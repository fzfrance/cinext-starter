// ---------------------------------------------------------------------------
// TMDB (The Movie Database) client
// ---------------------------------------------------------------------------
// Get a free API key at https://www.themoviedb.org/settings/api
// Put it in .env.local as TMDB_API_KEY=xxxx (see .env.local.example)
//
// These are server-side fetch helpers (no API key exposed to the browser).
// Call them from Server Components or Route Handlers, e.g.:
//   const show = await getShowDetails(1396).
// App Language (cookie cinext-app-language) is injected as TMDB `language`
// so titles/overviews/episodes match Language Settings.

import { APP_LANGUAGE_STORAGE_KEY, DEFAULT_APP_LANGUAGE, normalizeAppLanguage, toTmdbLanguage } from "@/lib/languageCodes";

const BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";

function authHeaders() {
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    throw new Error(
      "Missing TMDB_API_KEY. Add it to .env.local — see .env.local.example."
    );
  }
  return { Authorization: `Bearer ${key}`, accept: "application/json" };
}

// Detail endpoints (a single show/season/episode/movie/person by id) are
// effectively static day-to-day — a show gaining a new season or an air
// date shifting is a rare, discrete event, nowhere near frequent enough to
// need hourly freshness. Home/Highlights/Profile all resolve their shows
// through these (getShowDetails, getSeasonDetails via
// getAiredEpisodesForShow, getMovieDetails, batch/library-detail), and at
// the previous 1-hour window, any show not already touched by someone in
// the last hour was a cold, multi-second TMDB round-trip on every single
// page load — the exact "each page takes so much time to load" report.
// Discovery/search/trending endpoints (Explore's "New Releases"/trending
// rows) keep the shorter window below since those are meant to feel
// current.
const DETAIL_REVALIDATE_SECONDS = 86400;

async function resolveAppLanguageTag() {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    const raw = store.get(APP_LANGUAGE_STORAGE_KEY)?.value;
    if (!raw) return toTmdbLanguage(DEFAULT_APP_LANGUAGE);
    return toTmdbLanguage(normalizeAppLanguage(decodeURIComponent(raw)));
  } catch {
    return toTmdbLanguage(DEFAULT_APP_LANGUAGE);
  }
}

async function tmdbFetch(path, params = {}, revalidateSeconds = 3600) {
  const nextParams = { ...params };
  // Pass language: null to skip App Language injection (rare).
  if (nextParams.language === undefined) {
    nextParams.language = await resolveAppLanguageTag();
  } else if (nextParams.language === null) {
    delete nextParams.language;
  }

  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(nextParams).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    url.searchParams.set(k, v);
  });

  const res = await fetch(url.toString(), {
    headers: authHeaders(),
    next: { revalidate: revalidateSeconds },
  });

  if (!res.ok) {
    throw new Error(`TMDB request failed (${res.status}): ${path}`);
  }
  return res.json();
}

// ---- Image URLs ------------------------------------------------------------

// size: "w200" | "w300" | "w500" | "w780" | "original" (posters/stills)
export function tmdbImage(path, size = "w500") {
  if (!path) return null;
  return `${IMAGE_BASE}/${size}${path}`;
}

// ---- Search / discovery ------------------------------------------------------

/** Infer TMDB language tags from the query script so Hangul/Thai/CJK
 *  queries still hit even when App Language is something else. */
function searchLanguageTagsForQuery(query) {
  const tags = new Set([null, "en-US"]);
  if (/[\u0E00-\u0E7F]/.test(query)) tags.add("th-TH");
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(query)) tags.add("ko-KR");
  if (/[\u3040-\u30FF]/.test(query)) tags.add("ja-JP");
  if (/[\u4E00-\u9FFF]/.test(query)) {
    tags.add("zh-CN");
    tags.add("ja-JP");
  }
  if (/[\u0400-\u04FF]/.test(query)) tags.add("ru-RU");
  if (/[\u0600-\u06FF]/.test(query)) tags.add("ar-SA");
  return [...tags];
}

async function mergeSearchPages(path, query, page, languageTags) {
  const appTag = await resolveAppLanguageTag();
  // null first → stable default posters; App Language last → localized titles.
  const tags = [...new Set([null, "en-US", ...languageTags.filter(Boolean), appTag])];
  const pages = await Promise.all(
    tags.map((language) =>
      tmdbFetch(path, { query, page, include_adult: false, language }, 600).catch(() => ({ results: [] }))
    )
  );

  const byId = new Map();
  for (const pageData of pages) {
    for (const item of pageData.results ?? []) {
      const prev = byId.get(item.id);
      if (!prev) {
        byId.set(item.id, {
          ...item,
          searchTitles: [item.title, item.name, item.original_title, item.original_name].filter(Boolean),
        });
        continue;
      }
      const searchTitles = new Set([
        ...(prev.searchTitles ?? []),
        item.title,
        item.name,
        item.original_title,
        item.original_name,
      ].filter(Boolean));
      byId.set(item.id, {
        ...prev,
        ...item,
        poster_path: prev.poster_path || item.poster_path,
        backdrop_path: prev.backdrop_path || item.backdrop_path,
        searchTitles: [...searchTitles],
      });
    }
  }
  return { results: [...byId.values()] };
}

/** Localized list titles + default (non–App Language) posters. */
async function listWithStablePosters(path, params = {}, revalidateSeconds = 3600) {
  const appLang = await resolveAppLanguageTag();
  const [localized, base] = await Promise.all([
    tmdbFetch(path, { ...params, language: appLang }, revalidateSeconds),
    tmdbFetch(path, { ...params, language: null }, revalidateSeconds),
  ]);
  const baseById = new Map((base.results ?? []).map((item) => [item.id, item]));
  return {
    ...localized,
    results: (localized.results ?? []).map((item) => {
      const fallback = baseById.get(item.id);
      if (!fallback) return item;
      return {
        ...item,
        poster_path: fallback.poster_path ?? item.poster_path,
        backdrop_path: fallback.backdrop_path ?? item.backdrop_path,
      };
    }),
  };
}

export function searchShows(query, page = 1) {
  return mergeSearchPages("/search/tv", query, page, searchLanguageTagsForQuery(query));
}

export function trendingShows(window = "week") {
  return listWithStablePosters(`/trending/tv/${window}`);
}

export function topRatedShows(page = 1) {
  return listWithStablePosters("/tv/top_rated", { page });
}

export function discoverShowsByGenre(genreId, page = 1) {
  return listWithStablePosters("/discover/tv", { with_genres: genreId, page, sort_by: "popularity.desc" });
}

export function discoverShowsByYear(year, page = 1) {
  return listWithStablePosters("/discover/tv", { first_air_date_year: year, page, sort_by: "popularity.desc" });
}

// Same genre pool as discoverShowsByGenre, but newest-first instead of
// most-popular-first — lets a caller prioritize recent releases over
// long-running/evergreen shows. `vote_count.gte` filters out barely-aired
// obscure titles that would otherwise dominate a pure recency sort.
export function discoverNewReleasesByGenre(genreId, page = 1) {
  return listWithStablePosters("/discover/tv", {
    with_genres: genreId,
    page,
    sort_by: "first_air_date.desc",
    "vote_count.gte": 20,
  });
}

// Genre-agnostic version of the above — newest-first across all genres,
// for pools (like Explore's hero) that aren't scoped to one user's genre
// affinity.
export function discoverNewReleases(page = 1) {
  return listWithStablePosters("/discover/tv", { page, sort_by: "first_air_date.desc", "vote_count.gte": 20 });
}

// TMDB's TV genre id for Animation, and the ISO 3166-1 origin-country code
// for India — a shared "no cartoons, no Indian shows" exclusion rule used
// by both Explore's hero pool (page.jsx) and its recommended-for-you
// route, kept in one place so the two can't drift out of sync on what
// counts as excluded.
const ANIMATION_GENRE_ID = 16;
const EXCLUDED_ORIGIN_COUNTRIES = new Set(["IN"]);
export function isExcludedShow(show) {
  if ((show.genre_ids ?? []).includes(ANIMATION_GENRE_ID)) return true;
  if ((show.origin_country ?? []).some((c) => EXCLUDED_ORIGIN_COUNTRIES.has(c))) return true;
  return false;
}

// TMDB doesn't have a clean "by platform" filter without the /discover
// `with_watch_providers` + `watch_region` params — requires a region code
// (e.g. "US") and a provider ID. Look up provider IDs via /watch/providers/tv.
export function discoverShowsByPlatform(providerId, region = "US", page = 1) {
  return listWithStablePosters("/discover/tv", {
    with_watch_providers: providerId,
    watch_region: region,
    with_watch_monetization_types: "flatrate|free|ads|rent|buy",
    page,
    sort_by: "popularity.desc",
  });
}

// TMDB filters TV shows by original spoken language via
// `with_original_language` (ISO 639-1) — plain and simple for most
// languages. English needs a second axis to tell "made in the UK" apart
// from "made in the US" since language alone can't (`with_origin_country`,
// ISO 3166-1, is TMDB's country-of-origin filter, for exactly that).
export function discoverShowsByLanguage({ language, originCountry } = {}, page = 1) {
  const params = { page, sort_by: "popularity.desc" };
  if (language) params.with_original_language = language;
  if (originCountry) params.with_origin_country = originCountry;
  return tmdbFetch("/discover/tv", params);
}

export function getGenres() {
  return tmdbFetch("/genre/tv/list");
}

// Real TMDB-hosted provider logos (sourced from JustWatch, same as TMDB's
// own site) — backs the Full Library filter sheet's platform chips with
// actual logos instead of a colored monogram placeholder.
export function getWatchProvidersList(region = "US") {
  return tmdbFetch("/watch/providers/tv", { watch_region: region });
}

// Combined multi-axis discovery for the Explore "Full Library" browser —
// genre, year range, platform(s), and language(s) all at once, in one
// call where possible. TMDB's discover only accepts a single
// with_original_language value per request (unlike with_genres/
// with_watch_providers, which take pipe/comma-separated lists), so
// multiple selected languages mean one request per language. Those are
// safe to just concatenate rather than dedupe — a show has exactly one
// original_language, so per-language result sets can never overlap, and
// summing their total_results is still an accurate combined count.
export async function discoverLibrary({ genre, yearFrom, yearTo, platforms = [], languages = [], page = 1, region = "US" } = {}) {
  const baseParams = { page, sort_by: "popularity.desc" };
  if (genre) baseParams.with_genres = genre;
  if (yearFrom) baseParams["first_air_date.gte"] = `${yearFrom}-01-01`;
  if (yearTo) baseParams["first_air_date.lte"] = `${yearTo}-12-31`;
  if (platforms.length > 0) {
    baseParams.with_watch_providers = platforms.join("|");
    baseParams.watch_region = region;
    // Include every monetization type so provider catalogs aren't limited
    // to flatrate-only rows (rent/buy/ads/free still count as “on” that service).
    baseParams.with_watch_monetization_types = "flatrate|free|ads|rent|buy";
  }

  if (languages.length === 0) {
    return tmdbFetch("/discover/tv", baseParams);
  }

  // Same reasoning extends to total_pages: our own `page` index requests
  // page N from every selected language's own discover call at once, so
  // pagination can only keep advancing once every language has exhausted
  // its own pages — hence the max, not a sum (unlike total_results, pages
  // aren't additive). A language whose own total_pages is smaller just
  // starts contributing an empty results array for `page` values beyond
  // its own range, which is harmless to concatenate.
  const pages = await Promise.all(
    languages.map((lang) => tmdbFetch("/discover/tv", { ...baseParams, with_original_language: lang }))
  );
  return {
    results: pages.flatMap((p) => p.results ?? []),
    total_results: pages.reduce((sum, p) => sum + (p.total_results ?? 0), 0),
    total_pages: Math.max(0, ...pages.map((p) => p.total_pages ?? 0)),
  };
}

// TMDB's own "people who liked this also liked" list — powers the Show
// Detail "You May Also Like" row, and (fanned out across a few seed
// shows) Explore's real "Recommended for You" hero slides
// (app/api/shows/recommended-for-you). Generic, needs no signed-in user
// itself — the per-user part is which seed ids the caller passes in.
export function getShowRecommendations(showId, page = 1) {
  return tmdbFetch(`/tv/${showId}/recommendations`, { page });
}

// ---- Show / season / episode detail ------------------------------------------

// aggregate_credits (not just credits) — TMDB's plain `credits` on a TV
// show only reflects whoever's credited on the LATEST season, so a show
// several seasons in was silently losing most of its earlier-season
// regulars from every cast-picking UI (the character-rating grids, Cast &
// Crew tab). aggregate_credits merges a person's credit across every
// season/episode into one entry with a `roles` array (episode counts per
// character), which is what actually captures the full ensemble.
// Detail text follows App Language; artwork uses the same TMDB default as
// listWithStablePosters (language: null). Preferring original-language art
// on detail only mismatched lists/search (e.g. Korean Golden Spoon → KO
// poster on detail, EN default on shelves).
async function withStableArtwork(path, appendToResponse) {
  const appLang = await resolveAppLanguageTag();
  const [localized, art] = await Promise.all([
    tmdbFetch(path, { append_to_response: appendToResponse, language: appLang }, DETAIL_REVALIDATE_SECONDS),
    tmdbFetch(path, { language: null }, DETAIL_REVALIDATE_SECONDS).catch(() => null),
  ]);
  if (!art) return localized;

  const artSeasons = Array.isArray(art.seasons) ? art.seasons : null;
  const seasons = artSeasons && Array.isArray(localized.seasons)
    ? localized.seasons.map((season) => {
        const match = artSeasons.find((s) => s.season_number === season.season_number);
        if (!match?.poster_path) return season;
        return { ...season, poster_path: match.poster_path };
      })
    : localized.seasons;

  return {
    ...localized,
    poster_path: art.poster_path ?? localized.poster_path,
    backdrop_path: art.backdrop_path ?? localized.backdrop_path,
    ...(seasons ? { seasons } : {}),
  };
}

export function getShowDetails(showId) {
  return withStableArtwork(`/tv/${showId}`, "credits,videos,aggregate_credits,keywords,content_ratings");
}

const VIDEO_LOCALES = {
  en: ["en-US", "en-GB"],
  ko: ["ko-KR"],
  ja: ["ja-JP"],
  zh: ["zh-TW", "zh-CN", "zh-HK"],
  th: ["th-TH"],
  es: ["es-ES", "es-MX"],
  pt: ["pt-BR", "pt-PT"],
  fr: ["fr-FR"],
  de: ["de-DE"],
  it: ["it-IT"],
  hi: ["hi-IN"],
  ar: ["ar-SA"],
  ru: ["ru-RU"],
  tr: ["tr-TR"],
};

async function getLocalizedVideos(path, originalLanguage) {
  if (!originalLanguage) return [];
  const locales = [...new Set([...(VIDEO_LOCALES[originalLanguage] ?? []), originalLanguage])];
  const responses = await Promise.all(locales.map((language) =>
    tmdbFetch(path, { language }, DETAIL_REVALIDATE_SECONDS).catch(() => ({ results: [] }))
  ));
  const seen = new Set();
  return responses.flatMap((response) => response.results ?? []).filter((video) => {
    if (!video?.key || seen.has(video.key)) return false;
    seen.add(video.key);
    return true;
  });
}

// Appended detail responses can be empty even though TMDB has a trailer in
// the title's original locale. These are fallback-only calls from the detail
// pages, so titles whose default response already has a video make no extra
// request.
export function getLocalizedShowVideos(showId, originalLanguage) {
  return getLocalizedVideos(`/tv/${showId}/videos`, originalLanguage);
}

export function getSeasonDetails(showId, seasonNumber) {
  return tmdbFetch(`/tv/${showId}/season/${seasonNumber}`, {}, DETAIL_REVALIDATE_SECONDS);
}

// Show Detail's "Where to Watch" — TMDB's data here is licensed from
// JustWatch (results are keyed by ISO 3166-1 region, e.g. "TH"), and
// their terms require attributing JustWatch and linking back to the
// `link` field in whichever result the caller displays. Return the raw
// per-show response rather than resolving a single region here, so a
// missing region for a given show is just "no key for TH", handled by
// the caller (app/(tabs)/show/[id]/page.jsx).
export function getWatchProviders(showId) {
  return tmdbFetch(`/tv/${showId}/watch/providers`, {}, DETAIL_REVALIDATE_SECONDS);
}

export function getEpisodeDetails(showId, seasonNumber, episodeNumber) {
  return tmdbFetch(`/tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}`, {
    append_to_response: "credits",
  }, DETAIL_REVALIDATE_SECONDS);
}

// Every released episode of a show — season/episode pairs plus a bit of
// display info, unaired episodes filtered out. Season 0 ("Specials") is
// included whenever the show has one, same as Show Detail's own season
// list — a show whose Specials are trackable/ratable there but silently
// excluded from progress/completion here would leave those episodes
// stuck un-watchable-as-complete. This is the single definition of "aired
// episodes" shared by anything that needs it: /api/shows/library-detail's
// per-show progress resolution, and /api/shows/[id]/aired-episodes (which
// lib/userShows.js's markShowCompleted calls to bulk-mark a show watched
// from contexts, like Explore's search results, that don't already have
// season data loaded locally the way Show Detail does). Pass an
// already-fetched `show` (from getShowDetails) to skip a redundant
// refetch when the caller has one.
export async function getAiredEpisodesForShow(showId, show) {
  const showData = show ?? (await getShowDetails(showId));
  const seasonNumbers = (showData.seasons ?? [])
    .map((s) => s.season_number)
    .sort((a, b) => a - b);

  const seasonDetails = await Promise.all(seasonNumbers.map((n) => getSeasonDetails(showId, n)));

  const aired = [];
  for (const season of seasonDetails) {
    for (const ep of season.episodes ?? []) {
      // !ep.air_date: TMDB creates a placeholder episode (typically
      // "Season N, Episode 1", no air_date at all) the moment a show is
      // renewed for a season that hasn't actually been scheduled yet —
      // confirmed directly against the API for show 233347 ("Moving"),
      // renewed for a Season 2 that's still just a stub with a null
      // air_date. Without this check that placeholder counted as
      // "aired" (the future-date check alone never excludes a null
      // date), permanently inflating releasedEpisodes by one episode
      // that can never actually be watched — the show could never reach
      // "completed" even after every real released episode was watched.
      if (!ep.air_date || new Date(ep.air_date).getTime() > Date.now()) continue;
      aired.push({
        season: season.season_number,
        episode: ep.episode_number,
        title: ep.name,
        stillPath: ep.still_path,
        runtime: ep.runtime ?? null,
        airDate: ep.air_date ?? null,
        overview: ep.overview ?? "",
      });
    }
  }
  return aired;
}

// Every backdrop/poster/logo TMDB has for a show — backs the Show Detail
// "..." menu's Change covers/Change poster/Change logo pickers.
// include_image_language widens TMDB's default (which otherwise only
// returns untagged/"null"-language images) to also include English and
// the show's own original language — without this, the logo picker in
// particular would come back nearly empty for most shows, since
// text-bearing logos are almost always language-tagged.
export function getShowImages(showId, originalLanguage, extraLanguages = []) {
  const langs = new Set(["null", "en"]);
  if (originalLanguage) langs.add(originalLanguage);
  for (const l of extraLanguages) if (l) langs.add(l);
  return tmdbFetch(`/tv/${showId}/images`, { include_image_language: [...langs].join(",") }, DETAIL_REVALIDATE_SECONDS);
}

// Picks the best title logo for spines / hero lockups.
//
// Priority: original language → English → other readable languages.
// Original always wins when TMDB has that art (even if the language isn't
// marked readable) so a K-drama keeps its Korean wordmark and a Danish
// show like The Rain does not get a Thai market logo just because Thai is
// readable. English is the usual international fallback. Other readable
// languages are last resort only.
//
// Within a language bucket, WIDE wordmarks (aspect ≥ 2.0) beat tall/stacked
// logos before vote ranking — spine and hero slots are wide-and-short.
const isWordmarkShaped = (logo) => (logo.width ?? 1) / (logo.height ?? 1) >= 2.0;
function preferWordmarks(candidates) {
  const wordmarks = candidates.filter(isWordmarkShaped);
  return wordmarks.length ? wordmarks : candidates;
}
export function pickBestLogo(logos, readableLanguages = [], originalLanguage = null) {
  if (!logos || logos.length === 0) return null;
  const byVote = (a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0);
  const pickForLang = (lang) => {
    if (!lang) return null;
    const matches = logos.filter((l) => l.iso_639_1 === lang);
    return matches.length ? preferWordmarks(matches).sort(byVote)[0] : null;
  };

  // Always prefer the show's own original-language logo first — even when
  // that language isn't marked readable. Logo art is the title's graphic
  // identity (a Korean wordmark on a K-drama, Danish/English on The Rain),
  // not a UI string to localize. Falling through to "any readable language"
  // previously slapped Thai market logos onto non-Thai shows whenever the
  // user had Thai readable but not the show's original language.
  if (originalLanguage) {
    const native = pickForLang(originalLanguage);
    if (native) return native;
  }

  // English wordmark next — the common international fallback on TMDB.
  if (originalLanguage !== "en") {
    const english = pickForLang("en");
    if (english) return english;
  }

  // Only then walk other readable languages (skip ones already tried).
  for (const lang of readableLanguages) {
    if (lang === originalLanguage || lang === "en") continue;
    const match = pickForLang(lang);
    if (match) return match;
  }
  return null;
}

// ---- Cast / people --------------------------------------------------------

// combined_credits (not separate tv_credits/movie_credits) gives every
// entry a media_type field ("movie" | "tv") directly — exactly what
// /person/[id]'s tv/movie tab toggle filters on, no separate merge step.
export function getPersonDetails(personId) {
  return tmdbFetch(`/person/${personId}`, { append_to_response: "combined_credits" }, DETAIL_REVALIDATE_SECONDS);
}

// ---- Movie search / discovery ----------------------------------------------
// 1:1 mirrors of the TV functions above, hitting TMDB's /movie and
// /discover/movie endpoints instead of /tv and /discover/tv. Kept as a
// separate section (not interleaved with the TV functions) so the two
// content types stay easy to tell apart at a glance.

export function searchMovies(query, page = 1) {
  return mergeSearchPages("/search/movie", query, page, searchLanguageTagsForQuery(query));
}

// TMDB's own cross-type search — returns movies, TV shows, AND people in
// one call, each tagged with its own media_type ("movie" | "tv" |
// "person"). Used by the app's mixed-content search (app/api/search/multi)
// instead of two separate searchShows/searchMovies calls + a manual merge,
// since /search/multi already gives TMDB's own cross-type relevance
// ranking for free.
export function searchMulti(query, page = 1) {
  return mergeSearchPages("/search/multi", query, page, searchLanguageTagsForQuery(query));
}

export function searchPerson(query, page = 1) {
  return mergeSearchPages("/search/person", query, page, searchLanguageTagsForQuery(query));
}

export function trendingMovies(window = "week") {
  return listWithStablePosters(`/trending/movie/${window}`);
}

export function topRatedMovies(page = 1) {
  return listWithStablePosters("/movie/top_rated", { page });
}

export function popularMovies(page = 1) {
  return listWithStablePosters("/movie/popular", { page });
}

export function popularShows(page = 1) {
  return listWithStablePosters("/tv/popular", { page });
}

export function nowPlayingMovies(page = 1) {
  return tmdbFetch("/movie/now_playing", { page });
}

export function upcomingMovies(page = 1) {
  return tmdbFetch("/movie/upcoming", { page });
}

export function discoverMoviesByGenre(genreId, page = 1) {
  return listWithStablePosters("/discover/movie", { with_genres: genreId, page, sort_by: "popularity.desc" });
}

// Same genre pool as discoverMoviesByGenre, but newest-first — mirrors
// discoverNewReleasesByGenre's reasoning exactly, just release-date
// instead of air-date.
export function discoverNewMovieReleasesByGenre(genreId, page = 1) {
  return listWithStablePosters("/discover/movie", {
    with_genres: genreId,
    page,
    sort_by: "primary_release_date.desc",
    "vote_count.gte": 20,
  });
}

// Genre-agnostic version of the above — newest-first across all genres.
export function discoverNewMovieReleases(page = 1) {
  return listWithStablePosters("/discover/movie", { page, sort_by: "primary_release_date.desc", "vote_count.gte": 20 });
}

// TMDB's movie genre id for Animation happens to also be 16 (same id
// space overlap as Comedy=35/Drama=18 — see getMovieGenres' own comment
// on where movie/TV genre ids diverge) — same exclusion rule as
// isExcludedShow, just checked against a movie's own genre_ids.
export function isExcludedMovie(movie) {
  if ((movie.genre_ids ?? []).includes(ANIMATION_GENRE_ID)) return true;
  if ((movie.origin_country ?? []).some((c) => EXCLUDED_ORIGIN_COUNTRIES.has(c))) return true;
  return false;
}

export function discoverMoviesByPlatform(providerId, region = "US", page = 1) {
  return tmdbFetch("/discover/movie", {
    with_watch_providers: providerId,
    watch_region: region,
    with_watch_monetization_types: "flatrate|free|ads|rent|buy",
    page,
    sort_by: "popularity.desc",
  });
}

export function discoverMoviesByLanguage({ language, originCountry } = {}, page = 1) {
  const params = { page, sort_by: "popularity.desc" };
  if (language) params.with_original_language = language;
  if (originCountry) params.with_origin_country = originCountry;
  return tmdbFetch("/discover/movie", params);
}

// Movie and TV genre id spaces are NOT the same list — some ids match
// (Drama=18, Comedy=35, Action=/28 vs TV's Action & Adventure=10759,
// Animation=16), but movies have several real distinct genres TV doesn't
// (Horror=27, Thriller=53, Romance=10749, War=10752) that
// explore/library/LibraryClient.jsx's TV-only GENRES constant currently
// has to fuzzy-map onto a close-enough TV genre for lack of a real one.
// This must always be resolved separately from getGenres() — never
// shared/assumed interchangeable.
export function getMovieGenres() {
  return tmdbFetch("/genre/movie/list");
}

// Provider IDs (Netflix=8, Max=1899, etc.) are shared across TMDB's
// movie/TV provider catalogs — this call still needs its own
// media-type-scoped endpoint for the logo/name lookup itself, though.
export function getWatchProvidersListMovie(region = "US") {
  return tmdbFetch("/watch/providers/movie", { watch_region: region });
}

// Combined multi-axis discovery for movies — exact structural mirror of
// discoverLibrary, just /discover/movie and primary_release_date instead
// of first_air_date.
export async function discoverMovieLibrary({ genre, yearFrom, yearTo, platforms = [], languages = [], page = 1, region = "US" } = {}) {
  const baseParams = { page, sort_by: "popularity.desc" };
  if (genre) baseParams.with_genres = genre;
  if (yearFrom) baseParams["primary_release_date.gte"] = `${yearFrom}-01-01`;
  if (yearTo) baseParams["primary_release_date.lte"] = `${yearTo}-12-31`;
  if (platforms.length > 0) {
    baseParams.with_watch_providers = platforms.join("|");
    baseParams.watch_region = region;
    baseParams.with_watch_monetization_types = "flatrate|free|ads|rent|buy";
  }

  if (languages.length === 0) {
    return tmdbFetch("/discover/movie", baseParams);
  }

  const pages = await Promise.all(
    languages.map((lang) => tmdbFetch("/discover/movie", { ...baseParams, with_original_language: lang }))
  );
  return {
    results: pages.flatMap((p) => p.results ?? []),
    total_results: pages.reduce((sum, p) => sum + (p.total_results ?? 0), 0),
    total_pages: Math.max(0, ...pages.map((p) => p.total_pages ?? 0)),
  };
}

export function getMovieRecommendations(movieId, page = 1) {
  return tmdbFetch(`/movie/${movieId}/recommendations`, { page });
}

// ---- Movie detail -----------------------------------------------------------

// Plain `credits` (not aggregate_credits) — a movie has exactly one cast
// list, not one per season, so there's no per-season fragmentation to
// merge the way getShowDetails' aggregate_credits exists to fix for TV.
export function getMovieDetails(movieId) {
  // release_dates powers the desktop meta certification (e.g. "PG-13"),
  // mirroring how getShowDetails appends content_ratings for TV.
  return withStableArtwork(`/movie/${movieId}`, "credits,videos,release_dates");
}

export function getLocalizedMovieVideos(movieId, originalLanguage) {
  return getLocalizedVideos(`/movie/${movieId}/videos`, originalLanguage);
}

// Same JustWatch-licensed, region-keyed shape as getWatchProviders — see
// that function's own comment on attribution requirements, which apply
// here identically.
export function getMovieWatchProviders(movieId) {
  return tmdbFetch(`/movie/${movieId}/watch/providers`, {}, DETAIL_REVALIDATE_SECONDS);
}

// Mirrors getShowImages exactly (same include_image_language widening) —
// only used for Movie Detail's auto title-logo resolution (app/api/movies/
// logos), not a full cover-customization picker (no movie equivalent of
// show_customizations exists in this pass).
export function getMovieImages(movieId, originalLanguage, extraLanguages = []) {
  const langs = new Set(["null", "en"]);
  if (originalLanguage) langs.add(originalLanguage);
  for (const l of extraLanguages) if (l) langs.add(l);
  return tmdbFetch(`/movie/${movieId}/images`, { include_image_language: [...langs].join(",") }, DETAIL_REVALIDATE_SECONDS);
}
