-- GEKAS petition database schema
-- Database: gekas_petition (Postgres 15+)
-- Applied automatically by stats-api initDb() on startup;
-- also usable for a fresh Docker volume via docker-compose.

CREATE TABLE IF NOT EXISTS petition (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image TEXT NOT NULL DEFAULT '',
  target_signatures INTEGER NOT NULL DEFAULT 15000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS petition_signature (
  id SERIAL PRIMARY KEY,
  petition_id INTEGER NOT NULL REFERENCES petition(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  country TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (petition_id, email)
);

CREATE INDEX IF NOT EXISTS idx_petition_signature_petition_id
  ON petition_signature (petition_id);

CREATE INDEX IF NOT EXISTS idx_petition_signature_created_at
  ON petition_signature (created_at DESC);

-- Seed (only if empty). Image URL can be updated later from the stats admin.
INSERT INTO petition (title, content, image, target_signatures)
SELECT
  'Reconnaître le GENOCOST en RDC',
  $txt$Le peuple congolais a subi, depuis des décennies, des massacres, des violences systématiques et un pillage organisé de ses ressources.

Le GENOCOST désigne ce crime de longue durée : destruction de vies humaines et spoliation économique en République Démocratique du Congo.

Nous demandons la reconnaissance officielle du GENOCOST en RDC, la vérité pour les victimes, et la justice pour que ces crimes ne restent pas sans réponse.

Signez pour soutenir cet appel.$txt$,
  'https://gekas-security.com/petition/cover.svg',
  15000
WHERE NOT EXISTS (SELECT 1 FROM petition LIMIT 1);
