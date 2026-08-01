// Library tab helpers — pure functions only, no data. Real show/collection
// data now comes from Supabase (lib/userShows.js, lib/collections.js) +
// live TMDB (app/api/shows/library-detail), not a mock dataset.

// A show usually carries several TMDB genre tags. For AISLE PLACEMENT ONLY we
// resolve one primary genre per show, ranked by distinctiveness. This never
// touches the show's actual genres array — detail pages, search, etc. still
// show all of a show's tags, this ranking only decides which single shelf it
// stands on.
//
// These are TMDB's REAL /genre/tv/list names, not the movie-genre names an
// earlier draft of this list used ("Sci-Fi", "Action", "War", "Romance",
// "Horror", "Thriller" are movie-only genres — none of them ever match a TV
// show's real genre strings). That mismatch meant almost nothing here ever
// matched except "Drama", which is why aisles were collapsing into just
// Drama regardless of a show's other tags.
//
// "Drama" is deliberately EXCLUDED entirely (not just deprioritized) per
// explicit request — it's the default catch-all on most TV shows, so a show
// tagged ["Drama", "Family"] should shelve under Family, not Drama, and a
// show tagged ["Drama"] alone gets no genre aisle at all rather than a
// "Drama" one everything would otherwise pile into.
export const GENRE_PRIORITY = ["Sci-Fi & Fantasy", "War & Politics", "Western", "Mystery", "Action & Adventure", "Animation", "Comedy", "Family", "Kids", "Soap", "Reality", "Documentary", "News", "Talk"];
// Crime folds into Action & Adventure — a show tagged "Crime" shelves under
// the Action & Adventure aisle rather than getting its own, per explicit
// request (the two overlap heavily in practice on TMDB's TV catalog).
// There's no real TMDB TV genre called "Romance" at all (TV's true genre
// list is fixed — see the note above); "Soap" is the closest existing tag
// TMDB actually uses for romance-leaning TV, so that's what a
// romance-tagged-in-spirit show will fall under today.
const GENRE_ALIAS = { "Crime": "Action & Adventure" };
export function primaryGenre(genres) {
  const normalized = genres.map((g) => GENRE_ALIAS[g] || g);
  for (const g of GENRE_PRIORITY) if (normalized.includes(g)) return g;
  return null; // no aisle-worthy genre (e.g. Drama-only) — caller skips this show for aisle placement
}

// Small icon glyph per genre, shown before the aisle title (components/
// library/Aisle.jsx). Falls back to a plain "tv" icon for genres with no
// obviously distinct glyph worth adding.
export const GENRE_ICON = {
  "Sci-Fi & Fantasy": "genreSciFi",
  "War & Politics": "genreWar",
  "Western": "tv",
  "Mystery": "genreMystery",
  "Action & Adventure": "genreAction",
  "Animation": "sparkle",
  "Comedy": "genreComedy",
  "Family": "genreFamily",
  "Kids": "tv",
  "Soap": "tv",
  "Reality": "tv",
  "Documentary": "camera",
  "News": "tv",
  "Talk": "tv",
};

// Distinct color per genre icon, instead of one flat neutral tone —
// requested so aisles read as visually distinguishable at a glance, not
// just by their text label.
export const GENRE_COLOR = {
  "Sci-Fi & Fantasy": "#6fb4ee",
  "War & Politics": "#8a8ac9",
  "Western": "#c9975a",
  "Mystery": "#a985e8",
  "Action & Adventure": "#e8a24c",
  "Animation": "#8fbf8a",
  "Comedy": "#f2c94c",
  "Family": "#7fbf8f",
  "Kids": "#f2a65a",
  "Soap": "#d96565",
  "Reality": "#9b9ba3",
  "Documentary": "#7fa8c9",
  "News": "#9b9ba3",
  "Talk": "#9b9ba3",
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
