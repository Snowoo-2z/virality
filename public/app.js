'use strict';
/* Dashboard Virality — logique de la page de configuration */

let config = null; // config actuelle (objet)
let guild = null; // infos serveur renvoyées par le bot
let previewTab = 'channel'; // 'channel' ou 'dm'

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/* ---------- Accès aux valeurs par chemin ("welcome.embed.title") ---------- */
function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  let target = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof target[keys[i]] !== 'object' || target[keys[i]] === null) target[keys[i]] = {};
    target = target[keys[i]];
  }
  target[keys[keys.length - 1]] = value;
}

/* ---------- Toast (petit message en bas) ---------- */
let toastTimer = null;
function showToast(message, isError = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 4200);
}

/* ---------- API ---------- */
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Session expirée, reconnecte-toi.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

/* ---------- Formulaire <-> config ---------- */
function fillForm() {
  $$('[data-bind]').forEach((el) => {
    const value = getPath(config, el.dataset.bind);
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else if (value !== undefined && value !== null) el.value = value;
  });
  syncChannelSelect();
  syncRoleSelect();
  updateConditionalSections();
}

function collectForm() {
  $$('[data-bind]').forEach((el) => {
    let value;
    if (el.type === 'checkbox') value = el.checked;
    else if (el.type === 'number') value = Number(el.value) || 0;
    else value = el.value;
    setPath(config, el.dataset.bind, value);
  });
}

/* Affiche/masque les blocs selon les réglages (ex : embed vs texte) */
function updateConditionalSections() {
  $$('[data-show-when]').forEach((el) => {
    const [path, expected] = el.dataset.showWhen.split('=');
    const value = String(getPath(config, path));
    el.style.display = value === expected ? '' : 'none';
  });
}

function syncChannelSelect() {
  const select = $('#channelSelect');
  const current = config?.welcome?.channelId || '';
  if ([...select.options].some((o) => o.value === current)) select.value = current;
}
function syncRoleSelect() {
  const select = $('#roleSelect');
  const current = config?.welcome?.autoRole?.roleId || '';
  if ([...select.options].some((o) => o.value === current)) select.value = current;
}

function fillGuildSelects() {
  const channelSelect = $('#channelSelect');
  const roleSelect = $('#roleSelect');
  channelSelect.innerHTML = '';
  roleSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = guild?.online && guild?.onGuild
    ? '— Choisis un salon —'
    : '— Bot hors ligne : colle l\'ID ci-dessous —';
  channelSelect.appendChild(placeholder);

  const rolePlaceholder = document.createElement('option');
  rolePlaceholder.value = '';
  rolePlaceholder.textContent = guild?.online && guild?.onGuild
    ? '— Choisis un rôle —'
    : '— Bot hors ligne : colle l\'ID ci-dessous —';
  roleSelect.appendChild(rolePlaceholder);

  if (guild?.channels) {
    for (const ch of guild.channels) {
      const opt = document.createElement('option');
      opt.value = ch.id;
      opt.textContent = '# ' + ch.name;
      channelSelect.appendChild(opt);
    }
  }
  if (guild?.roles) {
    for (const role of guild.roles) {
      const opt = document.createElement('option');
      opt.value = role.id;
      opt.textContent = role.name;
      roleSelect.appendChild(opt);
    }
  }
  channelSelect.disabled = !(guild?.online && guild?.onGuild);
  roleSelect.disabled = !(guild?.online && guild?.onGuild);
  syncChannelSelect();
  syncRoleSelect();
}

/* ---------- Statut du bot ---------- */
function renderStatus() {
  const badge = $('#statusBadge');
  const text = $('#statusText');
  const offlineAlert = $('#offlineAlert');
  const inviteAlert = $('#inviteAlert');

  offlineAlert.classList.remove('show');
  inviteAlert.classList.remove('show');

  if (!guild || !guild.online) {
    badge.classList.remove('online');
    text.textContent = 'Bot hors ligne';
    offlineAlert.classList.add('show');
    return;
  }
  badge.classList.add('online');
  if (!guild.onGuild) {
    text.textContent = `Bot en ligne (${guild.botTag}) — pas encore sur le serveur`;
    $('#inviteLink').href = guild.inviteUrl;
    inviteAlert.classList.add('show');
    return;
  }
  text.textContent = `${guild.botTag} • ${guild.guildName} • ${guild.memberCount} membres`;
}

/* ---------- Aperçu façon discord ---------- */
const SAMPLE = () => ({
  username: 'NouveauMembre',
  server: guild?.guildName || 'Virality',
  memberCount: guild?.memberCount || 1234,
});

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/* Mini-markdown discord : **gras**, *italique*, `code`, retours à la ligne */
function renderText(text) {
  const s = SAMPLE();
  let out = String(text || '')
    .replaceAll('{user}', '\u0001USER\u0001')
    .replaceAll('{username}', s.username)
    .replaceAll('{server}', s.server)
    .replaceAll('{memberCount}', String(s.memberCount));
  out = escapeHtml(out);
  out = out
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replaceAll('\n', '<br>');
  out = out.replaceAll('\u0001USER\u0001', '<span class="mention">@' + s.username + '</span>');
  return out;
}

function thumbUrl(mode) {
  if (mode === 'avatar') return 'https://cdn.discordapp.com/embed/avatars/2.png';
  if (mode === 'logo') return '/assets/logo.jpg';
  return null;
}
function imageUrlFor(embed) {
  if (embed.imageMode === 'banniere') return '/assets/banner.png';
  if (embed.imageMode === 'url' && /^https?:\/\//i.test(embed.imageUrl || '')) return embed.imageUrl.trim();
  return null;
}

function renderPreview() {
  if (!config) return;
  const w = config.welcome;
  const isDm = previewTab === 'dm';
  const section = isDm ? w.dm : w;
  const botName = (guild?.botTag || 'Virality').split('#')[0];
  const botAvatar = guild?.botAvatar || '/assets/logo.jpg';
  const now = new Date();
  const timeStr = 'Aujourd\'hui à ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  let html = `<div class="discord-msg"><img class="avatar" src="${botAvatar}" alt=""><div class="body">`;
  html += `<div class="head"><span class="name">${escapeHtml(botName)}</span><span class="bot-tag">BOT</span><span class="time">${timeStr}</span></div>`;

  if (isDm && !w.dm.enabled) {
    html += `<div class="preview-empty">ℹ️ Le message privé de bienvenue est désactivé. Active-le pour le prévisualiser en conditions réelles (l'aperçu ci-dessous montre quand même le contenu).</div>`;
  }
  if (!isDm && !w.enabled) {
    html += `<div class="preview-empty">ℹ️ Le système de bienvenue est désactivé (l'aperçu montre quand même le contenu).</div>`;
  }

  if (section.type === 'texte') {
    html += `<div class="content">${renderText(section.texteMessage) || '<i>(message vide)</i>'}</div>`;
  } else {
    if (!isDm && w.pingUser) {
      html += `<div class="content"><span class="mention">@${SAMPLE().username}</span></div>`;
    }
    const e = section.embed;
    const thumb = thumbUrl(e.thumbnail);
    const img = imageUrlFor(e);
    const color = /^#?[0-9a-fA-F]{6}$/.test((e.color || '').trim())
      ? (e.color.trim().startsWith('#') ? e.color.trim() : '#' + e.color.trim())
      : '#FF6A00';
    html += `<div class="discord-embed${thumb ? ' with-thumb' : ''}" style="border-left-color:${color}">`;
    if (e.title?.trim()) html += `<div class="e-title">${renderText(e.title)}</div>`;
    if (e.description?.trim()) html += `<div class="e-desc">${renderText(e.description)}</div>`;
    if (thumb) html += `<img class="e-thumb" src="${thumb}" alt="">`;
    if (img) html += `<img class="e-image" src="${img}" alt="">`;
    if (e.footer?.trim()) html += `<div class="e-footer">${renderText(e.footer)}</div>`;
    if (!e.title?.trim() && !e.description?.trim() && !img) {
      html += `<div class="e-desc"><i>(embed vide : ajoute au moins un titre ou une description)</i></div>`;
    }
    html += `</div>`;
  }

  html += `</div></div>`;
  $('#preview').innerHTML = html;
}

/* ---------- Chargement ---------- */
async function loadAll() {
  try {
    config = await api('/api/config');
  } catch (err) {
    showToast('❌ ' + err.message, true);
    return;
  }
  await loadGuild();
  fillForm();
  renderPreview();
}

async function loadGuild() {
  try {
    guild = await api('/api/guild');
  } catch {
    guild = null;
  }
  renderStatus();
  fillGuildSelects();
}

/* ---------- Événements ---------- */
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.dataset?.bind || !config) return;
  // Synchronise les champs jumeaux (ex : sélecteur couleur + texte hexadécimal)
  if (el.type === 'color' || el.dataset.bind.endsWith('.color')) {
    $$(`[data-bind="${el.dataset.bind}"]`).forEach((other) => {
      if (other !== el && other.value !== el.value) other.value = el.value;
    });
  }
  collectForm();
  updateConditionalSections();
  renderPreview();
});

document.addEventListener('change', (e) => {
  if (!e.target.dataset?.bind || !config) return;
  collectForm();
  updateConditionalSections();
  renderPreview();
});

$('#channelSelect').addEventListener('change', (e) => {
  $('#channelIdInput').value = e.target.value;
  collectForm();
  renderPreview();
});
$('#roleSelect').addEventListener('change', (e) => {
  const input = document.querySelector('[data-bind="welcome.autoRole.roleId"]');
  input.value = e.target.value;
  collectForm();
});

$$('.preview-tabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    previewTab = btn.dataset.tab;
    $$('.preview-tabs button').forEach((b) => b.classList.toggle('active', b === btn));
    renderPreview();
  });
});

$('#saveBtn').addEventListener('click', async () => {
  collectForm();
  const btn = $('#saveBtn');
  btn.disabled = true;
  try {
    const data = await api('/api/config', { method: 'POST', body: JSON.stringify(config) });
    config = data.config;
    fillForm();
    renderPreview();
    showToast('✅ Configuration enregistrée ! Elle est déjà active sur le bot.');
  } catch (err) {
    showToast('❌ ' + err.message, true);
  } finally {
    btn.disabled = false;
  }
});

$('#testBtn').addEventListener('click', async () => {
  collectForm();
  const btn = $('#testBtn');
  btn.disabled = true;
  btn.textContent = 'Envoi en cours...';
  try {
    const data = await api('/api/config', { method: 'POST', body: JSON.stringify(config) });
    config = data.config;
    await api('/api/test', { method: 'POST', body: '{}' });
    showToast('✅ Config enregistrée et message de test envoyé sur discord ! Va voir dans le salon 👀');
  } catch (err) {
    showToast('❌ ' + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = '📨 Enregistrer + envoyer un test sur discord';
  }
});

$('#refreshBtn').addEventListener('click', async () => {
  await loadGuild();
  renderPreview();
  showToast('🔄 Statut, Salons et rôles actualisés.');
});

$('#logoutBtn').addEventListener('click', async () => {
  await fetch('/logout', { method: 'POST' }).catch(() => {});
  window.location.href = '/login';
});

loadAll();
