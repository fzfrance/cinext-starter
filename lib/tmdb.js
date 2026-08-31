// ---------------------------------------------------------------------------
// TMDB (The Movie Database) client
// ---------------------------------------------------------------------------
// Get a free API key at https://www.themoviedb.org/settings/api
// Put it in .env.local as TMDB_API_KEY=xxxx (see .env.local.example)
//
// These are server-side fetch helpers (no API key exposed to the browser).
// Call them from Server Components or Route Handlers, e.g.:
//   const show = await getShowDetails(1396);

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

async function tmdbFetch(path, params = {}, revalidateSeconds = 3600) {
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

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

export function searchShows(query, page = 1) {
  return tmdbFetch("/search/tv", { query, page, include_adult: false });
}

export function trendingShows(window = "week") {
  return tmdbFetch(`/trending/tv/${window}`);
}

export function topRatedShows(page = 1) {
  return tmdbFetch("/tv/top_rated", { page });
}

export function discoverShowsByGenre(genreId, page = 1) {
  return tmdbFetch("/discover/tv", { with_genres: genreId, page, sort_by: "popularity.desc" });
}

export function discoverShowsByYear(year, page = 1) {
  return tmdbFetch("/discover/tv", { first_air_date_year: year, page, sort_by: "popularity.desc" });
}

// Same genre pool as discoverShowsByGenre, but newest-first instead of
// most-popular-first — lets a caller prioritize recent releases over
// long-running/evergreen shows. `vote_count.gte` filters out barely-aired
// obscure titles that would otherwise dominate a pure recency sort.
export function discoverNewReleasesByGenre(genreId, page = 1) {
  return tmdbFetch("/discover/tv", {
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
  return tmdbFetch("/discover/tv", { page, sort_by: "first_air_date.desc", "vote_count.gte": 20 });
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
  return tmdbFetch("/discover/tv", {
    with_watch_providers: providerId,
    watch_region: region,
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
export function getShowDetails(showId) {
  return tmdbFetch(`/tv/${showId}`, { append_to_response: "credits,videos,aggregate_credits,keywords" }, DETAIL_REVALIDATE_SECONDS);
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
      aired.push({ season: season.season_number, episode: ep.episode_number, title: ep.name, stillPath: ep.still_path, runtime: ep.runtime ?? null, airDate: ep.air_date ?? null });
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

// Picks the logo that best matches the signed-in user's Readable Languages
// (lib/languages.js), instead of TMDB's raw highest-voted logo regardless
// of language.
//
// The show's own ORIGINAL language wins first, whenever it's one of the
// user's readable languages — same rule resolveTitle() (lib/languages.js)
// already applies to the text title. English is very often ALSO marked
// readable (it's effectively unavoidable, since the app's own UI is
// English), so simply walking readableLanguages in whatever order it's
// stored in and stopping at the first language with any logo at all —
// this function's previous behavior — would keep picking English first
// for an international show any time English sorted ahead of, say, Korean
// in that list, even though the user can read Korean too and the show
// actually IS Korean. Checking originalLanguage first fixes that: a
// K-drama gets its Korean logo, a Chinese show its Chinese logo, etc.,
// whenever the user has that language marked readable — regardless of
// where it falls in their readableLanguages list. Only once that specific
// check doesn't apply (or finds nothing) does it fall back to walking the
// user's full readable-language list, then to the overall highest-voted
// logo if none of those match anything TMDB has art for either.
//
// Within whichever language bucket wins, WIDE "wordmark" logos are
// preferred over tall/square ones before ranking by vote — TMDB routinely
// has both for the same show (e.g. a clean single-line wordmark AND a
// stylized stacked/diagonal 2-3 line treatment) sometimes tied on
// vote_average, and this app's logo slots (Library's spine/case title,
// Show Detail's hero title) are all wide-and-short. A stacked/diagonal
// logo squeezed into that shape renders tiny, off-balance, and looks
// "off-center" — not because it's mis-centered, but because its own
// composition (e.g. HTGWM's 3-line "how to get / away with / Murder", or a
// diagonal slanted wordmark) doesn't fit a wide box at all. 2.0 is a rough
// cutoff separating real-world wordmark shapes from stacked/square ones —
// deliberately loose, since CJK-character logos are often more compact
// than Latin wordmarks by nature of the script, not because they're
// awkwardly cropped. Only falls back to the full candidate set for that
// language if nothing clears it, so a show whose native logo is always a
// bit more square (common for Korean/Chinese/Japanese titles) still gets
// its correct-language logo rather than being skipped for a wider but
// wrong-language one.
const isWordmarkShaped = (logo) => (logo.width ?? 1) / (logo.height ?? 1) >= 2.0;
function preferWordmarks(candidates) {
  const wordmarks = candidates.filter(isWordmarkShaped);
  return wordmarks.length ? wordmarks : candidates;
}
export function pickBestLogo(logos, readableLanguages = [], originalLanguage = null) {
  if (!logos || logos.length === 0) return null;
  const byVote = (a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0);
  if (originalLanguage && readableLanguages.includes(originalLanguage)) {
    const native = logos.filter((l) => l.iso_639_1 === originalLanguage);
    if (native.length) return preferWordmarks(native).sort(byVote)[0];
    // The user can read this show's own original language, but TMDB has
    // no logo art in it at all (common — logo assets are community-
    // contributed and plenty of international shows only ever get an
    // English one uploaded). Deliberately return null here rather than
    // falling through to some OTHER language's logo below — every caller
    // falls back to plain text when this returns null, and that text is
    // already resolved to the original-language title (resolveTitle,
    // lib/languages.js) whenever the user can read it. A native-language
    // TEXT title reads truer to the show than an English (or otherwise
    // foreign-language) LOGO GRAPHIC would, for a show the user can
    // actually read natively.
    return null;
  }
  for (const lang of readableLanguages) {
    const matches = logos.filter((l) => l.iso_639_1 === lang);
    if (matches.length) return preferWordmarks(matches).sort(byVote)[0];
  }
  return preferWordmarks([...logos]).sort(byVote)[0];
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
  return tmdbFetch("/search/movie", { query, page, include_adult: false });
}

// TMDB's own cross-type search — returns movies, TV shows, AND people in
// one call, each tagged with its own media_type ("movie" | "tv" |
// "person"). Used by the app's mixed-content search (app/api/search/multi)
// instead of two separate searchShows/searchMovies calls + a manual merge,
// since /search/multi already gives TMDB's own cross-type relevance
// ranking for free.
export function searchMulti(query, page = 1) {
  return tmdbFetch("/search/multi", { query, page, include_adult: false });
}

export function trendingMovies(window = "week") {
  return tmdbFetch(`/trending/movie/${window}`);
}

export function topRatedMovies(page = 1) {
  return tmdbFetch("/movie/top_rated", { page });
}

export function discoverMoviesByGenre(genreId, page = 1) {
  return tmdbFetch("/discover/movie", { with_genres: genreId, page, sort_by: "popularity.desc" });
}

// Same genre pool as discoverMoviesByGenre, but newest-first — mirrors
// discoverNewReleasesByGenre's reasoning exactly, just release-date
// instead of air-date.
export function discoverNewMovieReleasesByGenre(genreId, page = 1) {
  return tmdbFetch("/discover/movie", {
    with_genres: genreId,
    page,
    sort_by: "primary_release_date.desc",
    "vote_count.gte": 20,
  });
}

// Genre-agnostic version of the above — newest-first across all genres.
export function discoverNewMovieReleases(page = 1) {
  return tmdbFetch("/discover/movie", { page, sort_by: "primary_release_date.desc", "vote_count.gte": 20 });
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
  return tmdbFetch(`/movie/${movieId}`, { append_to_response: "credits,videos" }, DETAIL_REVALIDATE_SECONDS);
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
