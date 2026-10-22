'use strict';
/**
 * Dashboard web de configuration du bot.
 * Accès protégé par le mot de passe DASHBOARD_PASSWORD du fichier .env.
 */
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const { getConfig, replaceConfig } = require('./config');
const bot = require('./bot');
const { startKeepAlive, status: keepAliveStatus } = require('./keepAlive');

const ROOT = path.join(__dirname, '..');

// Mot de passe : celui du .env, sinon un mot de passe temporaire généré au démarrage
let dashboardPassword = (process.env.DASHBOARD_PASSWORD || '').trim();
let generatedPassword = null;
if (!dashboardPassword || dashboardPassword === 'choisis_un_mot_de_passe') {
  generatedPassword = crypto.randomBytes(5).toString('hex'); // ex : "a3f9c1e2b4"
  dashboardPassword = generatedPassword;
}

// Deuxième mot de passe, volontairement limité : il ouvre uniquement la
// mini-interface Commandes (#commandes + ping @Clipper), jamais les réglages.
// Par défaut "bcko" comme demandé ; BCKO_PASSWORD permet de le remplacer
// par un mot de passe plus solide (fortement conseillé sur Render).
const quickOrderPassword = Object.prototype.hasOwnProperty.call(process.env, 'BCKO_PASSWORD')
  ? String(process.env.BCKO_PASSWORD || '').trim()
  : 'bcko';
const quickOrderPasswordIsCustom = Object.prototype.hasOwnProperty.call(process.env, 'BCKO_PASSWORD')
  && quickOrderPassword !== 'bcko';

const sessionSecret = (process.env.SESSION_SECRET || '').trim()
  || crypto.randomBytes(32).toString('hex');

// Petite protection anti-force-brute : max 10 échecs / 5 minutes par adresse IP
const loginAttempts = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.first > 5 * 60 * 1000) {
    loginAttempts.set(ip, { count: 0, first: now });
    return false;
  }
  return entry.count >= 10;
}
function registerFailedAttempt(ip) {
  const entry = loginAttempts.get(ip) || { count: 0, first: Date.now() };
  entry.count += 1;
  loginAttempts.set(ip, entry);
}

function secretMatches(given, expected) {
  if (!expected) return false;
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function passwordsMatch(given) {
  return secretMatches(given, dashboardPassword);
}

function requireAuthApi(req, res, next) {
  if (req.session?.authenticated) return next();
  return res.status(401).json({ error: 'Non connecté.' });
}

function requireQuickApi(req, res, next) {
  if (req.session?.authenticated || req.session?.quickAuthenticated) return next();
  return res.status(401).json({ error: 'Non connecté.' });
}

// Anti-spam très simple pour le ping @Clipper de la mini-interface.
const lastQuickOrderAt = new Map();

function startDashboard() {
  const app = express();
  const port = Number(process.env.PORT || process.env.DASHBOARD_PORT || 3000);

  app.disable('x-powered-by');

  // Derrière Render (proxy HTTPS), Express doit faire confiance au premier
  // proxy pour connaître la vraie IP (anti-force-brute) et utiliser un
  // cookie de session sécurisé.
  const runningOnRender = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL);
  if (runningOnRender) app.set('trust proxy', 1);

  // Page de santé publique : utilisée par Render et par l'auto-ping.
  // Elle ne contient aucune information sensible et répond toujours 200
  // si le processus web est vivant, même si discord est momentanément KO.
  app.get('/health', (req, res) => {
    let botOnline = false;
    try {
      botOnline = Boolean(bot.getGuildInfo()?.online);
    } catch {
      botOnline = false;
    }
    res.status(200).json({
      ok: true,
      service: 'virality-bot',
      botOnline,
      autoPing: keepAliveStatus().enabled,
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: runningOnRender,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }));
  app.use(express.static(path.join(ROOT, 'public'), { index: false }));

  // ----- Pages -----
  app.get('/login', (req, res) => {
    if (req.session?.authenticated) return res.redirect('/');
    if (req.session?.quickAuthenticated) return res.redirect('/commandes');
    res.sendFile(path.join(ROOT, 'views', 'login.html'));
  });

  app.get('/', (req, res) => {
    if (req.session?.authenticated) {
      return res.sendFile(path.join(ROOT, 'views', 'dashboard.html'));
    }
    if (req.session?.quickAuthenticated) return res.redirect('/commandes');
    return res.redirect('/login');
  });

  // Mini-interface limitée : aucun réglage, seulement l'envoi rapide
  // d'une commande avec lien(s) + ping @Clipper.
  app.get('/commandes', (req, res) => {
    if (req.session?.authenticated || req.session?.quickAuthenticated) {
      return res.sendFile(path.join(ROOT, 'views', 'quick-order.html'));
    }
    return res.redirect('/login');
  });

  // ----- Connexion / déconnexion -----
  app.post('/login', (req, res) => {
    const ip = req.ip || 'inconnue';
    if (tooManyAttempts(ip)) {
      return res.status(429).json({ error: 'Trop de tentatives. Réessaie dans 5 minutes.' });
    }
    const password = req.body?.password;
    const isAdmin = passwordsMatch(password);
    const isQuick = !isAdmin && secretMatches(password, quickOrderPassword);

    if (!isAdmin && !isQuick) {
      registerFailedAttempt(ip);
      return res.status(401).json({ error: 'Mot de passe incorrect.' });
    }

    loginAttempts.delete(ip);
    if (isAdmin) {
      req.session.authenticated = true;
      delete req.session.quickAuthenticated;
      req.session.accessLevel = 'admin';
      return res.json({ ok: true, redirect: '/' });
    }

    // Important : on ne met surtout pas "authenticated" ici. Toutes les
    // routes du dashboard normal resteront donc interdites à bcko.
    delete req.session.authenticated;
    req.session.quickAuthenticated = true;
    req.session.accessLevel = 'quick';
    return res.json({ ok: true, redirect: '/commandes' });
  });

  app.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  // ----- API (connexion requise) -----
  app.get('/api/config', requireAuthApi, (req, res) => {
    res.json(getConfig());
  });

  app.post('/api/config', requireAuthApi, (req, res) => {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Configuration invalide.' });
    }
    const saved = replaceConfig(req.body);
    res.json({ ok: true, config: saved });
  });

  app.get('/api/guild', requireAuthApi, (req, res) => {
    res.json(bot.getGuildInfo());
  });

  app.post('/api/test', requireAuthApi, async (req, res) => {
    const result = await bot.sendTestWelcome();
    if (!result.ok) return res.status(400).json({ error: result.reason });
    res.json({ ok: true });
  });

  // Applique le style des rôles sur le serveur (renomme/recolore + crée Accueil/Membre)
  app.post('/api/roles/apply', requireAuthApi, async (req, res) => {
    const result = await bot.applyRolesStyle();
    if (!result.ok && result.reason) return res.status(400).json({ error: result.reason });
    res.json({ ok: true, results: result.results, config: result.config });
  });

  // Construit / remet en forme toute la structure du serveur (catégories + Salons)
  app.post('/api/server/build', requireAuthApi, async (req, res) => {
    const result = await bot.buildServerStructure();
    if (!result.ok && result.reason) return res.status(400).json({ error: result.reason });
    res.json({ ok: true, results: result.results, config: result.config });
  });

  // Publie (ou met à jour) le panneau de tickets dans le salon configuré
  app.post('/api/tickets/publish', requireAuthApi, async (req, res) => {
    const result = await bot.publishTicketPanel();
    if (!result.ok) return res.status(400).json({ error: result.reason || 'Publication impossible.' });
    res.json({ ok: true, updated: Boolean(result.updated), channelName: result.channelName, config: result.config });
  });

  // Recherche un membre pour l'ouverture manuelle d'un ticket
  app.get('/api/tickets/members', requireAuthApi, async (req, res) => {
    const result = await bot.searchGuildMembers(req.query.q || '');
    if (!result.ok) return res.status(400).json({ error: result.reason, members: [] });
    return res.json({ ok: true, members: result.members });
  });

  // Ouvre directement un ticket normal depuis le dashboard
  app.post('/api/tickets/create', requireAuthApi, async (req, res) => {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Demande de ticket invalide.' });
    }
    const result = await bot.createManualTicket(req.body);
    if (!result.ok) {
      return res.status(400).json({
        error: result.reason || 'Impossible d\'ouvrir ce ticket.',
        alreadyExists: Boolean(result.alreadyExists),
        channelId: result.channelId || null,
        channelName: result.channelName || null,
      });
    }
    return res.json({
      ok: true,
      channelId: result.channelId,
      channelName: result.channelName,
      number: result.number,
      typeName: result.typeName,
      memberName: result.memberName,
      memberTag: result.memberTag,
      config: result.config,
    });
  });

  // Mini-interface Commandes : état limité (salon + rôle retrouvés ou non)
  app.get('/api/quick-order/status', requireQuickApi, async (req, res) => {
    try {
      return res.json(await bot.getQuickOrderStatus());
    } catch (err) {
      return res.status(500).json({ ok: false, reason: `État indisponible : ${err.message}` });
    }
  });

  // Mini-interface Commandes : envoi direct dans #commandes + ping @Clipper
  app.post('/api/quick-order/send', requireQuickApi, async (req, res) => {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Commande invalide.' });
    }

    const cooldownKey = `${req.sessionID || 'sans-session'}:${req.ip || 'inconnue'}`;
    const last = lastQuickOrderAt.get(cooldownKey) || 0;
    if (Date.now() - last < 3000) {
      return res.status(429).json({ error: 'Doucement 😅 Attends 3 secondes avant d\'envoyer une autre commande.' });
    }

    const result = await bot.sendQuickOrder(req.body);
    if (!result.ok) return res.status(400).json({ error: result.reason || 'Envoi impossible.' });

    lastQuickOrderAt.set(cooldownKey, Date.now());
    return res.json({
      ok: true,
      channelName: result.channelName,
      roleName: result.roleName,
      messageId: result.messageId,
      linksCount: result.linksCount,
    });
  });

  // Envoie un modèle d'embed (créateur d'embeds) dans son salon cible
  app.post('/api/embeds/send', requireAuthApi, async (req, res) => {
    const index = Number(req.body?.index);
    if (!Number.isInteger(index) || index < 0) {
      return res.status(400).json({ error: 'Modèle d\'embed invalide.' });
    }
    const result = await bot.sendEmbedTemplate(index);
    if (!result.ok) return res.status(400).json({ error: result.reason });
    res.json({ ok: true, channelName: result.channelName, messageId: result.messageId });
  });

  // État du système (sauvegarde locale + miroir Supabase) pour l'onglet Serveur
  app.get('/api/system', requireAuthApi, (req, res) => {
    res.json({
      supabase: require('./supabase').status(),
      ai: bot.getAiRuntime(),
      keepAlive: keepAliveStatus(),
      guildId: bot.GUILD_ID,
    });
  });

  app.listen(port, '0.0.0.0', () => {
    const publicUrl = String(process.env.RENDER_EXTERNAL_URL || '').trim();
    console.log('');
    console.log('🖥️  DASHBOARD WEB PRÊT');
    const baseUrl = (publicUrl || `http://localhost:${port}`).replace(/\/+$/, '');
    console.log(`    Ouvre dans ton navigateur :  ${baseUrl}`);
    console.log(`    Commandes rapides (bcko) :  ${baseUrl}/commandes`);
    startKeepAlive();
    if (generatedPassword) {
      console.log('    ⚠️  Aucun mot de passe défini dans le .env !');
      console.log(`    Mot de passe temporaire pour cette session :  ${generatedPassword}`);
      console.log('    (Définis DASHBOARD_PASSWORD dans le fichier .env pour en choisir un permanent.)');
    } else {
      console.log('    Mot de passe : celui que tu as mis dans le fichier .env (DASHBOARD_PASSWORD)');
    }
    console.log(
      quickOrderPassword
        ? `    Accès limité Commandes : ${quickOrderPasswordIsCustom ? 'mot de passe BCKO_PASSWORD du .env' : 'bcko (par défaut)'}`
        : '    Accès limité Commandes : désactivé (BCKO_PASSWORD vide)'
    );
    console.log('');
  });

  return app;
}

module.exports = { startDashboard };
