// ---------------------------------------------------------------------------
// Episode watch state (Supabase `episode_watches` table)
// ---------------------------------------------------------------------------
// Each row is one watch *event*, not a toggle flag — watched_at defaults to
// now() so a rewatch is just another row for the same episode. From that:
//   watched    = at least one row exists for (user, show, season, episode)
//   watchCount = row count for that key
//   rating     = carried on the row it was rated against (most recent wins)
//
// RLS on episode_watches requires auth.uid() = user_id, so callers pass the
// signed-in user's id explicitly rather than these helpers re-deriving it —
// Postgres still rejects any mismatched id, this just avoids an extra
// supabase.auth.getUser() round trip per call.

import { supabase } from "@/lib/supabase";
import { bangkokNow } from "@/lib/bangkokDate";
import { roundUpToHalf } from "@/lib/seasonRatings";

// Returns { "seasonNumber-episodeNumber": { watchCount, rating } }
export async function getEpisodeWatches(userId, tmdbShowId) {
  const { data, error } = await supabase
    .from("episode_watches")
    .select("season_number, episode_number, rating, watched_at")
    .eq("user_id", userId)
    .eq("tmdb_show_id", tmdbShowId)
    .order("watched_at", { ascending: true });
  if (error) throw error;

  const byEpisode = {};
  for (const row of data) {
    const key = `${row.season_number}-${row.episode_number}`;
    const entry = byEpisode[key] ?? { watchCount: 0, rating: null };
    entry.watchCount += 1;
    if (row.rating != null) entry.rating = row.rating;
    byEpisode[key] = entry;
  }
  return byEpisode;
}

// Every episode_watches row for this user, across their WHOLE library, in
// ascending watched_at order — the raw material for Activity's feed
// (lib/activity.js), which needs each individual watch *event* (not just
// "watched" as a flag) to tell a first watch apart from a rewatch: since
// this table allows multiple rows per (show, season, episode) — see this
// file's own header comment — the first row chronologically for a given
// key is the "Watched Episode" event, and every row after it for that same
// key is a "Rewatched" event. No row limit — Activity slices down to
// however many it actually renders itself, but rewatch-detection needs the
// FULL history, not just a recent window, or a genuinely-later rewatch
// could get misread as a first watch just because its real first watch
// fell outside an arbitrary cutoff.
export async function getRecentEpisodeWatches(userId) {
  const { data, error } = await supabase
    .from("episode_watches")
    .select("tmdb_show_id, season_number, episode_number, rating, watched_at")
    .eq("user_id", userId)
    .order("watched_at", { ascending: true });
  if (error) throw error;
  return data.map((row) => ({
    showId: row.tmdb_show_id,
    seasonNumber: row.season_number,
    episodeNumber: row.episode_number,
    rating: row.rating,
    watchedAt: new Date(row.watched_at),
  }));
}

// Every (show, season) the user has at least one star-rated episode in,
// across their WHOLE library — the "auto-eligible" half of Profile's My
// Ratings row (lib/seasonRatings.js's getAutoSeasonScore does the actual
// 0-5 -> 0-10 averaging over episode_watches.rating; this just groups the
// raw rows by show+season and tracks each group's most recent activity for
// sort order, same "most recent watched_at wins" rule used elsewhere).
export async function getRatedEpisodesAcrossShows(userId) {
  const { data, error } = await supabase
    .from("episode_watches")
    .select("tmdb_show_id, season_number, episode_number, rating, watched_at")
    .eq("user_id", userId)
    .not("rating", "is", null);
  if (error) throw error;

  const bySeason = {};
  for (const row of data) {
    const key = `${row.tmdb_show_id}-${row.season_number}`;
    const entry = bySeason[key] ?? { showId: row.tmdb_show_id, seasonNumber: row.season_number, ratings: [], lastRatedAt: null };
    entry.ratings.push(row.rating);
    if (!entry.lastRatedAt || row.watched_at > entry.lastRatedAt) entry.lastRatedAt = row.watched_at;
    bySeason[key] = entry;
  }
  return Object.values(bySeason).map((s) => ({
    showId: s.showId,
    seasonNumber: s.seasonNumber,
    avg10: roundUpToHalf((s.ratings.reduce((a, r) => a + r, 0) / s.ratings.length) * 2),
    ratedCount: s.ratings.length,
    lastRatedAt: new Date(s.lastRatedAt),
  }));
}

// Small newest-first lookup for choosing Home's first hero candidate without
// waiting for the user's complete, paginated episode history. The full
// summary below still determines final progress/status; this only selects
// which single show should be resolved first for perceived load speed.
export async function getRecentWatchedShowIds(userId, limit = 200) {
  const { data, error } = await supabase
    .from("episode_watches")
    .select("tmdb_show_id")
    .eq("user_id", userId)
    .order("watched_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return [...new Set(data.map((row) => row.tmdb_show_id))];
}

// Per-show viewing activity for several shows at once — this, not
// user_shows.updated_at (which also bumps on status/favorite changes that
// have nothing to do with watching), is the source of truth for "most
// recently watched" ordering. lastWatchedAt is computed live from
// watched_at rather than stored on a separate column, so there's no second
// place for it to drift out of sync with the actual watch events.
// Returns { [tmdbShowId]: { watchedKeys: string[] ("season-episode"), lastWatchedAt: number|null } }
//
// Paginated explicitly (PostgREST's own per-request row cap — 1000 by
// default — not something this client can just ask past in one call).
// This is the exact bug that made Home's Continue Watching/In Progress
// show wrong progress for real shows with real watch history: tmdbShowIds
// here is every non-paused/dropped show in the whole library (Home's
// caller passes them all in one call), so for an account with a few
// hundred watched episodes across many shows, this easily exceeds 1000
// rows combined — and with no .order() or pagination, PostgREST silently
// truncates rather than erroring, dropping whichever shows' rows happen
// to fall past the cutoff entirely (which shows those are can shift over
// time as more rows get added, which is what made this look
// intermittent). A show that gets truncated out here reads as "zero
// watched episodes" to every caller — stuck pointing at episode 1, 0%
// progress — even though its watch history is completely intact in the
// database; getEpisodeWatches/getWatchedEpisodesForYear were already
// correct for single-show and single-year queries respectively (neither
// realistically nears 1000 rows on their own), only this multi-show,
// whole-library query was missing it.
export async function getShowWatchSummary(userId, tmdbShowIds) {
  if (tmdbShowIds.length === 0) return {};
  const PAGE_SIZE = 1000;
  const data = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error } = await supabase
      .from("episode_watches")
      .select("tmdb_show_id, season_number, episode_number, watched_at")
      .eq("user_id", userId)
      .in("tmdb_show_id", tmdbShowIds)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    data.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const byShow = {};
  for (const row of data) {
    const bucket = byShow[row.tmdb_show_id] ?? (byShow[row.tmdb_show_id] = { watchedKeySet: new Set(), lastWatchedAt: null });
    bucket.watchedKeySet.add(`${row.season_number}-${row.episode_number}`);
    const ts = new Date(row.watched_at).getTime();
    if (bucket.lastWatchedAt == null || ts > bucket.lastWatchedAt) bucket.lastWatchedAt = ts;
  }

  const result = {};
  for (const [showId, bucket] of Object.entries(byShow)) {
    result[showId] = { watchedKeys: [...bucket.watchedKeySet], lastWatchedAt: bucket.lastWatchedAt };
  }
  return result;
}

// Every tmdb_show_id the user has watched at least one episode of, ever —
// not scoped to a single show like the functions above. Used to
// cross-reference a cast member's TV filmography (/person/[id]'s "watched"
// badge) against real watch history rather than library status alone (a
// show can sit in the library with a status but have zero watched
// episodes). Movies have no equivalent table in this app — there's
// nowhere for a movie "watched" flag to come from, so the caller should
// only check this set for media_type "tv" entries.
export async function getWatchedShowIds(userId) {
  // Paginated for the same reason getShowWatchSummary above now is — this
  // selects every episode_watches row the user has, ever, with no filter
  // at all, so it's the query most likely of all of them to exceed
  // PostgREST's default 1000-row cap on an active account.
  const PAGE_SIZE = 1000;
  const data = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error } = await supabase
      .from("episode_watches")
      .select("tmdb_show_id")
      .eq("user_id", userId)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    data.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return new Set(data.map((row) => row.tmdb_show_id));
}

// Every watch-event row for a given Highlights year — filtered by
// watched_year rather than a watched_at range now that precision is
// explicit (see episode_watches' schema comment): watched_year is
// populated for day/month/year precision alike (derived consistently at
// write time, see addEpisodeWatches/setWatchDate below), so one plain
// equality filter covers all three, and naturally excludes `unknown`
// precision rows too — their watched_year is null, which `.eq()` never
// matches. A day-precision row's real calendar date still lives in
// watched_on for whichever caller needs to bucket by day/month; this
// just scopes "everything that belongs to this year at all."
export async function getWatchedEpisodesForYear(userId, year) {
  // Paginated explicitly (PostgREST's own per-request row cap, not
  // something this client can just ask past in one call) rather than a
  // single unbounded select — a heavy year of watch activity (bulk-marking
  // several full shows at once, easily hundreds of rows) could otherwise
  // exceed that cap and get silently truncated, no error thrown. Ordered
  // by watched_on so pagination is deterministic and, just as importantly,
  // so a truncation under a *lower* cap than expected drops the oldest
  // rows rather than cutting off whatever was watched most recently
  // (month/year-precision rows, with no watched_on, sort first — nulls
  // first is fine here, they're excluded from day-level ordering concerns
  // anyway since they never appear on a specific calendar day).
  const PAGE_SIZE = 1000;
  const rowsById = new Map();
  // New rows use watched_year. The second query keeps legacy rows visible:
  // before the date columns were introduced, watched_at was the only stored
  // watch date and those rows were not always eligible for the one-time
  // schema backfill (watch_date_precision could be null).
  const ranges = [
    (query) => query.eq("watched_year", year),
    (query) => query.is("watched_year", null)
      .gte("watched_at", `${year}-01-01T00:00:00+07:00`)
      .lt("watched_at", `${year + 1}-01-01T00:00:00+07:00`),
  ];
  for (const applyRange of ranges) {
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = supabase
        .from("episode_watches")
        .select("id, tmdb_show_id, season_number, episode_number, watched_at, watch_date_precision, watched_on, watched_year, watched_month, watch_date_source, rating")
        .eq("user_id", userId)
        .eq("hidden_from_highlights", false);
      query = applyRange(query).order("watched_on", { ascending: true, nullsFirst: true }).range(from, from + PAGE_SIZE - 1);
      const { data, error } = await query;
      if (error) throw error;
      for (const row of data) rowsById.set(row.id, row);
      if (data.length < PAGE_SIZE) break;
    }
  }
  return [...rowsById.values()].sort((a, b) => (a.watched_on ?? a.watched_at ?? "").localeCompare(b.watched_on ?? b.watched_at ?? ""));
}

// Every distinct watched_year present anywhere in this user's history —
// backs Highlights' year picker, which used to just be a hardcoded
// rolling "current year back 3" window (Array.from({length:4}, (_,i) =>
// bangkokNow.year - i)). That silently made any year outside that fixed
// window unreachable from the picker even when it genuinely had data —
// an episode re-dated to, say, 2017 or 2020 via the Watch Date sheet had
// no way to be viewed again, since the dropdown never offered that year
// as an option in the first place. hidden_from_highlights rows are
// excluded, same as getWatchedEpisodesForYear, so a year that only has
// removed-from-history entries doesn't show up as a false option either.
export async function getWatchedYears(userId) {
  // Paginated for the same reason getShowWatchSummary/getWatchedShowIds
  // above now are — a truncated page here just risks a stale/incomplete
  // year list (less severe than those two), but the same unbounded
  // "every row this user has" shape, so the same fix applies.
  const PAGE_SIZE = 1000;
  const data = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error } = await supabase
      .from("episode_watches")
      .select("watched_year")
      .eq("user_id", userId)
      .eq("hidden_from_highlights", false)
      .not("watched_year", "is", null)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    data.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return [...new Set(data.map((r) => r.watched_year))].sort((a, b) => b - a);
}

// "Remove from History" (Highlights' Watch History calendar) — hides one
// watch event from Highlights specifically, by its own row id, without
// touching whether the episode counts as watched anywhere else (Show
// Detail's watch count/status, the person filmography "watched" badge,
// etc. all read this same table with no hidden_from_highlights filter, so
// they're unaffected). Not a delete: a real delete would strip watched
// state from the whole app just because the user didn't want this one
// entry cluttering their calendar. Targets one specific row (not every
// watch of this episode) for the same reason deleteEpisodeWatchById used
// to — a rewatch can produce several rows for the same episode on
// different days, and hiding "this one day's entry" must never touch the
// others.
export async function hideFromHighlights(userId, id) {
  const { error } = await supabase
    .from("episode_watches")
    .update({ hidden_from_highlights: true })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw error;
}

// Every watch-event row for this show, gone — not a per-episode unmark.
// Used by lib/userShows.js's setWatchlistAndClearProgress (moving a show
// back to Watchlist, defined as zero watched episodes) and by
// removeUserShow (Remove is a full reset of the show, not just its
// library row — see that function's comment for why).
export async function deleteAllEpisodeWatchesForShow(userId, tmdbShowId) {
  const { error } = await supabase
    .from("episode_watches")
    .delete()
    .eq("user_id", userId)
    .eq("tmdb_show_id", tmdbShowId);
  if (error) throw error;
}

// episodes: [{ seasonNumber, episodeNumber }] — inserts one watch event per
// entry. watch_date_precision defaults to 'day' at the column level (an
// ordinary mark-watched action is always real day precision — there's no
// case here where the user picked something coarser), but watched_on/
// watched_year/watched_month have no column default (see schema.sql's own
// comment on why a volatile default there would have been a real bug), so
// this sets them explicitly to "Bangkok right now" — the same value
// watched_at's own default effectively represents, just also written to
// the columns Highlights actually reads for day-level bucketing.
export async function addEpisodeWatches(userId, tmdbShowId, episodes) {
  if (episodes.length === 0) return;
  const now = bangkokNow();
  const watchedOn = `${now.year}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}`;
  const { error } = await supabase.from("episode_watches").insert(
    episodes.map(({ seasonNumber, episodeNumber }) => ({
      user_id: userId,
      tmdb_show_id: tmdbShowId,
      season_number: seasonNumber,
      episode_number: episodeNumber,
      watched_on: watchedOn,
      watched_year: now.year,
      watched_month: now.month,
    }))
  );
  if (error) throw error;
}

export async function clearEpisodeWatches(userId, tmdbShowId, seasonNumber, episodeNumber) {
  const { error } = await supabase
    .from("episode_watches")
    .delete()
    .eq("user_id", userId)
    .eq("tmdb_show_id", tmdbShowId)
    .eq("season_number", seasonNumber)
    .eq("episode_number", episodeNumber);
  if (error) throw error;
}

// Reconciles one episode's stored watch-event rows to exactly `count`.
export async function syncEpisodeWatchCount(userId, tmdbShowId, seasonNumber, episodeNumber, count) {
  await clearEpisodeWatches(userId, tmdbShowId, seasonNumber, episodeNumber);
  if (count > 0) {
    await addEpisodeWatches(userId, tmdbShowId, Array.from({ length: count }, () => ({ seasonNumber, episodeNumber })));
  }
}

// The full current Watch Date state for the most recently watched row of
// one episode — what EpisodeRatingFlow's Watch Date sheet bootstraps
// itself from when opened right after marking an episode watched, when
// there's no specific row id passed in yet. Same "most recent wins"
// targeting rateLatestWatch below already uses for star ratings in that
// exact flow, so both stay consistent about which row "this rating
// session" actually refers to.
export async function getLatestWatchDate(userId, tmdbShowId, seasonNumber, episodeNumber) {
  const { data, error } = await supabase
    .from("episode_watches")
    .select("id, watch_date_precision, watched_on, watched_year, watched_month, watch_date_source")
    .eq("user_id", userId)
    .eq("tmdb_show_id", tmdbShowId)
    .eq("season_number", seasonNumber)
    .eq("episode_number", episodeNumber)
    .order("watched_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  // Normalized to camelCase here, not left as Supabase's raw snake_case
  // row — every consumer of this value (formatWatchDateLabel,
  // selectedWatchDateOptionId, WatchDateSheet's `current` prop) reads
  // watch.watchDatePrecision/watchedOn/etc., same as the camelCase shape
  // /api/shows/watch-entries already returns for the same fields. Passing
  // the raw row through unconverted used to mean every fresh mark-watched
  // row read as `watchDatePrecision: undefined`, which formatWatchDateLabel
  // treats identically to true "unknown" precision — the Watch Date badge
  // showed "Date not remembered" immediately after marking an episode
  // watched, even though the row itself was already correctly stored as
  // real day precision with today's date.
  return {
    id: row.id,
    watchDatePrecision: row.watch_date_precision,
    watchedOn: row.watched_on,
    watchedYear: row.watched_year,
    watchedMonth: row.watched_month,
    watchDateSource: row.watch_date_source,
  };
}

// Attaches a rating to the most recently watched row for one episode.
export async function rateLatestWatch(userId, tmdbShowId, seasonNumber, episodeNumber, rating) {
  const { data, error } = await supabase
    .from("episode_watches")
    .select("id")
    .eq("user_id", userId)
    .eq("tmdb_show_id", tmdbShowId)
    .eq("season_number", seasonNumber)
    .eq("episode_number", episodeNumber)
    .order("watched_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data?.[0]) return;

  const { error: updateError } = await supabase.from("episode_watches").update({ rating }).eq("id", data[0].id);
  if (updateError) throw updateError;
}

// Attaches a rating to one specific watch event, by its own row id — not
// "the most recent watch" like rateLatestWatch above. Highlights' Watch
// History calendar lets you rate a specific past day's watch, which isn't
// necessarily the latest one if that episode's been rewatched since.
export async function rateWatchById(userId, id, rating) {
  const { error } = await supabase.from("episode_watches").update({ rating }).eq("user_id", userId).eq("id", id);
  if (error) throw error;
}

// The episode rating flow's Watch Date sheet — updates one specific watch
// event's date precision (never inserts a new row, and can be reopened
// later to change the pick without ever duplicating the underlying watch
// record). Always writes all four fields together, explicitly nulling out
// whichever don't apply to the chosen precision — a caller switching from
// "Year only" to "Exact date", say, must never leave a stale watched_year/
// watched_month from the previous pick sitting alongside the new one.
// This function does no date math of its own on purpose: WatchDateSheet
// (the UI) already has to work out exactly which fields apply to which
// precision to render itself correctly, so it passes them straight
// through rather than this layer re-deriving/second-guessing them.
//
// params:
//   precision: "day" | "month" | "year" | "unknown"
//   watchedOn: "YYYY-MM-DD" | null — set only for precision "day"
//   watchedYear: number | null — set for "day" | "month" | "year"
//   watchedMonth: number | null — set for "day" | "month" only
//   source: "manual" | "release_date" | "release_month" | null
export async function setWatchDate(userId, id, { precision, watchedOn = null, watchedYear = null, watchedMonth = null, source = null }) {
  const { error } = await supabase
    .from("episode_watches")
    .update({
      watch_date_precision: precision,
      watched_on: watchedOn,
      watched_year: watchedYear,
      watched_month: watchedMonth,
      watch_date_source: source,
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw error;
}
