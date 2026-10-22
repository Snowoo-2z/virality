'use strict';
/**
 * Auto-ping pour l'hébergement gratuit (Render notamment).
 *
 * Render endort un service gratuit après 15 minutes sans trafic entrant.
 * Ici, le bot s'appelle lui-même via son adresse publique (/health)
 * toutes les 10 minutes par défaut. Cela limite fortement la mise en
 * veille tant que le service reste démarré.
 *
 * Variables possibles :
 * - AUTO_PING=off          -> désactive complètement l'auto-ping
 * - AUTO_PING_MINUTES=10   -> délai entre deux pings (1 à 14 minutes)
 * - AUTO_PING_URL=...      -> adresse précise à appeler (optionnel)
 *
 * Sur Render, RENDER_EXTERNAL_URL est fourni automatiquement.
 */

const DEFAULT_INTERVAL_MINUTES = 10;
const FIRST_PING_DELAY_MS = 60_000;

let initialTimer = null;
let intervalTimer = null;

const state = {
  enabled: false,
  url: null,
  intervalMinutes: DEFAULT_INTERVAL_MINUTES,
  pings: 0,
  lastPingAt: null,
  lastStatus: null,
  lastError: null,
};

function isDisabled() {
  const value = String(process.env.AUTO_PING || '').trim().toLowerCase();
  return ['0', 'false', 'off', 'no', 'non'].includes(value);
}

function resolveIntervalMinutes() {
  const value = Number(process.env.AUTO_PING_MINUTES || DEFAULT_INTERVAL_MINUTES);
  if (!Number.isFinite(value)) return DEFAULT_INTERVAL_MINUTES;
  // 14 minutes maximum : Render endort le service après 15 minutes.
  return Math.min(14, Math.max(1, Math.floor(value)));
}

function resolvePingUrl() {
  const explicit = String(process.env.AUTO_PING_URL || '').trim();
  if (explicit) {
    const url = new URL(explicit);
    if (url.pathname === '/') url.pathname = '/health';
    return url.toString();
  }

  const external = String(process.env.RENDER_EXTERNAL_URL || '').trim();
  if (!external) return '';
  return new URL('/health', external).toString();
}

async function pingNow(url = state.url) {
  if (!url) return false;

  state.lastPingAt = new Date().toISOString();
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Virality-Bot-AutoPing/1.0',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(15_000),
    });

    // Consomme la réponse pour fermer proprement la connexion.
    await response.text().catch(() => '');

    state.lastStatus = response.status;
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    state.pings += 1;
    state.lastError = null;
    return true;
  } catch (err) {
    state.lastError = String(err?.message || err).slice(0, 300);
    console.warn(`⚠️  Auto-ping impossible (${state.lastError}) — nouvel essai au prochain cycle.`);
    return false;
  }
}

function status() {
  return { ...state };
}

function startKeepAlive() {
  if (initialTimer || intervalTimer) return status();

  if (isDisabled()) {
    state.enabled = false;
    console.log('💤 Auto-ping désactivé (AUTO_PING=off).');
    return status();
  }

  let target = '';
  try {
    target = resolvePingUrl();
    if (target) {
      const parsed = new URL(target);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('AUTO_PING_URL doit commencer par http:// ou https://');
      }
    }
  } catch (err) {
    state.enabled = false;
    state.lastError = String(err?.message || err).slice(0, 300);
    console.warn(`⚠️  Auto-ping non démarré : ${state.lastError}`);
    return status();
  }

  if (!target) {
    state.enabled = false;
    if (process.env.RENDER) {
      console.warn('⚠️  Auto-ping Render : adresse publique introuvable (RENDER_EXTERNAL_URL absent).');
    }
    return status();
  }

  state.enabled = true;
  state.url = target;
  state.intervalMinutes = resolveIntervalMinutes();

  const run = () => {
    pingNow().catch(() => {});
  };

  initialTimer = setTimeout(run, FIRST_PING_DELAY_MS);
  initialTimer.unref?.();
  intervalTimer = setInterval(run, state.intervalMinutes * 60_000);
  intervalTimer.unref?.();

  console.log(`🔁 Auto-ping activé : ${target} toutes les ${state.intervalMinutes} minute(s).`);
  return status();
}

function stopKeepAlive() {
  clearTimeout(initialTimer);
  clearInterval(intervalTimer);
  initialTimer = null;
  intervalTimer = null;
  state.enabled = false;
  return status();
}

module.exports = {
  startKeepAlive,
  stopKeepAlive,
  pingNow,
  status,
  resolvePingUrl,
  resolveIntervalMinutes,
};
