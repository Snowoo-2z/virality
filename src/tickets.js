'use strict';
/**
 * Système de tickets Virality.
 *
 * Fonctionnement :
 *  - Le dashboard publie un "panneau" (embed + bouton) dans un salon.
 *  - Au clic, un salon privé est créé pour le membre + les rôles staff
 *    choisis, dans une catégorie dédiée (créée au besoin).
 *  - Le propriétaire du ticket est inscrit dans la description (topic)
 *    du salon : "virality-ticket • owner:<id> • n°<num>" — c'est ce qui
 *    permet de retrouver les tickets ouverts même après un redémarrage.
 *  - Bouton "Fermer" : transcription .txt optionnelle (salon de logs
 *    et/ou MP), puis suppression du salon après un petit délai.
 */
const {
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  EmbedBuilder,
} = require('discord.js');
const { getConfig, saveConfig } = require('./config');
const { buildEmbedPayload } = require('./embeds');
const ai = require('./ai');

const OPEN_BUTTON_ID = 'ticket:open'; // anciens panneaux : 'ticket:open' | nouveaux : 'ticket:open:<typeId>'
const CLOSE_BUTTON_ID = 'ticket:close';
const MODAL_ID = 'ticket:modal:create'; // + ':<typeId>' pour les nouveaux panneaux
const ORANGE = 0xff6a00;
const autoJoinTicketsInFlight = new Set(); // évite un doublon si l'événement d'arrivée se répète
let ticketCreationQueue = Promise.resolve(); // un ticket à la fois : numéros et catégories toujours propres

const BUTTON_STYLES = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

/* ------------------------------ Utilitaires ------------------------------ */

function simplify(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

function sanitizeChannelName(raw) {
  const clean = String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
  return clean || 'ticket';
}

function ticketChannelName(patternOrCfg, member, number) {
  const pattern = typeof patternOrCfg === 'string'
    ? patternOrCfg
    : patternOrCfg?.namePattern;
  const raw = String(pattern || 'ticket-{number}')
    .replaceAll('{number}', String(number).padStart(3, '0'))
    .replaceAll('{user}', member?.user?.username ?? 'membre');
  return sanitizeChannelName(raw);
}

function parseTicketTopic(topic) {
  if (!topic || !topic.includes('virality-ticket')) return null;
  const owner = topic.match(/owner:(\d{5,})/)?.[1] || null;
  const number = topic.match(/n°(\d+)/)?.[1] || null;
  const type = topic.match(/type:([a-z0-9_-]+)/i)?.[1] || null;
  const subject = topic.match(/Sujet:\s*(.+)$/)?.[1]?.trim() || '';
  return owner ? { ownerId: owner, number, type, subject } : null;
}

function findUserTickets(guild, userId) {
  return guild.channels.cache.filter(
    (c) => c.type === ChannelType.GuildText && parseTicketTopic(c.topic)?.ownerId === userId
  );
}

function staffRolesOf(guild, roleIdsOrCfg) {
  const ids = Array.isArray(roleIdsOrCfg) ? roleIdsOrCfg : roleIdsOrCfg?.staffRoleIds || [];
  return ids
    .map((id) => guild.roles.cache.get(id))
    .filter(Boolean);
}

/** Les types de tickets configurés (toujours au moins un, voir config.js). */
function ticketTypes(cfg) {
  return Array.isArray(cfg.types) && cfg.types.length ? cfg.types : [];
}

/** Retrouve un type par son id, sinon le premier type (anciens tickets). */
function typeByKey(cfg, key) {
  const types = ticketTypes(cfg);
  return types.find((t) => t.id === key) || types[0] || null;
}

/** Rôles staff d'un type (repli sur les rôles staff globaux si vide). */
function typeStaffRoleIds(cfg, type) {
  return type?.staffRoleIds?.length ? type.staffRoleIds : cfg.staffRoleIds || [];
}

function memberAvatar(member) {
  try {
    if (typeof member?.displayAvatarURL === 'function') return member.displayAvatarURL({ size: 256 });
    if (typeof member?.user?.displayAvatarURL === 'function') return member.user.displayAvatarURL({ size: 256 });
  } catch { /* pas d'avatar */ }
  return null;
}

function ctxFor(member, extra = {}) {
  return {
    userId: member?.user?.id,
    username: member?.user?.username,
    guildName: member?.guild?.name,
    memberCount: member?.guild?.memberCount,
    avatarUrl: memberAvatar(member),
    ...extra,
  };
}

function baseOverwrites(guild, me, staffRoleIds, ownerId = null) {
  const F = PermissionFlagsBits;
  const ows = [
    { id: guild.id, deny: [F.ViewChannel] },
    {
      id: me.id,
      allow: [
        F.ViewChannel, F.SendMessages, F.ReadMessageHistory,
        F.ManageMessages, F.ManageChannels, F.EmbedLinks, F.AttachFiles,
      ],
    },
    ...staffRolesOf(guild, staffRoleIds).map((r) => ({
      id: r.id,
      allow: [F.ViewChannel, F.SendMessages, F.ReadMessageHistory, F.ManageMessages, F.EmbedLinks, F.AttachFiles],
    })),
  ];
  if (ownerId) {
    ows.push({
      id: ownerId,
      allow: [F.ViewChannel, F.SendMessages, F.ReadMessageHistory, F.EmbedLinks, F.AttachFiles],
    });
  }
  return ows;
}

/* ------------------------------ Panneau ------------------------------ */

function panelComponents(cfg) {
  const types = ticketTypes(cfg);
  const buttons = (types.length ? types : [null]).map((type) => {
    const button = new ButtonBuilder()
      .setCustomId(type ? `${OPEN_BUTTON_ID}:${type.id}` : OPEN_BUTTON_ID)
      .setLabel((type?.buttonLabel || type?.name || cfg.panelButtonLabel || 'Ouvrir un ticket').slice(0, 80))
      .setStyle(BUTTON_STYLES[type?.buttonStyle] ?? ButtonStyle.Primary);
    const emoji = type?.buttonEmoji ?? cfg.panelButtonEmoji;
    if (emoji) {
      try { button.setEmoji(emoji); } catch { /* emoji invalide : bouton sans emoji */ }
    }
    return button;
  });

  // discord : 5 rangées max, 5 boutons par rangée. Un bouton par rangée
  // reste le plus lisible jusqu'à 5 types ; au-delà on les range par 5.
  const perRow = buttons.length <= 5 ? 1 : 5;
  const rows = [];
  for (let i = 0; i < buttons.length && rows.length < 5; i += perRow) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + perRow)));
  }
  return rows;
}

/** Publie (ou met à jour) le panneau de tickets dans le salon configuré. */
async function publishPanel(guild) {
  const cfg = getConfig().tickets;
  if (!cfg.enabled) {
    return { ok: false, reason: 'Le système de tickets est désactivé. Active l\'interrupteur en haut de l\'onglet Tickets, enregistre, puis reclique.' };
  }
  if (!cfg.panelChannelId) {
    return { ok: false, reason: 'Choisis d\'abord le salon où publier le panneau (par exemple #🎫・tickets).' };
  }

  let channel = guild.channels.cache.get(cfg.panelChannelId)
    || (await guild.channels.fetch(cfg.panelChannelId).catch(() => null));
  if (!channel || typeof channel.send !== 'function') {
    return { ok: false, reason: 'Salon du panneau introuvable. Vérifie ton choix dans la liste des Salons.' };
  }

  const payload = buildEmbedPayload(
    cfg.panelEmbed,
    { guildName: guild.name, memberCount: guild.memberCount },
    { components: panelComponents(cfg) }
  );
  if (!payload) {
    return { ok: false, reason: 'Le panneau est vide : mets au moins un titre ou une description à l\'embed du panneau.' };
  }

  // Essaie de modifier l'ancien panneau plutôt que d'en poster un nouveau
  if (cfg.panelMessageId) {
    const existing = await channel.messages.fetch(cfg.panelMessageId).catch(() => null);
    if (existing) {
      if (!payload.files) payload.attachments = []; // retire d'éventuelles anciennes images
      await existing.edit(payload);
      return { ok: true, updated: true, channelName: channel.name };
    }
  }

  const sent = await channel.send(payload);
  cfg.panelMessageId = sent.id; // cfg = référence dans la config en mémoire
  saveConfig();
  return { ok: true, created: true, channelName: channel.name };
}

/* --------------------------- Création de ticket --------------------------- */

async function resolveCategory(guild, me, cfg, type) {
  // Le type peut avoir sa propre catégorie ; sinon celle des réglages généraux.
  const holder = type && (type.categoryId || type.categoryName) ? type : cfg;
  const wantedName = holder.categoryName || cfg.categoryName;

  let category = holder.categoryId ? guild.channels.cache.get(holder.categoryId) : null;
  if (category && category.type !== ChannelType.GuildCategory) category = null;
  if (!category) {
    category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && simplify(c.name) === simplify(wantedName)
    ) || null;
  }
  if (!category) {
    // Permissions de la catégorie : staff du type + staff global (les Salons
    // de tickets ont de toute façon leurs propres permissions explicites).
    const unionStaff = [...new Set([...(cfg.staffRoleIds || []), ...typeStaffRoleIds(cfg, type)])];
    category = await guild.channels.create({
      name: wantedName,
      type: ChannelType.GuildCategory,
      permissionOverwrites: baseOverwrites(guild, me, unionStaff),
      reason: 'Catégorie des tickets Virality',
    });
  }
  if (holder.categoryId !== category.id) {
    holder.categoryId = category.id; // cfg/type = références dans la config en mémoire
    saveConfig();
  }
  return category;
}

/**
 * Crée un ticket normal pour un membre donné.
 * Utilisé par les boutons discord, l'ouverture manuelle du dashboard
 * et l'ouverture automatique à l'arrivée d'un nouveau membre.
 * Les créations passent une par une pour éviter les numéros en double
 * quand plusieurs membres arrivent ou cliquent en même temps.
 */
function createTicketForMember(options = {}) {
  const run = ticketCreationQueue.then(() => createTicketForMemberNow(options));
  ticketCreationQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function createTicketForMemberNow({ guild, member, subject = '', typeKey = null, openedBy = 'member' } = {}) {
  const cfg = getConfig().tickets;
  if (!cfg.enabled) {
    return { ok: false, reason: 'Le système de tickets est désactivé. Active-le en haut de l\'onglet Tickets, puis enregistre.' };
  }
  if (!guild || !member) {
    return { ok: false, reason: 'Membre ou serveur introuvable.' };
  }
  const type = typeByKey(cfg, typeKey);
  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!me) return { ok: false, reason: 'Impossible de récupérer le membre du bot.' };

  await guild.channels.fetch().catch(() => {});
  const already = findUserTickets(guild, member.id);
  if (already.size >= cfg.maxPerUser) {
    const first = already.first();
    return {
      ok: false,
      alreadyExists: true,
      channel: first,
      channelId: first?.id || null,
      channelName: first?.name || null,
      reason: `Ce membre a déjà ${already.size > 1 ? 'des tickets ouverts' : 'un ticket ouvert'}${first ? ` (#${first.name})` : ''}.`,
    };
  }

  const staffIds = staffRolesOf(guild, typeStaffRoleIds(cfg, type)).map((r) => r.id);
  const category = await resolveCategory(guild, me, cfg, type);
  const number = (Number(cfg.counter) || 0) + 1;
  const topic = `virality-ticket • owner:${member.id} • n°${number}${type ? ` • type:${type.id}` : ''}${subject ? ` • Sujet: ${subject}` : ''}`.slice(0, 1024);

  const channel = await guild.channels.create({
    name: ticketChannelName(type?.namePattern || cfg.namePattern, member, number),
    type: ChannelType.GuildText,
    parent: category.id,
    topic,
    permissionOverwrites: baseOverwrites(guild, me, staffIds, member.id),
    reason: `Ticket ${openedBy === 'dashboard'
      ? 'ouvert depuis le dashboard pour'
      : openedBy === 'auto-join'
        ? 'ouvert automatiquement à l\'arrivée de'
        : 'ouvert par'} ${member.user.tag}${type ? ` (${type.name})` : ''}`,
  });

  cfg.counter = number;
  saveConfig();

  // Message d'accueil dans le ticket (propre au type cliqué)
  const ctx = ctxFor(member, { number, subject: subject || '' });
  const payload = buildEmbedPayload(type?.openEmbed || cfg.openEmbed, ctx, {
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CLOSE_BUTTON_ID)
        .setLabel('Fermer le ticket')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger)
    )],
  }) || { content: `Bienvenue dans ton ticket, ${member} !` };

  const openEmbed = payload.embeds?.[0];
  const canAddEmbedField = () => (openEmbed?.data?.fields?.length || 0) < 25; // limite discord
  if (subject && openEmbed && canAddEmbedField()) {
    openEmbed.addFields({ name: '📝 Sujet', value: subject.slice(0, 1024) });
  }
  if (openedBy === 'dashboard' && openEmbed && canAddEmbedField()) {
    openEmbed.addFields({
      name: '🖥️ Ouverture',
      value: 'Ticket créé directement par l\'équipe depuis le dashboard.',
    });
  }
  if (openedBy === 'auto-join' && openEmbed && canAddEmbedField()) {
    openEmbed.addFields({
      name: '👋 Bienvenue',
      value: 'Ticket créé automatiquement à ton arrivée sur le serveur.',
    });
  }

  const shouldPingStaff = type ? type.pingStaff : cfg.pingStaff;
  const pings = [`<@${member.id}>`];
  if (shouldPingStaff) pings.push(...staffIds.map((id) => `<@&${id}>`));
  payload.content = pings.join(' ');
  payload.allowedMentions = { users: [member.id], roles: shouldPingStaff ? staffIds : [] };

  await channel.send(payload);

  // Premier message de l'IA (si activée) : en arrière-plan, sans bloquer l'ouverture
  maybeAiGreeting(channel, member, { number, subject: subject || '', type })
    .catch((err) => console.warn('⚠️  Accueil IA du ticket échoué :', err.message));

  return {
    ok: true,
    channel,
    channelId: channel.id,
    channelName: channel.name,
    number,
    type,
    typeId: type?.id || null,
    typeName: type?.name || null,
  };
}

/**
 * Ouvre automatiquement le ticket d'accueil d'un membre qui vient
 * de rejoindre le serveur, si l'option est activée dans le dashboard.
 */
async function maybeCreateAutoTicketOnJoin(member) {
  const cfg = getConfig().tickets;
  if (!cfg.enabled || !cfg.autoCreateOnJoin || !member?.guild || !member?.user || member.user.bot) {
    return { ok: false, skipped: true, reason: 'Ticket automatique à l\'arrivée désactivé.' };
  }

  const flightKey = `${member.guild.id}:${member.id}`;
  if (autoJoinTicketsInFlight.has(flightKey)) {
    return { ok: false, skipped: true, reason: 'Création du ticket d\'arrivée déjà en cours.' };
  }

  autoJoinTicketsInFlight.add(flightKey);
  try {
    const result = await createTicketForMember({
      guild: member.guild,
      member,
      subject: cfg.autoCreateOnJoinSubject || '',
      typeKey: cfg.autoCreateOnJoinTypeId || null,
      openedBy: 'auto-join',
    });

    if (result.ok) {
      console.log(`🎫 Ticket d'arrivée créé pour ${member.user.tag} : #${result.channelName}${result.typeName ? ` (${result.typeName})` : ''}`);
    } else if (result.alreadyExists) {
      console.log(`🎫 ${member.user.tag} avait déjà un ticket ouvert (#${result.channelName || 'ticket existant'}) : aucun doublon créé.`);
    } else {
      console.warn(`⚠️  Ticket d'arrivée non créé pour ${member.user.tag} : ${result.reason || 'raison inconnue'}`);
    }
    return result;
  } catch (err) {
    console.warn(`⚠️  Ticket d'arrivée non créé pour ${member.user.tag} : ${err.message}`);
    return { ok: false, reason: err.message };
  } finally {
    autoJoinTicketsInFlight.delete(flightKey);
  }
}

/** Ouverture depuis un bouton / formulaire discord (comportement historique). */
async function createTicket(interaction, subject, typeKey) {
  const result = await createTicketForMember({
    guild: interaction.guild,
    member: interaction.member,
    subject,
    typeKey,
    openedBy: 'member',
  });

  if (result.alreadyExists) {
    await interaction.editReply({
      content: `🎫 Tu as déjà un ticket ouvert : ${result.channel} — continue là-bas, on s'occupe de toi !`,
    });
    return;
  }
  if (!result.ok) {
    await interaction.editReply({
      content: `❌ ${result.reason || 'Impossible d\'ouvrir ce ticket.'}`,
    });
    return;
  }

  await interaction.editReply({
    content: `✅ Ton ticket est ouvert : ${result.channel} — clique pour y aller !`,
  });
}

/* --------------------------- Fermeture + transcription --------------------------- */

/** Transforme une liste de messages en texte lisible (testable unitairement). */
function formatTranscript(messages, headerLines = []) {
  const lines = [
    '==================================================',
    '   VIRALITY — Transcription de ticket',
    '==================================================',
    ...headerLines,
    '--------------------------------------------------',
    '',
  ];
  for (const msg of messages) {
    const when = new Date(msg.createdTimestamp).toLocaleString('fr-FR');
    let line = `[${when}] ${msg.author?.tag ?? 'inconnu'} : ${msg.content ?? ''}`;
    const attachments = msg.attachments?.map ? [...msg.attachments.values()] : (msg.attachments || []);
    for (const att of attachments) line += `\n    📎 Pièce jointe : ${att.url}`;
    if (msg.embeds?.length) line += '\n    [embed]';
    lines.push(line);
  }
  return lines.join('\n');
}

async function buildTranscript(channel, meta) {
  const fetched = await channel.messages.fetch({ limit: 100 });
  const messages = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const text = formatTranscript(messages, [
    `Salon : #${channel.name}`,
    `Ouvert par : ${meta.ownerTag} (${meta.ownerId})`,
    `Fermé par : ${meta.closedByTag}`,
    meta.subject ? `Sujet : ${meta.subject}` : null,
    `Messages : ${messages.length}${messages.length === 100 ? ' (les 100 derniers)' : ''}`,
  ].filter(Boolean));
  return { buffer: Buffer.from(text, 'utf8'), count: messages.length };
}

async function closeTicket(interaction) {
  const channel = interaction.channel;
  const cfg = getConfig().tickets;
  const meta = parseTicketTopic(channel?.topic);

  if (!meta) {
    return interaction.reply({
      content: '🤔 Ce salon n\'est pas un ticket Virality.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const member = interaction.member;
  const type = typeByKey(cfg, meta.type);
  const isOwner = interaction.user.id === meta.ownerId;
  const isStaff = isStaffMember(member, cfg, type);
  if (!isOwner && !isStaff) {
    return interaction.reply({
      content: '⛔ Seuls le créateur du ticket et l\'équipe peuvent le fermer.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const owner = await interaction.client.users.fetch(meta.ownerId).catch(() => null);
  const wantTranscript = Boolean(cfg.transcriptChannelId) || cfg.dmTranscript;
  let transcript = null;
  if (wantTranscript) {
    transcript = await buildTranscript(channel, {
      ownerId: meta.ownerId,
      ownerTag: owner?.tag ?? meta.ownerId,
      closedByTag: interaction.user.tag,
      subject: meta.subject,
    }).catch(() => null);
  }
  const fileName = `transcript-${channel.name}.txt`;
  const makeFile = () => new AttachmentBuilder(transcript.buffer, { name: fileName });

  // Envoi dans le salon de logs
  if (cfg.transcriptChannelId) {
    try {
      const logChannel = interaction.guild.channels.cache.get(cfg.transcriptChannelId)
        || (await interaction.guild.channels.fetch(cfg.transcriptChannelId).catch(() => null));
      if (logChannel && typeof logChannel.send === 'function') {
        const logEmbed = new EmbedBuilder()
          .setColor(ORANGE)
          .setTitle('🎫 Ticket fermé')
          .addFields(
            { name: 'Salon', value: `#${channel.name}`, inline: true },
            { name: 'Ouvert par', value: `<@${meta.ownerId}>`, inline: true },
            { name: 'Fermé par', value: `<@${interaction.user.id}>`, inline: true },
          )
          .setTimestamp();
        if (meta.subject) logEmbed.addFields({ name: '📝 Sujet', value: meta.subject });
        if (transcript) logEmbed.addFields({ name: 'Messages', value: String(transcript.count), inline: true });
        await logChannel.send({
          embeds: [logEmbed],
          files: transcript ? [makeFile()] : [],
          allowedMentions: { parse: [] },
        });
      }
    } catch (err) {
      console.warn('⚠️  Envoi de la transcription dans les logs échoué :', err.message);
    }
  }

  // Envoi en MP au membre
  if (cfg.dmTranscript && transcript && owner) {
    await owner.send({
      content: `🎫 Ton ticket sur **${interaction.guild.name}** est fermé. Voici la transcription de la conversation :`,
      files: [makeFile()],
    }).catch(() => { /* MP fermés : pas grave */ });
  }

  const delay = Math.max(0, Number(cfg.closeDelaySeconds) || 0);
  await interaction.editReply({
    content: `🔒 Ticket fermé${transcript ? ' (transcription sauvegardée)' : ''}. Le salon va être supprimé${delay ? ` dans ${delay} s` : ''}...`,
  }).catch(() => {});

  if (delay > 0) {
    await channel.send(`🔒 Ticket fermé par <@${interaction.user.id}> — ce salon sera supprimé dans ${delay} secondes.`).catch(() => {});
  }
  setTimeout(() => {
    channel.delete('Ticket fermé').catch(() => {});
  }, delay * 1000);
}

/* ------------------------------ Assistante IA ------------------------------ */

const staffIntervenedChannels = new Set(); // Salons où un humain du staff a déjà répondu
const aiInFlightChannels = new Set(); // Réponse IA déjà en cours dans ce salon
const aiLastReplyAt = new Map(); // Dernier envoi IA par salon (anti-spam)
const aiErrorNotifiedChannels = new Set(); // Panne IA déjà signalée dans ce salon

function isStaffMember(member, cfg, type) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const ids = new Set([...(cfg.staffRoleIds || []), ...typeStaffRoleIds(cfg, type)]);
  return member.roles.cache.some((r) => ids.has(r.id));
}

function canonicalExactLinkCode(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function exactLinksOf(cfg) {
  const links = Array.isArray(cfg?.ai?.exactLinks) ? cfg.ai.exactLinks : [];
  const seen = new Set();
  return links.filter((link) => {
    const code = canonicalExactLinkCode(link?.code);
    const url = String(link?.url ?? '').trim();
    if (!code || !url || seen.has(code)) return false;
    seen.add(code);
    return true;
  });
}

function exactLinkMarker(code) {
  return `{{${canonicalExactLinkCode(code)}}}`;
}

/**
 * Cache les vraies URL à l'IA : Mistral ne voit que des petits codes
 * ({{inscription}}, par exemple), donc il ne peut pas déformer un lien long.
 */
function hideExactLinksForAi(text, cfg) {
  let output = String(text ?? '');
  const links = [...exactLinksOf(cfg)].sort((a, b) => b.url.length - a.url.length);
  for (const link of links) {
    output = output.replaceAll(link.url, exactLinkMarker(link.code));
  }
  return output;
}

/**
 * Remplace les codes écrits par l'IA par les URL exactes du dashboard.
 * Le remplacement se fait après génération, caractère par caractère.
 */
function replaceExactLinkMarkers(text, cfg) {
  const links = exactLinksOf(cfg);
  if (!links.length) return String(text ?? '');

  const byCode = new Map(links.map((link) => [canonicalExactLinkCode(link.code), link.url]));
  return String(text ?? '').replace(
    /(?:\{\{|\[\[)\s*([^\]{}]{1,60})\s*(?:\}\}|\]\])/g,
    (_marker, rawCode) => {
      const url = byCode.get(canonicalExactLinkCode(rawCode));
      if (url) return url;
      // Secours pratique : s'il n'existe qu'un seul lien exact, un code
      // approximatif de l'IA suffit quand même à retrouver le bon lien.
      return links.length === 1 ? links[0].url : '';
    }
  );
}

function exactLinksPrompt(cfg) {
  const links = exactLinksOf(cfg);
  if (!links.length) return '';

  return [
    'LIENS EXACTS GÉRÉS PAR LE BOT :',
    'Tu ne dois jamais écrire, recopier, raccourcir ni inventer une adresse web complète.',
    'Quand tu dois donner un lien, écris seulement son code ci-dessous, seul et sans markdown. Le bot remplacera automatiquement ce code par le vrai lien exact après ta réponse.',
    ...links.map((link) => `- ${exactLinkMarker(link.code)} : ${link.description || 'lien à donner au membre quand c\'est utile'}`),
  ].join('\n');
}

function aiSystemPrompt(cfg, type, meta = {}) {
  const parts = [hideExactLinksForAi(cfg.ai.systemPrompt, cfg)];
  if (type?.aiPrompt) {
    parts.push(`Consignes spécifiques à ce type de ticket (« ${type.name} ») :\n${hideExactLinksForAi(type.aiPrompt, cfg)}`);
  }
  const linksPrompt = exactLinksPrompt(cfg);
  if (linksPrompt) parts.push(linksPrompt);
  const context = [
    type ? `Type de ticket : ${type.name}.` : null,
    meta.number ? `Ticket n°${meta.number}.` : null,
    meta.subject ? `Sujet annoncé par le membre : ${meta.subject}.` : null,
  ].filter(Boolean).join(' ');
  if (context) parts.push(`Contexte : ${context}`);
  return parts.filter(Boolean).join('\n\n');
}

/** Convertit l'Historique discord en messages pour Mistral (testable). */
function buildAiMessages({ cfg, type, meta, messages, botId }) {
  const history = (messages || [])
    .filter((m) => (m.content || '').trim())
    .slice(-(cfg.ai.historyLimit || 12))
    .map((m) => {
      // On cache les URL avant la coupe à 1500 caractères : sinon un lien
      // long déjà envoyé serait tronqué dans la mémoire de l'IA.
      const content = hideExactLinksForAi(m.content.trim(), cfg).slice(0, 1500);
      if (m.author?.id === botId) return { role: 'assistant', content };
      if (m.author?.id === meta.ownerId) return { role: 'user', content };
      return { role: 'user', content: `[Membre de l'équipe ${m.author?.tag || ''}] ${content}` };
    });
  return [{ role: 'system', content: aiSystemPrompt(cfg, type, meta) }, ...history];
}

async function sendAiText(channel, text, cfg) {
  const exactText = replaceExactLinkMarkers(text, cfg);
  for (const chunk of ai.splitForDiscord(exactText)) {
    await channel.send({ content: chunk, allowedMentions: { parse: [] } });
  }
}

function aiUsable(cfg, type) {
  return Boolean(cfg.ai?.enabled && type && type.aiEnabled !== false && ai.isConfigured());
}

/** Premier message de l'IA à l'ouverture du ticket (si activé). */
async function maybeAiGreeting(channel, member, { number, subject, type }) {
  const cfg = getConfig().tickets;
  if (!aiUsable(cfg, type)) return;
  if (!cfg.ai.greetOnOpen && cfg.ai.trigger !== 'accueil') return;

  await channel.sendTyping().catch(() => {});
  const text = await ai.chat({
    model: cfg.ai.model,
    temperature: cfg.ai.temperature,
    maxTokens: cfg.ai.maxTokens,
    messages: [
      { role: 'system', content: aiSystemPrompt(cfg, type, { number, subject }) },
      {
        role: 'user',
        content:
          `Un membre nommé ${member.user.username} vient d'ouvrir un ticket « ${type.name} ».` +
          (subject ? ` Sujet annoncé : « ${subject} ».` : ' Il n\'a pas encore précisé de sujet.') +
          ' Écris ton tout premier message dans ce ticket : accueille-le chaleureusement en 2-3 phrases et pose-lui LA question la plus utile pour avancer (ou demande-lui de décrire sa demande si le sujet est vide).',
      },
    ],
  });
  await sendAiText(channel, text, cfg);
  aiLastReplyAt.set(channel.id, Date.now());
}

/**
 * À appeler pour chaque message reçu : l'IA répond dans les Salons de
 * tickets selon ses réglages (déclencheur, pause si le staff répond...).
 * Nécessite l'intent MESSAGE CONTENT (activé au démarrage si l'IA est on).
 */
async function handleMessage(message) {
  if (!message?.guild || message.author?.bot) return;
  const content = (message.content || '').trim();
  if (!content) return;

  const meta = parseTicketTopic(message.channel?.topic);
  if (!meta) return;

  const cfg = getConfig().tickets;
  if (!cfg.enabled || !cfg.ai?.enabled) return;
  const type = typeByKey(cfg, meta.type);
  if (!aiUsable(cfg, type)) return;

  const isOwner = message.author.id === meta.ownerId;
  const staff = isStaffMember(message.member, cfg, type);
  const mentioned = Boolean(message.mentions?.users?.has(message.client.user.id));

  if (staff && !isOwner) {
    staffIntervenedChannels.add(message.channel.id);
    if (!mentioned) return; // le staff gère, l'IA se tait (sauf si on l'appelle)
  } else if (!isOwner) {
    return;
  }

  if (cfg.ai.trigger === 'accueil') return;
  if (cfg.ai.trigger === 'mention' && !mentioned) return;
  if (cfg.ai.pauseWhenStaffReplies && staffIntervenedChannels.has(message.channel.id) && !mentioned) return;

  const channelId = message.channel.id;
  if (aiInFlightChannels.has(channelId)) return;
  const cooldownMs = Math.max(1, Number(cfg.ai.cooldownSeconds) || 5) * 1000;
  if (Date.now() - (aiLastReplyAt.get(channelId) || 0) < cooldownMs) return;

  aiInFlightChannels.add(channelId);
  aiLastReplyAt.set(channelId, Date.now());
  try {
    await message.channel.sendTyping().catch(() => {});
    const fetched = await message.channel.messages
      .fetch({ limit: Math.max(10, cfg.ai.historyLimit || 12) })
      .catch(() => null);
    const history = fetched
      ? [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp)
      : [message];

    // Pause « staff » retrouvée même après un redémarrage du bot :
    // un humain autre que le créateur a déjà écrit dans ce ticket.
    if (cfg.ai.pauseWhenStaffReplies && !mentioned
      && history.some((m) => m.id !== message.id && !m.author.bot && m.author.id !== meta.ownerId)) {
      staffIntervenedChannels.add(channelId);
      return;
    }

    const text = await ai.chat({
      model: cfg.ai.model,
      temperature: cfg.ai.temperature,
      maxTokens: cfg.ai.maxTokens,
      messages: buildAiMessages({
        cfg,
        type,
        meta,
        messages: history,
        botId: message.client.user.id,
      }),
    });
    await sendAiText(message.channel, text, cfg);
    aiErrorNotifiedChannels.delete(channelId);
  } catch (err) {
    console.warn('⚠️  Réponse IA du ticket échouée :', err.message);
    if (!aiErrorNotifiedChannels.has(channelId)) {
      aiErrorNotifiedChannels.add(channelId);
      await message.channel.send(
        '🤖 Petite panne de l\'assistante IA — un membre de l\'équipe prend le relais très vite !'
      ).catch(() => {});
    }
  } finally {
    aiInFlightChannels.delete(channelId);
  }
}

/* ------------------------------ Interactions ------------------------------ */

async function handleInteraction(interaction) {
  const cfg = getConfig().tickets;

  // Boutons d'ouverture : 'ticket:open' (anciens panneaux) ou 'ticket:open:<typeId>'
  if (interaction.isButton()
    && (interaction.customId === OPEN_BUTTON_ID || interaction.customId.startsWith(`${OPEN_BUTTON_ID}:`))) {
    if (!cfg.enabled) {
      return interaction.reply({
        content: '🎫 Les tickets sont désactivés pour le moment. Réessaie un peu plus tard !',
        flags: MessageFlags.Ephemeral,
      });
    }

    const already = findUserTickets(interaction.guild, interaction.user.id);
    if (already.size >= cfg.maxPerUser) {
      return interaction.reply({
        content: `🎫 Tu as déjà un ticket ouvert : ${already.first()} — continue là-bas !`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const typeKey = interaction.customId.slice(OPEN_BUTTON_ID.length + 1) || null;
    const type = typeByKey(cfg, typeKey);
    const askSubject = type ? type.askSubject : cfg.askSubject;

    if (askSubject) {
      const modal = new ModalBuilder()
        .setCustomId(type ? `${MODAL_ID}:${type.id}` : MODAL_ID)
        .setTitle((type ? `🎫 ${type.name}` : '🎫 Ouvrir un ticket').slice(0, 45))
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('subject')
            .setLabel('Sujet de ta demande (optionnel)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(100)
            .setPlaceholder('Ex : question sur une commande de clip')
        ));
      return interaction.showModal(modal);
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return createTicket(interaction, '', type?.id);
  }

  // Formulaire de sujet validé ('ticket:modal:create' + éventuellement ':<typeId>')
  if (interaction.isModalSubmit()
    && (interaction.customId === MODAL_ID || interaction.customId.startsWith(`${MODAL_ID}:`))) {
    if (!cfg.enabled) {
      return interaction.reply({
        content: '🎫 Les tickets sont désactivés pour le moment.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const typeKey = interaction.customId.slice(MODAL_ID.length + 1) || null;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const subject = interaction.fields.getTextInputValue('subject').trim();
    return createTicket(interaction, subject, typeKey);
  }

  // Bouton "Fermer le ticket"
  if (interaction.isButton() && interaction.customId === CLOSE_BUTTON_ID) {
    return closeTicket(interaction);
  }
}

module.exports = {
  handleInteraction,
  handleMessage,
  publishPanel,
  createTicketForMember,
  maybeCreateAutoTicketOnJoin,
  // Exportés pour les tests
  sanitizeChannelName,
  ticketChannelName,
  parseTicketTopic,
  formatTranscript,
  ticketTypes,
  typeByKey,
  typeStaffRoleIds,
  aiSystemPrompt,
  buildAiMessages,
  canonicalExactLinkCode,
  exactLinksOf,
  hideExactLinksForAi,
  replaceExactLinkMarkers,
};
