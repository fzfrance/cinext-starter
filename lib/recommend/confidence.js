/** Watched-history confidence for personalized Explore row titles. */

export function confidenceLevel(count) {
  const n = Number(count) || 0;
  if (n >= 5) return "strong";
  if (n >= 3) return "established";
  if (n >= 2) return "emerging";
  if (n >= 1) return "weak";
  return "none";
}

export function confidenceRank(level) {
  switch (level) {
    case "strong": return 4;
    case "established": return 3;
    case "emerging": return 2;
    case "weak": return 1;
    default: return 0;
  }
}

/** True when the title counts as real watch history (not watchlist-only). */
export function isSubstantialWatch(title) {
  if (!title) return false;
  if (title.notInterested) return false;
  if (title.status === "watchlist") return false;
  if (title.status === "completed") return true;
  if ((title.progress ?? 0) >= 0.7) return true;
  if (title.status === "watching" && (title.progress ?? 0) > 0.15) return true;
  if ((title.rewatchCount ?? 0) >= 1) return true;
  // Rated after watching counts as watched signal
  if (typeof title.rating10 === "number" && title.status !== "watchlist") return true;
  return false;
}

export const MIN_LANGUAGE_WATCHED = 3;
export const MIN_GENRE_LIKE_WATCHED = 3; // "Because You Like [Genre]"
export const MIN_OVERALL_FOR_PERSONAL_ROWS = 2; // emerging+
export const MIN_OVERALL_FOR_STRONG_ROWS = 3; // established+
