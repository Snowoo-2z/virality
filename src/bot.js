'use strict';
/**
 * Le bot discord Virality.
 * Il ne fonctionne QUE sur le serveur défini par GUILD_ID dans le .env :
 * il quitte automatiquement tout autre serveur où on tenterait de l'ajouter.
 */
const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  ChannelType,
  PermissionsBitField,
  PermissionFlagsBits,
  ActivityType,
  EmbedBuilder,
} = require('discord.js');
const configPanel = require('./configPanel');
const { sendWelcome, applyAutoRole } = require('./welcome');
const { getConfig, saveConfig } = require('./config');
const tickets = require('./tickets');
const { buildEmbedPayload } = require('./embeds');
const ai = require('./ai');

const GUILD_ID = (process.env.GUILD_ID || '1562033502612885534').trim();

let client = null;
let isReady = false;
let messageIntentsAtBoot = false; // l'IA des tickets lit les messages : intents décidés au démarrage

function createClient() {
  // L'IA des tickets doit LIRE les messages des membres : ces intents ne
  // peuvent être choisis qu'ici, au démarrage. Si l'IA est activée dans la
  // config, on les demande (MESSAGE CONTENT INTENT à cocher sur le
  // portail développeur discord). Sinon on garde le minimum.
  messageIntentsAtBoot = Boolean(getConfig().tickets.ai?.enabled && ai.isConfigured());
  const intents = [
    GatewayIntentBits.Guilds,
    // Obligatoire pour détecter l'arrivée des nouveaux membres.
    // À activer aussi sur le portail développeur : "SERVER MEMBERS INTENT".
    GatewayIntentBits.GuildMembers,
  ];
  if (messageIntentsAtBoot) {
    intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
    console.log('🤖 IA des tickets activée : écoute des messages des tickets (modèle Mistral connecté).');
  }
  client = new Client({ intents });

  const readyEvent = Events.ClientReady || 'ready';
  client.once(readyEvent, async () => {
    isReady = true;
    console.log(`✅ Bot connecté sur discord en tant que ${client.user.tag}`);

    client.user.setActivity('Virality 🔥', { type: ActivityType.Watching }).catch(() => {});

    // Verrouillage : quitter tous les serveurs sauf celui autorisé
    for (const guild of client.guilds.cache.values()) {
      if (guild.id !== GUILD_ID) {
        console.log(`🚪 Je quitte le serveur non autorisé : ${guild.name} (${guild.id})`);
        await guild.leave().catch(() => {});
      }
    }

    const target = client.guilds.cache.get(GUILD_ID);
    if (!target) {
      console.log('⚠️  Le bot n\'est pas encore sur le serveur Virality.');
      console.log(`    Utilise ce lien pour l'inviter :\n    ${buildInviteUrl(client.user.id)}`);
    } else {
      console.log(`🎯 Serveur Virality trouvé : ${target.name} (${target.memberCount} membres)`);
    }

    // Enregistrement de la commande /config (sur ce serveur uniquement)
    try {
      const rest = new REST().setToken(process.env.DISCORD_TOKEN);
      await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), {
        body: [configPanel.commandData.toJSON()],
      });
      console.log('✅ Commande /config enregistrée sur le serveur.');
    } catch (err) {
      console.error('❌ Impossible d\'enregistrer la commande /config :', err.message);
      console.log('   (Le bot doit être présent sur le serveur. Invite-le puis redémarre le bot.)');
    }
  });

  client.on(Events.GuildCreate, async (guild) => {
    if (guild.id !== GUILD_ID) {
      console.log(`🚪 Serveur non autorisé (${guild.name}) : je le quitte.`);
      await guild.leave().catch(() => {});
    } else {
      console.log(`🎉 Le bot vient de rejoindre le serveur Virality : ${guild.name}`);
    }
  });

  // Arrivée d'un nouveau membre -> bienvenue + rôle auto
  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.guild.id !== GUILD_ID) return;
    if (member.user.bot) return; // pas de bienvenue pour les autres bots
    console.log(`👋 Nouveau membre : ${member.user.tag}`);
    await sendWelcome(member);
    applyAutoRole(member);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.guildId !== GUILD_ID) return;
    try {
      if (interaction.customId?.startsWith('ticket:')) {
        await tickets.handleInteraction(interaction);
      } else {
        await configPanel.handleInteraction(interaction);
      }
    } catch (err) {
      console.error('❌ Erreur pendant une interaction (bouton/menu) :', err);
      // Réponse de secours si l'interaction est encore en attente
      const fallback = { content: '❌ Oups, quelque chose a coincé. Réessaie, et si ça persiste, préviens un admin !', flags: 64 };
      if (interaction.deferred && !interaction.replied) await interaction.editReply(fallback).catch(() => {});
      else if (!interaction.replied && !interaction.deferred) await interaction.reply(fallback).catch(() => {});
    }
  });

  // Messages dans les Salons de tickets -> assistante IA (Mistral)
  client.on(Events.MessageCreate, async (message) => {
    if (message.guildId !== GUILD_ID) return;
    try {
      await tickets.handleMessage(message);
    } catch (err) {
      console.warn('⚠️  IA des tickets :', err.message);
    }
  });

  client.on(Events.Error, (err) => console.error('❌ Erreur du bot discord :', err.message));

  return client;
}

function buildInviteUrl(clientId) {
  const permissions = new PermissionsBitField([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.ManageRoles, // rôle automatique + style des rôles
    PermissionFlagsBits.ManageChannels, // construction du serveur (catégories/Salons)
  ]).bitfield.toString();
  return (
    `https://discord.com/oauth2/authorize?client_id=${clientId}` +
    `&guild_id=${GUILD_ID}&scope=bot%20applications.commands&permissions=${permissions}`
  );
}

async function startBot() {
  createClient();
  const token = (process.env.DISCORD_TOKEN || '').trim();

  if (!token || token === 'colle_ton_token_ici') {
    console.log('');
    console.log('⚠️  TOKEN DISCORD MANQUANT');
    console.log('    Ouvre le fichier ".env" et colle ton token après DISCORD_TOKEN=');
    console.log('    Le dashboard web fonctionne quand même, mais le bot restera hors ligne.');
    console.log('');
    return client;
  }

  try {
    await client.login(token);
  } catch (err) {
    console.error('');
    console.error('❌ CONNEXION À DISCORD IMPOSSIBLE :', err.message);
    if (/invalid token|401/i.test(err.message)) {
      console.error('    Ton token semble invalide. Récupère-le sur https://discord.com/developers/applications');
      console.error('    (ton application > Bot > Reset Token), mets-le dans le fichier .env, puis redémarre.');
    }
    if (/disallowed intents/i.test(err.message)) {
      console.error('    ➜ Va sur le portail développeur > ton application > Bot, et ACTIVE "SERVER MEMBERS INTENT".');
      if (messageIntentsAtBoot) {
        console.error('    ➜ Active AUSSI "MESSAGE CONTENT INTENT" (obligatoire pour l\'IA des tickets).');
      }
    }
    console.error('    Le dashboard web reste accessible, mais le bot est hors ligne.');
    console.error('');
  }
  return client;
}

/** Infos du serveur pour le dashboard (Salons, rôles, statut...). */
function getGuildInfo() {
  const base = {
    online: false,
    guildId: GUILD_ID,
    botTag: null,
    guildName: null,
    guildIcon: null,
    memberCount: null,
    channels: [],
    categories: [],
    roles: [],
    inviteUrl: null,
  };
  if (!client || !isReady) return base;

  base.online = true;
  base.botTag = client.user.tag;
  base.botAvatar = client.user.displayAvatarURL({ size: 128 });
  base.inviteUrl = buildInviteUrl(client.user.id);

  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return { ...base, onGuild: false };

  base.onGuild = true;
  base.guildName = guild.name;
  base.guildIcon = guild.iconURL({ size: 128 });
  base.memberCount = guild.memberCount;

  base.channels = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: c.name }));

  base.categories = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildCategory)
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: c.name }));

  base.roles = guild.roles.cache
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name, color: r.hexColor }));

  return base;
}

/** Envoie un faux message de bienvenue (le bot joue le nouveau membre). */
async function sendTestWelcome() {
  if (!client || !isReady) {
    return { ok: false, reason: 'Le bot est hors ligne. Vérifie le token dans le fichier .env puis redémarre le bot.' };
  }
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) {
    return { ok: false, reason: 'Le bot n\'est pas sur le serveur Virality. Utilise le lien d\'invitation affiché en haut du dashboard.' };
  }
  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!me) return { ok: false, reason: 'Impossible de récupérer le membre du bot sur le serveur.' };
  return sendWelcome(me, { test: true });
}

/* --------------------- Style des rôles (dashboard, 1 clic) --------------------- */

function hexToInt(hex) {
  const value = parseInt(String(hex || '').trim().replace(/^#/, ''), 16);
  return Number.isNaN(value) ? 0xff6a00 : value;
}

/** "🔥・Membre" -> "membre" (pour retrouver un rôle malgré les emojis/espaces). */
function simplifyRoleName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

/**
 * Applique le style Virality aux rôles du serveur (nom + couleur + affichage
 * séparé), et crée les rôles manquants marqués "creatable" (Accueil, Membre).
 * Les permissions des rôles existants ne sont jamais modifiées.
 */
async function applyRolesStyle() {
  if (!client || !isReady) {
    return { ok: false, reason: 'Le bot est hors ligne. Vérifie le token dans le fichier .env puis redémarre le bot.', results: [] };
  }
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) {
    return { ok: false, reason: 'Le bot n\'est pas sur le serveur Virality. Utilise le lien d\'invitation affiché en haut du dashboard.', results: [] };
  }
  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!me) {
    return { ok: false, reason: 'Impossible de récupérer le membre du bot sur le serveur.', results: [] };
  }
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { ok: false, reason: 'Le bot n\'a pas la permission « Gérer les rôles ». Réinvite-le avec le lien affiché en haut du dashboard (il contient les bonnes permissions).', results: [] };
  }

  await guild.roles.fetch().catch(() => {});
  const myHighest = me.roles.highest;
  const cfg = getConfig();
  const results = [];
  let configChanged = false;

  for (const entry of cfg.rolesStyle) {
    try {
      let role = entry.id ? guild.roles.cache.get(entry.id) : null;

      // Retrouver un rôle "à créer" qui existe peut-être déjà sous le même nom
      if (!role && entry.creatable) {
        const wanted = simplifyRoleName(entry.name);
        role = guild.roles.cache.find(
          (r) => r.id !== guild.id && !r.managed && simplifyRoleName(r.name) === wanted
        ) || null;
        if (role && entry.id !== role.id) {
          entry.id = role.id;
          configChanged = true;
        }
      }

      if (!role && !entry.creatable) {
        results.push({
          key: entry.key, name: entry.name, status: 'error',
          message: 'Rôle introuvable sur le serveur (il a peut-être été supprimé). Je ne le recrée pas pour ne pas perdre ses permissions : dis-moi si tu veux que je le recrée.',
        });
        continue;
      }

      let created = false;
      if (!role) {
        role = await guild.roles.create({
          name: entry.name,
          color: hexToInt(entry.color),
          hoist: entry.hoist,
          mentionable: false,
          permissions: [],
          reason: 'Créée depuis le dashboard Virality (style des rôles en 1 clic)',
        });
        created = true;
        entry.id = role.id;
        configChanged = true;
      }

      // discord interdit de modifier un rôle placé au-dessus (ou au même niveau) que celui du bot
      if (!created && role.position >= myHighest.position) {
        results.push({
          key: entry.key, name: entry.name, status: 'error',
          message: `Le rôle « ${role.name} » est placé au-dessus du rôle du bot : discord m'interdit de le toucher. Va dans Paramètres du serveur → Rôles, glisse le rôle « ${myHighest.name} » (celui du bot) AU-DESSUS des rôles du staff, puis reclique sur le bouton.`,
        });
        continue;
      }

      if (!created) {
        await role.edit({
          name: entry.name,
          color: hexToInt(entry.color),
          hoist: entry.hoist,
          reason: 'Style appliqué depuis le dashboard Virality',
        });
      }

      // Bonus : emoji officiel du rôle (serveurs boostés niveau 2+) — échec ignoré en silence
      if (entry.emoji) {
        await role.edit({ unicodeEmoji: entry.emoji }).catch(() => {});
      }

      results.push({
        key: entry.key,
        name: entry.name,
        status: created ? 'created' : 'updated',
        message: created ? 'Rôle créé avec le style Virality ✨' : 'Nom et couleur appliqués ✅',
      });
    } catch (err) {
      const message = err?.code === 50013
        ? 'discord a refusé (permissions) : le rôle du bot doit être placé au-dessus des rôles du staff (Paramètres du serveur → Rôles, glisse-dépose).'
        : `Erreur discord : ${err.message}`;
      results.push({ key: entry.key, name: entry.name, status: 'error', message });
    }
  }

  if (configChanged) saveConfig();
  const okCount = results.filter((r) => r.status !== 'error').length;
  return { ok: okCount > 0, results, config: getConfig() };
}

/* ---------------- Construction du serveur (dashboard, 1 clic) ---------------- */

// Autres noms possibles pour retrouver un salon/catégorie déjà existant
// au lieu d'en créer un deuxième (comparaison sans emoji ni accents).
const CATEGORY_ALIASES = {
  informations: ['informations', 'information', 'infos', 'info'],
  communaute: ['communaute', 'community'],
  clipper: ['clipper', 'clippers', 'espaceclipper'],
};
const CHANNEL_ALIASES = {
  annonces: ['annonces', 'annonce', 'announcements', 'announcement'],
  bienvenue: ['bienvenue', 'welcome', 'arrivees'],
  'a-propos': ['apropos', 'about'],
  'success-flex': ['successflex', 'sucessflex', 'flex'],
  proof: ['proof', 'preuves'],
  tickets: ['tickets', 'ticket', 'support'],
  commandes: ['commandes', 'commande', 'orders'],
  discussion: ['discussion', 'discussions'],
  bonus: ['bonus'],
};

function matchesName(name, clé, aliasesMap, wantedName) {
  const simple = simplifyRoleName(name);
  const candidates = [
    simplifyRoleName(wantedName),
    simplifyRoleName(clé),
    ...(aliasesMap[clé] || []).map(simplifyRoleName),
  ];
  return candidates.includes(simple);
}

/** Retrouve un rôle "stylé" sur le serveur (par ID mémorisé, sinon par nom). */
function findStyledRole(guild, entry) {
  if (entry.id) {
    const byId = guild.roles.cache.get(entry.id);
    if (byId) return byId;
  }
  const wanted = simplifyRoleName(entry.name);
  return guild.roles.cache.find(
    (r) => r.id !== guild.id && !r.managed && simplifyRoleName(r.name) === wanted
  ) || null;
}

/** Comme findStyledRole, mais crée le rôle s'il est marqué "creatable". */
async function ensureStyledRole(guild, entry) {
  let role = findStyledRole(guild, entry);
  let created = false;
  if (role && entry.id !== role.id) entry.id = role.id;
  if (!role && entry.creatable) {
    role = await guild.roles.create({
      name: entry.name,
      color: hexToInt(entry.color),
      hoist: entry.hoist,
      mentionable: false,
      permissions: [],
      reason: 'Créé depuis le dashboard Virality (construction du serveur)',
    });
    created = true;
    entry.id = role.id;
    if (entry.emoji) await role.edit({ unicodeEmoji: entry.emoji }).catch(() => {});
  }
  return { role, created };
}

/** Permissions de chaque catégorie (le cœur du "plan" du serveur). */
function overwritesForCategory(clé, ctx) {
  const F = PermissionFlagsBits;
  const everyoneId = ctx.guild.id;
  const botOw = {
    id: ctx.me.id,
    allow: [
      F.ViewChannel, F.SendMessages, F.ReadMessageHistory,
      F.EmbedLinks, F.AttachFiles, F.ManageMessages, F.ManageChannels,
    ],
  };
  const staffOws = ctx.staffRoles.map((r) => ({
    id: r.id,
    allow: [F.ViewChannel, F.SendMessages, F.ReadMessageHistory, F.ManageMessages],
  }));

  // 📌 Informations : tout le monde LIT, seuls le staff et le bot ÉCRIVENT
  if (clé === 'informations') {
    return [
      { id: everyoneId, allow: [F.ViewChannel, F.ReadMessageHistory, F.AddReactions], deny: [F.SendMessages] },
      botOw,
      ...staffOws,
    ];
  }

  // 💬 Communauté : tout le monde voit et participe
  if (clé === 'communaute') {
    return [
      {
        id: everyoneId,
        allow: [F.ViewChannel, F.SendMessages, F.ReadMessageHistory, F.AddReactions, F.EmbedLinks, F.AttachFiles],
      },
      botOw,
      ...staffOws,
    ];
  }

  // 🔒 Espace Clipper (privé) :
  //  - @everyone (et donc Accueil) : invisible
  //  - Membre : voit les Salons et peut écrire, MAIS pas l'Historique passé
  //  - Clipper : tout voit, Historique compris
  //  - Staff + bot : accès complet
  const ows = [
    { id: everyoneId, deny: [F.ViewChannel] },
    botOw,
    ...staffOws,
  ];
  if (ctx.membreRole) {
    ows.push({
      id: ctx.membreRole.id,
      allow: [F.ViewChannel, F.SendMessages, F.AddReactions],
      deny: [F.ReadMessageHistory],
    });
  }
  if (ctx.clipperRole) {
    ows.push({
      id: ctx.clipperRole.id,
      allow: [F.ViewChannel, F.SendMessages, F.ReadMessageHistory, F.AddReactions, F.EmbedLinks, F.AttachFiles],
    });
  }
  return ows;
}

/**
 * Construit (ou remet en forme) toute la structure du serveur :
 * catégories, Salons, descriptions et permissions, selon config.serverStructure.
 * Sûr par conception : ne SUPPRIME jamais rien. Ce qui existe déjà est
 * retrouvé par nom, déplacé au bon endroit, renommé et re-synchronisé.
 */
async function buildServerStructure() {
  if (!client || !isReady) {
    return { ok: false, reason: 'Le bot est hors ligne. Vérifie le token dans le fichier .env puis redémarre le bot.', results: [] };
  }
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) {
    return { ok: false, reason: 'Le bot n\'est pas sur le serveur Virality. Utilise le lien d\'invitation affiché en haut du dashboard.', results: [] };
  }
  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!me) {
    return { ok: false, reason: 'Impossible de récupérer le membre du bot sur le serveur.', results: [] };
  }

  const missing = [];
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) missing.push('« Gérer les Salons »');
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) missing.push('« Gérer les rôles »');
  if (missing.length) {
    return {
      ok: false,
      reason: `Il manque au bot la permission ${missing.join(' et ')}. Pour l'ajouter (10 secondes) : discord → Paramètres du serveur → Rôles → clique le rôle du bot → active ${missing.join(' et ')} → Enregistrer. Puis reclique le bouton ici.`,
      results: [],
    };
  }

  await guild.roles.fetch().catch(() => {});
  await guild.channels.fetch().catch(() => {});

  const cfg = getConfig();
  const results = [];
  let configChanged = false;
  const entryByKey = (k) => cfg.rolesStyle.find((r) => r.key === k);

  // Rôles du staff (accès partout)
  const staffRoles = [];
  for (const k of ['fondateur', 'gerant', 'moderateur', 'moderateur-test']) {
    const entry = entryByKey(k);
    if (!entry) continue;
    const role = findStyledRole(guild, entry);
    if (role) {
      if (entry.id !== role.id) { entry.id = role.id; configChanged = true; }
      staffRoles.push(role);
    }
  }

  // Rôles Membre et Clipper : créés au besoin (requis pour les permissions)
  let membreRole = null;
  let clipperRole = null;
  for (const k of ['membre', 'clipper']) {
    const entry = entryByKey(k);
    if (!entry) continue;
    const before = entry.id;
    try {
      const { role, created } = await ensureStyledRole(guild, entry);
      if (k === 'membre') membreRole = role;
      else clipperRole = role;
      if (created) {
        results.push({ name: entry.name, status: 'created', message: 'Rôle créé (nécessaire pour les permissions de l\'Espace Clipper) ✨' });
      }
      if (entry.id !== before) configChanged = true;
    } catch (err) {
      results.push({ name: entry.name, status: 'error', message: `Création du rôle impossible : ${err.message}` });
    }
  }

  const ctx = { guild, me, staffRoles, membreRole, clipperRole };
  const usedChannelIds = new Set();
  let bienvenueChannel = null;
  const isTextual = (c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement;

  for (const catDef of cfg.serverStructure.categories) {
    try {
      const overwrites = overwritesForCategory(catDef.key, ctx);
      let category = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildCategory && matchesName(c.name, catDef.key, CATEGORY_ALIASES, catDef.name)
      );
      let catCreated = false;
      if (!category) {
        category = await guild.channels.create({
          name: catDef.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: overwrites,
          reason: 'Construction du serveur depuis le dashboard Virality',
        });
        catCreated = true;
      } else {
        await category.edit({
          name: catDef.name,
          permissionOverwrites: overwrites,
          reason: 'Remise en forme depuis le dashboard Virality',
        });
      }
      results.push({
        name: catDef.name,
        status: catCreated ? 'created' : 'updated',
        message: catCreated ? 'Catégorie créée ✨' : 'Catégorie remise en forme (nom + permissions) ✅',
      });

      for (const chDef of catDef.channels) {
        try {
          // 1) déjà dans cette catégorie ? 2) ailleurs sur le serveur ?
          let channel = guild.channels.cache.find(
            (c) => isTextual(c) && !usedChannelIds.has(c.id) && c.parentId === category.id
              && matchesName(c.name, chDef.key, CHANNEL_ALIASES, chDef.name)
          ) || guild.channels.cache.find(
            (c) => isTextual(c) && !usedChannelIds.has(c.id)
              && matchesName(c.name, chDef.key, CHANNEL_ALIASES, chDef.name)
          );

          let created = false;
          if (!channel) {
            channel = await guild.channels.create({
              name: chDef.name,
              type: ChannelType.GuildText,
              parent: category.id,
              topic: chDef.topic || undefined,
              reason: 'Construction du serveur depuis le dashboard Virality',
            });
            created = true;
          } else {
            if (channel.parentId !== category.id) {
              await channel.setParent(category.id, { lockPermissions: true });
            } else if (typeof channel.lockPermissions === 'function') {
              await channel.lockPermissions().catch(() => {});
            }
            if (channel.name !== chDef.name) await channel.setName(chDef.name).catch(() => {});
            if (chDef.topic && channel.topic !== chDef.topic && typeof channel.setTopic === 'function') {
              await channel.setTopic(chDef.topic).catch(() => {});
            }
          }

          usedChannelIds.add(channel.id);
          if (chDef.key === 'bienvenue') bienvenueChannel = channel;
          results.push({
            name: `#${chDef.name}`,
            status: created ? 'created' : 'updated',
            message: created ? 'Salon créé dans la catégorie ✨' : 'Salon rangé au bon endroit, renommé, permissions synchronisées ✅',
          });
        } catch (err) {
          results.push({ name: `#${chDef.name}`, status: 'error', message: `Erreur discord : ${err.message}` });
        }
      }
    } catch (err) {
      results.push({ name: catDef.name, status: 'error', message: `Erreur discord : ${err.message}` });
    }
  }

  // Relie automatiquement le salon de bienvenue si ce n'est pas déjà fait
  if (bienvenueChannel && !cfg.welcome.channelId) {
    cfg.welcome.channelId = bienvenueChannel.id;
    configChanged = true;
    results.push({
      name: 'Salon de bienvenue',
      status: 'updated',
      message: 'Relié automatiquement au système de bienvenue 👋 (vérifie dans l\'onglet Bienvenue)',
    });
  }

  if (configChanged) saveConfig();
  return { ok: results.some((r) => r.status !== 'error'), results, config: getConfig() };
}

/* ---------------- Tickets + Embeds (actions du dashboard) ---------------- */

/** Retrouve le serveur Virality si le bot est en ligne, sinon message clair. */
function requireGuild() {
  if (!client || !isReady) {
    return { error: 'Le bot est hors ligne. Vérifie le token dans le fichier .env puis redémarre le bot.' };
  }
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) {
    return { error: 'Le bot n\'est pas sur le serveur Virality. Utilise le lien d\'invitation affiché en haut du dashboard.' };
  }
  return { guild };
}

/** Publie/met à jour le panneau de tickets (bouton du dashboard). */
async function publishTicketPanel() {
  const { guild, error } = requireGuild();
  if (error) return { ok: false, reason: error };
  try {
    const result = await tickets.publishPanel(guild);
    if (result.ok) return { ...result, config: getConfig() };
    return result;
  } catch (err) {
    return { ok: false, reason: `Publication impossible : ${err.message} (le bot a-t-il le droit d'écrire dans ce salon ?)` };
  }
}

/** Envoie un modèle d'embed du créateur d'embeds dans son salon cible. */
async function sendEmbedTemplate(index) {
  const { guild, error } = requireGuild();
  if (error) return { ok: false, reason: error };

  const template = getConfig().embeds.templates[index];
  if (!template) return { ok: false, reason: 'Modèle d\'embed introuvable. Recharge la page et réessaie.' };
  if (!template.channelId) {
    return { ok: false, reason: 'Choisis d\'abord le salon où envoyer cet embed (liste déroulante en haut du créateur).' };
  }

  let channel = guild.channels.cache.get(template.channelId)
    || (await guild.channels.fetch(template.channelId).catch(() => null));
  if (!channel || typeof channel.send !== 'function') {
    return { ok: false, reason: 'Salon d\'envoi introuvable. Vérifie ton choix dans la liste des Salons.' };
  }

  const payload = buildEmbedPayload(
    template.embed,
    { guildName: guild.name, memberCount: guild.memberCount },
    { content: template.content, pingEveryone: template.pingEveryone }
  );
  if (!payload) {
    return { ok: false, reason: 'Cet embed est complètement vide : ajoute au moins un titre, une description, un champ, une image ou un texte.' };
  }

  try {
    const sent = await channel.send(payload);
    return { ok: true, channelName: channel.name, messageId: sent.id };
  } catch (err) {
    return { ok: false, reason: `Envoi impossible : ${err.message} (le bot a-t-il le droit d'écrire dans ce salon ?)` };
  }
}

/* ---------------- Interface rapide Commandes (accès bcko) ---------------- */

function extractQuickOrderLinks(input) {
  const chunks = Array.isArray(input)
    ? input
    : String(input ?? '').split(/\s+/);

  const candidates = [];
  for (const chunk of chunks) {
    const text = String(chunk ?? '');
    const found = text.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi)
      || text.match(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s<>"']*)?/gi)
      || [];
    candidates.push(...found);
  }

  const links = [];
  const seen = new Set();
  for (const candidate of candidates) {
    let raw = String(candidate).trim()
      .replace(/^[<([{"']+/, '')
      .replace(/[>)\]}>"']+$/, '')
      .replace(/[.,;]+$/, '');
    if (!raw) continue;
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw.replace(/^\/+/, '')}`;

    try {
      const parsed = new URL(raw);
      if (!['http:', 'https:'].includes(parsed.protocol)) continue;
    } catch {
      continue;
    }

    if (!seen.has(raw)) {
      seen.add(raw);
      links.push(raw);
    }
    if (links.length >= 10) break;
  }
  return links;
}

function buildQuickOrderPayload({ links, message, roleId }) {
  const cleanLinks = extractQuickOrderLinks(links);
  const linkLines = cleanLinks.map((url, index) => (
    cleanLinks.length > 1 ? `**${index + 1}.** ${url}` : url
  ));
  const linksText = linkLines.join('\n');
  const availableForMessage = Math.max(0, 3900 - linksText.length);
  const cleanMessage = String(message ?? '').trim().slice(0, Math.min(1000, availableForMessage));

  const descriptionParts = [];
  if (cleanMessage) descriptionParts.push(cleanMessage, '');
  descriptionParts.push(cleanLinks.length > 1 ? '🔗 **Liens :**' : '🔗 **Lien :**', linksText);

  const embed = new EmbedBuilder()
    .setColor(0xff6a00)
    .setTitle(cleanLinks.length > 1 ? '🎬 Nouvelles commandes' : '🎬 Nouvelle commande')
    .setDescription(descriptionParts.join('\n').slice(0, 4096))
    .setFooter({ text: 'Virality • Commandes clippers' })
    .setTimestamp();

  return {
    content: `<@&${roleId}>`,
    embeds: [embed],
    allowedMentions: { parse: [], roles: [roleId] },
  };
}

async function resolveQuickOrderTargets(guild) {
  await guild.channels.fetch().catch(() => {});
  await guild.roles.fetch().catch(() => {});

  const cfg = getConfig();
  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));

  const clipperCategoryDef = cfg.serverStructure?.categories?.find((c) => c.key === 'clipper')
    || cfg.serverStructure?.categories?.find((c) => simplifyRoleName(c.name).includes('clipper'));
  const commandesDef = clipperCategoryDef?.channels?.find((c) => c.key === 'commandes')
    || { key: 'commandes', name: '🛒・commandes' };

  const category = clipperCategoryDef
    ? guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory
        && matchesName(c.name, clipperCategoryDef.key, CATEGORY_ALIASES, clipperCategoryDef.name)
    )
    : null;

  const isTextual = (c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement;
  const candidates = [...guild.channels.cache.values()]
    .filter((c) => isTextual(c) && matchesName(c.name, commandesDef.key, CHANNEL_ALIASES, commandesDef.name))
    .sort((a, b) => {
      const score = (c) => (category && c.parentId === category.id ? 0 : 1);
      return score(a) - score(b) || a.rawPosition - b.rawPosition;
    });
  const channel = candidates[0] || null;

  const clipperEntry = cfg.rolesStyle?.find((r) => r.key === 'clipper');
  const role = (clipperEntry ? findStyledRole(guild, clipperEntry) : null)
    || guild.roles.cache.find((r) => r.id !== guild.id && !r.managed && simplifyRoleName(r.name).includes('clipper'))
    || null;

  let permissions = null;
  try {
    permissions = channel && me ? channel.permissionsFor(me) : null;
  } catch {
    permissions = null;
  }

  const canSend = Boolean(permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ]));
  const canPingDirectly = Boolean(role && (
    role.mentionable || permissions?.has(PermissionFlagsBits.MentionEveryone)
  ));
  const canMakePingable = Boolean(
    role && me?.permissions?.has(PermissionFlagsBits.ManageRoles) && role.editable
  );

  return {
    me,
    channel,
    role,
    permissions,
    canSend,
    canPing: canPingDirectly || canMakePingable,
    canPingDirectly,
    canMakePingable,
  };
}

function quickOrderProblem({ channel, role, canSend, canPing }) {
  if (!channel) return 'Salon #🛒・commandes introuvable. Construis le serveur depuis l\'onglet 🏗️ ou vérifie le nom du salon.';
  if (!role) return 'Rôle 🎬・Clipper introuvable. Crée-le depuis l\'onglet 🎨 Rôles ou la construction du serveur.';
  if (!canSend) return 'Le bot ne peut pas écrire dans #commandes. Vérifie ses permissions : Voir le salon, Envoyer des messages et Intégrer des liens.';
  if (!canPing) return 'Le rôle Clipper ne peut pas être pingé. Dans discord : Paramètres du serveur → Rôles → Clipper → active « Autoriser tout le monde à mentionner ce rôle ». Autre solution : donne au bot « Gérer les rôles » et place son rôle au-dessus de Clipper.';
  return null;
}

/** État minimal et sûr pour la mini-interface bcko (aucun réglage sensible). */
async function getQuickOrderStatus() {
  const { guild, error } = requireGuild();
  if (error) return { ok: false, online: false, onGuild: false, reason: error };

  const targets = await resolveQuickOrderTargets(guild);
  const problem = quickOrderProblem(targets);
  return {
    ok: !problem,
    online: true,
    onGuild: true,
    guildName: guild.name,
    channelName: targets.channel?.name || null,
    roleName: targets.role?.name || null,
    canSend: targets.canSend,
    canPing: targets.canPing,
    reason: problem,
  };
}

/** Envoie directement un embed de commande dans #commandes avec ping @Clipper. */
async function sendQuickOrder(input = {}) {
  const links = extractQuickOrderLinks(input.links ?? input.link ?? input.linksText ?? '');
  if (!links.length) {
    return { ok: false, reason: 'Colle au moins un lien valide (commençant par https://).' };
  }
  if (links.join('\n').length > 3500) {
    return { ok: false, reason: 'Ces liens sont trop longs pour un seul embed discord. Envoie-les en deux fois.' };
  }

  const { guild, error } = requireGuild();
  if (error) return { ok: false, reason: error };

  const targets = await resolveQuickOrderTargets(guild);
  const problem = quickOrderProblem(targets);
  if (problem) return { ok: false, reason: problem };

  const { channel, role } = targets;
  let restoreMentionable = false;

  try {
    // Si le rôle n'est pas mentionnable et que le bot peut le gérer,
    // on l'autorise juste le temps d'envoyer, puis on remet comme avant.
    if (!targets.canPingDirectly && targets.canMakePingable) {
      await role.edit({
        mentionable: true,
        reason: 'Ping @Clipper pour une commande rapide Virality',
      });
      restoreMentionable = true;
    }

    const payload = buildQuickOrderPayload({
      links,
      message: input.message,
      roleId: role.id,
    });
    const sent = await channel.send(payload);
    console.log(`🛒 Commande rapide envoyée dans #${channel.name} (${links.length} lien(s), ping ${role.name}).`);

    return {
      ok: true,
      channelName: channel.name,
      roleName: role.name,
      messageId: sent.id,
      linksCount: links.length,
    };
  } catch (err) {
    return { ok: false, reason: `Envoi impossible : ${err.message}` };
  } finally {
    if (restoreMentionable) {
      await role.edit({
        mentionable: false,
        reason: 'Fin du ping @Clipper Virality',
      }).catch(() => {});
    }
  }
}

/* ---------------- Tickets manuels (interface normale) ---------------- */

/** Recherche de membres pour ouvrir un ticket depuis le dashboard. */
async function searchGuildMembers(query = '') {
  const { guild, error } = requireGuild();
  if (error) return { ok: false, reason: error, members: [] };

  const cleanQuery = String(query || '').trim().slice(0, 50);
  if (cleanQuery.length < 2) return { ok: true, members: [] };

  try {
    const fetched = await guild.members.fetch({ query: cleanQuery, limit: 25 });
    const members = [...fetched.values()]
      .filter((member) => !member.user.bot)
      .map((member) => ({
        id: member.id,
        username: member.user.username,
        tag: member.user.tag,
        displayName: member.displayName,
        avatarUrl: member.displayAvatarURL({ size: 64 }),
      }));
    return { ok: true, members };
  } catch (err) {
    return { ok: false, reason: `Recherche impossible : ${err.message}`, members: [] };
  }
}

/** Ouvre un ticket normal depuis le dashboard, pour le membre et le type choisis. */
async function createManualTicket({ userId, memberId, typeId, subject } = {}) {
  const { guild, error } = requireGuild();
  if (error) return { ok: false, reason: error };

  const cleanUserId = String(userId || memberId || '').trim();
  if (!/^\d{5,25}$/.test(cleanUserId)) {
    return { ok: false, reason: 'Choisis d\'abord un membre dans la liste.' };
  }

  const cfg = getConfig().tickets;
  const cleanTypeId = String(typeId || '').trim();
  if (cleanTypeId && !(cfg.types || []).some((type) => type.id === cleanTypeId)) {
    return { ok: false, reason: 'Ce type de ticket n\'existe plus. Recharge la page puis réessaie.' };
  }

  let member = guild.members.cache.get(cleanUserId)
    || (await guild.members.fetch(cleanUserId).catch(() => null));
  if (!member) return { ok: false, reason: 'Membre introuvable sur le serveur.' };
  if (member.user.bot) return { ok: false, reason: 'On ne peut pas ouvrir un ticket pour un bot.' };

  try {
    const result = await tickets.createTicketForMember({
      guild,
      member,
      subject: String(subject || '').trim().slice(0, 500),
      typeKey: cleanTypeId || null,
      openedBy: 'dashboard',
    });

    if (!result.ok) {
      return {
        ok: false,
        alreadyExists: Boolean(result.alreadyExists),
        channelId: result.channelId || null,
        channelName: result.channelName || null,
        reason: result.reason || 'Impossible d\'ouvrir ce ticket.',
      };
    }

    return {
      ok: true,
      channelId: result.channelId,
      channelName: result.channelName,
      number: result.number,
      typeId: result.typeId,
      typeName: result.typeName,
      memberTag: member.user.tag,
      memberName: member.displayName,
      config: getConfig(),
    };
  } catch (err) {
    return { ok: false, reason: `Création impossible : ${err.message} (le bot a-t-il « Gérer les Salons » ?)` };
  }
}

/**
 * État de l'IA pour le dashboard : clé Mistral présente ou non, intents
 * messages actifs au démarrage, et si un redémarrage est nécessaire
 * (les intents discord ne peuvent pas changer sans relancer le bot).
 */
function getAiRuntime() {
  const cfg = getConfig().tickets.ai;
  const wantsIntents = Boolean(cfg?.enabled && ai.isConfigured());
  return {
    ...ai.status(),
    enabledInConfig: Boolean(cfg?.enabled),
    model: cfg?.model || ai.DEFAULT_MODEL,
    intentsActive: messageIntentsAtBoot,
    needsRestart: wantsIntents !== messageIntentsAtBoot,
    ready: Boolean(cfg?.enabled && ai.isConfigured() && messageIntentsAtBoot && isReady),
  };
}

module.exports = {
  startBot,
  getGuildInfo,
  sendTestWelcome,
  applyRolesStyle,
  buildServerStructure,
  publishTicketPanel,
  sendEmbedTemplate,
  getQuickOrderStatus,
  sendQuickOrder,
  searchGuildMembers,
  createManualTicket,
  getAiRuntime,
  // Exportés pour les tests
  extractQuickOrderLinks,
  buildQuickOrderPayload,
  resolveQuickOrderTargets,
  GUILD_ID,
};
