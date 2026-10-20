'use strict';
/**
 * Commande /config : un panneau de configuration interactif dans discord
 * (boutons, menus de sélection de salon/rôle, formulaires popup).
 * Réservé aux administrateurs du serveur.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { getConfig, saveConfig, isValidColor, normalizeColor } = require('./config');
const { sendWelcome } = require('./welcome');

const ORANGE = 0xff6a00;
const IMAGE_MODES = ['banniere', 'aucune', 'url'];
const THUMB_MODES = ['avatar', 'logo', 'aucune'];
const IMAGE_LABELS = { banniere: 'Bannière Virality', aucune: 'Aucune', url: 'URL perso' };
const THUMB_LABELS = { avatar: 'Avatar du membre', logo: 'Logo Virality', aucune: 'Aucune' };

const commandData = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Configurer le bot Virality (système de bienvenue)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

function ouiNon(value) {
  return value ? '✅ Oui' : '❌ Non';
}

function summaryEmbed() {
  const w = getConfig().welcome;
  const embed = new EmbedBuilder()
    .setColor(ORANGE)
    .setTitle('🔥 Configuration — Système de bienvenue')
    .setDescription(
      'Utilise les menus et boutons ci-dessous pour tout régler.\n' +
      '💡 Variables pour les textes : `{user}` `{username}` `{server}` `{memberCount}`\n' +
      '🖥️ Encore plus d\'options (aperçu en direct, délai du rôle...) sur le **dashboard web**.'
    )
    .addFields(
      { name: 'État', value: w.enabled ? '🟢 Activé' : '🔴 Désactivé', inline: true },
      { name: 'Salon', value: w.channelId ? `<#${w.channelId}>` : '⚠️ Non défini', inline: true },
      { name: 'Format', value: w.type === 'embed' ? 'Embed' : 'Texte simple', inline: true },
      { name: 'Mention du membre', value: ouiNon(w.pingUser), inline: true },
      { name: 'Message privé', value: ouiNon(w.dm.enabled), inline: true },
      {
        name: 'Rôle automatique',
        value: w.autoRole.enabled
          ? (w.autoRole.roleId ? `<@&${w.autoRole.roleId}>` : '⚠️ Activé mais aucun rôle choisi')
          : '❌ Non',
        inline: true,
      },
      { name: 'Grande image', value: IMAGE_LABELS[w.embed.imageMode] || w.embed.imageMode, inline: true },
      { name: 'Miniature', value: THUMB_LABELS[w.embed.thumbnail] || w.embed.thumbnail, inline: true },
      { name: 'Couleur embed', value: w.embed.color, inline: true },
    );
  return embed;
}

function panelPayload() {
  const w = getConfig().welcome;

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('cfg:channel')
    .setPlaceholder('📍 Choisir le salon de bienvenue')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);
  if (w.channelId) channelSelect.setDefaultChannels(w.channelId);

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId('cfg:role')
    .setPlaceholder('🏷️ Choisir le rôle automatique (optionnel)')
    .setMinValues(0)
    .setMaxValues(1);
  if (w.autoRole.roleId) roleSelect.setDefaultRoles(w.autoRole.roleId);

  const rowButtons1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('cfg:toggle-enabled')
      .setLabel(w.enabled ? 'Désactiver' : 'Activer')
      .setEmoji(w.enabled ? '🔴' : '🟢')
      .setStyle(w.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('cfg:toggle-type')
      .setLabel(`Format : ${w.type === 'embed' ? 'Embed' : 'Texte'}`)
      .setEmoji('🔀')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('cfg:toggle-ping')
      .setLabel(`Ping : ${w.pingUser ? 'Oui' : 'Non'}`)
      .setEmoji('🔔')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('cfg:toggle-dm')
      .setLabel(`MP : ${w.dm.enabled ? 'Oui' : 'Non'}`)
      .setEmoji('💬')
      .setStyle(ButtonStyle.Secondary),
  );

  const rowButtons2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('cfg:open-texts')
      .setLabel('Textes (salon)')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('cfg:open-dm-texts')
      .setLabel('Textes (MP)')
      .setEmoji('💬')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('cfg:open-colors')
      .setLabel('Couleurs & URL image')
      .setEmoji('🎨')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('cfg:toggle-autorole')
      .setLabel(`Rôle auto : ${w.autoRole.enabled ? 'Oui' : 'Non'}`)
      .setEmoji('🏷️')
      .setStyle(ButtonStyle.Secondary),
  );

  const rowButtons3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('cfg:cycle-image')
      .setLabel(`Image : ${IMAGE_LABELS[w.embed.imageMode]}`)
      .setEmoji('🖼️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('cfg:cycle-thumb')
      .setLabel(`Miniature : ${THUMB_LABELS[w.embed.thumbnail]}`)
      .setEmoji('🔸')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('cfg:test')
      .setLabel('Envoyer un test')
      .setEmoji('📨')
      .setStyle(ButtonStyle.Success),
  );

  return {
    embeds: [summaryEmbed()],
    components: [
      new ActionRowBuilder().addComponents(channelSelect),
      new ActionRowBuilder().addComponents(roleSelect),
      rowButtons1,
      rowButtons2,
      rowButtons3,
    ],
  };
}

function textsModal(kind) {
  const w = getConfig().welcome;
  const section = kind === 'dm' ? w.dm : w;
  const modal = new ModalBuilder()
    .setCustomId(kind === 'dm' ? 'cfg:modal:dm-texts' : 'cfg:modal:texts')
    .setTitle(kind === 'dm' ? 'Textes du message privé' : 'Textes du message de bienvenue');

  const input = (id, label, style, value, max) =>
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setStyle(style)
        .setRequired(false)
        .setMaxLength(max)
        .setValue(String(value || '').slice(0, max))
    );

  modal.addComponents(
    input('title', 'Titre de l\'embed', TextInputStyle.Short, section.embed.title, 256),
    input('description', 'Description de l\'embed', TextInputStyle.Paragraph, section.embed.description, 4000),
    input('footer', 'Petit texte en bas (footer)', TextInputStyle.Short, section.embed.footer, 256),
    input('texte', 'Message si format = Texte simple', TextInputStyle.Paragraph, section.texteMessage, 2000),
  );
  return modal;
}

function colorsModal() {
  const w = getConfig().welcome;
  const modal = new ModalBuilder()
    .setCustomId('cfg:modal:colors')
    .setTitle('Couleurs et image personnalisée');

  const input = (id, label, value, placeholder) =>
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(1000)
        .setPlaceholder(placeholder)
        .setValue(String(value || '').slice(0, 1000))
    );

  modal.addComponents(
    input('color', 'Couleur embed salon (ex : #FF6A00)', w.embed.color, '#FF6A00'),
    input('dmColor', 'Couleur embed MP (ex : #FF6A00)', w.dm.embed.color, '#FF6A00'),
    input('imageUrl', 'URL image perso (si Image = URL perso)', w.embed.imageUrl, 'https://...'),
  );
  return modal;
}

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

async function deny(interaction) {
  return interaction.reply({
    content: '⛔ Seuls les administrateurs du serveur peuvent configurer le bot.',
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
}

/** Point d'entrée : gère la commande /config et toutes ses interactions. */
async function handleInteraction(interaction) {
  // ----- Lancement de la commande -----
  if (interaction.isChatInputCommand() && interaction.commandName === 'config') {
    if (!isAdmin(interaction)) return deny(interaction);
    return interaction.reply({ ...panelPayload(), flags: MessageFlags.Ephemeral });
  }

  const isComponent = interaction.isButton()
    || interaction.isChannelSelectMenu()
    || interaction.isRoleSelectMenu()
    || interaction.isModalSubmit();
  if (!isComponent || !interaction.customId?.startsWith('cfg:')) return;
  if (!isAdmin(interaction)) return deny(interaction);

  const w = getConfig().welcome;
  const id = interaction.customId;

  // ----- Menus déroulants -----
  if (interaction.isChannelSelectMenu() && id === 'cfg:channel') {
    w.channelId = interaction.values[0] || '';
    saveConfig();
    return interaction.update(panelPayload());
  }
  if (interaction.isRoleSelectMenu() && id === 'cfg:role') {
    w.autoRole.roleId = interaction.values[0] || '';
    if (w.autoRole.roleId) w.autoRole.enabled = true;
    saveConfig();
    return interaction.update(panelPayload());
  }

  // ----- Boutons -----
  if (interaction.isButton()) {
    switch (id) {
      case 'cfg:toggle-enabled': w.enabled = !w.enabled; break;
      case 'cfg:toggle-type': w.type = w.type === 'embed' ? 'texte' : 'embed'; break;
      case 'cfg:toggle-ping': w.pingUser = !w.pingUser; break;
      case 'cfg:toggle-dm': w.dm.enabled = !w.dm.enabled; break;
      case 'cfg:toggle-autorole': w.autoRole.enabled = !w.autoRole.enabled; break;
      case 'cfg:cycle-image': {
        const i = IMAGE_MODES.indexOf(w.embed.imageMode);
        w.embed.imageMode = IMAGE_MODES[(i + 1) % IMAGE_MODES.length];
        break;
      }
      case 'cfg:cycle-thumb': {
        const i = THUMB_MODES.indexOf(w.embed.thumbnail);
        w.embed.thumbnail = THUMB_MODES[(i + 1) % THUMB_MODES.length];
        break;
      }
      case 'cfg:open-texts':
        return interaction.showModal(textsModal('main'));
      case 'cfg:open-dm-texts':
        return interaction.showModal(textsModal('dm'));
      case 'cfg:open-colors':
        return interaction.showModal(colorsModal());
      case 'cfg:test': {
        await interaction.deferUpdate();
        const result = await sendWelcome(interaction.member, { test: true });
        return interaction.followUp({
          content: result.ok
            ? '✅ Message de test envoyé dans le salon de bienvenue (avec toi comme faux nouveau membre) !'
            : `❌ Test impossible : ${result.reason}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      default:
        return;
    }
    saveConfig();
    return interaction.update(panelPayload());
  }

  // ----- Formulaires (modals) -----
  if (interaction.isModalSubmit()) {
    const get = (name) => interaction.fields.getTextInputValue(name).trim();
    let done = '✅ Modifications enregistrées !';

    if (id === 'cfg:modal:texts' || id === 'cfg:modal:dm-texts') {
      const section = id === 'cfg:modal:dm-texts' ? w.dm : w;
      section.embed.title = get('title');
      section.embed.description = get('description');
      section.embed.footer = get('footer');
      section.texteMessage = get('texte');
    } else if (id === 'cfg:modal:colors') {
      const color = get('color');
      const dmColor = get('dmColor');
      if (color && !isValidColor(color)) {
        return interaction.reply({
          content: '❌ Couleur de l\'embed invalide. Format attendu : `#FF6A00` (6 caractères hexadécimaux).',
          flags: MessageFlags.Ephemeral,
        });
      }
      if (dmColor && !isValidColor(dmColor)) {
        return interaction.reply({
          content: '❌ Couleur du MP invalide. Format attendu : `#FF6A00`.',
          flags: MessageFlags.Ephemeral,
        });
      }
      if (color) w.embed.color = normalizeColor(color, w.embed.color);
      if (dmColor) w.dm.embed.color = normalizeColor(dmColor, w.dm.embed.color);
      w.embed.imageUrl = get('imageUrl');
      if (w.embed.imageUrl && w.embed.imageMode !== 'url') {
        done += '\nℹ️ Pense à mettre le bouton « Image » sur **URL perso** pour utiliser cette URL.';
      }
    } else {
      return;
    }

    saveConfig();
    // Met à jour le panneau sous le formulaire si possible
    try {
      return await interaction.update(panelPayload());
    } catch {
      return interaction.reply({ content: done, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

module.exports = { commandData, handleInteraction, panelPayload };
