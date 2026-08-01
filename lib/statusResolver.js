// ---------------------------------------------------------------------------
// Single source of truth for "what status is a show actually in"
// ---------------------------------------------------------------------------
// user_shows.status is a user-set label, not a live fact — it can silently
// drift out of sync with real watch history (mark every episode watched,
// then the status pill still says "Watchlist"). Every surface that
// displays a status (Home, Profile, Explore, Show Detail) must resolve
// through this function instead of reading the raw column directly, so
// they can never disagree with each other or with reality.
//
// Adapted from the reference pseudocode to this app's actual schema
// ("drop", not "dropped" — see supabase/schema.sql's check constraint) and
// with one deliberate change: when watchedReleasedEpisodes is 0 and
// explicitStatus is something other than "watchlist" (e.g. "watching",
// reached after unmarking every previously-watched episode), this
// preserves explicitStatus instead of returning null. The task's own
// rule — "change it to watchlist only if zero episodes are watched AND
// the user explicitly chooses Watchlist" — means unmarking down to zero
// must NOT silently evict the show from the library (null) or force it
// back to watchlist; it should just stay whatever the user last chose.
//
// explicitStatus === "completed" was added to this unconditional-override
// group (previously only paused/drop) after real per-episode watch data
// turned out to be unreliable for a batch of shows brought in from an
// external import: TV Time's own export didn't map 1:1 onto TMDB's
// episode list for many of them (off-by-one gaps, or large chunks of a
// season missing), so watchedReleasedEpisodes never actually reached
// releasedEpisodes even for shows the user had genuinely finished — they
// stayed stuck on "Watching" with no way to correct it, since picking
// Completed from the status menu used to be silently discarded by the
// episode-count check below. Same tradeoff paused/drop already accept:
// an explicit choice here sticks even if the underlying episode count
// later changes (e.g. a "completed" show renewed for a new season with
// unwatched episodes won't auto-flip back to "watching" by itself
// anymore — the user has to pick a status again, same as already true
// for un-pausing a paused show).
export function resolveShowStatus({ explicitStatus, watchedReleasedEpisodes = 0, releasedEpisodes = 0 }) {
  if (explicitStatus === "paused" || explicitStatus === "drop" || explicitStatus === "completed") {
    return explicitStatus;
  }
  if (releasedEpisodes > 0 && watchedReleasedEpisodes === releasedEpisodes) {
    return "completed";
  }
  if (watchedReleasedEpisodes > 0) {
    return "watching";
  }
  return explicitStatus ?? null;
}
