-- ============================================================
-- Spin — Schéma complet de la base de données
-- À exécuter dans Supabase Dashboard > SQL Editor
-- ============================================================


-- ── Users ────────────────────────────────────────────────────
create table if not exists public.users (
  id              uuid primary key default gen_random_uuid(),
  email           text,
  username        text,
  avatar_url      text,
  xp              int4 not null default 0,
  level           int4 not null default 1,
  streak_count    int4 not null default 0,
  streak_freezes  int4 not null default 1,
  streak_last_checkin timestamptz,
  created_at      timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "users: lecture propre" on public.users
  for select using (auth.uid() = id);

create policy "users: modification propre" on public.users
  for update using (auth.uid() = id);

create policy "users: insertion propre" on public.users
  for insert with check (auth.uid() = id);


-- ── Venues (cache Google Places) ─────────────────────────────
create table if not exists public.venues (
  id              uuid primary key default gen_random_uuid(),
  google_place_id text not null unique,
  name            text not null,
  address         text not null default '',
  category        text not null check (category in ('lieu', 'restaurant', 'ambiance')),
  lat             float8,
  lng             float8,
  price_level     int4 check (price_level between 1 and 3),
  rating          float8,
  photo_url       text,
  rarity          text not null default 'common' check (rarity in ('common', 'rare', 'epic', 'legendary')),
  is_active       boolean not null default true,
  cached_at       timestamptz not null default now()
);

alter table public.venues enable row level security;

-- Les venues sont lisibles par tous les utilisateurs connectés
create policy "venues: lecture publique" on public.venues
  for select using (auth.role() = 'authenticated');

-- Tout utilisateur connecté peut écrire (MVP — à restreindre au service_role en prod)
create policy "venues: écriture authentifié" on public.venues
  for all using (auth.role() = 'authenticated');


-- ── Events (cache Paris Open Data + Eventbrite) ──────────────
create table if not exists public.events (
  id              uuid primary key default gen_random_uuid(),
  source          text not null check (source in ('paris_opendata', 'eventbrite')),
  external_id     text not null,
  title           text not null,
  description     text,
  category        text not null check (category in ('lieu', 'restaurant', 'ambiance')),
  venue_name      text,
  lat             float8,
  lng             float8,
  start_date      timestamptz not null,
  end_date        timestamptz,
  price           int4 not null default 0,
  url             text,
  cached_at       timestamptz not null default now(),
  unique (external_id, source)
);

alter table public.events enable row level security;

create policy "events: lecture publique" on public.events
  for select using (auth.role() = 'authenticated');

-- Tout utilisateur connecté peut écrire (MVP — à restreindre au service_role en prod)
create policy "events: écriture authentifié" on public.events
  for all using (auth.role() = 'authenticated');


-- ── Soirees ──────────────────────────────────────────────────
create table if not exists public.soirees (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  venue_id        uuid not null references public.venues(id),
  restaurant_id   uuid not null references public.venues(id),
  event_id        uuid not null references public.events(id),
  status          text not null default 'generated' check (status in ('generated', 'accepted', 'completed')),
  created_at      timestamptz not null default now()
);

alter table public.soirees enable row level security;

create policy "soirees: lecture propre" on public.soirees
  for select using (auth.uid() = user_id);

create policy "soirees: insertion propre" on public.soirees
  for insert with check (auth.uid() = user_id);

create policy "soirees: modification propre" on public.soirees
  for update using (auth.uid() = user_id);


-- ── Checkins ─────────────────────────────────────────────────
create table if not exists public.checkins (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  soiree_id       uuid not null references public.soirees(id) on delete cascade,
  venue_id        uuid not null references public.venues(id),
  gps_verified    boolean not null default false,
  photo_url       text,
  rating          int4 check (rating between 1 and 3),
  checked_in_at   timestamptz not null default now()
);

alter table public.checkins enable row level security;

create policy "checkins: lecture propre" on public.checkins
  for select using (auth.uid() = user_id);

create policy "checkins: insertion propre" on public.checkins
  for insert with check (auth.uid() = user_id);


-- ── Badges ───────────────────────────────────────────────────
create table if not exists public.badges (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text not null,
  icon            text not null,
  xp_reward       int4 not null default 0,
  condition_type  text not null check (condition_type in ('checkin_count', 'streak', 'arrondissement', 'cuisine', 'rarity', 'time')),
  condition_value int4 not null
);

alter table public.badges enable row level security;

-- Badges lisibles par tous
create policy "badges: lecture publique" on public.badges
  for select using (auth.role() = 'authenticated');


-- ── User Badges ───────────────────────────────────────────────
create table if not exists public.user_badges (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  badge_id        uuid not null references public.badges(id),
  earned_at       timestamptz not null default now(),
  unique (user_id, badge_id)
);

alter table public.user_badges enable row level security;

create policy "user_badges: lecture propre" on public.user_badges
  for select using (auth.uid() = user_id);

create policy "user_badges: insertion propre" on public.user_badges
  for insert with check (auth.uid() = user_id);


-- ── Index pour les requêtes fréquentes ───────────────────────
create index if not exists idx_venues_category on public.venues(category);
create index if not exists idx_venues_is_active on public.venues(is_active);
create index if not exists idx_events_category on public.events(category);
create index if not exists idx_events_start_date on public.events(start_date);
create index if not exists idx_soirees_user_id on public.soirees(user_id);
create index if not exists idx_checkins_user_id on public.checkins(user_id);


-- ── Badges de base ────────────────────────────────────────────
insert into public.badges (name, description, icon, xp_reward, condition_type, condition_value) values
  ('Premier Spin',    'Tu as lancé ta première soirée',          '🎰', 50,  'checkin_count', 1),
  ('Lancé',           '3 soirées validées',                      '🔥', 100, 'checkin_count', 3),
  ('Semainier',       '7 jours de streak',                       '📅', 200, 'streak',        7),
  ('Explorateur',     '10 arrondissements différents visités',   '🗺️', 300, 'arrondissement', 10),
  ('Noctambule',      'Sortir après minuit 3 fois',              '🌙', 150, 'time',          3),
  ('Coup de Dés',     'Accepter sans relancer aucun reel',       '🎲', 75,  'checkin_count', 1),
  ('Légendaire',      'Tomber sur un lieu légendaire',           '⭐', 500, 'rarity',        1)
on conflict do nothing;
