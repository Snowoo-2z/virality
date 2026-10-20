'use strict';
/**
 * Assistante IA des tickets, via l'API Mistral.
 *
 * - Clé API lue uniquement dans le fichier .env : MISTRAL_API_KEY
 *   (jamais dans la config, jamais affichée dans le dashboard).
 * - File d'attente globale : les appels partent un par un, espacés
 *   d'un peu plus d'1 seconde (limite annoncée : 1 requête/seconde).
 * - Aucune erreur ne remonte en crash : l'appelant reçoit une Error
 *   propre, et l'état est visible dans le dashboard (onglet Tickets).
 */

const API_URL = 'https://api.mistral.ai/v1/chat/completions';
const DEFAULT_MODEL = 'ministral-14b-2512';
const MIN_INTERVAL_MS = 1100; // 1 requête / seconde max -> petite marge
const TIMEOUT_MS = 30000;

let lastRequestAt = 0;
let queue = Promise.resolve();

const state = {
  lastOkAt: null,
  lastError: null,
  requests: 0,
};

function isConfigured() {
  const key = (process.env.MISTRAL_API_KEY || '').trim();
  return Boolean(key && key !== 'colle_ta_cle_mistral_ici');
}

function status() {
  return {
    configured: isConfigured(),
    provider: 'Mistral',
    lastOkAt: state.lastOkAt,
    lastError: state.lastError,
    requests: state.requests,
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('')
      .trim();
  }
  return '';
}

async function callMistral({ model, messages, temperature, maxTokens }) {
  const sinceLast = Date.now() - lastRequestAt;
  if (sinceLast < MIN_INTERVAL_MS) await wait(MIN_INTERVAL_MS - sinceLast);
  lastRequestAt = Date.now();
  state.requests += 1;

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY.trim()}`,
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages,
      temperature: typeof temperature === 'number' ? temperature : 0.7,
      max_tokens: maxTokens || 450,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.message || body?.error?.message || '';
    } catch { /* corps illisible : on garde juste le code HTTP */ }
    throw new Error(`Mistral a répondu HTTP ${response.status}${detail ? ` : ${detail}` : ''}`);
  }

  const data = await response.json();
  const text = contentToText(data?.choices?.[0]?.message?.content);
  if (!text) throw new Error('Mistral a répondu vide.');

  state.lastOkAt = new Date().toISOString();
  state.lastError = null;
  return text;
}

/**
 * Envoie une conversation à Mistral et retourne la réponse texte.
 * messages = [{ role: 'system'|'user'|'assistant', content: '...' }]
 * Les appels sont mis en file pour respecter 1 requête / seconde.
 */
function chat(options) {
  if (!isConfigured()) {
    return Promise.reject(
      new Error('Clé Mistral manquante : ajoute MISTRAL_API_KEY dans le fichier .env puis redémarre le bot.')
    );
  }
  const run = () => callMistral(options).catch((err) => {
    state.lastError = String(err?.message || err).slice(0, 300);
    throw err;
  });
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}

/** Découpe un long texte en morceaux envoyables sur discord (< 2000 caractères). */
function splitForDiscord(text, maxLength = 1900) {
  const clean = String(text || '').trim();
  if (!clean) return [];
  const chunks = [];
  let rest = clean;
  while (rest.length > maxLength) {
    let cut = rest.lastIndexOf('\n', maxLength);
    if (cut < maxLength * 0.4) cut = rest.lastIndexOf(' ', maxLength);
    if (cut <= 0) cut = maxLength;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

module.exports = { isConfigured, status, chat, splitForDiscord, DEFAULT_MODEL };
