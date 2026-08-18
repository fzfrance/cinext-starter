-- ============ Run this in the Supabase SQL Editor ============
-- Everything below is idempotent (safe to run more than once).

-- ---------------------------------------------------------------------------
-- New: per-episode "Skipped" state (Show Detail's episode status menu)
-- ---------------------------------------------------------------------------
-- A toggle flag, not an event log like episode_watches — skipping has no
-- rewatch-style count, an episode is just skipped or it isn't. Kept as its
-- own table (not a column on episode_watches) so watched and skipped stay
-- structurally separate: a skip is never a "watch event" and must never be
-- visible to Highlights/Activity/rewatch-count/any real watch statistic,
-- which is automatic as long as it lives outside episode_watches entirely.
-- A skipped regular (non-Specials) episode counts as *resolved* for
-- season/show completion without counting as *watched* for any stat.
create table if not exists episode_skips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_show_id integer not null,
  season_number integer not null,
  episode_number integer not null,
  skipped_at timestamptz not null default now(),
  unique (user_id, tmdb_show_id, season_number, episode_number)
);

alter table episode_skips enable row level security;

drop policy if exists "own rows only" on episode_skips;
create policy "own rows only" on episode_skips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
