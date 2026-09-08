// Database snapshots replace watch state, including records that disappeared.
// Keep TMDB metadata and unrelated episode fields intact.
export function applyWatchSnapshot(seasons, byEpisode) {
  return seasons.map((season) => ({
    ...season,
    episodes: season.episodes.map((episode) => {
      const watch = byEpisode[`${season.id}-${episode.n}`];
      const watchCount = watch?.watchCount ?? 0;
      return { ...episode, watched: watchCount > 0, watchCount, myRating: watch?.rating ?? null };
    }),
  }));
}
export function applySkipSnapshot(seasons, skippedKeys) {
  return seasons.map((season) => ({
    ...season,
    episodes: season.episodes.map((episode) => ({
      ...episode, skipped: skippedKeys.has(`${season.id}-${episode.n}`),
    })),
  }));
}
