'use strict';
/**
 * Système de bienvenue : construit et envoie le message de bienvenue
 * dans le salon configuré (+ message privé + rôle automatique).
 *
 * Variables utilisables dans les textes :
 *   {user}        -> mention du membre (@Pseudo)
 *   {username}    -> pseudo du membre, sans mention
 *   {server}      -> nom du serveur
 *   {memberCount} -> nombre de membres sur le serveur
 */
const fs = require('fs');
const path = require('path');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getConfig } = require('./config');

const ASSETS_DIR = path.join(__dirname, '..', 'public', 'assets');
const BANNER_PATH = path.join(ASSETS_DIR, 'banner.png');
const LOGO_PATH = path.join(ASSETS_DIR, 'logo.jpg');
const DEFAULT_COLOR = 0xff6a00;

function replaceVars(text, member) {
  if (!text) return '';
  const guild = member?.guild;
  const user = member?.user;
  return String(text)
    .replaceAll('{user}', user ? `<@${user.id}>` : '@membre')
    .replaceAll('{username}', user?.username ?? 'membre')
    .replaceAll('{server}', guild?.name ?? 'le serveur')
    .replaceAll('{memberCount}', String(guild?.memberCount ?? ''));
}

function colorToInt(hex) {
  if (typeof hex !== 'string') return DEFAULT_COLOR;
  const clean = hex.trim().replace(/^#/, '');
  const value = parseInt(clean, 16);
  return Number.isNaN(value) ? DEFAULT_COLOR : value;
}

function memberAvatarUrl(member) {
  try {
    if (typeof member?.displayAvatarURL === 'function') {
      return member.displayAvatarURL({ size: 256 });
    }
    if (typeof member?.user?.displayAvatarURL === 'function') {
      return member.user.displayAvatarURL({ size: 256 });
    }
  } catch {
    /* on ignore, pas de miniature */
  }
  return null;
}

/**
 * Construit le message (texte ou embed) pour une section de config
 * (celle du salon ou celle du message privé, elles ont la même forme).
 */
function buildPayload(member, section, { ping = false } = {}) {
  // ---- Mode texte simple ----
  if (section.type === 'texte') {
    const content =
      replaceVars(section.texteMessage, member).trim() ||
      `Bienvenue <@${member.user.id}> !`;
    return { content, allowedMentions: { parse: ['users'] } };
  }

  // ---- Mode embed ----
  const cfg = section.embed;
  const files = [];
  const embed = new EmbedBuilder().setColor(colorToInt(cfg.color));

  const title = replaceVars(cfg.title, member).trim();
  const description = replaceVars(cfg.description, member).trim();
  const footer = replaceVars(cfg.footer, member).trim();

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (footer) embed.setFooter({ text: footer });

  // Grande image
  if (cfg.imageMode === 'banniere' && fs.existsSync(BANNER_PATH)) {
    files.push(new AttachmentBuilder(BANNER_PATH, { name: 'virality-banner.png' }));
    embed.setImage('attachment://virality-banner.png');
  } else if (cfg.imageMode === 'url' && /^https?:\/\//i.test(cfg.imageUrl || '')) {
    embed.setImage(cfg.imageUrl.trim());
  }

  // Miniature (petite image en haut à droite)
  if (cfg.thumbnail === 'avatar') {
    const avatar = memberAvatarUrl(member);
    if (avatar) embed.setThumbnail(avatar);
  } else if (cfg.thumbnail === 'logo' && fs.existsSync(LOGO_PATH)) {
    files.push(new AttachmentBuilder(LOGO_PATH, { name: 'virality-logo.jpg' }));
    embed.setThumbnail('attachment://virality-logo.jpg');
  }

  // Sécurité : discord refuse un embed complètement vide
  const data = embed.toJSON();
  if (!data.title && !data.description && !data.image && !data.thumbnail) {
    embed.setDescription(`Bienvenue <@${member.user.id}> ! 🎉`);
  }

  const payload = { embeds: [embed], allowedMentions: { parse: ['users'] } };
  if (files.length) payload.files = files;
  if (ping) payload.content = `<@${member.user.id}>`;
  return payload;
}

/**
 * Envoie le message de bienvenue dans le salon (+ MP si activé).
 * En mode test, le message est envoyé même si le système est désactivé,
 * et aucun MP n'est envoyé.
 */
async function sendWelcome(member, { test = false } = {}) {
  const cfg = getConfig().welcome;

  if (!cfg.enabled && !test) return { ok: false, reason: 'Le système de bienvenue est désactivé.' };
  if (!cfg.channelId) return { ok: false, reason: 'Aucun salon de bienvenue n\'est configuré.' };

  let channel = member.guild.channels.cache.get(cfg.channelId);
  if (!channel) {
    channel = await member.guild.channels.fetch(cfg.channelId).catch(() => null);
  }
  if (!channel || typeof channel.send !== 'function') {
    return { ok: false, reason: 'Le salon de bienvenue est introuvable (vérifie la configuration et les permissions du bot).' };
  }

  try {
    await channel.send(buildPayload(member, cfg, { ping: cfg.pingUser }));
  } catch (err) {
    console.error('❌ Envoi du message de bienvenue impossible :', err.message);
    return { ok: false, reason: 'Le bot n\'a pas pu envoyer le message dans ce salon (permissions ?).' };
  }

  // Message privé (jamais en mode test)
  if (!test && cfg.dm.enabled) {
    try {
      await member.send(buildPayload(member, cfg.dm, { ping: false }));
    } catch {
      console.log(`ℹ️  MP de bienvenue non envoyé à ${member.user.tag} (messages privés fermés).`);
    }
  }

  return { ok: true };
}

/** "🔥・Membre" -> "membre" (pour retrouver un rôle malgré emoji/accents). */
function simplifyRoleName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

/** Retrouve le rôle Membre : par l'ID mémorisé (onglet Rôles), sinon par nom. */
async function resolveMemberRole(guild) {
  const entry = getConfig().rolesStyle?.find((r) => r.key === 'membre');
  if (entry?.id) {
    const byId = guild.roles.cache.get(entry.id)
      || (await guild.roles.fetch(entry.id).catch(() => null));
    if (byId) return byId;
  }
  const wanted = entry?.name ? simplifyRoleName(entry.name) : 'membre';
  return guild.roles.cache.find(
    (r) => r.id !== guild.id && !r.managed && simplifyRoleName(r.name) === wanted
  ) || null;
}

/**
 * Donne les rôles d'arrivée au nouveau membre (avec délai éventuel) :
 * - le rôle 🔥・Membre si l'option est activée (par défaut),
 * - le rôle automatique libre choisi dans le dashboard, si activé.
 */
function applyAutoRole(member) {
  const welcome = getConfig().welcome;
  const auto = welcome.autoRole;
  const wantGeneric = Boolean(auto.enabled && auto.roleId);
  const wantMember = Boolean(welcome.autoMemberRole);
  if (!wantGeneric && !wantMember) return;

  const give = async () => {
    try {
      const roles = [];
      const seen = new Set();
      const pushRole = (role) => {
        if (role && !seen.has(role.id)) {
          seen.add(role.id);
          roles.push(role);
        }
      };

      if (wantMember) {
        const memberRole = await resolveMemberRole(member.guild);
        if (memberRole) pushRole(memberRole);
        else console.log('⚠️  Rôle Membre introuvable : crée-le via l\'onglet Rôles (bouton style) ou la construction du serveur.');
      }

      if (wantGeneric) {
        const role = member.guild.roles.cache.get(auto.roleId)
          || (await member.guild.roles.fetch(auto.roleId).catch(() => null));
        if (role) pushRole(role);
        else console.log('⚠️  Rôle automatique introuvable (ID incorrect dans la config ?).');
      }

      for (const role of roles) {
        if (member.roles.cache.has(role.id)) continue;
        await member.roles.add(role, 'Rôle donné automatiquement à l\'arrivée');
        console.log(`🏷️  Rôle ${role.name} donné à ${member.user.tag}`);
      }
    } catch (err) {
      console.error(
        '❌ Rôle d\'arrivée non attribué :', err.message,
        '\n   Astuce : dans les paramètres du serveur > Rôles, glisse le rôle du bot AU-DESSUS du rôle à donner.'
      );
    }
  };

  const delayMs = Math.max(0, Number(auto.delaySeconds) || 0) * 1000;
  if (delayMs > 0) setTimeout(give, delayMs);
  else give();
}

module.exports = { replaceVars, buildPayload, sendWelcome, applyAutoRole };
