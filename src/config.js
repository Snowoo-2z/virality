'use strict';
/**
 * Gestion de la configuration du bot.
 * La config est sauvegardée dans data/config.json et partagée
 * entre le bot discord, la commande /config et le dashboard web.
 */
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'config.json');

const DEFAULTS = {
  welcome: {
    enabled: true,
    channelId: '',
    type: 'embed', // 'embed' ou 'texte'
    pingUser: true,
    texteMessage:
      '🔥 Bienvenue {user} sur **{server}** ! Tu es notre {memberCount}ᵉ membre 🎉',
    embed: {
      title: '🔥 Bienvenue sur {server} !',
      description:
        'Salut {user}, bienvenue dans la communauté **Virality** !\n\n' +
        'Tu es notre **{memberCount}ᵉ membre** 🎉\n' +
        'Pense à lire les règles et à te présenter, et prépare-toi à devenir viral 🚀',
      color: '#FF6A00',
      footer: 'Virality • Membre n°{memberCount}',
      imageMode: 'banniere', // 'aucune' | 'banniere' | 'url'
      imageUrl: '',
      thumbnail: 'avatar', // 'avatar' | 'logo' | 'aucune'
    },
    dm: {
      enabled: false,
      type: 'embed', // 'embed' ou 'texte'
      texteMessage:
        '🔥 Salut {username} ! Bienvenue sur **{server}**, content de te voir parmi nous !',
      embed: {
        title: '🔥 Bienvenue sur {server} !',
        description:
          'Salut {username} 👋\n\nMerci d\'avoir rejoint **Virality** !\n' +
          'Si tu as la moindre question, l\'équipe est là pour toi.\n\nBonne visite 🚀',
        color: '#FF6A00',
        footer: 'L\'équipe Virality',
        imageMode: 'banniere',
        imageUrl: '',
        thumbnail: 'logo',
      },
    },
    autoRole: {
      enabled: false,
      roleId: '',
      delaySeconds: 0,
    },
  },

  /**
   * Style des rôles du serveur, appliqué en 1 clic depuis le dashboard.
   * Les 4 rôles du staff existent déjà (id renseigné) : on les renomme/recolore.
   * Membre et Accueil seront créés par le bot au premier clic (creatable).
   * hoist = "afficher séparément dans la liste des membres".
   */
  rolesStyle: [
    {
      key: 'fondateur',
      label: 'Fondateur (rôle existant)',
      id: '1562040635345735751',
      name: '👑・Fondateur',
      color: '#FFB020',
      emoji: '👑',
      hoist: true,
      creatable: false,
    },
    {
      key: 'gerant',
      label: 'Gérant Pôle Modération (rôle existant)',
      id: '1562040762722553876',
      name: '🛡️・Gérant Modération',
      color: '#FF6A00',
      emoji: '🛡️',
      hoist: true,
      creatable: false,
    },
    {
      key: 'moderateur',
      label: 'modérateur (rôle existant)',
      id: '1562040845689946122',
      name: '🔨・modérateur',
      color: '#F04E23',
      emoji: '🔨',
      hoist: true,
      creatable: false,
    },
    {
      key: 'moderateur-test',
      label: 'modérateur en Test (rôle existant)',
      id: '1562040906603823124',
      name: '🌱・modérateur en Test',
      color: '#C97B4A',
      emoji: '🌱',
      hoist: true,
      creatable: false,
    },
    {
      key: 'accueil',
      label: 'Accueil (nouveau rôle, créé au clic)',
      id: '',
      name: '👋・Accueil',
      color: '#FFCF87',
      emoji: '👋',
      hoist: true,
      creatable: true,
    },
    {
      key: 'membre',
      label: 'Membre (nouveau rôle, créé au clic)',
      id: '',
      name: '🔥・Membre',
      color: '#FF9E57',
      emoji: '🔥',
      hoist: false,
      creatable: true,
    },
    {
      key: 'clipper',
      label: 'Clipper (nouveau rôle, créé au clic)',
      id: '',
      name: '🎬・Clipper',
      color: '#FF7B1C',
      emoji: '🎬',
      hoist: true,
      creatable: true,
    },
  ],

  /**
   * Plan du serveur, construit en 1 clic depuis le dashboard
   * (catégories + Salons + permissions). Les noms sont modifiables
   * dans le dashboard ; les permissions sont gérées par le bot
   * selon la clé de chaque catégorie (voir bot.js).
   */
  serverStructure: {
    categories: [
      {
        key: 'informations',
        name: '📌・Informations',
        channels: [
          { key: 'annonces', name: '📢・annonces', topic: 'Les annonces officielles de Virality 📢 — active la cloche pour ne rien rater !' },
          { key: 'bienvenue', name: '👋・bienvenue', topic: 'Souhaitez la bienvenue aux nouveaux membres de la communauté 🔥' },
          { key: 'a-propos', name: '📖・à-propos', topic: 'Virality, c\'est quoi ? Comment gagner de l\'argent avec le clipping : tout est expliqué ici 📖' },
        ],
      },
      {
        key: 'communaute',
        name: '💬・Communauté',
        channels: [
          { key: 'success-flex', name: '🏆・success-flex', topic: 'FLEX tes résultats, tes vues et tes victoires ici 🏆🔥' },
          { key: 'proof', name: '💸・proof', topic: 'Les preuves de gains de la communauté 💸 — du concret, que du concret.' },
          { key: 'tickets', name: '🎫・tickets', topic: 'Un souci, une question ? C\'est ici que ça se passe, l\'équipe te répond 🎫' },
        ],
      },
      {
        key: 'clipper',
        name: '🔒・Espace Clipper',
        channels: [
          { key: 'commandes', name: '🛒・commandes', topic: 'Les commandes de clips passent ici 🎬' },
          { key: 'discussion', name: '💬・discussion', topic: 'Discussion entre clippers : entraide, astuces, retours 💬' },
          { key: 'bonus', name: '🎁・bonus', topic: 'Bonus, récompenses et avantages réservés aux clippers 🎁' },
        ],
      },
    ],
  },
};

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      deepMerge(target[key], value);
    } else if (value !== undefined) {
      target[key] = value;
    }
  }
  return target;
}

function isValidColor(value) {
  return typeof value === 'string' && /^#?[0-9a-fA-F]{6}$/.test(value.trim());
}

function normalizeColor(value, fallback) {
  if (!isValidColor(value)) return fallback;
  const clean = value.trim().replace(/^#/, '');
  return '#' + clean.toUpperCase();
}

function normalizeEmbedSection(embed, defaults) {
  if (!embed || typeof embed !== 'object') return { ...defaults };
  return {
    title: String(embed.title ?? defaults.title).slice(0, 256),
    description: String(embed.description ?? defaults.description).slice(0, 4000),
    color: normalizeColor(embed.color, defaults.color),
    footer: String(embed.footer ?? defaults.footer).slice(0, 2048),
    imageMode: ['aucune', 'banniere', 'url'].includes(embed.imageMode)
      ? embed.imageMode
      : defaults.imageMode,
    imageUrl: String(embed.imageUrl ?? '').trim().slice(0, 1000),
    thumbnail: ['avatar', 'logo', 'aucune'].includes(embed.thumbnail)
      ? embed.thumbnail
      : defaults.thumbnail,
  };
}

/** Reconstruit proprement la liste des styles de rôles (par clé). */
function normalizeRolesStyle(input) {
  const fromUser = Array.isArray(input) ? input : [];
  return DEFAULTS.rolesStyle.map((def) => {
    const saved = fromUser.find((r) => r && r.key === def.key) || {};
    const name = String(saved.name ?? def.name).trim().slice(0, 100);
    return {
      key: def.key,
      label: def.label,
      id: String(saved.id ?? def.id).trim(),
      name: name || def.name,
      color: normalizeColor(saved.color, def.color),
      emoji: def.emoji,
      hoist: typeof saved.hoist === 'boolean' ? saved.hoist : def.hoist,
      creatable: def.creatable,
    };
  });
}

/** Reconstruit proprement le plan du serveur (par clé de catégorie/salon). */
function normalizeServerStructure(input) {
  const fromUser = input && Array.isArray(input.categories) ? input.categories : [];
  return {
    categories: DEFAULTS.serverStructure.categories.map((defCat) => {
      const savedCat = fromUser.find((c) => c && c.key === defCat.key) || {};
      const savedChannels = Array.isArray(savedCat.channels) ? savedCat.channels : [];
      const catName = String(savedCat.name ?? defCat.name).trim().slice(0, 100);
      return {
        key: defCat.key,
        name: catName || defCat.name,
        channels: defCat.channels.map((defCh) => {
          const savedCh = savedChannels.find((c) => c && c.key === defCh.key) || {};
          const chName = String(savedCh.name ?? defCh.name).trim().slice(0, 100);
          return {
            key: defCh.key,
            name: chName || defCh.name,
            topic: String(savedCh.topic ?? defCh.topic).slice(0, 1024),
          };
        }),
      };
    }),
  };
}

/** Nettoie/valide une config complète (utilisée par le dashboard web). */
function normalizeConfig(input) {
  const base = structuredClone(DEFAULTS);
  if (!input || typeof input !== 'object') return base;
  const merged = deepMerge(base, input);
  const w = merged.welcome;
  w.enabled = Boolean(w.enabled);
  w.channelId = String(w.channelId || '').trim();
  w.type = w.type === 'texte' ? 'texte' : 'embed';
  w.pingUser = Boolean(w.pingUser);
  w.texteMessage = String(w.texteMessage || '').slice(0, 2000);
  w.embed = normalizeEmbedSection(w.embed, DEFAULTS.welcome.embed);

  w.dm.enabled = Boolean(w.dm.enabled);
  w.dm.type = w.dm.type === 'texte' ? 'texte' : 'embed';
  w.dm.texteMessage = String(w.dm.texteMessage || '').slice(0, 2000);
  w.dm.embed = normalizeEmbedSection(w.dm.embed, DEFAULTS.welcome.dm.embed);

  w.autoRole.enabled = Boolean(w.autoRole.enabled);
  w.autoRole.roleId = String(w.autoRole.roleId || '').trim();
  const delay = Number(w.autoRole.delaySeconds);
  w.autoRole.delaySeconds = Number.isFinite(delay)
    ? Math.min(3600, Math.max(0, Math.floor(delay)))
    : 0;

  merged.rolesStyle = normalizeRolesStyle(merged.rolesStyle);
  merged.serverStructure = normalizeServerStructure(merged.serverStructure);
  return merged;
}

function load() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULTS);
  }
}

let current = load();

function getConfig() {
  return current;
}

/** Vrai si un fichier de config local existe déjà (utilisé au démarrage). */
function hasLocalConfig() {
  return fs.existsSync(CONFIG_PATH);
}

function saveConfig() {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2), 'utf8');
  } catch (err) {
    console.error('❌ Impossible de sauvegarder la configuration :', err.message);
  }
  // Miroir de sauvegarde sur Supabase (si configuré dans le .env) :
  // en arrière-plan, sans jamais bloquer le bot en cas de souci réseau.
  try {
    require('./supabase').queuePush(current);
  } catch {
    /* Supabase est optionnel : on ignore silencieusement */
  }
  return current;
}

/** Remplace toute la config (dashboard web) après validation. */
function replaceConfig(input) {
  current = normalizeConfig(input);
  return saveConfig();
}

module.exports = {
  DEFAULTS,
  getConfig,
  saveConfig,
  replaceConfig,
  normalizeConfig,
  hasLocalConfig,
  isValidColor,
  normalizeColor,
};
