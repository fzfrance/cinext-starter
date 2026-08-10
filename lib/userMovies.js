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
      payload.watched_on = bangkokDateKey(new Date());
    }
  }

  const { error } = await supabase.from("user_movies").upsert(payload, { onConflict: "user_id,tmdb_movie_id" });
  if (error) throw error;
}

// Highlights' "Change Watched Date" for a movie — unlike
// lib/episodeWatches.js's setWatchDate, there's no precision/source
// column to thread through (user_movies.watched_on is just a plain date,
// always day-precision or absent), so this is a direct single-field
// write. null clears it back to "no watch date" (Highlights' "Don't
// remember" option) — same as marking it never happened, not today.
export async function setMovieWatchDate(userId, tmdbMovieId, watchedOn) {
  const { error } = await supabase
    .from("user_movies")
    .update({ watched_on: watchedOn })
    .eq("user_id", userId)
    .eq("tmdb_movie_id", tmdbMovieId);
  if (error) throw error;
}

// Every movie watched in a given year, by watched_on — Highlights' movie
// data source. Mirrors getWatchedEpisodesForYear's year-scoping
// (lib/episodeWatches.js), one media type over. No pagination needed:
// unlike episode_watches (one row per watch EVENT), user_movies is one row
// per movie the user has ever added — realistically never near
// PostgREST's page cap the way a heavy watch-event year can be.
export async function getUserMoviesWatchedInYear(userId, year) {
  const { data, error } = await supabase
    .from("user_movies")
    .select("tmdb_movie_id, watched_on")
    .eq("user_id", userId)
    .gte("watched_on", `${year}-01-01`)
    .lte("watched_on", `${year}-12-31`);
  if (error) throw error;
  return data.map((r) => ({ movieId: r.tmdb_movie_id, watchedOn: r.watched_on }));
}

// Every watched movie across ALL years, not just one — Profile's Time
// Machine section source (it needs to know every year that has movie
// activity up front, not one year at a time like Highlights does). Same
// "no pagination needed" reasoning as getUserMoviesWatchedInYear — one
// row per movie ever added, not per watch event.
export async function getAllUserMoviesWatched(userId) {
  const { data, error } = await supabase
    .from("user_movies")
    .select("tmdb_movie_id, watched_on")
    .eq("user_id", userId)
    .not("watched_on", "is", null);
  if (error) throw error;
  return data.map((r) => ({ movieId: r.tmdb_movie_id, watchedOn: r.watched_on }));
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
