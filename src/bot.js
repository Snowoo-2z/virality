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
} = require('discord.js');
const configPanel = require('./configPanel');
const { sendWelcome, applyAutoRole } = require('./welcome');
const { getConfig, saveConfig } = require('./config');

const GUILD_ID = (process.env.GUILD_ID || '1562033502612885534').trim();

let client = null;
let isReady = false;

function createClient() {
  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      // Obligatoire pour détecter l'arrivée des nouveaux membres.
      // À activer aussi sur le portail développeur : "SERVER MEMBERS INTENT".
      GatewayIntentBits.GuildMembers,
    ],
  });

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
      await configPanel.handleInteraction(interaction);
    } catch (err) {
      console.error('❌ Erreur pendant une interaction /config :', err);
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
    PermissionFlagsBits.ManageRoles, // pour le rôle automatique
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

module.exports = { startBot, getGuildInfo, sendTestWelcome, applyRolesStyle, GUILD_ID };
