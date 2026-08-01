-- ---------------------------------------------------------------------------
-- Cinext starter schema
-- ---------------------------------------------------------------------------
-- Run this in the Supabase SQL editor (Project > SQL Editor > New query).
-- Auth users are handled by Supabase's built-in `auth.users` table already —
-- these tables just reference it via user_id.

-- A show a user has added to their library, with its status.
create table if not exists user_shows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_show_id integer not null,
  status text not null check (status in ('watchlist', 'watching', 'paused', 'drop', 'completed')),
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tmdb_show_id)
);

-- Whether `status` was ever actually chosen by the user (the status menu,
-- Watchlist-confirm, Completed, etc.) as opposed to existing purely
-- because marking an episode/season watched created the row. Both look
-- identical in `status` alone ("watching"/"completed" either way), but
-- they need to behave differently when watched-episode count drops back
-- to zero: an explicit pick must survive that (this app's established
-- rule — unmarking must never silently evict a status the user
-- deliberately set), while a status that only ever existed as a side
-- effect of marking episodes should revert the show out of the library
-- entirely once the last of those episodes is unmarked, since nothing
-- actually justifies it being there anymore. Defaults true since every
-- row created before this column existed was, by this app's own rule,
-- created by a genuine explicit action.
alter table user_shows add column if not exists status_explicit boolean not null default true;

-- Per-episode watch state.
create table if not exists episode_watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_show_id integer not null,
  season_number integer not null,
  episode_number integer not null,
  watched_at timestamptz not null default now(),
  rating numeric(3,1), -- 0.0–5.0, half-star precision (matches EpisodeRatingFlow.jsx). Was 0.0-10.0 before the 5-star conversion; existing rows were migrated in place, see that migration for the conversion formula.
  unique (user_id, tmdb_show_id, season_number, episode_number, watched_at)
);

-- "Remove from History" (Highlights' Watch History calendar) sets this
-- instead of deleting the row — the episode must stay watched everywhere
-- else (Show Detail's watch count/status, the person filmography "watched"
-- badge, etc.), only Highlights' own queries filter it out. A real delete
-- would strip watched state from the whole app just because the user
-- didn't want one entry cluttering their calendar.
alter table episode_watches add column if not exists hidden_from_highlights boolean not null default false;

-- Editable Watch Date precision (episode_rating_flow.jsx's Watch Date
-- sheet) — explicit precision instead of inventing a fake date. `day`
-- (exact date, whether picked manually or from the episode's real TMDB
-- air date) is the only precision that ever appears on a specific
-- Watch History calendar day; `month` counts toward that month's
-- Highlights totals without a day; `year` counts toward yearly totals
-- only; `unknown` ("Don't remember") is excluded from every time-based
-- Highlights view while the episode still counts as watched everywhere
-- else. Defaults keep every pre-existing/ordinary mark-watched row
-- (never touched by the Watch Date sheet) behaving exactly as it always
-- has — real day precision, derived from watched_at, no code changes
-- needed at the call sites that just mark something watched.
alter table episode_watches add column if not exists watch_date_precision text not null default 'day'
  check (watch_date_precision in ('day', 'month', 'year', 'unknown'));
-- Nullable, no default — deliberately NOT `default (now() at time zone
-- ...)::date`. That expression is volatile, so Postgres can't apply it
-- as a cheap metadata-only default for pre-existing rows the way it can
-- a constant; it would instead rewrite the table and stamp every
-- existing row with today's date (whenever this migration happens to
-- run), destroying their real watched date. New ordinary rows get this
-- set explicitly by addEpisodeWatches (lib/episodeWatches.js) at insert
-- time instead — this (not watched_at, which is really "when this row
-- was recorded" and can diverge once a user picks a different past date
-- via the sheet) is what Watch History's calendar and day-bucketing must
-- read for `day` rows going forward. Existing rows are backfilled below
-- from their own real watched_at, not from "now".
alter table episode_watches add column if not exists watched_on date;
-- Same reasoning — no volatile default. Populated for day/month
-- precision (never invented for `year`/`unknown`), so year-level
-- aggregation can group by this one column regardless of a row's
-- precision, instead of needing a different date source per precision.
alter table episode_watches add column if not exists watched_year integer;
-- Same reasoning — no volatile default. Populated for day/month
-- precision only; deliberately left null for `year` precision (no
-- invented month) and `unknown`.
alter table episode_watches add column if not exists watched_month integer;
-- Null for ordinary rows (nothing "sourced" them — they're just a normal
-- watch). Set once a row has gone through the Watch Date sheet: manual
-- (any precision the user picked by hand), release_date, or release_month.
alter table episode_watches add column if not exists watch_date_source text
  check (watch_date_source is null or watch_date_source in ('manual', 'release_date', 'release_month'));

-- One-time backfill for rows that existed before these columns did —
-- guarded by `watched_on is null` so re-running this file is still safe
-- (a row already touched by the Watch Date sheet, including one
-- deliberately set to null for month/year/unknown precision, is never
-- overwritten). Every such row is real day-precision history (this
-- column didn't exist yet, so nothing could have chosen otherwise).
update episode_watches
set
  watched_on = (watched_at at time zone 'Asia/Bangkok')::date,
  watched_year = extract(year from (watched_at at time zone 'Asia/Bangkok'))::int,
  watched_month = extract(month from (watched_at at time zone 'Asia/Bangkok'))::int
where watched_on is null and watch_date_precision = 'day';

-- Season-level reviews (matches season_review.jsx).
create table if not exists season_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_show_id integer not null,
  season_number integer not null,
  rating numeric(3,1) not null,
  mood text, -- e.g. "wow" | "excited" | "sad" | "thrilled" | "other"
  review_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tmdb_show_id, season_number)
);

-- Editable profile fields (Edit Profile screen) — one row per user,
-- created on first save. avatar_url/background_url point at objects in
-- the profile-media Storage bucket (see below), not TMDB paths.
-- readable_languages backs Language Settings' "Readable Languages"
-- multi-select — ISO 639-1 codes (matches TMDB's original_language) for
-- every language the user can read; a show's original title displays
-- instead of its English one when its original_language is in this list.
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  bio text,
  avatar_url text,
  background_url text,
  readable_languages text[] not null default array['en'],
  theme_preference text not null default 'dark',
  accent_color text not null default '#E8A24C',
  updated_at timestamptz not null default now()
);

-- Idempotent: picks up the column on a profiles table that already
-- existed before readable_languages was added (create table if not
-- exists above is a no-op against an existing table, missing column and
-- all, so this needs to be a separate statement).
alter table profiles add column if not exists readable_languages text[] not null default array['en'];

-- Settings > Appearance — persists the theme/accent picker (previously
-- local-only, forgotten on reload). theme_preference: 'dark' | 'light' |
-- 'system'; accent_color: a hex string, either one of lib/theme.js's
-- accentPalette entries or a custom color picked via the color input.
alter table profiles add column if not exists theme_preference text not null default 'dark';
alter table profiles add column if not exists accent_color text not null default '#E8A24C';

-- Profile header's "@handle" (Edit Profile) — a real user-chosen username,
-- not derived from display name or email. Nullable (not every profile has
-- picked one yet); unique so two accounts can't collide — re-created via
-- drop-then-add each run since Postgres has no ADD CONSTRAINT IF NOT
-- EXISTS, matching this file's own idempotency approach elsewhere.
-- lib/profile.js's validateHandle enforces the actual format (lowercase
-- letters/numbers/underscores, 3-20 chars) client-side before this is ever
-- reached; this constraint is just the last-resort guarantee.
alter table profiles add column if not exists handle text;
alter table profiles drop constraint if exists profiles_handle_unique;
alter table profiles add constraint profiles_handle_unique unique (handle);

-- User-created collections (matches collections.jsx).
-- cover_style: null (the default gradient/theme/custom-image cover) |
-- 'boxset' (the Collector Box Set style, components/CollectionBoxSet.jsx) —
-- unlike backdropTheme/customImage (still local-only/cosmetic, see
-- app/(tabs)/profile/collections/[id]/page.jsx), this one persists since
-- it's a real selectable cover style, not a per-session preview tweak.
create table if not exists collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  cover_style text,
  created_at timestamptz not null default now()
);

-- Idempotent, same reasoning as readable_languages above — picks up the
-- column on a collections table that already existed before this was added.
alter table collections add column if not exists cover_style text;

create table if not exists collection_shows (
  collection_id uuid not null references collections(id) on delete cascade,
  tmdb_show_id integer not null,
  added_at timestamptz not null default now(),
  primary key (collection_id, tmdb_show_id)
);

-- Per-user custom cover/poster/logo picks (Show Detail's "..." menu ->
-- Change covers / Change poster / Change logo). Deliberately its own
-- table, not columns on user_shows: user_shows rows may only ever be
-- created by one of the app's explicit library actions (picking a
-- status, marking an episode watched — see lib/userShows.js), and
-- customizing a show's art is a different action that should work even
-- for a show the user hasn't added to any list yet. Each column is
-- nullable and independently upserted (see lib/showCustomizations.js) —
-- null means "use TMDB's default art for this category".
create table if not exists show_customizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_show_id integer not null,
  custom_backdrop_url text,
  custom_poster_url text,
  custom_logo_url text,
  updated_at timestamptz not null default now(),
  unique (user_id, tmdb_show_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security — every table is per-user private by default.
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table user_shows enable row level security;
alter table episode_watches enable row level security;
alter table season_reviews enable row level security;
alter table collections enable row level security;
alter table collection_shows enable row level security;
alter table show_customizations enable row level security;

-- Every policy below is preceded by a matching `drop policy if exists` —
-- unlike `create table if not exists`, Postgres has no `if not exists`
-- for policies, so re-running this file against a project that already
-- has some (or all) of these policies would otherwise fail on the first
-- one that already exists (`policy "..." already exists`) and abort
-- before reaching anything after it, including brand-new tables further
-- down. Drop-then-recreate with an identical definition is a no-op in
-- effect, so this is safe to run any number of times.
drop policy if exists "own row only" on profiles;
create policy "own row only" on profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows only" on user_shows;
create policy "own rows only" on user_shows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows only" on episode_watches;
create policy "own rows only" on episode_watches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows only" on season_reviews;
create policy "own rows only" on season_reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows only" on collections;
create policy "own rows only" on collections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows only via parent collection" on collection_shows;
create policy "own rows only via parent collection" on collection_shows
  for all using (
    exists (select 1 from collections c where c.id = collection_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from collections c where c.id = collection_id and c.user_id = auth.uid())
  );

drop policy if exists "own rows only" on show_customizations;
create policy "own rows only" on show_customizations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage — avatar / background image uploads (Edit Profile screen).
-- ---------------------------------------------------------------------------
-- Public bucket (profile photos aren't sensitive, and this keeps the
-- saved URL a plain public URL instead of needing signed-URL refresh
-- logic). Each object's path is "{user_id}/{avatar|background}-{ts}.ext" —
-- the policies below scope reads/writes to a user's own folder by
-- checking that the first path segment matches auth.uid().
insert into storage.buckets (id, name, public)
values ('profile-media', 'profile-media', true)
on conflict (id) do nothing;

drop policy if exists "profile media is publicly readable" on storage.objects;
create policy "profile media is publicly readable"
  on storage.objects for select
  using (bucket_id = 'profile-media');

drop policy if exists "users can upload their own profile media" on storage.objects;
create policy "users can upload their own profile media"
  on storage.objects for insert
  with check (bucket_id = 'profile-media' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "users can update their own profile media" on storage.objects;
create policy "users can update their own profile media"
  on storage.objects for update
  using (bucket_id = 'profile-media' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "users can delete their own profile media" on storage.objects;
create policy "users can delete their own profile media"
  on storage.objects for delete
  using (bucket_id = 'profile-media' and auth.uid()::text = (storage.foldername(name))[1]);
