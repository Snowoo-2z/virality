'use strict';
/**
 * Sauvegarde "miroir" de la configuration sur Supabase (optionnel).
 *
 * Principe (simple et sûr) :
 *  - Le fichier local data/config.json reste LA source de vérité du bot.
 *  - À chaque sauvegarde, une copie est envoyée sur Supabase (en fond).
 *  - Au démarrage, s'il n'y a AUCUNE config locale (nouveau PC, dossier
 *    tout frais) et que Supabase est configuré, on récupère la copie.
 *
 * Activation : remplir SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans le
 * fichier .env, et créer la table `bot_config` (voir supabase/schema.sql).
 * Sans ça, ce module ne fait strictement rien.
 */

const TABLE = 'bot_config';
const ROW_ID = () =>
  String(process.env.GUILD_ID || '1562033502612885534').trim();

let client = null;
let clientFailed = false;
let pushTimer = null;

const state = {
  lastSyncAt: null, // ISO string de la dernière synchro réussie
  lastSyncOk: null, // true / false / null (jamais essayé)
  lastError: null,
};

function isConfigured() {
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return Boolean(url && key && key !== 'colle_ta_cle_service_role_ici');
}

function getClient() {
  if (!isConfigured() || clientFailed) return null;
  if (client) return client;
  try {
    const { createClient } = require('@supabase/supabase-js');
    client = createClient(
      process.env.SUPABASE_URL.trim(),
      process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
      { auth: { persistSession: false } }
    );
    return client;
  } catch (err) {
    clientFailed = true;
    state.lastError = `Module Supabase indisponible : ${err.message}`;
    console.warn('⚠️ ', state.lastError, '(lance "npm install" pour réparer — le bot continue sans Supabase)');
    return null;
  }
}

function rememberError(err) {
  state.lastSyncOk = false;
  state.lastError = String(err?.message || err).slice(0, 300);
}

/** Envoie une copie de la config sur Supabase. Ne plante jamais. */
async function pushConfig(cfg) {
  const sb = getClient();
  if (!sb) return false;
  try {
    const { error } = await sb.from(TABLE).upsert({
      id: ROW_ID(),
      config: cfg,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    state.lastSyncOk = true;
    state.lastSyncAt = new Date().toISOString();
    state.lastError = null;
    return true;
  } catch (err) {
    rememberError(err);
    console.warn('⚠️  Sauvegarde Supabase échouée (le bot continue en local) :', state.lastError);
    return false;
  }
}

/** Version "regroupée" : évite d'envoyer 10 copies si on sauvegarde en rafale. */
function queuePush(cfg) {
  if (!isConfigured()) return;
  clearTimeout(pushTimer);
  const snapshot = JSON.parse(JSON.stringify(cfg));
  pushTimer = setTimeout(() => {
    pushConfig(snapshot).catch(() => {});
  }, 800);
}

/** Récupère la config stockée sur Supabase (ou null). Ne plante jamais. */
async function fetchConfig() {
  const sb = getClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from(TABLE)
      .select('config')
      .eq('id', ROW_ID())
      .maybeSingle();
    if (error) throw error;
    return data?.config || null;
  } catch (err) {
    rememberError(err);
    console.warn('⚠️  Lecture Supabase impossible (le bot démarre avec les réglages par défaut) :', state.lastError);
    return null;
  }
}

/** État pour affichage dans le dashboard. */
function status() {
  return {
    configured: isConfigured(),
    url: isConfigured() ? process.env.SUPABASE_URL.trim() : null,
    lastSyncAt: state.lastSyncAt,
    lastSyncOk: state.lastSyncOk,
    lastError: state.lastError,
  };
}

module.exports = { isConfigured, queuePush, pushConfig, fetchConfig, status };
