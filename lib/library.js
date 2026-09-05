// Library tab helpers — pure functions only, no data. Real show/collection
// data now comes from Supabase (lib/userShows.js, lib/collections.js) +
// live TMDB (app/api/shows/library-detail), not a mock dataset.

// User-facing shelf groups. A title can appear in every matching shelf,
// except that Sci-Fi/Fantasy titles do not also create a broad Drama shelf.
// Horror, Music, and History are intentionally not shelves.
export const GENRE_PRIORITY = ["Action & Adventure", "Mystery & Thriller", "Sci-Fi & Fantasy", "War", "Western", "Romance", "Comedy", "Family", "Animation", "Documentary", "Reality", "News", "Talk"];

const KEYWORD_GENRES = [
  ["Mystery & Thriller", ["thriller", "suspense", "psychological thriller", "conspiracy", "serial killer"]],
  ["Sci-Fi & Fantasy", ["science fiction", "sci-fi", "space travel", "alien", "time travel", "dystopia", "cyberpunk", "robot", "fantasy", "magic", "witch", "wizard", "dragon", "mythology", "fairy tale"]],
  ["Romance", ["romance", "love story", "romantic relationship", "love triangle", "first love"]],
];

const TV_GENRE_TO_SHARED = {
  "Sci-Fi & Fantasy": ["Sci-Fi & Fantasy"],
  "War & Politics": ["War"],
  "Action & Adventure": ["Action & Adventure"],
  Action: ["Action & Adventure"],
  Adventure: ["Action & Adventure"],
  Mystery: ["Mystery & Thriller"],
  Thriller: ["Mystery & Thriller"],
  Kids: ["Family"],
  Soap: ["Romance"],
};

export function shelfGenresForShow(genres = [], keywords = []) {
  const shelfGenres = new Set();
  const normalizedKeywords = new Set(keywords.map((keyword) => keyword.trim().toLowerCase()));
  for (const [genre, matchKeywords] of KEYWORD_GENRES) {
    if (matchKeywords.some((keyword) => normalizedKeywords.has(keyword))) shelfGenres.add(genre);
  }
  for (const genre of genres) {
    if (["Horror", "Music", "History"].includes(genre)) continue;
    for (const sharedGenre of (TV_GENRE_TO_SHARED[genre] || [genre])) shelfGenres.add(sharedGenre);
  }
  // Drama is a valid shelf on its own, but not alongside the requested
  // Sci-Fi & Fantasy grouping.
  if (shelfGenres.has("Sci-Fi & Fantasy")) shelfGenres.delete("Drama");
  return GENRE_PRIORITY.filter((genre) => shelfGenres.has(genre));
}

export function primaryGenre(genres = [], keywords = []) {
  return shelfGenresForShow(genres, keywords)[0] ?? null;
}

// Movie equivalent of the show shelf list above, using TMDB's native movie
// genre names. Every matching genre is returned rather than selecting one.
export const MOVIE_GENRE_PRIORITY = GENRE_PRIORITY;
const MOVIE_GENRE_TO_SHARED = {
  "Science Fiction": "Sci-Fi & Fantasy",
  "Sci-Fi": "Sci-Fi & Fantasy",
  Fantasy: "Sci-Fi & Fantasy",
  Action: "Action & Adventure",
  Adventure: "Action & Adventure",
  Mystery: "Mystery & Thriller",
  Thriller: "Mystery & Thriller",
};
export function shelfGenresForMovie(genres = []) {
  const shelfGenres = new Set();
  for (const genre of genres) {
    if (["Horror", "Music", "History"].includes(genre)) continue;
    shelfGenres.add(MOVIE_GENRE_TO_SHARED[genre] || genre);
  }
  if (shelfGenres.has("Sci-Fi & Fantasy")) shelfGenres.delete("Drama");
  return MOVIE_GENRE_PRIORITY.filter((genre) => shelfGenres.has(genre));
}
export function primaryGenreMovie(genres) {
  return shelfGenresForMovie(genres)[0] ?? null;
}

// Small icon glyph per genre, shown before the aisle title (components/
// library/Aisle.jsx). Falls back to a plain "tv" icon for genres with no
// obviously distinct glyph worth adding.
export const GENRE_ICON = {
  "Action & Adventure": "genreAction",
  "Mystery & Thriller": "genreMystery",
  "Sci-Fi & Fantasy": "genreSciFi",
  "Science Fiction": "genreSciFi",
  "Fantasy": "genreSciFi",
  "War & Politics": "genreWar",
  "War": "genreWar",
  "Western": "tv",
  "Mystery": "genreMystery",
  "Action": "genreAction",
  "Adventure": "genreAction",
  "Animation": "sparkle",
  "Comedy": "genreComedy",
  "Family": "genreFamily",
  "Kids": "tv",
  "Soap": "tv",
  "Reality": "tv",
  "Documentary": "camera",
  "Horror": "genreMystery",
  "Thriller": "genreMystery",
  "Crime": "genreCrime",
  "Romance": "genreFamily",
  "History": "camera",
  "Music": "sparkle",
  "News": "tv",
  "Talk": "tv",
};

// Distinct color per genre icon, instead of one flat neutral tone —
// requested so aisles read as visually distinguishable at a glance, not
// just by their text label.
export const GENRE_COLOR = {
  "Action & Adventure": "#e8a24c",
  "Mystery & Thriller": "#a985e8",
  "Sci-Fi & Fantasy": "#6fb4ee",
  "Science Fiction": "#6fb4ee",
  "Fantasy": "#a985e8",
  "War & Politics": "#8a8ac9",
  "War": "#8a8ac9",
  "Western": "#c9975a",
  "Mystery": "#a985e8",
  "Action": "#e8a24c",
  "Adventure": "#e8a24c",
  "Animation": "#8fbf8a",
  "Comedy": "#f2c94c",
  "Family": "#7fbf8f",
  "Kids": "#f2a65a",
  "Soap": "#d96565",
  "Reality": "#9b9ba3",
  "Documentary": "#7fa8c9",
  "Horror": "#d96565",
  "Thriller": "#7f87a8",
  "Crime": "#d96565",
  "Romance": "#df8ba7",
  "History": "#b79a75",
  "Music": "#8f9fe8",
  "News": "#9b9ba3",
  "Talk": "#9b9ba3",
  // Movie-only additions — same no-collision reasoning as GENRE_ICON above.
};

// Deterministic per-show fallback color pair, derived from the show's real
// tmdb_show_id — used by CoverArt/Disc's procedural-gradient fallback when a
// show has no poster/backdrop art at all, so the fallback still looks
// intentional/varied rather than identical for every artless show.
const FALLBACK_PALETTE = [
  { base: "#3a2415", glow: "#e8a24c" },
  { base: "#28331f", glow: "#8fbf8a" },
  { base: "#16283f", glow: "#6fb4ee" },
  { base: "#241a3c", glow: "#a985e8" },
  { base: "#3d1414", glow: "#d96565" },
  { base: "#1c1c24", glow: "#8a8ac9" },
  { base: "#182028", glow: "#7fa8c9" },
  { base: "#233326", glow: "#7fbf8f" },
];
export function fallbackPalette(id) {
  const n = Number(id) || 0;
  return FALLBACK_PALETTE[n % FALLBACK_PALETTE.length];
}

// Season number → display label, everywhere a season is named from just
// its number with no TMDB season.name in hand (My Ratings, shared rating
// links, Activity cards) — season 0 is TMDB's "Specials" bucket, not
// literally "Season 0".
export function seasonLabel(seasonNumber) {
  return seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`;
}
