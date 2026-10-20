'use strict';
/**
 * Moteur d'embeds générique, partagé par le système de tickets
 * (panneau + message d'ouverture) et le créateur d'embeds du dashboard.
 *
 * Variables utilisables dans les textes (selon le contexte fourni) :
 *   {user}        -> mention du membre (@Pseudo)
 *   {username}    -> pseudo sans mention
 *   {server}      -> nom du serveur
 *   {memberCount} -> nombre de membres
 *   {number}      -> numéro du ticket (tickets uniquement)
 *   {subject}     -> sujet du ticket (tickets uniquement)
 */
const fs = require('fs');
const path = require('path');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

const ASSETS_DIR = path.join(__dirname, '..', 'public', 'assets');
const BANNER_PATH = path.join(ASSETS_DIR, 'banner.png');
const LOGO_PATH = path.join(ASSETS_DIR, 'logo.jpg');
const DEFAULT_COLOR = 0xff6a00;

/**
 * ctx = { userId, username, guildName, memberCount, number, subject, avatarUrl }
 * Tous les champs sont optionnels : des valeurs de remplacement lisibles
 * sont utilisées quand le contexte n'en fournit pas (ex : panneau tickets).
 */
function replaceVars(text, ctx = {}) {
  if (!text) return '';
  return String(text)
    .replaceAll('{user}', ctx.userId ? `<@${ctx.userId}>` : '@membre')
    .replaceAll('{username}', ctx.username ?? 'membre')
    .replaceAll('{server}', ctx.guildName ?? 'le serveur')
    .replaceAll('{memberCount}', ctx.memberCount != null ? String(ctx.memberCount) : '')
    .replaceAll('{number}', ctx.number != null ? String(ctx.number) : '')
    .replaceAll('{subject}', ctx.subject ?? '');
}

function colorToInt(hex) {
  if (typeof hex !== 'string') return DEFAULT_COLOR;
  const clean = hex.trim().replace(/^#/, '');
  const value = parseInt(clean, 16);
  return Number.isNaN(value) ? DEFAULT_COLOR : value;
}

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

/**
 * Construit un payload discord complet { content?, embeds, files?, allowedMentions }
 * à partir d'une config d'embed générique (voir config.js).
 * options = { content, pingEveryone, components }
 * Retourne null si l'embed ET le texte sont complètement vides.
 */
function buildEmbedPayload(embedCfg, ctx = {}, options = {}) {
  const cfg = embedCfg || {};
  const files = [];
  const embed = new EmbedBuilder().setColor(colorToInt(cfg.color));

  const author = replaceVars(cfg.author, ctx).trim();
  const title = replaceVars(cfg.title, ctx).trim();
  const description = replaceVars(cfg.description, ctx).trim();
  const footer = replaceVars(cfg.footer, ctx).trim();

  if (author) embed.setAuthor({ name: author });
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (footer) embed.setFooter({ text: footer });
  if (cfg.timestamp) embed.setTimestamp();

  // Champs (nom / valeur / côte à côte)
  if (Array.isArray(cfg.fields)) {
    for (const field of cfg.fields) {
      const name = replaceVars(field?.name, ctx).trim();
      const value = replaceVars(field?.value, ctx).trim();
      if (!name && !value) continue;
      embed.addFields({
        name: name || '•',
        value: value || '—',
        inline: Boolean(field?.inline),
      });
    }
  }

  // Grande image
  if (cfg.imageMode === 'banniere' && fs.existsSync(BANNER_PATH)) {
    files.push(new AttachmentBuilder(BANNER_PATH, { name: 'virality-banner.png' }));
    embed.setImage('attachment://virality-banner.png');
  } else if (cfg.imageMode === 'url' && isHttpUrl(cfg.imageUrl)) {
    embed.setImage(cfg.imageUrl.trim());
  }

  // Miniature
  if (cfg.thumbnail === 'avatar' && ctx.avatarUrl) {
    embed.setThumbnail(ctx.avatarUrl);
  } else if (cfg.thumbnail === 'logo' && fs.existsSync(LOGO_PATH)) {
    files.push(new AttachmentBuilder(LOGO_PATH, { name: 'virality-logo.jpg' }));
    embed.setThumbnail('attachment://virality-logo.jpg');
  } else if (cfg.thumbnail === 'url' && isHttpUrl(cfg.thumbnailUrl)) {
    embed.setThumbnail(cfg.thumbnailUrl.trim());
  }

  const content = replaceVars(options.content, ctx).trim();
  const data = embed.toJSON();
  const embedIsEmpty =
    !data.author && !data.title && !data.description &&
    !data.image && !data.thumbnail && !(data.fields && data.fields.length);

  if (embedIsEmpty && !content) return null;

  const payload = {
    allowedMentions: options.pingEveryone
      ? { parse: ['everyone', 'roles', 'users'] }
      : { parse: ['users'] },
  };
  if (content) payload.content = content;
  if (!embedIsEmpty) payload.embeds = [embed];
  if (files.length && payload.embeds) payload.files = files;
  if (options.components) payload.components = options.components;
  return payload;
}

module.exports = { replaceVars, buildEmbedPayload, colorToInt };
