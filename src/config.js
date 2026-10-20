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
    // Donne automatiquement le rôle 🔥・Membre à chaque nouvel arrivant
    // (rôle retrouvé via l'onglet Rôles, créé par le style 1 clic ou la
    // construction du serveur). Indépendant du rôle automatique libre.
    autoMemberRole: true,
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

  /**
   * Système de tickets (onglet Tickets du dashboard).
   * Un panneau avec bouton est publié dans un salon ; au clic, un salon
   * privé est créé pour le membre + les rôles staff choisis.
   * Compteur et IDs du panneau/catégorie sont mémorisés ici.
   */
  tickets: {
    enabled: true,
    panelChannelId: '',
    panelMessageId: '',
    categoryId: '',
    categoryName: '🎫・Tickets',
    staffRoleIds: [
      '1562040635345735751', // Fondateur
      '1562040762722553876', // Gérant Modération
      '1562040845689946122', // modérateur
      '1562040906603823124', // modérateur en Test
    ],
    maxPerUser: 1,
    namePattern: 'ticket-{number}',
    counter: 0,
    askSubject: true,
    pingStaff: true,
    closeDelaySeconds: 5,
    transcriptChannelId: '',
    dmTranscript: false,
    panelButtonLabel: 'Ouvrir un ticket',
    panelButtonEmoji: '🎫',
    panelEmbed: {
      title: '🎫 Besoin d\'aide ? Ouvre un ticket !',
      description:
        'Une question, un souci, une commande spéciale ?\n\n' +
        'Clique sur le bouton **« Ouvrir un ticket »** ci-dessous : un salon privé ' +
        'sera créé rien que pour toi et l\'équipe **Virality** 🔥\n\n' +
        '⏱️ On te répond le plus vite possible !',
      color: '#FF6A00',
      footer: 'Virality • Support',
      author: '',
      imageMode: 'banniere', // 'aucune' | 'banniere' | 'url'
      imageUrl: '',
      thumbnail: 'logo', // 'logo' | 'url' | 'aucune'
      thumbnailUrl: '',
      timestamp: false,
      fields: [],
    },
    openEmbed: {
      title: '🎫 Ticket ouvert — bienvenue !',
      description:
        'Salut {user} 👋\n\nDécris ton souci ou ta demande le plus clairement possible, ' +
        'un membre de l\'équipe arrive très vite.\n\n' +
        'Quand tout est réglé, clique sur **🔒 Fermer le ticket**.',
      color: '#FF6A00',
      footer: 'Virality • Ticket n°{number}',
      author: '',
      imageMode: 'aucune',
      imageUrl: '',
      thumbnail: 'avatar', // 'avatar' | 'logo' | 'url' | 'aucune'
      thumbnailUrl: '',
      timestamp: true,
      fields: [],
    },

    // Vrai une fois la config convertie au format "plusieurs boutons".
    migratedTypes: true,

    /**
     * Assistante IA des tickets (Mistral). La clé API reste dans le .env
     * (MISTRAL_API_KEY), jamais dans cette config. Le modèle par défaut
     * correspond aux limites annoncées : 250 000 tokens/min, 1 req/s —
     * le bot espace donc ses appels d'un peu plus d'1 seconde.
     */
    ai: {
      enabled: false,
      model: 'mistral-large-2512',
      // 'messages' = répond aux messages du membre | 'mention' = seulement si @bot | 'accueil' = message IA à l'ouverture uniquement
      trigger: 'messages',
      greetOnOpen: true,
      pauseWhenStaffReplies: true,
      temperature: 0.7,
      maxTokens: 450,
      historyLimit: 12,
      cooldownSeconds: 5,
      systemPrompt:
        'Tu es l\'assistante IA du support de Virality, une communauté discord autour du clipping vidéo (TikTok, YouTube Shorts, Reels) où les membres peuvent gagner de l\'argent grâce aux vues.\n' +
        'Réponds en français, de façon chaleureuse, claire et concise (phrases courtes, quelques emojis max, jamais de pavé).\n' +
        'Ton rôle : accueillir le membre, comprendre sa demande et lui poser les bonnes questions pour faire gagner du temps à l\'équipe humaine.\n' +
        'Règles strictes : n\'invente jamais de prix, de délai ou de promesse ; ne demande jamais de mot de passe, de token ou de coordonnées bancaires ; si tu ne sais pas, dis simplement qu\'un membre de l\'équipe prend le relais très vite. Tu es une IA et tu peux le dire si on te le demande.',
    },

    /**
     * Les boutons du panneau : un bouton = un type de ticket, avec ses
     * rôles staff (accès + ping), son message d'ouverture et ses
     * consignes IA propres. Modifiables/ajoutables dans le dashboard.
     */
    types: [
      {
        id: 'support',
        name: 'Question / Support',
        buttonLabel: 'Question / Support',
        buttonEmoji: '❓',
        buttonStyle: 'Primary',
        staffRoleIds: [
          '1562040635345735751', // Fondateur
          '1562040762722553876', // Gérant Modération
          '1562040845689946122', // modérateur
          '1562040906603823124', // modérateur en Test
        ],
        pingStaff: true,
        askSubject: true,
        categoryId: '',
        categoryName: '',
        namePattern: 'ticket-{number}',
        aiEnabled: true,
        aiPrompt:
          'Type de ticket : question générale ou problème. Aide le membre à décrire clairement son souci (quoi, depuis quand, sur quel salon/compte). Si c\'est une question simple sur le fonctionnement de la communauté, réponds brièvement ; sinon, récolte les infos utiles et rassure-le : l\'équipe arrive.',
        openEmbed: {
          title: '❓ Ticket Support ouvert',
          description:
            'Salut {user} 👋\n\nDécris ton souci ou ta question le plus clairement possible, ' +
            'un membre de l\'équipe arrive très vite.\n\n' +
            'Quand tout est réglé, clique sur **🔒 Fermer le ticket**.',
          color: '#FF6A00',
          footer: 'Virality • Ticket n°{number}',
          author: '',
          imageMode: 'aucune',
          imageUrl: '',
          thumbnail: 'avatar',
          thumbnailUrl: '',
          timestamp: true,
          fields: [],
        },
      },
      {
        id: 'commande',
        name: 'Commande de clip',
        buttonLabel: 'Commander un clip',
        buttonEmoji: '🎬',
        buttonStyle: 'Success',
        staffRoleIds: [
          '1562040635345735751', // Fondateur
          '1562040762722553876', // Gérant Modération
          '1562040845689946122', // modérateur
        ],
        pingStaff: true,
        askSubject: true,
        categoryId: '',
        categoryName: '',
        namePattern: 'commande-{number}',
        aiEnabled: true,
        aiPrompt:
          'Type de ticket : commande de clip vidéo. Ton but est de récolter un brief complet pour les clippers : lien de la vidéo ou du live à clipper, moment précis (timestamps), style souhaité (texte à l\'écran, musique, format), plateformes visées (TikTok, Shorts, Reels) et délai espéré. Pose ces questions une par une, gentiment, puis récapitule le brief en liste courte quand le membre a tout donné. Ne donne aucun prix ni délai garanti : l\'équipe confirmera.',
        openEmbed: {
          title: '🎬 Commande de clip',
          description:
            'Salut {user} 👋 Prêt à devenir viral ? 🔥\n\nPour que nos clippers te fassent un clip au top, donne-nous :\n' +
            '• le **lien** de la vidéo / du live\n• le **moment** à clipper (timestamps)\n• le **style** souhaité\n\n' +
            'On s\'occupe du reste ! Quand tout est réglé, clique sur **🔒 Fermer le ticket**.',
          color: '#FF7B1C',
          footer: 'Virality • Commande n°{number}',
          author: '',
          imageMode: 'aucune',
          imageUrl: '',
          thumbnail: 'avatar',
          thumbnailUrl: '',
          timestamp: true,
          fields: [],
        },
      },
      {
        id: 'partenariat',
        name: 'Partenariat / Business',
        buttonLabel: 'Partenariat',
        buttonEmoji: '🤝',
        buttonStyle: 'Secondary',
        staffRoleIds: [
          '1562040635345735751', // Fondateur
          '1562040762722553876', // Gérant Modération
        ],
        pingStaff: true,
        askSubject: true,
        categoryId: '',
        categoryName: '',
        namePattern: 'partenariat-{number}',
        aiEnabled: true,
        aiPrompt:
          'Type de ticket : partenariat ou proposition business. Reste très professionnelle. Demande poliment : qui ils sont (marque, créateur...), leurs réseaux et chiffres clés (abonnés, vues), ce qu\'ils proposent concrètement et ce qu\'ils attendent de Virality. Ne t\'engage sur rien : explique que la direction étudie chaque proposition et reviendra vers eux ici même.',
        openEmbed: {
          title: '🤝 Partenariat / Business',
          description:
            'Bonjour {user}, merci de votre intérêt pour **Virality** 🤝\n\nPrésentez-vous en quelques lignes : ' +
            'votre marque ou chaîne, vos chiffres clés, et la collaboration que vous imaginez.\n\n' +
            'La direction étudie chaque proposition et vous répondra ici même.',
          color: '#FFB020',
          footer: 'Virality • Partenariat n°{number}',
          author: '',
          imageMode: 'aucune',
          imageUrl: '',
          thumbnail: 'avatar',
          thumbnailUrl: '',
          timestamp: true,
          fields: [],
        },
      },
    ],
  },

  /**
   * Créateur d'embeds (onglet Embeds du dashboard) : des modèles
   * d'embeds entièrement personnalisables, envoyables en 1 clic
   * dans le salon de ton choix.
   */
  embeds: {
    templates: [
      {
        name: '📢 Annonce (exemple)',
        channelId: '',
        content: '',
        pingEveryone: false,
        embed: {
          title: '🔥 Grande nouvelle !',
          description:
            'Écris ton annonce ici...\n\nTu peux utiliser **gras**, *italique*, des emojis 🚀 ' +
            'et les variables {server} et {memberCount}.',
          color: '#FF6A00',
          footer: 'Virality',
          author: '',
          imageMode: 'banniere',
          imageUrl: '',
          thumbnail: 'logo',
          thumbnailUrl: '',
          timestamp: true,
          fields: [],
        },
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

/**
 * Valide un embed "générique" (tickets + créateur d'embeds) :
 * comme l'embed de bienvenue, mais avec auteur, champs et horodatage.
 */
function normalizeGenericEmbed(embed, defaults) {
  if (!embed || typeof embed !== 'object') return structuredClone(defaults);
  const fields = Array.isArray(embed.fields)
    ? embed.fields.slice(0, 25).map((f) => ({
        name: String(f?.name ?? '').slice(0, 256),
        value: String(f?.value ?? '').slice(0, 1024),
        inline: Boolean(f?.inline),
      }))
    : [];
  return {
    title: String(embed.title ?? defaults.title).slice(0, 256),
    description: String(embed.description ?? defaults.description).slice(0, 4000),
    color: normalizeColor(embed.color, defaults.color),
    footer: String(embed.footer ?? defaults.footer).slice(0, 2048),
    author: String(embed.author ?? defaults.author ?? '').slice(0, 256),
    imageMode: ['aucune', 'banniere', 'url'].includes(embed.imageMode)
      ? embed.imageMode
      : defaults.imageMode,
    imageUrl: String(embed.imageUrl ?? '').trim().slice(0, 1000),
    thumbnail: ['avatar', 'logo', 'url', 'aucune'].includes(embed.thumbnail)
      ? embed.thumbnail
      : defaults.thumbnail,
    thumbnailUrl: String(embed.thumbnailUrl ?? '').trim().slice(0, 1000),
    timestamp: Boolean(embed.timestamp ?? defaults.timestamp),
    fields,
  };
}

function normalizeRoleIdList(value, fallback) {
  return Array.isArray(value)
    ? [...new Set(value.map((x) => String(x).trim()).filter(Boolean))].slice(0, 25)
    : [...fallback];
}

function sanitizeTicketTypeId(value, fallback) {
  const clean = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return clean || fallback;
}

function normalizeTicketAi(input) {
  const def = DEFAULTS.tickets.ai;
  const a = input && typeof input === 'object' ? input : {};
  const intInRange = (v, min, max, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
  };
  const temp = Number(a.temperature);
  return {
    enabled: Boolean(a.enabled ?? def.enabled),
    model: String(a.model ?? def.model).trim().slice(0, 80) || def.model,
    trigger: ['messages', 'mention', 'accueil'].includes(a.trigger) ? a.trigger : def.trigger,
    greetOnOpen: Boolean(a.greetOnOpen ?? def.greetOnOpen),
    pauseWhenStaffReplies: Boolean(a.pauseWhenStaffReplies ?? def.pauseWhenStaffReplies),
    temperature: Number.isFinite(temp) ? Math.min(1.5, Math.max(0, temp)) : def.temperature,
    maxTokens: intInRange(a.maxTokens, 50, 2000, def.maxTokens),
    historyLimit: intInRange(a.historyLimit, 2, 30, def.historyLimit),
    cooldownSeconds: intInRange(a.cooldownSeconds, 1, 120, def.cooldownSeconds),
    systemPrompt: String(a.systemPrompt ?? def.systemPrompt).slice(0, 4000) || def.systemPrompt,
  };
}

function normalizeTicketType(raw, fallback, index) {
  const t = raw && typeof raw === 'object' ? raw : {};
  const def = fallback || DEFAULTS.tickets.types[0];
  return {
    id: sanitizeTicketTypeId(t.id, def.id || `type-${index + 1}`),
    name: String(t.name ?? def.name).trim().slice(0, 80) || def.name,
    buttonLabel: String(t.buttonLabel ?? def.buttonLabel).trim().slice(0, 80) || def.buttonLabel,
    buttonEmoji: String(t.buttonEmoji ?? def.buttonEmoji).trim().slice(0, 16),
    buttonStyle: ['Primary', 'Secondary', 'Success', 'Danger'].includes(t.buttonStyle)
      ? t.buttonStyle
      : def.buttonStyle,
    staffRoleIds: normalizeRoleIdList(t.staffRoleIds, def.staffRoleIds || []),
    pingStaff: Boolean(t.pingStaff ?? def.pingStaff),
    askSubject: Boolean(t.askSubject ?? def.askSubject),
    categoryId: String(t.categoryId ?? '').trim(),
    categoryName: String(t.categoryName ?? def.categoryName ?? '').trim().slice(0, 100),
    namePattern: String(t.namePattern ?? def.namePattern).trim().slice(0, 60) || def.namePattern,
    aiEnabled: Boolean(t.aiEnabled ?? def.aiEnabled ?? true),
    aiPrompt: String(t.aiPrompt ?? def.aiPrompt ?? '').slice(0, 3000),
    openEmbed: normalizeGenericEmbed(t.openEmbed, def.openEmbed || DEFAULTS.tickets.openEmbed),
  };
}

function normalizeTicketTypes(t) {
  const defTypes = DEFAULTS.tickets.types;
  let rawTypes;

  if (Array.isArray(t.types) && t.types.length) {
    rawTypes = t.types;
  } else {
    // Ancienne config (un seul bouton) : on la convertit en premier type
    // pour ne perdre aucun réglage, puis on ajoute les types suggérés.
    const legacy = {
      id: 'support',
      name: 'Question / Support',
      buttonLabel: t.panelButtonLabel || 'Question / Support',
      buttonEmoji: t.panelButtonEmoji ?? '❓',
      buttonStyle: 'Primary',
      staffRoleIds: t.staffRoleIds,
      pingStaff: t.pingStaff,
      askSubject: t.askSubject,
      categoryId: t.categoryId,
      categoryName: t.categoryName,
      namePattern: t.namePattern,
      aiEnabled: true,
      aiPrompt: defTypes[0].aiPrompt,
      openEmbed: t.openEmbed,
    };
    rawTypes = [legacy, ...defTypes.slice(1)];
  }

  const seen = new Set();
  return rawTypes.slice(0, 10).map((raw, i) => {
    const fallback = defTypes.find((d) => d.id === raw?.id) || defTypes[0];
    const type = normalizeTicketType(raw, fallback, i);
    let uniqueId = type.id;
    let n = 2;
    while (seen.has(uniqueId)) uniqueId = `${type.id}-${n++}`;
    seen.add(uniqueId);
    type.id = uniqueId;
    return type;
  });
}

function normalizeTickets(input) {
  const def = DEFAULTS.tickets;
  const t = input && typeof input === 'object' ? input : {};
  const intInRange = (v, min, max, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
  };
  return {
    enabled: Boolean(t.enabled ?? def.enabled),
    panelChannelId: String(t.panelChannelId ?? '').trim(),
    panelMessageId: String(t.panelMessageId ?? '').trim(),
    categoryId: String(t.categoryId ?? '').trim(),
    categoryName: String(t.categoryName ?? def.categoryName).trim().slice(0, 100) || def.categoryName,
    staffRoleIds: normalizeRoleIdList(t.staffRoleIds, def.staffRoleIds),
    maxPerUser: intInRange(t.maxPerUser, 1, 10, def.maxPerUser),
    namePattern: String(t.namePattern ?? def.namePattern).trim().slice(0, 60) || def.namePattern,
    counter: intInRange(t.counter, 0, 999999, 0),
    askSubject: Boolean(t.askSubject ?? def.askSubject),
    pingStaff: Boolean(t.pingStaff ?? def.pingStaff),
    closeDelaySeconds: intInRange(t.closeDelaySeconds, 0, 60, def.closeDelaySeconds),
    transcriptChannelId: String(t.transcriptChannelId ?? '').trim(),
    dmTranscript: Boolean(t.dmTranscript ?? def.dmTranscript),
    panelButtonLabel: String(t.panelButtonLabel ?? def.panelButtonLabel).trim().slice(0, 80) || def.panelButtonLabel,
    panelButtonEmoji: String(t.panelButtonEmoji ?? def.panelButtonEmoji).trim().slice(0, 16),
    panelEmbed: normalizeGenericEmbed(t.panelEmbed, def.panelEmbed),
    openEmbed: normalizeGenericEmbed(t.openEmbed, def.openEmbed),
    migratedTypes: true,
    ai: normalizeTicketAi(t.ai),
    types: normalizeTicketTypes(t),
  };
}

function normalizeEmbeds(input) {
  const defTemplate = DEFAULTS.embeds.templates[0];
  const fromUser = input && Array.isArray(input.templates) ? input.templates : [];
  const templates = fromUser.slice(0, 25).map((tpl) => {
    const t = tpl && typeof tpl === 'object' ? tpl : {};
    return {
      name: String(t.name ?? 'Sans nom').trim().slice(0, 80) || 'Sans nom',
      channelId: String(t.channelId ?? '').trim(),
      content: String(t.content ?? '').slice(0, 2000),
      pingEveryone: Boolean(t.pingEveryone),
      embed: normalizeGenericEmbed(t.embed, defTemplate.embed),
    };
  });
  return { templates: templates.length ? templates : structuredClone(DEFAULTS.embeds.templates) };
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

  w.autoMemberRole = Boolean(w.autoMemberRole ?? DEFAULTS.welcome.autoMemberRole);
  w.autoRole.enabled = Boolean(w.autoRole.enabled);
  w.autoRole.roleId = String(w.autoRole.roleId || '').trim();
  const delay = Number(w.autoRole.delaySeconds);
  w.autoRole.delaySeconds = Number.isFinite(delay)
    ? Math.min(3600, Math.max(0, Math.floor(delay)))
    : 0;

  merged.rolesStyle = normalizeRolesStyle(merged.rolesStyle);
  merged.serverStructure = normalizeServerStructure(merged.serverStructure);
  // Tickets : on valide depuis l'entrée brute pour détecter les anciennes
  // configs (un seul bouton) et les migrer sans perdre leurs réglages.
  merged.tickets = normalizeTickets(
    input && typeof input === 'object' ? input.tickets : undefined
  );
  merged.embeds = normalizeEmbeds(merged.embeds);
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
