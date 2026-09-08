// Shared Explore desktop genre-rail config + page fetch. Used by
// lib/exploreData (SSR first paint) and /api/explore/genre-rail (scroll load-more).

import {
  discoverShowsByGenre,
  discoverMoviesByGenre,
  isExcludedShow,
  isExcludedMovie,
} from "@/lib/tmdb";
import { mediaKey } from "@/lib/media";

export const EXPLORE_GENRE_RAILS = [
  { name: "Action & Adventure", movieId: "28|12", tvId: 10759 },
  { name: "Mystery & Thriller", movieId: "9648|53", tvId: "9648|80" },
  { name: "Sci-Fi & Fantasy", movieId: "878|14", tvId: 10765 },
  { name: "Drama & Crime", movieId: "18|80", tvId: "18|80" },
  { name: "Comedy", movieId: 35, tvId: 35 },
  { name: "Horror", movieId: 27, tvId: 9648 },
  { name: "Romance", movieId: 10749, tvId: 18 },
  { name: "Documentary", movieId: 99, tvId: 99 },
];

export const GENRE_RAIL_INITIAL_PAGES = 2;

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

export function mixGenreRailItems(movies, shows, genreName, limit = Infinity) {
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

export async function fetchGenreRailPages(rail, fromPage, toPage) {
  const pages = await Promise.all(
    Array.from({ length: Math.max(0, toPage - fromPage + 1) }, (_, i) => {
      const page = fromPage + i;
      return Promise.all([
        discoverMoviesByGenre(rail.movieId, page).catch(() => ({ results: [] })),
        discoverShowsByGenre(rail.tvId, page).catch(() => ({ results: [] })),
      ]);
    })
  );
  const movies = pages.flatMap(([moviePage]) => (moviePage.results ?? []).map(normalizeMovie));
  const shows = pages.flatMap(([, showPage]) => (showPage.results ?? []).map(normalizeShow));
  const items = mixGenreRailItems(movies, shows, rail.name);
  const lastMovie = pages[pages.length - 1]?.[0];
  const lastShow = pages[pages.length - 1]?.[1];
  const movieDone = (lastMovie?.page ?? toPage) >= (lastMovie?.total_pages ?? toPage);
  const showDone = (lastShow?.page ?? toPage) >= (lastShow?.total_pages ?? toPage);
  return {
    items,
    hasMore: items.length > 0 && !(movieDone && showDone),
  };
}
