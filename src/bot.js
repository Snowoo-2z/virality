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

module.exports = { startBot, getGuildInfo, sendTestWelcome, GUILD_ID };
