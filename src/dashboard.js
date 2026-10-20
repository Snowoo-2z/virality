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

const ROOT = path.join(__dirname, '..');

// Mot de passe : celui du .env, sinon un mot de passe temporaire généré au démarrage
let dashboardPassword = (process.env.DASHBOARD_PASSWORD || '').trim();
let generatedPassword = null;
if (!dashboardPassword || dashboardPassword === 'choisis_un_mot_de_passe') {
  generatedPassword = crypto.randomBytes(5).toString('hex'); // ex : "a3f9c1e2b4"
  dashboardPassword = generatedPassword;
}

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

function passwordsMatch(given) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(dashboardPassword);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireAuthApi(req, res, next) {
  if (req.session?.authenticated) return next();
  return res.status(401).json({ error: 'Non connecté.' });
}

function startDashboard() {
  const app = express();
  const port = Number(process.env.PORT || process.env.DASHBOARD_PORT || 3000);

  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 },
  }));
  app.use(express.static(path.join(ROOT, 'public'), { index: false }));

  // ----- Pages -----
  app.get('/login', (req, res) => {
    if (req.session?.authenticated) return res.redirect('/');
    res.sendFile(path.join(ROOT, 'views', 'login.html'));
  });

  app.get('/', (req, res) => {
    if (!req.session?.authenticated) return res.redirect('/login');
    res.sendFile(path.join(ROOT, 'views', 'dashboard.html'));
  });

  // ----- Connexion / déconnexion -----
  app.post('/login', (req, res) => {
    const ip = req.ip || 'inconnue';
    if (tooManyAttempts(ip)) {
      return res.status(429).json({ error: 'Trop de tentatives. Réessaie dans 5 minutes.' });
    }
    const password = req.body?.password;
    if (!passwordsMatch(password)) {
      registerFailedAttempt(ip);
      return res.status(401).json({ error: 'Mot de passe incorrect.' });
    }
    loginAttempts.delete(ip);
    req.session.authenticated = true;
    return res.json({ ok: true });
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

  app.listen(port, '0.0.0.0', () => {
    console.log('');
    console.log('🖥️  DASHBOARD WEB PRÊT');
    console.log(`    Ouvre dans ton navigateur :  http://localhost:${port}`);
    if (generatedPassword) {
      console.log('    ⚠️  Aucun mot de passe défini dans le .env !');
      console.log(`    Mot de passe temporaire pour cette session :  ${generatedPassword}`);
      console.log('    (Définis DASHBOARD_PASSWORD dans le fichier .env pour en choisir un permanent.)');
    } else {
      console.log('    Mot de passe : celui que tu as mis dans le fichier .env (DASHBOARD_PASSWORD)');
    }
    console.log('');
  });

  return app;
}

module.exports = { startDashboard };
