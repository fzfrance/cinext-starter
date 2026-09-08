// Rule-based recommendation weights — shared by taste profile + scoring.

export const SIGNAL_WEIGHTS = {
  finished: 5,
  ratedHigh: 5,
  rewatched: 4,
  watchedMostly: 3, // progress > 0.7
  favorite: 3,
  library: 1, // watchlist / soft library presence
  abandoned: -2, // drop / paused mid-watch with little progress
  poorRating: -4,
  notInterested: -8,
};

/** Half-life for implicit watch signals (ms) — ~90 days. */
export const RECENCY_HALF_LIFE_MS = 90 * 24 * 60 * 60 * 1000;

export const SCORE_WEIGHTS = {
  genre: 0.30,
  keyword: 0.15,
  language: 0.10,
  people: 0.10, // actors + directors
  ratingConfidence: 0.10,
  popularity: 0.08,
  releaseRecency: 0.05,
  preferredEra: 0.05,
  mediaType: 0.04,
  discovery: 0.03,
};

export const FOR_YOU_MIX = {
  strong: 0.50,
  adjacent: 0.20,
  qualityPopular: 0.15,
  newReleases: 0.10,
  wildcard: 0.05,
};

export const EXPLORE_PERSONALIZATION = 0.45; // ~40–50% personalized vs discovery

export const HERO_RANK = {
  personal: 0.55,
  backdrop: 0.15,
  popularity: 0.10,
  ratingConfidence: 0.10,
  freshness: 0.10,
};

export const HIGH_RATING_10 = 8;
export const POOR_RATING_10 = 4;
export const MIN_VOTE_COUNT = 40;
export const MIN_HERO_VOTE_COUNT = 80;
export const MIN_HERO_SCORE = 0.42;

export const IMPRESSION_PENALTY_DAYS = 14;
export const HERO_IMPRESSION_DAYS = 21;
