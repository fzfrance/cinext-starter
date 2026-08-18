// ---------------------------------------------------------------------------
// Episode skip state (Supabase `episode_skips` table)
// ---------------------------------------------------------------------------
// A toggle flag per episode, not an event log like episode_watches — one
// row means "this episode is currently marked Skipped," no rewatch-style
// count concept applies. A skipped episode counts as *resolved* for
// season/show completion (see lib/statusResolver.js's resolvedReleasedEpisodes
// param) without ever counting as *watched* for any real watch statistic —
// every one of those already reads episode_watches directly, which this
// table never touches, so that separation holds automatically.
//
// RLS on episode_skips requires auth.uid() = user_id, same as
// episode_watches — callers pass the signed-in user's id explicitly.

import { supabase } from "@/lib/supabase";

// Returns Set of "seasonNumber-episodeNumber" keys currently skipped.
export async function getEpisodeSkips(userId, tmdbShowId) {
  const { data, error } = await supabase
    .from("episode_skips")
    .select("season_number, episode_number")
    .eq("user_id", userId)
    .eq("tmdb_show_id", tmdbShowId);
  if (error) throw error;
  return new Set(data.map((row) => `${row.season_number}-${row.episode_number}`));
}

// One episode's skip flag — set true to mark Skipped (upsert), false to
// clear it (delete). Never touches episode_watches; callers that need
// "mark as watched instead of skipped" clear this AND write a watch
// separately (see ShowDetailClient's markSkipped/markWatchedOnce).
export async function setEpisodeSkipped(userId, tmdbShowId, seasonNumber, episodeNumber, skipped) {
  if (skipped) {
    const { error } = await supabase.from("episode_skips").upsert(
      { user_id: userId, tmdb_show_id: tmdbShowId, season_number: seasonNumber, episode_number: episodeNumber },
      { onConflict: "user_id,tmdb_show_id,season_number,episode_number" }
    );
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("episode_skips")
      .delete()
      .eq("user_id", userId)
      .eq("tmdb_show_id", tmdbShowId)
      .eq("season_number", seasonNumber)
      .eq("episode_number", episodeNumber);
    if (error) throw error;
  }
}

// Per-show skip summary for several shows at once — parallel to
// lib/episodeWatches.js's getShowWatchSummary, for surfaces (Home,
// Profile, Library) that resolve show status/progress in bulk. Paginated
// for the same reason that file's own functions are (PostgREST's default
// 1000-row cap) even though skips are expected to be far rarer than
// watches in practice — cheap to guard against regardless.
// Returns { [tmdbShowId]: { skippedKeys: string[] } }
export async function getShowSkipSummary(userId, tmdbShowIds) {
  if (tmdbShowIds.length === 0) return {};
  const PAGE_SIZE = 1000;
  const data = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error } = await supabase
      .from("episode_skips")
      .select("tmdb_show_id, season_number, episode_number")
      .eq("user_id", userId)
      .in("tmdb_show_id", tmdbShowIds)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    data.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const byShow = {};
  for (const row of data) {
    const set = (byShow[row.tmdb_show_id] ??= new Set());
    set.add(`${row.season_number}-${row.episode_number}`);
  }
  const result = {};
  for (const [showId, set] of Object.entries(byShow)) result[showId] = { skippedKeys: [...set] };
  return result;
}

// Every skip row for this show, gone — mirrors
// deleteAllEpisodeWatchesForShow (lib/episodeWatches.js), used by the
// same callers for the same reasons (Remove, moving back to Watchlist).
export async function deleteAllEpisodeSkipsForShow(userId, tmdbShowId) {
  const { error } = await supabase.from("episode_skips").delete().eq("user_id", userId).eq("tmdb_show_id", tmdbShowId);
  if (error) throw error;
}
