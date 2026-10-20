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

const OPEN_BUTTON_ID = 'ticket:open';
const CLOSE_BUTTON_ID = 'ticket:close';
const MODAL_ID = 'ticket:modal:create';
const ORANGE = 0xff6a00;

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

function ticketChannelName(cfg, member, number) {
  const raw = String(cfg.namePattern || 'ticket-{number}')
    .replaceAll('{number}', String(number).padStart(3, '0'))
    .replaceAll('{user}', member?.user?.username ?? 'membre');
  return sanitizeChannelName(raw);
}

function parseTicketTopic(topic) {
  if (!topic || !topic.includes('virality-ticket')) return null;
  const owner = topic.match(/owner:(\d{5,})/)?.[1] || null;
  const number = topic.match(/n°(\d+)/)?.[1] || null;
  const subject = topic.match(/Sujet:\s*(.+)$/)?.[1]?.trim() || '';
  return owner ? { ownerId: owner, number, subject } : null;
}

function findUserTickets(guild, userId) {
  return guild.channels.cache.filter(
    (c) => c.type === ChannelType.GuildText && parseTicketTopic(c.topic)?.ownerId === userId
  );
}

function staffRolesOf(guild, cfg) {
  return (cfg.staffRoleIds || [])
    .map((id) => guild.roles.cache.get(id))
    .filter(Boolean);
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

function baseOverwrites(guild, me, cfg, ownerId = null) {
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
    ...staffRolesOf(guild, cfg).map((r) => ({
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
  const button = new ButtonBuilder()
    .setCustomId(OPEN_BUTTON_ID)
    .setLabel(cfg.panelButtonLabel || 'Ouvrir un ticket')
    .setStyle(ButtonStyle.Primary);
  if (cfg.panelButtonEmoji) {
    try { button.setEmoji(cfg.panelButtonEmoji); } catch { /* emoji invalide : bouton sans emoji */ }
  }
  return [new ActionRowBuilder().addComponents(button)];
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

async function resolveCategory(guild, me, cfg) {
  let category = cfg.categoryId ? guild.channels.cache.get(cfg.categoryId) : null;
  if (category && category.type !== ChannelType.GuildCategory) category = null;
  if (!category) {
    category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && simplify(c.name) === simplify(cfg.categoryName)
    ) || null;
  }
  if (!category) {
    category = await guild.channels.create({
      name: cfg.categoryName,
      type: ChannelType.GuildCategory,
      permissionOverwrites: baseOverwrites(guild, me, cfg),
      reason: 'Catégorie des tickets Virality',
    });
  }
  if (cfg.categoryId !== category.id) {
    cfg.categoryId = category.id;
    saveConfig();
  }
  return category;
}

async function createTicket(interaction, subject) {
  const guild = interaction.guild;
  const member = interaction.member;
  const cfg = getConfig().tickets;
  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!me) throw new Error('Impossible de récupérer le membre du bot.');

  await guild.channels.fetch().catch(() => {});
  const already = findUserTickets(guild, member.id);
  if (already.size >= cfg.maxPerUser) {
    const first = already.first();
    await interaction.editReply({
      content: `🎫 Tu as déjà ${already.size > 1 ? 'des tickets ouverts' : 'un ticket ouvert'} : ${first} — continue là-bas, on s'occupe de toi !`,
    });
    return;
  }

  const category = await resolveCategory(guild, me, cfg);
  const number = (Number(cfg.counter) || 0) + 1;
  const topic = `virality-ticket • owner:${member.id} • n°${number}${subject ? ` • Sujet: ${subject}` : ''}`.slice(0, 1024);

  const channel = await guild.channels.create({
    name: ticketChannelName(cfg, member, number),
    type: ChannelType.GuildText,
    parent: category.id,
    topic,
    permissionOverwrites: baseOverwrites(guild, me, cfg, member.id),
    reason: `Ticket ouvert par ${member.user.tag}`,
  });

  cfg.counter = number;
  saveConfig();

  // Message d'accueil dans le ticket
  const ctx = ctxFor(member, { number, subject: subject || '' });
  const payload = buildEmbedPayload(cfg.openEmbed, ctx, {
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CLOSE_BUTTON_ID)
        .setLabel('Fermer le ticket')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger)
    )],
  }) || { content: `Bienvenue dans ton ticket, ${member} !` };

  if (subject && payload.embeds?.[0]) {
    payload.embeds[0].addFields({ name: '📝 Sujet', value: subject.slice(0, 1024) });
  }

  const staffIds = staffRolesOf(guild, cfg).map((r) => r.id);
  const pings = [`<@${member.id}>`];
  if (cfg.pingStaff) pings.push(...staffIds.map((id) => `<@&${id}>`));
  payload.content = pings.join(' ');
  payload.allowedMentions = { users: [member.id], roles: cfg.pingStaff ? staffIds : [] };

  await channel.send(payload);
  await interaction.editReply({
    content: `✅ Ton ticket est ouvert : ${channel} — clique pour y aller !`,
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
  const isOwner = interaction.user.id === meta.ownerId;
  const isStaff = member.roles.cache.some((r) => cfg.staffRoleIds.includes(r.id))
    || member.permissions.has(PermissionFlagsBits.Administrator);
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

/* ------------------------------ Interactions ------------------------------ */

async function handleInteraction(interaction) {
  const cfg = getConfig().tickets;

  // Bouton "Ouvrir un ticket" du panneau
  if (interaction.isButton() && interaction.customId === OPEN_BUTTON_ID) {
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

    if (cfg.askSubject) {
      const modal = new ModalBuilder()
        .setCustomId(MODAL_ID)
        .setTitle('🎫 Ouvrir un ticket')
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
    return createTicket(interaction, '');
  }

  // Formulaire de sujet validé
  if (interaction.isModalSubmit() && interaction.customId === MODAL_ID) {
    if (!cfg.enabled) {
      return interaction.reply({
        content: '🎫 Les tickets sont désactivés pour le moment.',
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const subject = interaction.fields.getTextInputValue('subject').trim();
    return createTicket(interaction, subject);
  }

  // Bouton "Fermer le ticket"
  if (interaction.isButton() && interaction.customId === CLOSE_BUTTON_ID) {
    return closeTicket(interaction);
  }
}

module.exports = {
  handleInteraction,
  publishPanel,
  // Exportés pour les tests
  sanitizeChannelName,
  ticketChannelName,
  parseTicketTopic,
  formatTranscript,
};
