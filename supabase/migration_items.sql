-- ═════════════════════════════════════════════════════════════
-- Migration : modèle unifié `items` — VERSION IDEMPOTENTE
-- Ré-exécutable sans risque quel que soit l'état intermédiaire.
--
-- venues + events → items (nature · slot · category)
-- escapades → escapades + escapade_items (étapes ordonnées)
-- stamps : venue_id → item_id, category → slot
-- ═════════════════════════════════════════════════════════════

-- ── 1. La table unifiée ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  nature         text NOT NULL CHECK (nature IN ('permanent', 'ephemere')),
  slot           text NOT NULL CHECK (slot IN ('activite', 'table', 'sortie')),
  category       text NOT NULL CHECK (category IN
                   ('culture', 'loisir', 'plein_air', 'food', 'bar', 'club', 'concert')),

  name           text NOT NULL,
  description    text,
  photo_url      text,

  address        text,
  arrondissement int CHECK (arrondissement BETWEEN 1 AND 20),
  lat            float8,
  lng            float8,
  transport      text,

  price          int,           -- euros (éphémères, 0 = gratuit)
  price_level    int CHECK (price_level BETWEEN 1 AND 3),  -- permanents
  rating         float8,
  schedule_text  text,          -- horaires en clair
  access_type    text,          -- 'obligatoire' | 'conseillé' | null
  access_link    text,          -- lien de réservation
  url            text,
  is_indoor      boolean NOT NULL DEFAULT true,
  tags           text,          -- labels source bruts "Expo;Histoire"

  -- Temporel (éphémères uniquement)
  start_date     timestamptz,
  end_date       timestamptz,
  occurrences    text,

  -- Curation & jeu
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  rarity         text NOT NULL DEFAULT 'common'
                   CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  is_active      boolean NOT NULL DEFAULT true,

  -- Traçabilité
  source         text NOT NULL CHECK (source IN ('admin', 'paris_opendata', 'google_places')),
  external_id    text,
  cached_at      timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_items_spin   ON items (slot, status, is_active);
CREATE INDEX IF NOT EXISTS idx_items_nature ON items (nature);

-- RLS : lecture pour tous les connectés, écriture pour les admins
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "items_select_auth"   ON items;
DROP POLICY IF EXISTS "items_admin_insert"  ON items;
DROP POLICY IF EXISTS "items_admin_update"  ON items;
DROP POLICY IF EXISTS "items_admin_delete"  ON items;

CREATE POLICY "items_select_auth" ON items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "items_admin_insert" ON items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin));

CREATE POLICY "items_admin_update" ON items
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin));

CREATE POLICY "items_admin_delete" ON items
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin));

-- ── 2. Escapades : étapes dans une table de jointure ─────────

ALTER TABLE escapades DROP COLUMN IF EXISTS venue_id;
ALTER TABLE escapades DROP COLUMN IF EXISTS restaurant_id;
ALTER TABLE escapades DROP COLUMN IF EXISTS event_id;
ALTER TABLE escapades ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE escapades ADD COLUMN IF NOT EXISTS is_curated boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS escapade_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escapade_id  uuid NOT NULL REFERENCES escapades(id) ON DELETE CASCADE,
  item_id      uuid NOT NULL REFERENCES items(id),
  position     int NOT NULL,
  UNIQUE (escapade_id, position)
);

ALTER TABLE escapade_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "escapade_items_select_own" ON escapade_items;
DROP POLICY IF EXISTS "escapade_items_insert_own" ON escapade_items;

CREATE POLICY "escapade_items_select_own" ON escapade_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM escapades e
                 WHERE e.id = escapade_id AND e.user_id = auth.uid()));

CREATE POLICY "escapade_items_insert_own" ON escapade_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM escapades e
                      WHERE e.id = escapade_id AND e.user_id = auth.uid()));

-- ── 3. Stamps : renommages (seulement si pas déjà faits) ─────

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'stamps'
               AND column_name = 'venue_id') THEN
    ALTER TABLE stamps RENAME COLUMN venue_id TO item_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'stamps'
               AND column_name = 'category') THEN
    ALTER TABLE stamps RENAME COLUMN category TO slot;
  END IF;
END $$;

-- ── 4. Nettoyage des anciennes tables ────────────────────────
-- Ordre : checkins d'abord — elle a des FK vers venues/events

DROP TABLE IF EXISTS checkins;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS venues;

-- ── 5. Vérification ──────────────────────────────────────────
-- Attendu : badges · escapade_items · escapades · items · stamps
--           · user_badges · users  (et PAS events/venues/checkins)
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
