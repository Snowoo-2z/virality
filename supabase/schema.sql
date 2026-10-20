-- ============================================================
--  VIRALITY BOT — Table de sauvegarde de la configuration
--  À exécuter UNE fois dans Supabase : menu "SQL Editor"
--  -> colle tout ce fichier -> bouton "Run".
-- ============================================================

create table if not exists public.bot_config (
  id text primary key,               -- l'ID du serveur discord
  config jsonb not null,             -- tous les réglages du bot
  updated_at timestamptz not null default now()
);

-- Sécurité : on allume le verrou (RLS) SANS ouvrir de porte publique.
-- Résultat : personne ne peut lire/écrire avec la clé publique (anon).
-- Seule la clé secrète "service_role" (celle dans ton fichier .env,
-- côté bot uniquement) contourne ce verrou. C'est exactement ce qu'on veut.
alter table public.bot_config enable row level security;
