// Shared discover / search filter catalogs (genres, languages, platforms)
// and JustWatch watch-region helpers. Kept in one place so Search, provider
// pages, and Explore Full Library don't drift.

/** App catalog region — show detail "Where to Watch" already uses TH. */
export const DEFAULT_WATCH_REGION = "TH";

/**
 * JustWatch/TMDB sometimes assigns different provider_ids per region for
 * the same brand. Disney+ is 337 in US/KR/JP but 122 in TH — discovering
 * with only 337 + watch_region=TH returns an empty / wrong catalog
 * (e.g. The Golden Spoon is on Disney+ in TH under 122, Hulu in US).
 */
const PROVIDER_ID_ALIASES = {
  337: [337, 122], // Disney+
  122: [337, 122],
};

export function expandWatchProviderIds(platformIds = []) {
  const out = new Set();
  for (const raw of platformIds) {
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) continue;
    const aliases = PROVIDER_ID_ALIASES[id];
    if (aliases) {
      for (const a of aliases) out.add(a);
    } else {
      out.add(id);
    }
  }
  return [...out];
}

/** Map TMDB provider rows → logo paths, filling canonical chip ids via aliases. */
export function buildProviderLogoMap(providerRows = []) {
  const byId = {};
  for (const p of providerRows) {
    if (!p?.logo_path || !p?.provider_id) continue;
    byId[p.provider_id] = p.logo_path;
  }
  const out = { ...byId };
  for (const platform of SEARCH_PLATFORMS) {
    if (out[platform.id]) continue;
    for (const alias of expandWatchProviderIds([platform.id])) {
      if (byId[alias]) {
        out[platform.id] = byId[alias];
        break;
      }
    }
  }
  return out;
}

/** Resolve a provider id against a region list, including Disney+ 337↔122. */
export function resolveWatchProvider(providerRows = [], providerId) {
  const id = Number(providerId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const rows = providerRows ?? [];
  const direct = rows.find((p) => p.provider_id === id);
  if (direct) return direct;
  for (const alias of expandWatchProviderIds([id])) {
    if (alias === id) continue;
    const hit = rows.find((p) => p.provider_id === alias);
    if (hit) {
      // Keep the requested id as the page/canonical id so chips stay stable.
      return { ...hit, provider_id: id };
    }
  }
  const fallback = SEARCH_PLATFORMS.find((p) => p.id === id || expandWatchProviderIds([p.id]).includes(id));
  if (!fallback) return null;
  return {
    provider_id: fallback.id,
    provider_name: fallback.name,
    logo_path: null,
  };
}

/** Canonical streaming chips (UI ids). Discover expands aliases server-side. */
export const SEARCH_PLATFORMS = [
  { id: 8, name: "Netflix", mono: "N", color: "#d9382f" },
  { id: 1899, name: "Max", mono: "M", color: "#8060ff" },
  { id: 337, name: "Disney+", mono: "D+", color: "#2a7ae4" },
  { id: 350, name: "Apple TV+", mono: "TV", color: "#c8c8cf" },
  { id: 9, name: "Prime Video", mono: "P", color: "#33c7ee" },
  { id: 15, name: "Hulu", mono: "H", color: "#3ddc84" },
  { id: 531, name: "Paramount+", mono: "P+", color: "#4a7fd9" },
  { id: 386, name: "Peacock", mono: "PC", color: "#cd6fd6" },
  { id: 283, name: "Crunchyroll", mono: "CR", color: "#f47521" },
];

/**
 * Original-language filter options for Search / provider / library.
 * Broader than App Language settings — users filter catalogs by many
 * production languages, not only UI locales.
 */
export const SEARCH_FILTER_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "ko", name: "Korean" },
  { code: "ja", name: "Japanese" },
  { code: "zh", name: "Chinese" },
  { code: "th", name: "Thai" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "hi", name: "Hindi" },
  { code: "ar", name: "Arabic" },
  { code: "ru", name: "Russian" },
  { code: "tr", name: "Turkish" },
  { code: "sv", name: "Swedish" },
  { code: "nl", name: "Dutch" },
  { code: "pl", name: "Polish" },
  { code: "id", name: "Indonesian" },
  { code: "vi", name: "Vietnamese" },
  { code: "ms", name: "Malay" },
  { code: "tl", name: "Filipino" },
  { code: "da", name: "Danish" },
  { code: "no", name: "Norwegian" },
  { code: "fi", name: "Finnish" },
  { code: "cs", name: "Czech" },
  { code: "hu", name: "Hungarian" },
  { code: "el", name: "Greek" },
  { code: "he", name: "Hebrew" },
  { code: "uk", name: "Ukrainian" },
  { code: "ro", name: "Romanian" },
  { code: "bn", name: "Bengali" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
];

// Movie vs TV genre id spaces diverge. Fantasy is a real movie genre (14);
// TV folds Sci-Fi & Fantasy into 10765 — we still expose a Fantasy chip so
// users can find it (same id as Sci-Fi on TV-only / All TV leg).
export const BROWSE_MOVIE_GENRES = [
  { id: "m-action", name: "Action", movieId: "28|12" },
  { id: "m-animation", name: "Animation", movieId: "16" },
  { id: "m-comedy", name: "Comedy", movieId: "35" },
  { id: "m-crime", name: "Crime", movieId: "80" },
  { id: "m-documentary", name: "Documentary", movieId: "99" },
  { id: "m-drama", name: "Drama", movieId: "18" },
  { id: "m-family", name: "Family", movieId: "10751" },
  { id: "m-fantasy", name: "Fantasy", movieId: "14" },
  { id: "m-horror", name: "Horror", movieId: "27" },
  { id: "m-mystery", name: "Mystery", movieId: "9648|53" },
  { id: "m-romance", name: "Romance", movieId: "10749" },
  { id: "m-scifi", name: "Sci-Fi", movieId: "878" },
  { id: "m-war", name: "War", movieId: "10752" },
];

export const BROWSE_TV_GENRES = [
  { id: "t-action", name: "Action", tvId: "10759" },
  { id: "t-animation", name: "Animation", tvId: "16" },
  { id: "t-comedy", name: "Comedy", tvId: "35" },
  { id: "t-crime", name: "Crime", tvId: "80" },
  { id: "t-documentary", name: "Documentary", tvId: "99" },
  { id: "t-drama", name: "Drama", tvId: "18" },
  { id: "t-family", name: "Family", tvId: "10751" },
  { id: "t-fantasy", name: "Fantasy", tvId: "10765" },
  { id: "t-kids", name: "Kids", tvId: "10762" },
  { id: "t-mystery", name: "Mystery", tvId: "9648" },
  { id: "t-reality", name: "Reality", tvId: "10764" },
  { id: "t-scifi", name: "Sci-Fi", tvId: "10765" },
  { id: "t-war", name: "War", tvId: "10768" },
];

export const BROWSE_ALL_GENRES = [
  { id: "a-action", name: "Action", movieId: "28|12", tvId: "10759" },
  { id: "a-animation", name: "Animation", movieId: "16", tvId: "16" },
  { id: "a-comedy", name: "Comedy", movieId: "35", tvId: "35" },
  { id: "a-crime", name: "Crime", movieId: "80", tvId: "80" },
  { id: "a-documentary", name: "Documentary", movieId: "99", tvId: "99" },
  { id: "a-drama", name: "Drama", movieId: "18", tvId: "18" },
  { id: "a-family", name: "Family", movieId: "10751", tvId: "10751" },
  { id: "a-fantasy", name: "Fantasy", movieId: "14", tvId: "10765" },
  { id: "a-horror", name: "Horror", movieId: "27", tvId: "9648" },
  { id: "a-mystery", name: "Mystery", movieId: "9648|53", tvId: "9648" },
  { id: "a-romance", name: "Romance", movieId: "10749", tvId: "18" },
  { id: "a-scifi", name: "Sci-Fi", movieId: "878", tvId: "10765" },
  { id: "a-war", name: "War", movieId: "10752", tvId: "10768" },
];

export function genresForContentType(contentType) {
  if (contentType === "tv") return BROWSE_TV_GENRES;
  if (contentType === "movie") return BROWSE_MOVIE_GENRES;
  return BROWSE_ALL_GENRES;
}
