// ---------------------------------------------------------------------------
// Library status + favorite (Supabase `user_movies` table)
// ---------------------------------------------------------------------------
// Mirrors lib/userShows.js's shape and status vocabulary exactly (watchlist
// | watching | paused | drop | completed, same StatusMenu component/icons)
// so Movie Detail's status pill/menu and Library/Profile status filters
// work identically whether the underlying item is a movie or a show.
//
// Meaningfully SIMPLER than userShows.js, though: a movie has no episodes,
// so there's no watch-progress concept to auto-resolve a live status from
// (contrast lib/statusResolver.js's resolveShowStatus, which has no movie
// equivalent) and no implicit-row-creation path the way marking an episode
// watched creates a user_shows row before any explicit status pick — a
// user_movies row can only ever be created by an explicit user action
// (Status menu pick), so status_explicit is always true here. That column
// still exists on the table purely for return-shape parity with
// getUserShow, not because movies need the auto-vs-explicit distinction.

import { supabase } from "@/lib/supabase";
import { deleteMovieRating } from "@/lib/movieRatings";
import { bangkokDateKey } from "@/lib/bangkokDate";

// Returns { [tmdbMovieId]: { status, favorite, addedAt, updatedAt } } for
// the user's whole movie library — same shape as getUserShows.
export async function getUserMovies(userId) {
  const { data, error } = await supabase
    .from("user_movies")
    .select("tmdb_movie_id, status, favorite, created_at, updated_at")
    .eq("user_id", userId);
  if (error) throw error;

  const byMovie = {};
  for (const row of data) {
    byMovie[row.tmdb_movie_id] = {
      status: row.status,
      favorite: row.favorite,
      addedAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at ?? row.created_at).getTime(),
    };
  }
  return byMovie;
}

// Single-movie lookup, for Movie Detail.
export async function getUserMovie(userId, tmdbMovieId) {
  const { data, error } = await supabase
    .from("user_movies")
    .select("status, favorite, status_explicit, created_at, updated_at")
    .eq("user_id", userId)
    .eq("tmdb_movie_id", tmdbMovieId)
    .maybeSingle();
  if (error) throw error;
  return data
    ? {
        status: data.status,
        favorite: data.favorite,
        statusExplicit: data.status_explicit,
        addedAt: new Date(data.created_at).getTime(),
        updatedAt: new Date(data.updated_at ?? data.created_at).getTime(),
      }
    : null;
}

// Upsert — every real call site is a genuine user pick (Status menu), so
// unlike setShowStatus there's no `explicit` option to thread through:
// status_explicit just keeps its column default (true) on insert and is
// never touched on update.
//
// watched_on is Highlights' only watch-date signal for a movie — there's
// no episode_watches-style event log for movies (see the plan this was
// built against), so it's stamped here, the moment status transitions TO
// 'completed', and only once ever: a movie has no rewatch tracking (one
// row per movie, period), so a later completed -> paused -> completed
// cycle must never overwrite the original date.
export async function setMovieStatus(userId, tmdbMovieId, status, source = "unknown") {
  const payload = { user_id: userId, tmdb_movie_id: tmdbMovieId, status, updated_at: new Date().toISOString() };

  if (status === "completed") {
    const { data: existing, error: selectError } = await supabase
      .from("user_movies")
      .select("status, watched_on")
      .eq("user_id", userId)
      .eq("tmdb_movie_id", tmdbMovieId)
      .maybeSingle();
    if (selectError) throw selectError;
    if ((existing?.status ?? null) !== "completed" && existing?.watched_on == null) {
      const today = bangkokDateKey(new Date());
      const [y, m] = today.split("-").map(Number);
      // Real day-precision "just now" — same fields a manually-picked
      // exact date via MovieWatchDateSheet would produce, so this
      // auto-stamped date is indistinguishable from (and just as editable
      // as) one the user picked by hand.
      payload.watched_on = today;
      payload.watch_date_precision = "day";
      payload.watched_year = y;
      payload.watched_month = m;
      payload.watch_date_source = "manual";
    }
  }

  const { error } = await supabase.from("user_movies").upsert(payload, { onConflict: "user_id,tmdb_movie_id" });
  if (error) throw error;
}

// Highlights' "Change Watched Date" for a movie — full precision parity
// with lib/episodeWatches.js's setWatchDate now that user_movies carries
// the same watch_date_precision/watched_year/watched_month/
// watch_date_source columns episode_watches has (see
// supabase/pending_migration.sql). `id` is not needed here the way
// setWatchDate needs one (episode_watches is an event log, potentially
// several rows per episode; user_movies is one row per movie, so
// (userId, tmdbMovieId) alone always identifies the right row).
export async function setMovieWatchDate(userId, tmdbMovieId, { precision, watchedOn = null, watchedYear = null, watchedMonth = null, source = null }) {
  const { error } = await supabase
    .from("user_movies")
    .update({
      watch_date_precision: precision,
      watched_on: watchedOn,
      watched_year: watchedYear,
      watched_month: watchedMonth,
      watch_date_source: source,
    })
    .eq("user_id", userId)
    .eq("tmdb_movie_id", tmdbMovieId);
  if (error) throw error;
}

// Every movie watched in a given year — Highlights' movie data source.
// Filters by the watched_year column itself now (not a watched_on date
// range), same year-scoping getWatchedEpisodesForYear uses
// (lib/episodeWatches.js) — necessary now that a movie's watch date can
// be month/year precision (watched_on null) instead of always a real
// exact date. 'unknown'-precision movies (watched_year also null, same as
// episode_watches' own "Don't remember" rows) never match any year here
// by construction — same as TV's own behavior. No pagination needed:
// unlike episode_watches (one row per watch EVENT), user_movies is one row
// per movie the user has ever added — realistically never near
// PostgREST's page cap the way a heavy watch-event year can be.
export async function getUserMoviesWatchedInYear(userId, year) {
  const { data, error } = await supabase
    .from("user_movies")
    .select("tmdb_movie_id, watched_on, watch_date_precision, watched_year, watched_month, watch_date_source")
    .eq("user_id", userId)
    .eq("watched_year", year);
  if (error) throw error;
  return data.map((r) => ({
    movieId: r.tmdb_movie_id,
    watchedOn: r.watched_on,
    watchDatePrecision: r.watch_date_precision,
    watchedYear: r.watched_year,
    watchedMonth: r.watched_month,
    watchDateSource: r.watch_date_source,
  }));
}

// Every watched movie across ALL years, not just one — Profile's Time
// Machine section source (it needs to know every year that has movie
// activity up front, not one year at a time like Highlights does).
// Filters on watched_year (populated for day AND month precision, same as
// episode_watches) rather than watched_on, so month/year-precision movies
// aren't silently dropped. Same "no pagination needed" reasoning as
// getUserMoviesWatchedInYear — one row per movie ever added, not per
// watch event.
export async function getAllUserMoviesWatched(userId) {
  const { data, error } = await supabase
    .from("user_movies")
    .select("tmdb_movie_id, watched_on, watch_date_precision, watched_year, watched_month, watch_date_source")
    .eq("user_id", userId)
    .not("watched_year", "is", null);
  if (error) throw error;
  return data.map((r) => ({
    movieId: r.tmdb_movie_id,
    watchedOn: r.watched_on,
    watchDatePrecision: r.watch_date_precision,
    watchedYear: r.watched_year,
    watchedMonth: r.watched_month,
    watchDateSource: r.watch_date_source,
  }));
}

// Deliberately UPDATE-only, same rule as setShowFavorite: a library row
// may only ever be created by an explicit status pick, never as a side
// effect of favoriting. No-ops (returns false) if the movie isn't already
// in the library.
export async function setMovieFavorite(userId, tmdbMovieId, favorite, source = "unknown") {
  const { data: existing, error: selectError } = await supabase
    .from("user_movies")
    .select("id")
    .eq("user_id", userId)
    .eq("tmdb_movie_id", tmdbMovieId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (!existing) return false;

  const { error } = await supabase.from("user_movies").update({ favorite, updated_at: new Date().toISOString() }).eq("id", existing.id);
  if (error) throw error;
  return true;
}

// "Remove" cascades through movie_ratings first (same ordering reasoning
// as removeUserShow: if the rating delete fails, the user_movies row is
// still present and visibly unremoved, rather than silently gone while an
// orphaned rating lingers underneath it) then the user_movies row itself.
// No episode_watches/season_reviews equivalent to cascade — movies have
// neither.
export async function removeUserMovie(userId, tmdbMovieId, source = "unknown") {
  await deleteMovieRating(userId, tmdbMovieId);

  const { error } = await supabase.from("user_movies").delete().eq("user_id", userId).eq("tmdb_movie_id", tmdbMovieId);
  if (error) throw error;
}
