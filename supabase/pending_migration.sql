-- ============ Run this in the Supabase SQL Editor ============
-- Everything below is idempotent (safe to run more than once).

-- ---------------------------------------------------------------------------
-- Follow-up fix: drop review_date's DB-level default
-- ---------------------------------------------------------------------------
-- `default current_date` turned out to be a real bug, not the safe choice
-- the original comment here claimed: current_date is STABLE, not
-- IMMUTABLE, so Postgres can't apply it as a cheap metadata-only default
-- the way a true constant gets — it instead performs a real table
-- rewrite, evaluating current_date ONCE (at ALTER TABLE time) and
-- stamping that SAME single date onto every pre-existing row. That's
-- exactly episode_watches.watched_on's own schema comment's warning
-- (elsewhere in this file) about volatile/stable defaults — this column
-- just didn't follow its own precedent. Every row's review_date got mass-
-- backfilled to the day this migration happened to run, not each rating's
-- own real history (already corrected in the live data via a one-off
-- script, using each row's own created_at date converted to its Bangkok
-- calendar day). The app itself never actually needed this default in the
-- first place — SeasonRatingScreen/MovieRatingScreen's save() always
-- sends an explicit reviewDate now (today for a first save, whatever's
-- showing for an edit), so dropping the default here is safe and removes
-- the only thing that could ever cause this exact bug again.
alter table season_ratings alter column review_date drop default;
alter table movie_ratings alter column review_date drop default;
