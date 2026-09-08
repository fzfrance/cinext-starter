import { NextResponse } from "next/server";
import {
  getShowDetails, getShowRecommendations, discoverShowsByGenre, discoverShowsForTaste, discoverNewReleasesByGenre, getGenres, isExcludedShow, trendingShows,
  getMovieDetails, getMovieRecommendations, discoverMoviesByGenre, discoverMoviesForTaste, discoverNewMovieReleasesByGenre, getMovieGenres, isExcludedMovie, trendingMovies,
} from "@/lib/tmdb";
import { mediaKey } from "@/lib/media";

const MAX_ITEMS = 48;
const MAX_SEED_GENRES = 4;
const MAX_SEED_LANGS = 3;

function topIds(counts, limit) {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
}

function bump(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + amount);
}

// POST body: { seedIds: [{id, mediaType}], excludeIds: [{id, mediaType}] }
// Taste-first For You: similar titles, then popular/trending in the user's
// genres + original languages (so K-drama / Western / thriller taste sticks).
export async function POST(request) {
  const { seedIds = [], excludeIds = [] } = await request.json();
  if (seedIds.length === 0) return NextResponse.json({ tvItems: [], movieItems: [] });

  const excludeSet = new Set(excludeIds.map(mediaKey));
  const seedShowIds = seedIds.filter((s) => s.mediaType !== "movie").map((s) => s.id);
  const seedMovieIds = seedIds.filter((s) => s.mediaType === "movie").map((s) => s.id);

  const [{ genres: tvGenres }, { genres: movieGenres }, seedShows, seedMovies] = await Promise.all([
    getGenres(),
    getMovieGenres(),
    Promise.all(seedShowIds.map((id) => getShowDetails(id).catch(() => null))),
    Promise.all(seedMovieIds.map((id) => getMovieDetails(id).catch(() => null))),
  ]);
  const tvGenreName = new Map(tvGenres.map((g) => [g.id, g.name]));
  const movieGenreName = new Map(movieGenres.map((g) => [g.id, g.name]));

  const tvGenreCounts = new Map();
  const movieGenreCounts = new Map();
  const tvLangCounts = new Map();
  const movieLangCounts = new Map();
  const tvOriginCounts = new Map();

  for (const show of seedShows) {
    if (!show) continue;
    for (const g of show.genres ?? []) bump(tvGenreCounts, g.id);
    bump(tvLangCounts, show.original_language, 2);
    for (const c of show.origin_country ?? []) bump(tvOriginCounts, c, 2);
  }
  for (const movie of seedMovies) {
    if (!movie) continue;
    for (const g of movie.genres ?? []) bump(movieGenreCounts, g.id);
    bump(movieLangCounts, movie.original_language, 2);
  }

  const topTvGenreIds = topIds(tvGenreCounts, MAX_SEED_GENRES);
  const topMovieGenreIds = topIds(movieGenreCounts, MAX_SEED_GENRES);
  const topTvLangs = topIds(tvLangCounts, MAX_SEED_LANGS);
  const topMovieLangs = topIds(movieLangCounts, MAX_SEED_LANGS);

  const tasteScore = (item) => {
    const genreCounts = item.mediaType === "movie" ? movieGenreCounts : tvGenreCounts;
    const langCounts = item.mediaType === "movie" ? movieLangCounts : tvLangCounts;
    let score = 0;
    for (const g of item.genreIds ?? []) score += (genreCounts.get(g) ?? 0) * 3;
    score += (langCounts.get(item.originalLanguage) ?? 0) * 6;
    if (item.mediaType === "tv") {
      for (const c of item.originCountries ?? []) score += (tvOriginCounts.get(c) ?? 0) * 4;
    }
    score += Math.min(Number(item.voteAverage) || 0, 8) * 0.2;
    return score;
  };

  const byKey = new Map();
  const addResults = (results, mediaType, sourceBonus = 0) => {
    for (const raw of results ?? []) {
      const item = mediaType === "movie"
        ? {
            id: raw.id,
            mediaType,
            name: raw.title,
            originalName: raw.original_title ?? null,
            originalLanguage: raw.original_language ?? null,
            genreIds: raw.genre_ids ?? [],
            originCountries: [],
            dateStr: raw.release_date,
            voteAverage: raw.vote_average,
            posterPath: raw.poster_path,
            backdropPath: raw.backdrop_path,
            overview: raw.overview ?? "",
            _excluded: isExcludedMovie(raw),
          }
        : {
            id: raw.id,
            mediaType,
            name: raw.name,
            originalName: raw.original_name ?? null,
            originalLanguage: raw.original_language ?? null,
            genreIds: raw.genre_ids ?? [],
            originCountries: raw.origin_country ?? [],
            dateStr: raw.first_air_date,
            voteAverage: raw.vote_average,
            posterPath: raw.poster_path,
            backdropPath: raw.backdrop_path,
            overview: raw.overview ?? "",
            _excluded: isExcludedShow(raw),
          };
      const key = mediaKey(item);
      if (excludeSet.has(key) || item._excluded) continue;
      const score = tasteScore(item) + sourceBonus;
      const existing = byKey.get(key);
      if (!existing || score > existing._score) byKey.set(key, { ...item, _score: score });
    }
  };

  // 1) Similar-to-seeds (strongest personalization signal)
  const [showRecLists, movieRecLists] = await Promise.all([
    Promise.all(seedShowIds.slice(0, 8).map((id) => getShowRecommendations(id).catch(() => ({ results: [] })))),
    Promise.all(seedMovieIds.slice(0, 8).map((id) => getMovieRecommendations(id).catch(() => ({ results: [] })))),
  ]);
  showRecLists.forEach((list) => addResults(list.results, "tv", 110));
  movieRecLists.forEach((list) => addResults(list.results, "movie", 110));

  // 2) Popular in (genre × language) — keeps K-drama / Western / etc. coherent
  const tasteDiscover = [];
  for (const genreId of topTvGenreIds) {
    for (const language of topTvLangs.slice(0, 2)) {
      tasteDiscover.push(discoverShowsForTaste({ genreId, language }).catch(() => ({ results: [] })).then((p) => addResults(p.results, "tv", 55)));
    }
    tasteDiscover.push(discoverShowsByGenre(genreId).catch(() => ({ results: [] })).then((p) => addResults(p.results, "tv", 28)));
    tasteDiscover.push(discoverNewReleasesByGenre(genreId).catch(() => ({ results: [] })).then((p) => addResults(p.results, "tv", 22)));
  }
  for (const genreId of topMovieGenreIds) {
    for (const language of topMovieLangs.slice(0, 2)) {
      tasteDiscover.push(discoverMoviesForTaste({ genreId, language }).catch(() => ({ results: [] })).then((p) => addResults(p.results, "movie", 55)));
    }
    tasteDiscover.push(discoverMoviesByGenre(genreId).catch(() => ({ results: [] })).then((p) => addResults(p.results, "movie", 28)));
    tasteDiscover.push(discoverNewMovieReleasesByGenre(genreId).catch(() => ({ results: [] })).then((p) => addResults(p.results, "movie", 22)));
  }
  // Language-only popular (e.g. more Korean titles even outside top genres)
  for (const language of topTvLangs.slice(0, 2)) {
    tasteDiscover.push(discoverShowsForTaste({ language }).catch(() => ({ results: [] })).then((p) => addResults(p.results, "tv", 35)));
  }
  for (const language of topMovieLangs.slice(0, 2)) {
    tasteDiscover.push(discoverMoviesForTaste({ language }).catch(() => ({ results: [] })).then((p) => addResults(p.results, "movie", 35)));
  }

  // 3) Trending, scored by the same taste weights (not blindly global)
  tasteDiscover.push(
    trendingShows("week").catch(() => ({ results: [] })).then((p) => addResults(p.results, "tv", 18)),
    trendingMovies("week").catch(() => ({ results: [] })).then((p) => addResults(p.results, "movie", 18)),
  );

  await Promise.all(tasteDiscover);

  const shapeItem = (item) => {
    const genreName = item.mediaType === "movie" ? movieGenreName : tvGenreName;
    const itemGenres = (item.genreIds ?? []).slice(0, 2).map((id) => genreName.get(id)).filter(Boolean);
    const year = item.dateStr ? item.dateStr.slice(0, 4) : null;
    return {
      id: item.id,
      mediaType: item.mediaType,
      title: item.name,
      originalTitle: item.originalName,
      originalLanguage: item.originalLanguage,
      genre: itemGenres[0] ?? "",
      meta: [...itemGenres, year].filter(Boolean).join(" · "),
      date: item.dateStr ?? "",
      year: year ?? "",
      overview: item.overview ?? "",
      rating: item.voteAverage ? item.voteAverage.toFixed(1) : "",
      posterPath: item.posterPath,
      backdropPath: item.backdropPath ?? item.posterPath,
    };
  };

  const ranked = [...byKey.values()].sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
  // Require a minimum taste overlap so pure global trending noise drops out
  // when we already have a clear language/genre profile.
  const hasTaste = tvGenreCounts.size + movieGenreCounts.size + tvLangCounts.size + movieLangCounts.size > 0;
  const filtered = hasTaste
    ? ranked.filter((item) => tasteScore(item) > 0 || (item._score ?? 0) >= 110)
    : ranked;

  const tvItems = filtered.filter((i) => i.mediaType === "tv").slice(0, MAX_ITEMS).map(shapeItem);
  const movieItems = filtered.filter((i) => i.mediaType === "movie").slice(0, MAX_ITEMS).map(shapeItem);

  return NextResponse.json({ tvItems, movieItems });
}
