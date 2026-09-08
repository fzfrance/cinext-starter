import {
  SIGNAL_WEIGHTS,
  RECENCY_HALF_LIFE_MS,
  HIGH_RATING_10,
  POOR_RATING_10,
} from "./constants";

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function recencyMultiplier(lastActivityAt, now = Date.now()) {
  if (!lastActivityAt) return 0.55;
  const age = Math.max(0, now - lastActivityAt);
  return Math.pow(0.5, age / RECENCY_HALF_LIFE_MS);
}

/**
 * Per-title signal weight before metadata fan-out.
 * Library/watchlist is intentionally weak vs watched/rated behavior.
 */
export function titleSignalWeight(title, now = Date.now()) {
  let w = 0;
  const status = title.status;
  const progress = clamp01(title.progress ?? 0);
  const rating10 = title.rating10;
  const decay = recencyMultiplier(title.lastActivityAt, now);

  if (title.notInterested) {
    w += SIGNAL_WEIGHTS.notInterested;
    return { weight: w, decay: 1, implicit: false };
  }

  if (status === "completed" || progress >= 0.99) {
    w += SIGNAL_WEIGHTS.finished * decay;
  } else if (progress > 0.7) {
    w += SIGNAL_WEIGHTS.watchedMostly * decay;
  }

  if ((title.rewatchCount ?? 0) >= 1) {
    w += SIGNAL_WEIGHTS.rewatched * decay;
  }

  if (typeof rating10 === "number") {
    if (rating10 >= HIGH_RATING_10) w += SIGNAL_WEIGHTS.ratedHigh;
    else if (rating10 <= POOR_RATING_10) w += SIGNAL_WEIGHTS.poorRating;
  }

  if (title.favorite) w += SIGNAL_WEIGHTS.favorite;

  if (status === "watchlist" || (status && !["completed", "watching", "drop", "paused"].includes(status))) {
    w += SIGNAL_WEIGHTS.library; // no recency boost — weak intent
  } else if (status === "watching" && progress <= 0.7) {
    w += SIGNAL_WEIGHTS.library * 0.5 * decay;
  }

  if (status === "drop") {
    w += SIGNAL_WEIGHTS.abandoned;
  } else if (status === "paused" && progress < 0.5) {
    w += SIGNAL_WEIGHTS.abandoned * 0.75 * decay;
  }

  return { weight: w, decay, implicit: true };
}

export function mediaKeyOf(title) {
  return `${title.mediaType}-${title.id}`;
}
