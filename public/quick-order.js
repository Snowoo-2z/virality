'use strict';

const els = {
  form: document.getElementById('quickForm'),
  links: document.getElementById('links'),
  message: document.getElementById('message'),
  chips: document.getElementById('linkChips'),
  linkCount: document.getElementById('linkCount'),
  messageCount: document.getElementById('messageCount'),
  sendBtn: document.getElementById('sendBtn'),
  sendIcon: document.getElementById('sendIcon'),
  sendLabel: document.getElementById('sendLabel'),
  feedback: document.getElementById('feedback'),
  connection: document.getElementById('connection'),
  connectionText: document.getElementById('connectionText'),
  previewChannel: document.getElementById('previewChannel'),
  previewRole: document.getElementById('previewRole'),
  previewBotName: document.getElementById('previewBotName'),
  previewBotAvatar: document.getElementById('previewBotAvatar'),
  previewEmbed: document.getElementById('previewEmbed'),
  previewTitle: document.getElementById('previewEmbedTitle'),
  previewMessage: document.getElementById('previewMessage'),
  previewLinks: document.getElementById('previewLinks'),
  clearBtn: document.getElementById('clearBtn'),
  burstLayer: document.getElementById('burstLayer'),
  composer: document.querySelector('.composer'),
};

const MAX_LINKS = 10;
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>()\[\]{}"']+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>()\[\]{}"']*)?/gi;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let statusState = null;
let submitting = false;
let successMode = false;
let renderQueued = false;
let pulseTimer = 0;
let feedbackTimer = 0;
let successTimer = 0;

function cleanDisplayName(value, fallback) {
  const cleaned = String(value || '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim();
  return cleaned || fallback;
}

function normalizeLink(value) {
  let link = String(value || '').trim().replace(/[),.;!?]+$/g, '');
  if (!link) return '';
  if (/^www\./i.test(link)) link = `https://${link}`;
  if (!/^https?:\/\//i.test(link)) link = `https://${link}`;

  try {
    const parsed = new URL(link);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function parseLinks() {
  const matches = els.links.value.match(URL_PATTERN) || [];
  return [...new Set(matches.map(normalizeLink).filter(Boolean))];
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function pulsePreview() {
  if (reducedMotion.matches) return;
  els.previewEmbed.classList.add('is-pulsing');
  clearTimeout(pulseTimer);
  pulseTimer = setTimeout(() => els.previewEmbed.classList.remove('is-pulsing'), 180);
}

function renderChips(links) {
  const fragment = document.createDocumentFragment();

  links.forEach((link, index) => {
    const chip = document.createElement('span');
    chip.className = 'link-chip';
    chip.title = link;

    const icon = document.createElement('span');
    icon.textContent = '🔗';
    icon.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.textContent = link.replace(/^https?:\/\//i, '');

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'chip-remove';
    remove.dataset.index = String(index);
    remove.setAttribute('aria-label', `Retirer le lien ${index + 1}`);
    remove.textContent = '×';

    chip.append(icon, text, remove);
    fragment.append(chip);
  });

  els.chips.replaceChildren(fragment);
}

function updateSendButton(links) {
  if (submitting) {
    els.sendBtn.disabled = true;
    els.sendBtn.classList.add('is-loading');
    els.sendIcon.textContent = '↻';
    els.sendLabel.textContent = 'Envoi en cours…';
    return;
  }

  els.sendBtn.classList.remove('is-loading');

  if (successMode) {
    els.sendBtn.disabled = true;
    els.sendBtn.classList.add('is-success');
    els.sendIcon.textContent = '✓';
    els.sendLabel.textContent = 'Commande envoyée !';
    return;
  }

  els.sendBtn.classList.remove('is-success');
  els.sendIcon.textContent = '➤';

  if (!statusState) {
    els.sendBtn.disabled = true;
    els.sendLabel.textContent = 'Vérification du salon…';
    return;
  }

  if (!statusState.canSend || !statusState.canPing) {
    els.sendBtn.disabled = true;
    els.sendLabel.textContent = statusState.canSend ? 'Ping @Clipper indisponible' : 'Envoi indisponible';
    return;
  }

  if (!links.length) {
    els.sendBtn.disabled = true;
    els.sendLabel.textContent = 'Colle un lien pour envoyer';
    return;
  }

  if (links.length > MAX_LINKS) {
    els.sendBtn.disabled = true;
    els.sendLabel.textContent = `Trop de liens (${MAX_LINKS} maximum)`;
    return;
  }

  els.sendBtn.disabled = false;
  const roleLabel = cleanDisplayName(statusState.roleName, 'Clipper');
  els.sendLabel.textContent = `Envoyer et ping @${roleLabel}`;
}

function render() {
  const links = parseLinks();
  const message = els.message.value.trim();

  els.linkCount.textContent = `${links.length} lien${links.length > 1 ? 's' : ''}`;
  els.linkCount.classList.toggle('is-hot', links.length >= MAX_LINKS);
  els.links.classList.toggle('is-invalid', links.length > MAX_LINKS);
  els.messageCount.textContent = `${els.message.value.length} / 300`;
  els.messageCount.classList.toggle('is-hot', els.message.value.length > 260);

  renderChips(links);

  els.previewTitle.textContent = links.length > 1
    ? '🎬 Nouvelles commandes'
    : '🎬 Nouvelle commande';

  if (message) {
    els.previewMessage.hidden = false;
    els.previewMessage.textContent = message;
    els.previewMessage.classList.remove('preview-placeholder');
  } else {
    // Comme dans le vrai embed : pas de phrase ajoutée si le champ est vide.
    els.previewMessage.hidden = true;
    els.previewMessage.textContent = '';
    els.previewMessage.classList.add('preview-placeholder');
  }

  if (links.length) {
    els.previewLinks.textContent = links.map((link, index) => `${index + 1}. ${link}`).join('\n');
    els.previewLinks.classList.remove('preview-placeholder');
  } else {
    els.previewLinks.textContent = 'Colle un lien pour voir l’aperçu.';
    els.previewLinks.classList.add('preview-placeholder');
  }

  updateSendButton(links);
  pulsePreview();
}

function showFeedback(type, text, sticky = false) {
  clearTimeout(feedbackTimer);
  els.feedback.className = `feedback is-visible is-${type}`;
  els.feedback.textContent = text;

  if (!sticky) {
    feedbackTimer = setTimeout(hideFeedback, type === 'success' ? 6000 : 8000);
  }
}

function hideFeedback() {
  els.feedback.className = 'feedback';
  els.feedback.textContent = '';
}

function shakeComposer() {
  if (reducedMotion.matches) return;
  els.composer.classList.remove('shake');
  void els.composer.offsetWidth;
  els.composer.classList.add('shake');
  setTimeout(() => els.composer.classList.remove('shake'), 390);
}

function launchBurst() {
  if (reducedMotion.matches) return;

  const rect = els.sendBtn.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;
  const colors = ['#ffb020', '#ff7a18', '#43d17c', '#ffffff', '#ffcf87'];
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < 18; i += 1) {
    const particle = document.createElement('span');
    const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.35;
    const distance = 70 + Math.random() * 110;

    particle.className = 'burst-particle';
    particle.style.left = `${originX}px`;
    particle.style.top = `${originY}px`;
    particle.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    particle.style.setProperty('--dy', `${Math.sin(angle) * distance - 34}px`);
    particle.style.setProperty('--rot', `${Math.round(Math.random() * 420 - 210)}deg`);
    particle.style.setProperty('--particle-color', colors[i % colors.length]);
    fragment.append(particle);
  }

  els.burstLayer.replaceChildren(fragment);
  setTimeout(() => els.burstLayer.replaceChildren(), 850);
}

async function loadStatus() {
  try {
    const response = await fetch('/api/quick-order/status', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.reason || data.error || 'Impossible de vérifier Discord.');

    statusState = data;
    const channelLabel = `#${cleanDisplayName(data.channelName, 'commandes')}`;
    const roleLabel = `@${cleanDisplayName(data.roleName, 'Clipper')}`;

    els.previewChannel.textContent = channelLabel;
    els.previewRole.textContent = roleLabel;
    if (data.botName) els.previewBotName.textContent = data.botName;
    if (data.botAvatarUrl) els.previewBotAvatar.src = data.botAvatarUrl;

    if (data.canSend && data.canPing) {
      els.connection.className = 'connection is-online';
      els.connectionText.textContent = 'Bot en ligne';
      hideFeedback();
    } else if (data.canSend) {
      els.connection.className = 'connection is-online';
      els.connectionText.textContent = 'Bot en ligne';
      showFeedback('error', `⚠️ ${data.reason || 'Le bot peut envoyer, mais pas ping le rôle Clipper.'}`, true);
    } else {
      els.connection.className = 'connection is-offline';
      els.connectionText.textContent = data.online ? 'À vérifier' : 'Bot hors ligne';
      showFeedback('error', `⚠️ ${data.reason || 'Le salon commandes est introuvable.'}`, true);
    }

    render();
  } catch (err) {
    statusState = { canSend: false, canPing: false };
    els.connection.className = 'connection is-offline';
    els.connectionText.textContent = 'Connexion impossible';
    showFeedback('error', `⚠️ ${err.message}`, true);
    render();
  }
}

els.previewBotAvatar.addEventListener('error', () => {
  if (!els.previewBotAvatar.src.endsWith('/assets/logo.jpg')) {
    els.previewBotAvatar.src = '/assets/logo.jpg';
  }
});

els.chips.addEventListener('click', (event) => {
  const button = event.target.closest('.chip-remove');
  if (!button) return;

  const links = parseLinks();
  links.splice(Number(button.dataset.index), 1);
  els.links.value = links.join('\n');
  render();
  els.links.focus();
});

els.links.addEventListener('input', scheduleRender);
els.message.addEventListener('input', scheduleRender);

els.clearBtn.addEventListener('click', () => {
  els.links.value = '';
  render();
  els.links.focus();
});

document.querySelectorAll('[data-quick-message]').forEach((button) => {
  button.addEventListener('click', () => {
    els.message.value = button.dataset.quickMessage || '';
    render();
    if (parseLinks().length) els.sendBtn.focus();
    else els.links.focus();
  });
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    if (!els.sendBtn.disabled) els.form.requestSubmit();
  }
});

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitting) return;

  const links = parseLinks();
  if (!statusState?.canSend || !statusState?.canPing) {
    showFeedback('error', `⚠️ ${statusState?.reason || 'Le bot n’est pas prêt à envoyer cette commande.'}`, true);
    shakeComposer();
    return;
  }
  if (!links.length) {
    showFeedback('error', '🔗 Colle au moins un lien avant d’envoyer.');
    shakeComposer();
    els.links.focus();
    return;
  }
  if (links.length > MAX_LINKS) {
    showFeedback('error', `🔗 ${MAX_LINKS} liens maximum par commande.`);
    shakeComposer();
    return;
  }

  submitting = true;
  hideFeedback();
  render();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch('/api/quick-order/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ links: els.links.value, message: els.message.value.trim() }),
      signal: controller.signal,
    });

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'L’envoi a échoué.');

    submitting = false;
    successMode = true;
    els.composer.classList.remove('pop-success');
    void els.composer.offsetWidth;
    els.composer.classList.add('pop-success');
    render();
    launchBurst();

    const channelLabel = `#${cleanDisplayName(data.channelName, 'commandes')}`;
    const roleLabel = `@${cleanDisplayName(data.roleName, 'Clipper')}`;
    showFeedback(
      'success',
      `✅ Commande envoyée dans ${channelLabel} : ${data.linksCount || links.length} lien${(data.linksCount || links.length) > 1 ? 's' : ''}, ${roleLabel} pingé.`,
    );

    clearTimeout(successTimer);
    successTimer = setTimeout(() => {
      successMode = false;
      els.links.value = '';
      els.message.value = '';
      render();
      els.links.focus();
    }, 900);
  } catch (err) {
    submitting = false;
    render();
    showFeedback(
      'error',
      err.name === 'AbortError'
        ? '⏳ Discord met trop de temps à répondre. Réessaie dans quelques secondes.'
        : `❌ ${err.message}`,
    );
    shakeComposer();
    loadStatus();
  } finally {
    clearTimeout(timeout);
  }
});

render();
loadStatus();
setTimeout(() => els.links.focus(), 120);
