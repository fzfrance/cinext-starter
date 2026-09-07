// ---------------------------------------------------------------------------
// Shared trending/hero data fetch for the Explore experience — extracted
// from app/(tabs)/explore/page.jsx so both that route AND app/search
// (which now shows this same, unchanged Explore content behind its search
// bar) can fetch it identically without duplicating this logic.
// ---------------------------------------------------------------------------
//
// Movies and TV shows are both fetched here — every raw TMDB result is
// normalized to a common shape carrying its own `mediaType` ("movie" |
// "tv") right after fetch, via normalizeShow/normalizeMovie below.
// Trending renders as two separate rows on Explore ("Trending Shows" /
// "Trending Movies" — tried mixed into one row first, reverted per
// explicit request), so this returns trendingShows/trendingMovies
// separately; the HERO still pools both types together (not addressed by
// that request), via `trendingTagged` below.
//
// Movie and TV `id` numbers are NOT globally unique across media types —
// every Map used to pool/dedupe below is keyed on a composite
// "mediaType-id" string (see lib/media.js's mediaKey), never the bare id,
// or two unrelated titles that happen to share a numeric id could
// silently collide.

import {
  trendingShows, discoverNewReleases, isExcludedShow, getGenres,
  trendingMovies, discoverNewMovieReleases, isExcludedMovie, getMovieGenres,
  discoverShowsByGenre, discoverMoviesByGenre,
} from "@/lib/tmdb";
import { mediaKey } from "@/lib/media";

const HERO_SLIDE_COUNT = 5;
// Same pooling rationale as trending/new-release always did: pool several
// pages and randomly sample on every request (this route is already
// fully dynamic, not statically generated) so the hero varies visit to
// visit instead of looking frozen.
const NEW_RELEASE_POOL_PAGES = 2;

const GENRE_RAIL_LIMIT = 18;

// Genre discovery rails for Explore desktop. Paired shelves use TMDB's
// pipe-OR `with_genres` so Action|Adventure (etc.) share one mixed
// movie+TV shelf instead of two near-duplicate rows. TV taxonomy gaps
// (no Thriller / Horror / Romance / standalone Sci-Fi) reuse the same
// fuzzy maps LibraryClient documents.
const EXPLORE_GENRE_RAILS = [
  { name: "Action & Adventure", movieId: "28|12", tvId: 10759 },
  { name: "Mystery & Thriller", movieId: "9648|53", tvId: "9648|80" },
  { name: "Sci-Fi & Fantasy", movieId: "878|14", tvId: 10765 },
  { name: "Drama & Crime", movieId: "18|80", tvId: "18|80" },
  { name: "Comedy", movieId: 35, tvId: 35 },
  { name: "Horror", movieId: 27, tvId: 9648 },
  { name: "Romance", movieId: 10749, tvId: 18 },
  { name: "Documentary", movieId: 99, tvId: 99 },
];

function shuffled(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Normalizes a raw TMDB /tv or /movie result to one common shape:
// { id, mediaType, name, originalName, originalLanguage, genreIds,
//   posterPath, backdropPath, voteAverage, dateStr, originCountry }.
// dateStr is first_air_date for a show, release_date for a movie — both
// "YYYY-MM-DD", used identically downstream for the year in meta strings.
function normalizeShow(show) {
  return {
    id: show.id,
    mediaType: "tv",
    name: show.name,
    originalName: show.original_name ?? null,
    originalLanguage: show.original_language ?? null,
    genreIds: show.genre_ids ?? [],
    posterPath: show.poster_path,
    backdropPath: show.backdrop_path,
    voteAverage: show.vote_average,
    popularity: show.popularity ?? 0,
    dateStr: show.first_air_date,
    overview: show.overview ?? "",
    _excluded: isExcludedShow(show),
  };
}
function normalizeMovie(movie) {
  return {
    id: movie.id,
    mediaType: "movie",
    name: movie.title,
    originalName: movie.original_title ?? null,
    originalLanguage: movie.original_language ?? null,
    genreIds: movie.genre_ids ?? [],
    posterPath: movie.poster_path,
    backdropPath: movie.backdrop_path,
    voteAverage: movie.vote_average,
    popularity: movie.popularity ?? 0,
    dateStr: movie.release_date,
    overview: movie.overview ?? "",
    _excluded: isExcludedMovie(movie),
  };
}

function shapeShelfItem(item, genreName) {
  return {
    id: item.id,
    mediaType: item.mediaType,
    title: item.name,
    originalTitle: item.originalName,
    originalLanguage: item.originalLanguage,
    genre: genreName,
    year: item.dateStr ? item.dateStr.slice(0, 4) : "",
    overview: item.overview ?? "",
    rating: item.voteAverage ? item.voteAverage.toFixed(1) : "",
    posterPath: item.posterPath,
  };
}

// Popularity-sorted movie + TV lists interleaved so each genre rail reads
// as mixed discovery, not one media type then the other.
function mixGenreRailItems(movies, shows, genreName, limit = GENRE_RAIL_LIMIT) {
  const byPop = (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0);
  const movieQueue = movies.filter((item) => !item._excluded && item.posterPath).sort(byPop);
  const showQueue = shows.filter((item) => !item._excluded && item.posterPath).sort(byPop);
  const mixed = [];
  const seen = new Set();
  let mi = 0;
  let si = 0;
  while (mixed.length < limit && (mi < movieQueue.length || si < showQueue.length)) {
    const takeMovie = mixed.length % 2 === 0
      ? mi < movieQueue.length
      : si >= showQueue.length && mi < movieQueue.length;
    const next = takeMovie ? movieQueue[mi++] : showQueue[si++];
    if (!next) continue;
    const key = mediaKey(next);
    if (seen.has(key)) continue;
    seen.add(key);
    mixed.push(shapeShelfItem(next, genreName));
  }
  return mixed;
}

async function fetchGenreRails() {
  const pages = await Promise.all(
    EXPLORE_GENRE_RAILS.flatMap((rail) => [
      discoverMoviesByGenre(rail.movieId).catch(() => ({ results: [] })),
      discoverShowsByGenre(rail.tvId).catch(() => ({ results: [] })),
    ])
  );
  return EXPLORE_GENRE_RAILS.map((rail, index) => {
    const moviePage = pages[index * 2];
    const showPage = pages[index * 2 + 1];
    const movies = (moviePage.results ?? []).map(normalizeMovie);
    const shows = (showPage.results ?? []).map(normalizeShow);
    return {
      name: rail.name,
      items: mixGenreRailItems(movies, shows, rail.name),
    };
  }).filter((rail) => rail.items.length > 0);
}

export async function getExploreData({ includeGenreRails = true } = {}) {
  try {
    const [
      { results: trendingShowResults },
      newReleaseShowPages,
      { genres: tvGenres },
      { results: trendingMovieResults },
      newReleaseMoviePages,
      { genres: movieGenres },
    ] = await Promise.all([
      trendingShows(),
      Promise.all(Array.from({ length: NEW_RELEASE_POOL_PAGES }, (_, i) => discoverNewReleases(i + 1))),
      getGenres(),
      trendingMovies(),
      Promise.all(Array.from({ length: NEW_RELEASE_POOL_PAGES }, (_, i) => discoverNewMovieReleases(i + 1))),
      getMovieGenres(),
    ]);
    // Movie and TV genre id spaces diverge (see lib/tmdb.js's
    // getMovieGenres comment) — always resolved separately, picked per
    // item by its own mediaType, never shared/assumed interchangeable.
    const tvGenreName = new Map(tvGenres.map((g) => [g.id, g.name]));
    const movieGenreName = new Map(movieGenres.map((g) => [g.id, g.name]));

    const shapeTrending = (item, genreName) => ({
      id: item.id,
      mediaType: item.mediaType,
      title: item.name,
      originalTitle: item.originalName,
      originalLanguage: item.originalLanguage,
      genre: genreName.get(item.genreIds?.[0]) ?? "",
      year: item.dateStr ? item.dateStr.slice(0, 4) : "",
      overview: item.overview ?? "",
      rating: item.voteAverage ? item.voteAverage.toFixed(1) : "",
      posterPath: item.posterPath,
    });

    const trendingShowItems = (trendingShowResults ?? []).map(normalizeShow);
    const trendingMovieItems = (trendingMovieResults ?? []).map(normalizeMovie);
    const trendingItems = [...trendingShowItems, ...trendingMovieItems];

    // Two separate rows on Explore — each type's own full list, not
    // sliced against a shared cap.
    const trendingShowsOut = trendingShowItems.map((item) => shapeTrending(item, tvGenreName));
    const trendingMoviesOut = trendingMovieItems.map((item) => shapeTrending(item, movieGenreName));

    // Hero prioritizes what's currently trending and newly released,
    // both media types pooled together (the hero stays mixed-type even
    // though the rows below it split by type — a separate, later
    // request). Animation ("cartoons") and Indian-origin content is
    // excluded from every source (see isExcludedShow/isExcludedMovie).
    // Pooled and randomly sampled (not always the same first few
    // results) so the hero varies visit to visit rather than looking
    // frozen. "Recommended for you" slides get mixed in client-side (see
    // ExploreClient) once the signed-in user's own library is known —
    // that part can only happen client-side, since this app has no
    // server-side session (no @supabase/ssr).
    //
    // No top-rated fallback pool — the hero now only ever sources from
    // new-release + trending + recommended-for-you (mixed in client-
    // side), per explicit request. When this priority pool is smaller
    // than HERO_SLIDE_COUNT, the hero just shows fewer slides instead of
    // padding out with top-rated content.
    //
    // Each item is tagged with which tier it actually came from (_tier)
    // *before* the pools get merged/deduped — carried through to
    // heroSlides' own `mode` below, so ExploreHero's badge always tells
    // the truth about why a given slide is showing.
    const trendingTagged = trendingItems.map((s) => ({ ...s, _tier: "trending" }));
    const newReleaseShowItems = newReleaseShowPages.flatMap((p) => p.results ?? []).map(normalizeShow);
    const newReleaseMovieItems = newReleaseMoviePages.flatMap((p) => p.results ?? []).map(normalizeMovie);
    const newReleaseTagged = [...newReleaseShowItems, ...newReleaseMovieItems].map((s) => ({ ...s, _tier: "new" }));
    // trending listed last so it wins ties in the dedup Map below (an
    // item that's both trending and a new release reads better as
    // "trending").
    const priorityPool = [...new Map(
      [...newReleaseTagged, ...trendingTagged]
        .filter((item) => !item._excluded)
        .map((item) => [mediaKey(item), item])
    ).values()];

    const heroItems = shuffled(priorityPool).slice(0, HERO_SLIDE_COUNT);
    const heroSlides = heroItems.map((item) => {
      const itemGenres = (item.genreIds ?? []).slice(0, 2).map((id) => (item.mediaType === "movie" ? movieGenreName : tvGenreName).get(id)).filter(Boolean);
      const year = item.dateStr ? item.dateStr.slice(0, 4) : null;
      return {
        id: item.id,
        mediaType: item.mediaType,
        mode: item._tier,
        title: item.name,
        originalTitle: item.originalName,
        originalLanguage: item.originalLanguage,
        meta: [...itemGenres, year].filter(Boolean).join(" · "),
        year: year ?? "",
        overview: item.overview ?? "",
        rating: item.voteAverage ? item.voteAverage.toFixed(1) : "",
        posterPath: item.backdropPath ?? item.posterPath,
      };
    });

    const genreRails = includeGenreRails ? await fetchGenreRails() : [];

    return { trendingShows: trendingShowsOut, trendingMovies: trendingMoviesOut, heroSlides, genreRails };
  } catch (err) {
    console.error("Failed to fetch trending shows/movies:", err);
    return { trendingShows: [], trendingMovies: [], heroSlides: [], genreRails: [] };
  }
}
