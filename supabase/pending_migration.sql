-- ============ MIGRATION 1: original movies-as-content-type tables ============

create table if not exists user_movies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_movie_id integer not null,
  status text not null check (status in ('watchlist', 'watching', 'paused', 'drop', 'completed')),
  favorite boolean not null default false,
  status_explicit boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tmdb_movie_id)
);

create table if not exists movie_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_movie_id integer not null,
  rating numeric(3,1) not null,
  mood text,
  favorite_character_id text,
  favorite_character_name text,
  review_text text,
  share_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tmdb_movie_id)
);

-- Idempotent add — covers the case where movie_ratings was already
-- created by an earlier run of this file, before the Share feature
-- (share_id column) existed.
alter table movie_ratings add column if not exists share_id text;

alter table user_movies enable row level security;
alter table movie_ratings enable row level security;

drop policy if exists "own rows only" on user_movies;
create policy "own rows only" on user_movies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows only" on movie_ratings;
create policy "own rows only" on movie_ratings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Public read of shared ratings — mirrors season_ratings' own "share_id
-- is not null" policy (the mechanism Show Detail's Share button already
-- relies on for the public /s/[shareId] page), one media type over. Only
-- SELECT, only rows the owner explicitly opted into sharing (share_id set
-- via ensureMovieShareId) — never a blanket public-read policy.
drop policy if exists "public read of shared ratings" on movie_ratings;
create policy "public read of shared ratings" on movie_ratings
  for select using (share_id is not null);

-- ============ MIGRATION 2: Highlights + Movie Detail customization/collections ============

alter table user_movies add column if not exists watched_on date;

create table if not exists movie_customizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_movie_id integer not null,
  custom_backdrop_url text,
  custom_poster_url text,
  custom_logo_url text,
  updated_at timestamptz not null default now(),
  unique (user_id, tmdb_movie_id)
);

create table if not exists collection_movies (
  collection_id uuid not null references collections(id) on delete cascade,
  tmdb_movie_id integer not null,
  added_at timestamptz not null default now(),
  primary key (collection_id, tmdb_movie_id)
);

alter table movie_customizations enable row level security;
alter table collection_movies enable row level security;

drop policy if exists "own rows only" on movie_customizations;
create policy "own rows only" on movie_customizations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows only via parent collection" on collection_movies;
create policy "own rows only via parent collection" on collection_movies
  for all using (exists (select 1 from collections c where c.id = collection_id and c.user_id = auth.uid()))
  with check (exists (select 1 from collections c where c.id = collection_id and c.user_id = auth.uid()));
