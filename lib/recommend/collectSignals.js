"use client";

import { getUserShows } from "@/lib/userShows";
import { getUserMovies } from "@/lib/userMovies";
import { getEpisodeWatches, getShowWatchSummary } from "@/lib/episodeWatches";
import { getAllSeasonRatingsForUser } from "@/lib/seasonRatings";
import { getAllMovieRatingsForUser } from "@/lib/movieRatings";

/**
 * Build recommendation signal titles for the signed-in user.
 * Ratings: season/movie are 0–10; episode averages mapped to 0–10 when no season rating.
 */
export async function collectRecommendSignals(userId) {
  const [byShow, byMovie, seasonRatings, movieRatings] = await Promise.all([
    getUserShows(userId).catch(() => ({})),
    getUserMovies(userId).catch(() => ({})),
    getAllSeasonRatingsForUser(userId).catch(() => []),
    getAllMovieRatingsForUser(userId).catch(() => []),
  ]);

  const showIds = Object.keys(byShow ?? {}).map(Number);
  const summary = showIds.length
    ? await getShowWatchSummary(userId, showIds).catch(() => ({}))
    : {};

  const seasonBest = new Map();
  for (const row of seasonRatings) {
    const id = row.showId;
    if (id == null || typeof row.rating !== "number") continue;
    const prev = seasonBest.get(id);
    if (prev == null || row.rating > prev) seasonBest.set(id, row.rating);
  }
  const movieRatingMap = new Map(movieRatings.map((r) => [r.movieId, r.rating]));

  const sampleIds = showIds.slice(0, 40);
  const watchMaps = await Promise.all(
    sampleIds.map(async (id) => {
      try {
        const map = await getEpisodeWatches(userId, id);
        return [id, map];
      } catch {
        return [id, {}];
      }
    })
  );

  const rewatchByShow = new Map();
  const epRatingByShow = new Map();
  for (const [id, map] of watchMaps) {
    let rewatches = 0;
    const ratings = [];
    for (const entry of Object.values(map ?? {})) {
      if ((entry.watchCount ?? 0) > 1) rewatches += entry.watchCount - 1;
      if (typeof entry.rating === "number") ratings.push(entry.rating * 2);
    }
    if (rewatches > 0) rewatchByShow.set(id, rewatches);
    if (ratings.length) epRatingByShow.set(id, ratings.reduce((a, b) => a + b, 0) / ratings.length);
  }

  const titles = [];

  for (const [idStr, row] of Object.entries(byShow ?? {})) {
    const id = Number(idStr);
    const watchedKeys = summary[id]?.watchedKeys?.length ?? 0;
    let progress = 0;
    if (row.status === "completed") progress = 1;
    else if (row.status === "watching" && watchedKeys > 0) progress = 0.75;
    else if (watchedKeys > 0) progress = Math.min(0.65, watchedKeys * 0.05);

    titles.push({
      id,
      mediaType: "tv",
      status: row.status,
      favorite: Boolean(row.favorite),
      rating10: seasonBest.get(id) ?? epRatingByShow.get(id) ?? null,
      rewatchCount: rewatchByShow.get(id) ?? 0,
      progress,
      lastActivityAt: row.updatedAt ?? null,
      notInterested: false,
    });
  }

  for (const [idStr, row] of Object.entries(byMovie ?? {})) {
    const id = Number(idStr);
    titles.push({
      id,
      mediaType: "movie",
      status: row.status,
      favorite: Boolean(row.favorite),
      rating10: movieRatingMap.get(id) ?? null,
      rewatchCount: 0,
      progress: row.status === "completed" ? 1 : 0,
      lastActivityAt: row.updatedAt ?? null,
      notInterested: false,
    });
  }

  return titles;
}
