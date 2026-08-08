import { NextResponse } from "next/server";
import {
  getShowDetails, getShowRecommendations, discoverShowsByGenre, discoverNewReleasesByGenre, getGenres, isExcludedShow,
  getMovieDetails, getMovieRecommendations, discoverMoviesByGenre, discoverNewMovieReleasesByGenre, getMovieGenres, isExcludedMovie,
} from "@/lib/tmdb";
import { mediaKey } from "@/lib/media";

const MAX_ITEMS = 12;
const MAX_SEED_GENRES = 3;

// Real per-user "Recommended for You" — Explore renders this as two
// separate rows, "Shows For You" and "Movies For You" (not one mixed
// row — that was tried and reverted; the user wants them split by type),
// plus a few of each mixed into the hero (see ExploreClient.jsx). This
// app has no server-side session (no @supabase/ssr — auth only lives in
// the browser client), so it can't look up "the signed-in user's
// library" itself; the caller passes a handful of the user's own items
// as seeds.
//
// One route serving both rows, not two separate calls: genre affinity is
// tallied separately per media type (movie and TV genre id spaces
// diverge — see lib/tmdb.js's getMovieGenres comment) and discover calls
// already go out against both /discover/tv and /discover/movie for their
// own respective top genres — the only thing that changed for the
// two-row split is the FINAL step (partition the shared dedup pool by
// mediaType instead of merging it into one array); reusing one seed
// fetch/genre-affinity pass for both rows is cheaper than two round
// trips or duplicated seed-resolution work.
//
// No `becauseOfGenre`/"BECAUSE YOU WATCH X" attribution on returned items
// — the hero's "recommended" badge is a flat "RECOMMENDED FOR YOU" label
// now, per explicit request; nothing here still needs to track which
// genre surfaced which item.
//
// POST body: { seedIds: [{id, mediaType}], excludeIds: [{id, mediaType}] }
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
  for (const show of seedShows) {
    for (const g of show?.genres ?? []) tvGenreCounts.set(g.id, (tvGenreCounts.get(g.id) ?? 0) + 1);
  }
  const movieGenreCounts = new Map();
  for (const movie of seedMovies) {
    for (const g of movie?.genres ?? []) movieGenreCounts.set(g.id, (movieGenreCounts.get(g.id) ?? 0) + 1);
  }

  const topGenreIds = (counts) => [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_SEED_GENRES).map(([id]) => id);
  const topTvGenreIds = topGenreIds(tvGenreCounts);
  const topMovieGenreIds = topGenreIds(movieGenreCounts);

  const byKey = new Map();
  const addResults = (results, mediaType) => {
    for (const raw of results ?? []) {
      const item = mediaType === "movie"
        ? { id: raw.id, mediaType, name: raw.title, originalName: raw.original_title ?? null, originalLanguage: raw.original_language ?? null, genreIds: raw.genre_ids ?? [], dateStr: raw.release_date, voteAverage: raw.vote_average, posterPath: raw.poster_path, backdropPath: raw.backdrop_path, _excluded: isExcludedMovie(raw) }
        : { id: raw.id, mediaType, name: raw.name, originalName: raw.original_name ?? null, originalLanguage: raw.original_language ?? null, genreIds: raw.genre_ids ?? [], dateStr: raw.first_air_date, voteAverage: raw.vote_average, posterPath: raw.poster_path, backdropPath: raw.backdrop_path, _excluded: isExcludedShow(raw) };
      const key = mediaKey(item);
      if (excludeSet.has(key) || byKey.has(key) || item._excluded) continue;
      byKey.set(key, item);
    }
  };

  // Priority order (first-added wins ties via addResults' Map dedup):
  // 1. newest releases within the seed's top genres, both media types.
  // 2. the existing popularity-ranked genre discovery, both media types.
  // 3. per-item recommendations, as the original fallback.
  if (topTvGenreIds.length > 0) {
    const pages = await Promise.all(topTvGenreIds.map((id) => discoverNewReleasesByGenre(id).catch(() => ({ results: [] }))));
    pages.forEach((page) => addResults(page.results, "tv"));
  }
  if (topMovieGenreIds.length > 0) {
    const pages = await Promise.all(topMovieGenreIds.map((id) => discoverNewMovieReleasesByGenre(id).catch(() => ({ results: [] }))));
    pages.forEach((page) => addResults(page.results, "movie"));
  }

  if (topTvGenreIds.length > 0) {
    const pages = await Promise.all(topTvGenreIds.map((id) => discoverShowsByGenre(id).catch(() => ({ results: [] }))));
    pages.forEach((page) => addResults(page.results, "tv"));
  }
  if (topMovieGenreIds.length > 0) {
    const pages = await Promise.all(topMovieGenreIds.map((id) => discoverMoviesByGenre(id).catch(() => ({ results: [] }))));
    pages.forEach((page) => addResults(page.results, "movie"));
  }

  // Fallback only, per media type — either no genre signal at all for
  // that type, or genre discovery alone didn't reach MAX_ITEMS for it.
  const tvSoFar = [...byKey.values()].filter((i) => i.mediaType === "tv").length;
  const movieSoFar = [...byKey.values()].filter((i) => i.mediaType === "movie").length;
  if (tvSoFar < MAX_ITEMS || movieSoFar < MAX_ITEMS) {
    const [showRecLists, movieRecLists] = await Promise.all([
      Promise.all(seedShowIds.map((id) => getShowRecommendations(id).catch(() => ({ results: [] })))),
      Promise.all(seedMovieIds.map((id) => getMovieRecommendations(id).catch(() => ({ results: [] })))),
    ]);
    showRecLists.forEach((list) => addResults(list.results, "tv"));
    movieRecLists.forEach((list) => addResults(list.results, "movie"));
  }

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
      rating: item.voteAverage ? item.voteAverage.toFixed(1) : "",
      posterPath: item.posterPath,
      backdropPath: item.backdropPath ?? item.posterPath,
    };
  };

  const allItems = [...byKey.values()];
  // Each type capped independently (up to MAX_ITEMS each), not against a
  // shared total — "Shows For You" and "Movies For You" are two
  // independent rows now, same as Trending Shows/Trending Movies each
  // getting their own full pool with no shared cap between them.
  const tvItems = allItems.filter((i) => i.mediaType === "tv").slice(0, MAX_ITEMS).map(shapeItem);
  const movieItems = allItems.filter((i) => i.mediaType === "movie").slice(0, MAX_ITEMS).map(shapeItem);

  return NextResponse.json({ tvItems, movieItems });
}
