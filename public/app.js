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
  // Rôles staff des tickets (cases à cocher, hors système data-bind)
  if (document.getElementById('ticketStaffRoles')) {
    config.tickets.staffRoleIds = $$('#ticketStaffRoles input[type="checkbox"]:checked')
      .map((box) => box.value);
  }
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
  fillGenericSelects();
}

/* ---------- Rôles du serveur (style en 1 clic) ---------- */
function buildRoleRows() {
  const container = $('#rolesList');
  if (!container || !Array.isArray(config?.rolesStyle)) return;
  container.innerHTML = config.rolesStyle.map((entry, i) => `
    <div class="role-row">
      <div class="role-head">
        <span class="role-chip" id="roleChip-${entry.key}"></span>
        <span class="role-label">${escapeHtml(entry.label)}</span>
        <span class="role-status" id="roleStatus-${entry.key}"></span>
      </div>
      <div class="grid-2">
        <div>
          <label class="field-label">Nom affiché</label>
          <input type="text" data-bind="rolesStyle.${i}.name" maxlength="100" />
        </div>
        <div>
          <label class="field-label">Couleur</label>
          <div class="color-row">
            <input type="color" data-bind="rolesStyle.${i}.color" />
            <input type="text" data-bind="rolesStyle.${i}.color" placeholder="#FF6A00" />
          </div>
        </div>
      </div>
    </div>`).join('');
}

/* Met à jour les pastilles colorées (aperçu en direct, façon discord) */
function updateRoleChips() {
  if (!Array.isArray(config?.rolesStyle)) return;
  for (const entry of config.rolesStyle) {
    const chip = document.getElementById('roleChip-' + entry.key);
    if (!chip) continue;
    const raw = (entry.color || '').trim();
    const color = /^#?[0-9a-fA-F]{6}$/.test(raw)
      ? (raw.startsWith('#') ? raw : '#' + raw)
      : '#FF6A00';
    chip.textContent = entry.name?.trim() || '(sans nom)';
    chip.style.color = color;
    chip.style.borderColor = color;
    chip.style.backgroundColor = color + '24';
  }
}

/* Indique, pour chaque rôle, s'il existe déjà sur le serveur ou s'il sera créé */
function markRoleStatuses() {
  if (!Array.isArray(config?.rolesStyle)) return;
  for (const entry of config.rolesStyle) {
    const el = document.getElementById('roleStatus-' + entry.key);
    if (!el) continue;
    if (!guild?.online || !guild?.onGuild) {
      el.textContent = 'Bot hors ligne';
      continue;
    }
    const found = entry.id ? guild.roles.find((r) => r.id === entry.id) : null;
    if (found) el.textContent = `✅ Sur le serveur : « ${found.name} »`;
    else if (entry.creatable) el.textContent = '✨ Sera créé quand tu cliqueras le bouton orange';
    else el.textContent = '⚠️ Introuvable sur le serveur';
  }
}

function renderRolesResult(results) {
  const box = $('#rolesResult');
  if (!box) return;
  const icons = { created: '✨', updated: '✅', error: '❌' };
  box.innerHTML = '<div class="roles-result">' + results.map((r) =>
    `<div class="roles-result-line ${r.status}">${icons[r.status] || '•'} <b>${escapeHtml(r.name)}</b> — ${escapeHtml(r.message)}</div>`
  ).join('') + '</div>';
}

/* ---------- Listes de Salons/catégories génériques (tickets, embeds) ---------- */
function fillGenericSelects() {
  if (!config) return;
  const online = Boolean(guild?.online && guild?.onGuild);

  $$('select[data-channel-for]').forEach((select) => {
    const current = String(getPath(config, select.dataset.channelFor) || '');
    select.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = online ? '— Choisis un salon —' : '— Bot hors ligne : colle l\'ID ci-dessous —';
    select.appendChild(ph);
    for (const ch of guild?.channels || []) {
      const opt = document.createElement('option');
      opt.value = ch.id;
      opt.textContent = '# ' + ch.name;
      select.appendChild(opt);
    }
    select.disabled = !online;
    if ([...select.options].some((o) => o.value === current)) select.value = current;
  });

  $$('select[data-category-for]').forEach((select) => {
    const current = String(getPath(config, select.dataset.categoryFor) || '');
    select.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = online ? '— Créer automatiquement (nom ci-dessous) —' : '— Bot hors ligne : création automatique —';
    select.appendChild(ph);
    for (const cat of guild?.categories || []) {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      select.appendChild(opt);
    }
    select.disabled = !online;
    if ([...select.options].some((o) => o.value === current)) select.value = current;
  });
}

/* ---------------- Tickets : rôles staff (cases à cocher) ---------------- */
function buildTicketStaffRoles() {
  const box = $('#ticketStaffRoles');
  if (!box || !config) return;
  const online = Boolean(guild?.online && guild?.onGuild && guild.roles?.length);
  // Bot hors ligne : on montre les rôles connus (ceux de l'onglet Rôles)
  const source = online
    ? guild.roles
    : (config.rolesStyle || []).filter((r) => r.id).map((r) => ({ id: r.id, name: r.name, color: r.color }));
  if (!source.length) {
    box.innerHTML = '<p class="hint">Bot hors ligne : impossible de lister les rôles pour le moment.</p>';
    return;
  }
  const selected = new Set(config.tickets.staffRoleIds || []);
  box.innerHTML = '<div class="check-list">' + source.map((r) => {
    const dot = /^#[0-9a-fA-F]{6}$/.test(r.color || '') && r.color !== '#000000' ? r.color : '#99aab5';
    return `<label class="check-chip"><input type="checkbox" value="${r.id}" ${selected.has(r.id) ? 'checked' : ''} /><span class="dotc" style="background:${dot}"></span>${escapeHtml(r.name)}</label>`;
  }).join('') + '</div>'
    + (online ? '' : '<p class="hint">Bot hors ligne : liste partielle (rôles connus). La liste complète du serveur arrivera quand le bot sera connecté.</p>');
}

/* ----------- Fabrique de champs d'embed (réutilisée partout) ----------- */
function embedInputsHtml(prefix, thumbOptions) {
  const thumb = thumbOptions.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  return `
    <label class="field-label">Auteur (petit nom tout en haut, optionnel)</label>
    <input type="text" data-bind="${prefix}.author" maxlength="256" placeholder="Laisse vide pour ne pas l'afficher" />
    <label class="field-label">Titre</label>
    <input type="text" data-bind="${prefix}.title" maxlength="256" />
    <label class="field-label">Description (texte principal)</label>
    <textarea data-bind="${prefix}.description" maxlength="4000"></textarea>
    <label class="field-label">Petit texte en bas (footer)</label>
    <input type="text" data-bind="${prefix}.footer" maxlength="2048" />
    <div class="grid-2">
      <div>
        <label class="field-label">Couleur de la bordure</label>
        <div class="color-row">
          <input type="color" data-bind="${prefix}.color" />
          <input type="text" data-bind="${prefix}.color" placeholder="#FF6A00" />
        </div>
      </div>
      <div>
        <label class="field-label">Miniature (petite image en haut à droite)</label>
        <select data-bind="${prefix}.thumbnail">${thumb}</select>
      </div>
    </div>
    <label class="field-label">URL de la miniature (si « Image personnalisée »)</label>
    <input type="url" data-bind="${prefix}.thumbnailUrl" placeholder="https://exemple.com/petite-image.png" />
    <label class="field-label">Grande image</label>
    <select data-bind="${prefix}.imageMode">
      <option value="banniere">Bannière Virality (incluse)</option>
      <option value="aucune">Aucune</option>
      <option value="url">Image personnalisée (lien URL)</option>
    </select>
    <label class="field-label">URL de la grande image (si « Image personnalisée »)</label>
    <input type="url" data-bind="${prefix}.imageUrl" placeholder="https://exemple.com/mon-image.png" />
    <div class="switch-row">
      <div class="txt"><b>Horodatage</b><span>Afficher la date et l'heure en bas de l'embed</span></div>
      <label class="switch"><input type="checkbox" data-bind="${prefix}.timestamp" /><span class="track"></span></label>
    </div>`;
}

function buildTicketForms() {
  const panel = $('#ticketPanelEmbedForm');
  if (panel) {
    panel.innerHTML = embedInputsHtml('tickets.panelEmbed', [
      ['logo', 'Logo Virality'], ['url', 'Image personnalisée (URL)'], ['aucune', 'Aucune'],
    ]);
  }
  const open = $('#ticketOpenEmbedForm');
  if (open) {
    open.innerHTML = embedInputsHtml('tickets.openEmbed', [
      ['avatar', 'Avatar du membre'], ['logo', 'Logo Virality'], ['url', 'Image personnalisée (URL)'], ['aucune', 'Aucune'],
    ]);
  }
}

/* ---------------- Créateur d'embeds (modèles) ---------------- */
let embedIndex = 0;

function buildEmbedFields() {
  const box = $('#embedFieldsList');
  if (!box) return;
  const fields = config.embeds.templates[embedIndex]?.embed?.fields || [];
  box.innerHTML = fields.map((f, j) => `
    <div class="field-row">
      <div class="field-row-head"><span>Champ n°${j + 1}</span><button class="field-remove" data-remove-field="${j}" title="Supprimer ce champ">❌</button></div>
      <label class="field-label">Titre du champ</label>
      <input type="text" data-bind="embeds.templates.${embedIndex}.embed.fields.${j}.name" maxlength="256" />
      <label class="field-label">Texte du champ</label>
      <textarea data-bind="embeds.templates.${embedIndex}.embed.fields.${j}.value" maxlength="1024" style="min-height:52px"></textarea>
      <div class="switch-row">
        <div class="txt"><b>Côte à côte</b><span>Afficher ce champ à côté des autres (sinon pleine largeur)</span></div>
        <label class="switch"><input type="checkbox" data-bind="embeds.templates.${embedIndex}.embed.fields.${j}.inline" /><span class="track"></span></label>
      </div>
    </div>`).join('') || '<p class="hint">Aucun champ pour le moment — ce n\'est pas obligatoire !</p>';
  box.querySelectorAll('[data-remove-field]').forEach((btn) => btn.addEventListener('click', () => {
    collectForm();
    config.embeds.templates[embedIndex].embed.fields.splice(Number(btn.dataset.removeField), 1);
    buildEmbedBuilder();
  }));
}

function buildEmbedBuilder() {
  const form = $('#embedBuilderForm');
  const select = $('#embedTemplateSelect');
  if (!form || !select || !Array.isArray(config?.embeds?.templates) || !config.embeds.templates.length) return;
  embedIndex = Math.min(Math.max(embedIndex, 0), config.embeds.templates.length - 1);

  select.innerHTML = config.embeds.templates
    .map((t, i) => `<option value="${i}">${escapeHtml(t.name || 'Sans nom')}</option>`).join('');
  select.value = String(embedIndex);

  const p = `embeds.templates.${embedIndex}`;
  form.innerHTML = `
    <label class="field-label">Nom du modèle</label>
    <input type="text" data-bind="${p}.name" maxlength="80" />
    <label class="field-label">Salon où envoyer cet embed</label>
    <select data-channel-for="${p}.channelId"></select>
    <label class="field-label">...ou colle l'ID du salon à la main</label>
    <input type="text" data-bind="${p}.channelId" placeholder="Ex : 123456789012345678" />
    <label class="field-label">Texte au-dessus de l'embed (optionnel)</label>
    <textarea data-bind="${p}.content" maxlength="2000" placeholder="Ex : @everyone grosse annonce 🔥" style="min-height:56px"></textarea>
    <div class="switch-row">
      <div class="txt"><b>Autoriser les mentions</b><span>Permet à @everyone et aux @rôles écrits dans le texte de notifier pour de vrai</span></div>
      <label class="switch"><input type="checkbox" data-bind="${p}.pingEveryone" /><span class="track"></span></label>
    </div>
    ${embedInputsHtml(p + '.embed', [['logo', 'Logo Virality'], ['url', 'Image personnalisée (URL)'], ['aucune', 'Aucune']])}
    <label class="field-label">Champs (petits blocs titre + texte dans l'embed)</label>
    <div id="embedFieldsList"></div>
    <div style="margin-top:10px"><button class="btn btn-ghost btn-sm" id="addFieldBtn">➕ Ajouter un champ</button></div>`;

  buildEmbedFields();
  fillForm();
  fillGenericSelects();
  updateEmbedPreview();

  $('#addFieldBtn').addEventListener('click', () => {
    collectForm();
    const fields = config.embeds.templates[embedIndex].embed.fields;
    if (fields.length >= 10) {
      showToast('Maximum 10 champs dans le créateur — restons lisibles 😉', true);
      return;
    }
    fields.push({ name: '', value: '', inline: false });
    buildEmbedBuilder();
  });
}

/* ---------------- Aperçus génériques (tickets + embeds) ---------------- */
function genericThumbUrl(e) {
  if (e.thumbnail === 'avatar') return 'https://cdn.discordapp.com/embed/avatars/2.png';
  if (e.thumbnail === 'logo') return '/assets/logo.jpg';
  if (e.thumbnail === 'url' && /^https?:\/\//i.test(e.thumbnailUrl || '')) return e.thumbnailUrl.trim();
  return null;
}

function renderEmbedPreviewInto(box, e, { content = '', buttonHtml = '' } = {}) {
  if (!box || !e) return;
  const botName = (guild?.botTag || 'Virality').split('#')[0];
  const botAvatar = guild?.botAvatar || '/assets/logo.jpg';
  const timeStr = 'Aujourd\'hui à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  let html = `<div class="discord-msg"><img class="avatar" src="${botAvatar}" alt=""><div class="body">`;
  html += `<div class="head"><span class="name">${escapeHtml(botName)}</span><span class="bot-tag">BOT</span><span class="time">${timeStr}</span></div>`;
  if (content?.trim()) html += `<div class="content">${renderText(content)}</div>`;

  const thumb = genericThumbUrl(e);
  const img = e.imageMode === 'banniere'
    ? '/assets/banner.png'
    : (e.imageMode === 'url' && /^https?:\/\//i.test(e.imageUrl || '') ? e.imageUrl.trim() : null);
  const color = /^#?[0-9a-fA-F]{6}$/.test((e.color || '').trim())
    ? (e.color.trim().startsWith('#') ? e.color.trim() : '#' + e.color.trim())
    : '#FF6A00';
  const fields = (e.fields || []).filter((f) => f.name?.trim() || f.value?.trim());
  const hasEmbed = e.author?.trim() || e.title?.trim() || e.description?.trim() || img || fields.length;

  if (hasEmbed) {
    html += `<div class="discord-embed${thumb ? ' with-thumb' : ''}" style="border-left-color:${color}">`;
    if (e.author?.trim()) html += `<div class="e-author">${renderText(e.author)}</div>`;
    if (e.title?.trim()) html += `<div class="e-title">${renderText(e.title)}</div>`;
    if (e.description?.trim()) html += `<div class="e-desc">${renderText(e.description)}</div>`;
    if (fields.length) {
      html += '<div class="e-fields">' + fields.map((f) =>
        `<div class="e-field${f.inline ? '' : ' block'}"><div class="fname">${renderText(f.name)}</div><div class="fvalue">${renderText(f.value)}</div></div>`
      ).join('') + '</div>';
    }
    if (thumb) html += `<img class="e-thumb" src="${thumb}" alt="">`;
    if (img) html += `<img class="e-image" src="${img}" alt="">`;
    const footBits = [];
    if (e.footer?.trim()) footBits.push(renderText(e.footer));
    if (e.timestamp) footBits.push(timeStr.replace('Aujourd\'hui à ', ''));
    if (footBits.length) html += `<div class="e-footer">${footBits.join(' • ')}</div>`;
    html += '</div>';
  } else if (!content?.trim()) {
    html += '<div class="preview-empty">(embed vide : ajoute au moins un titre ou une description)</div>';
  }

  if (buttonHtml) html += buttonHtml;
  html += '</div></div>';
  box.innerHTML = html;
}

let ticketPreviewTab = 'panel';
function updateTicketPreview() {
  const box = $('#ticketPreview');
  if (!box || !config) return;
  const t = config.tickets;
  if (ticketPreviewTab === 'panel') {
    const label = `${t.panelButtonEmoji ? t.panelButtonEmoji + ' ' : ''}${t.panelButtonLabel || 'Ouvrir un ticket'}`;
    renderEmbedPreviewInto(box, t.panelEmbed, {
      buttonHtml: `<span class="fake-button">${escapeHtml(label)}</span>`,
    });
  } else {
    renderEmbedPreviewInto(box, t.openEmbed, {
      content: '{user}' + (t.pingStaff ? ' *(le staff est notifié)*' : ''),
      buttonHtml: '<span class="fake-button danger">🔒 Fermer le ticket</span>',
    });
  }
}

function updateEmbedPreview() {
  const box = $('#embedPreview');
  if (!box || !config) return;
  const tpl = config.embeds?.templates?.[embedIndex];
  if (!tpl) return;
  renderEmbedPreviewInto(box, tpl.embed, { content: tpl.content });
}

/* ---------- Onglets du dashboard ---------- */
function activateTab(name) {
  $$('#mainTabs .tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.panel === name));
  $$('.tab-panel').forEach((p) => { p.style.display = p.id === 'tab-' + name ? '' : 'none'; });
  try { localStorage.setItem('virality-tab', name); } catch { /* navigation privée */ }
}
$$('#mainTabs .tab-btn').forEach((b) =>
  b.addEventListener('click', () => activateTab(b.dataset.panel))
);
try {
  const savedTab = localStorage.getItem('virality-tab');
  if (savedTab && document.getElementById('tab-' + savedTab)) activateTab(savedTab);
} catch { /* navigation privée */ }

/* ---------- Structure du serveur (arborescence modifiable) ---------- */
const CATEGORY_NOTES = {
  informations: '🔒 Lecture seule pour les membres — seuls le staff et le bot écrivent.',
  communaute: '🌍 Public — tout le monde voit les Salons et peut participer.',
  clipper: '🔐 Privé — Membre : voit sans Historique • Clipper 🎬 : tout • Accueil : invisible.',
};

function buildServerRows() {
  const container = $('#serverTree');
  if (!container || !Array.isArray(config?.serverStructure?.categories)) return;
  container.innerHTML = config.serverStructure.categories.map((cat, i) => `
    <div class="server-cat">
      <label class="field-label" style="margin-top:0">Catégorie</label>
      <input type="text" class="cat-name-input" data-bind="serverStructure.categories.${i}.name" maxlength="100" />
      <p class="hint">${CATEGORY_NOTES[cat.key] || ''}</p>
      ${cat.channels.map((ch, j) => `
        <div class="server-ch">
          <span class="server-ch-hash">#</span>
          <input type="text" data-bind="serverStructure.categories.${i}.channels.${j}.name" maxlength="100" />
        </div>`).join('')}
    </div>`).join('');
}

/* Affiche une liste de résultats (✅/✨/❌) dans la boîte demandée */
function renderResultInto(boxId, results) {
  const box = document.getElementById(boxId);
  if (!box) return;
  const icons = { created: '✨', updated: '✅', error: '❌' };
  box.innerHTML = '<div class="roles-result">' + results.map((r) =>
    `<div class="roles-result-line ${r.status}">${icons[r.status] || '•'} <b>${escapeHtml(r.name)}</b> — ${escapeHtml(r.message)}</div>`
  ).join('') + '</div>';
}

/* ---------- Sauvegarde & système (Supabase) ---------- */
function renderSystemInfo(sys) {
  const box = $('#systemInfo');
  if (!box) return;
  const s = sys?.supabase || {};
  if (!s.configured) {
    box.innerHTML =
      '<div class="system-line">☁️ <b>Supabase : non activé</b> — tes réglages sont gardés uniquement sur ce PC.</div>' +
      '<p class="hint">Pour l\'activer : <b>1)</b> sur supabase.com, ouvre ton projet → <b>SQL Editor</b> → colle le contenu du fichier <code class="var">supabase/schema.sql</code> (dans le dossier du bot) → <b>Run</b>. ' +
      '<b>2)</b> Ajoute ces 2 lignes dans ton fichier <code class="var">.env</code>, puis redémarre le bot :</p>' +
      '<pre class="env-snippet">SUPABASE_URL=https://koxhyhdfsdikhundwinn.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=colle_ta_cle_service_role_ici</pre>' +
      '<p class="hint">La clé secrète se trouve sur supabase.com → ton projet → <b>Project Settings</b> (engrenage) → <b>API Keys</b> → <b>service_role</b>. Garde-la secrète, comme ton token.</p>';
    return;
  }
  let syncLine;
  if (s.lastSyncOk === true) {
    syncLine = `✅ Dernière copie envoyée : ${new Date(s.lastSyncAt).toLocaleString('fr-FR')}`;
  } else if (s.lastSyncOk === false) {
    syncLine = `❌ Dernier envoi raté : ${escapeHtml(s.lastError || 'erreur inconnue')} — vérifie la table et la clé, puis ré-enregistre un réglage.`;
  } else {
    syncLine = '⏳ Aucune copie envoyée depuis le démarrage (elle part automatiquement à chaque enregistrement).';
  }
  box.innerHTML =
    `<div class="system-line">☁️ <b>Supabase : activé</b> — ${escapeHtml(s.url || '')}</div>` +
    `<div class="system-line">${syncLine}</div>`;
}

async function loadSystem() {
  try {
    renderSystemInfo(await api('/api/system'));
  } catch {
    const box = $('#systemInfo');
    if (box) box.textContent = 'Infos de sauvegarde indisponibles pour le moment.';
  }
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
    .replaceAll('{memberCount}', String(s.memberCount))
    .replaceAll('{number}', '001')
    .replaceAll('{subject}', 'Ma question');
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
  buildRoleRows();
  buildServerRows();
  buildTicketForms();
  buildEmbedBuilder();
  fillForm();
  fillGenericSelects();
  updateRoleChips();
  updateTicketPreview();
  renderPreview();
  loadSystem();
}

async function loadGuild() {
  try {
    guild = await api('/api/guild');
  } catch {
    guild = null;
  }
  renderStatus();
  fillGuildSelects();
  markRoleStatuses();
  buildTicketStaffRoles();
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
  updateRoleChips();
  updateTicketPreview();
  updateEmbedPreview();
  // Le nom du modèle d'embed se met à jour dans la liste pendant la frappe
  if (el.dataset.bind === `embeds.templates.${embedIndex}.name`) {
    const opt = $('#embedTemplateSelect')?.options[embedIndex];
    if (opt) opt.textContent = el.value || 'Sans nom';
  }
  renderPreview();
});

document.addEventListener('change', (e) => {
  if (!e.target.dataset?.bind || !config) return;
  collectForm();
  updateConditionalSections();
  updateRoleChips();
  updateTicketPreview();
  updateEmbedPreview();
  renderPreview();
});

/* Listes déroulantes génériques (Salon/catégorie) + cases des rôles staff */
document.addEventListener('change', (e) => {
  if (!config) return;
  const sel = e.target;
  const path = sel.dataset?.channelFor || sel.dataset?.categoryFor;
  if (path) {
    const input = document.querySelector(`[data-bind="${path}"]`);
    if (input) input.value = sel.value;
    collectForm();
    return;
  }
  if (sel.closest?.('#ticketStaffRoles')) collectForm();
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
    fillGenericSelects();
    updateRoleChips();
    updateTicketPreview();
    updateEmbedPreview();
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

$('#applyRolesBtn').addEventListener('click', async () => {
  collectForm();
  const btn = $('#applyRolesBtn');
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'Application en cours sur discord...';
  try {
    const saved = await api('/api/config', { method: 'POST', body: JSON.stringify(config) });
    config = saved.config;
    const data = await api('/api/roles/apply', { method: 'POST', body: '{}' });
    if (data.config) config = data.config;
    fillForm();
    updateRoleChips();
    renderRolesResult(data.results || []);
    await loadGuild(); // rafraîchit les listes déroulantes (rôle auto...) et les statuts des rôles
    const errorCount = (data.results || []).filter((r) => r.status === 'error').length;
    if (errorCount > 0) {
      showToast(`⚠️ Terminé, mais ${errorCount} rôle(s) ont résisté — regarde le détail sous le bouton orange.`, true);
    } else {
      showToast('🎨 Style appliqué aux rôles du serveur ! Va admirer la liste des membres sur discord 👀');
    }
  } catch (err) {
    showToast('❌ ' + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

$('#buildServerBtn').addEventListener('click', async () => {
  collectForm();
  const btn = $('#buildServerBtn');
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'Construction en cours sur discord... (quelques secondes)';
  try {
    const saved = await api('/api/config', { method: 'POST', body: JSON.stringify(config) });
    config = saved.config;
    const data = await api('/api/server/build', { method: 'POST', body: '{}' });
    if (data.config) config = data.config;
    renderResultInto('serverResult', data.results || []);
    await loadGuild(); // nouveaux Salons/rôles dans les listes déroulantes
    fillForm();
    updateRoleChips();
    renderPreview();
    const errorCount = (data.results || []).filter((r) => r.status === 'error').length;
    if (errorCount > 0) {
      showToast(`⚠️ Construction terminée avec ${errorCount} souci(s) — regarde le détail sous le bouton.`, true);
    } else {
      showToast('🏗️ Serveur construit ! Va admirer tes catégories et Salons sur discord 👀🔥');
    }
  } catch (err) {
    showToast('❌ ' + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

$$('.ticket-preview-tabs button').forEach((btn) => btn.addEventListener('click', () => {
  ticketPreviewTab = btn.dataset.tp;
  $$('.ticket-preview-tabs button').forEach((b) => b.classList.toggle('active', b === btn));
  updateTicketPreview();
}));

$('#publishPanelBtn').addEventListener('click', async () => {
  collectForm();
  const btn = $('#publishPanelBtn');
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'Publication en cours sur discord...';
  try {
    const saved = await api('/api/config', { method: 'POST', body: JSON.stringify(config) });
    config = saved.config;
    const data = await api('/api/tickets/publish', { method: 'POST', body: '{}' });
    if (data.config) config = data.config;
    fillForm();
    fillGenericSelects();
    updateTicketPreview();
    showToast(data.updated
      ? `✅ Panneau de tickets mis à jour dans #${data.channelName} !`
      : `✅ Panneau publié dans #${data.channelName} ! Va cliquer le bouton pour tester 🎫`);
  } catch (err) {
    showToast('❌ ' + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

$('#embedTemplateSelect').addEventListener('change', (e) => {
  collectForm();
  embedIndex = Number(e.target.value) || 0;
  buildEmbedBuilder();
});

$('#newTemplateBtn').addEventListener('click', () => {
  collectForm();
  config.embeds.templates.push({
    name: 'Nouveau modèle',
    channelId: '',
    content: '',
    pingEveryone: false,
    embed: {
      title: '', description: '', color: '#FF6A00', footer: 'Virality', author: '',
      imageMode: 'aucune', imageUrl: '', thumbnail: 'logo', thumbnailUrl: '',
      timestamp: true, fields: [],
    },
  });
  embedIndex = config.embeds.templates.length - 1;
  buildEmbedBuilder();
  showToast('➕ Nouveau modèle créé ! Pense à cliquer « 💾 Enregistrer » (onglet Bienvenue) ou à l\'envoyer pour le sauvegarder.');
});

$('#deleteTemplateBtn').addEventListener('click', () => {
  if (config.embeds.templates.length <= 1) {
    showToast('Il faut garder au moins un modèle 😉', true);
    return;
  }
  collectForm();
  const name = config.embeds.templates[embedIndex]?.name || 'ce modèle';
  config.embeds.templates.splice(embedIndex, 1);
  embedIndex = 0;
  buildEmbedBuilder();
  showToast(`🗑️ Modèle « ${name} » supprimé. Pense à enregistrer pour confirmer.`);
});

$('#sendEmbedBtn').addEventListener('click', async () => {
  collectForm();
  const btn = $('#sendEmbedBtn');
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'Envoi en cours...';
  try {
    const saved = await api('/api/config', { method: 'POST', body: JSON.stringify(config) });
    config = saved.config;
    const data = await api('/api/embeds/send', {
      method: 'POST',
      body: JSON.stringify({ index: embedIndex }),
    });
    showToast(`📤 Embed envoyé dans #${data.channelName} ! Va l'admirer sur discord 👀`);
  } catch (err) {
    showToast('❌ ' + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

$('#refreshBtn').addEventListener('click', async () => {
  if (config) collectForm();
  await loadGuild();
  updateTicketPreview();
  updateEmbedPreview();
  renderPreview();
  loadSystem();
  showToast('🔄 Statut, Salons et rôles actualisés.');
});

$('#logoutBtn').addEventListener('click', async () => {
  await fetch('/logout', { method: 'POST' }).catch(() => {});
  window.location.href = '/login';
});

loadAll();
