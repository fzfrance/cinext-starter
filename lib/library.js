// Library tab helpers — pure functions only, no data. Real show/collection
// data now comes from Supabase (lib/userShows.js, lib/collections.js) +
// live TMDB (app/api/shows/library-detail), not a mock dataset.

// A show usually carries several TMDB genre tags. For AISLE PLACEMENT ONLY we
// resolve one primary genre per show, ranked by distinctiveness. This never
// touches the show's actual genres array — detail pages, search, etc. still
// show all of a show's tags, this ranking only decides which single shelf it
// stands on.
//
// TMDB keeps separate movie and TV taxonomies. TV has no Horror, Thriller,
// Romance, History, Music, or standalone Science Fiction/Fantasy genres, so
// the resolver below combines real TV genres with real TMDB keywords and
// emits the movie-facing shelf names shared by both Library tabs.
//
// "Drama" is deliberately EXCLUDED entirely (not just deprioritized) per
// explicit request — it's the default catch-all on most TV shows, so a show
// tagged ["Drama", "Family"] should shelve under Family, not Drama, and a
// show tagged ["Drama"] alone gets no genre aisle at all rather than a
// "Drama" one everything would otherwise pile into.
export const GENRE_PRIORITY = ["Science Fiction", "Fantasy", "War", "Western", "Horror", "Mystery", "Thriller", "Crime", "Action", "Adventure", "Animation", "Music", "History", "Romance", "Comedy", "Family", "Documentary", "Reality", "News", "Talk"];

const KEYWORD_GENRES = [
  ["Horror", ["horror", "slasher", "zombie", "undead", "vampire", "werewolf", "haunted", "ghost", "demon", "demonic possession", "body horror"]],
  ["Thriller", ["thriller", "suspense", "psychological thriller", "conspiracy", "serial killer"]],
  ["Science Fiction", ["science fiction", "sci-fi", "space travel", "alien", "time travel", "dystopia", "cyberpunk", "robot"]],
  ["Fantasy", ["fantasy", "magic", "witch", "wizard", "dragon", "mythology", "fairy tale"]],
  ["Romance", ["romance", "love story", "romantic relationship", "love triangle", "first love"]],
  ["History", ["historical", "historical drama", "period drama", "based on true story"]],
  ["Music", ["music", "musical", "singer", "rock band", "pop star"]],
];

const TV_GENRE_TO_SHARED = {
  "Sci-Fi & Fantasy": "Science Fiction",
  "War & Politics": "War",
  "Action & Adventure": "Action",
  Crime: "Crime",
  Kids: "Family",
  Soap: "Romance",
};

export function primaryGenre(genres = [], keywords = []) {
  const normalizedKeywords = new Set(keywords.map((keyword) => keyword.trim().toLowerCase()));
  for (const [genre, matches] of KEYWORD_GENRES) {
    if (matches.some((keyword) => normalizedKeywords.has(keyword))) return genre;
  }

  const normalizedGenres = genres.map((genre) => TV_GENRE_TO_SHARED[genre] || genre);
  for (const genre of GENRE_PRIORITY) if (normalizedGenres.includes(genre)) return genre;
  return null; // no aisle-worthy genre (e.g. Drama-only) — caller skips this show for aisle placement
}

// Movie equivalent of GENRE_PRIORITY/primaryGenre above — TMDB's real
// /genre/movie/list names, which is its OWN fixed list distinct from the
// TV one (e.g. "Action" and "Crime" are real standalone movie genres,
// unlike TV's list, which has neither — see GENRE_ALIAS's own comment on
// why the two lists can't be shared). "Drama" stays excluded here too,
// same catch-all reasoning as the TV list.
export const MOVIE_GENRE_PRIORITY = ["Science Fiction", "Fantasy", "War", "Western", "Horror", "Mystery", "Thriller", "Crime", "Action", "Adventure", "Animation", "Music", "History", "Romance", "Comedy", "Family", "Documentary", "TV Movie"];
export function primaryGenreMovie(genres) {
  for (const g of MOVIE_GENRE_PRIORITY) if (genres.includes(g)) return g;
  return null;
}

// Small icon glyph per genre, shown before the aisle title (components/
// library/Aisle.jsx). Falls back to a plain "tv" icon for genres with no
// obviously distinct glyph worth adding.
export const GENRE_ICON = {
  "Sci-Fi & Fantasy": "genreSciFi",
  "Science Fiction": "genreSciFi",
  "Fantasy": "genreSciFi",
  "War & Politics": "genreWar",
  "War": "genreWar",
  "Western": "tv",
  "Mystery": "genreMystery",
  "Action & Adventure": "genreAction",
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
  "Sci-Fi & Fantasy": "#6fb4ee",
  "Science Fiction": "#6fb4ee",
  "Fantasy": "#a985e8",
  "War & Politics": "#8a8ac9",
  "War": "#8a8ac9",
  "Western": "#c9975a",
  "Mystery": "#a985e8",
  "Action & Adventure": "#e8a24c",
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
