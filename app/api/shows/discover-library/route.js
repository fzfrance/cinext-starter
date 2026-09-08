import { NextResponse } from "next/server";
import {
  discoverLibrary,
  discoverMovieLibrary,
  popularMovies,
  popularShows,
  topRatedMovies,
  topRatedShows,
  nowPlayingMovies,
  upcomingMovies,
} from "@/lib/tmdb";

// Backs Explore's "Full Library" browser and Search desktop browse mode.
// list=discover (default) uses multi-axis discover; other list values map
// to curated TMDB lists (popular / top_rated / now_playing / upcoming).
// Date-scoped movie lists return empty for TV-only requests.
//
// GET ?genre=&yearFrom=&yearTo=&platforms=1,2&languages=en,ko&contentType=movie|tv&list=&page=1

function mapShow(show) {
  return {
    id: show.id,
    mediaType: "tv",
    title: show.name,
    originalTitle: show.original_name ?? null,
    originalLanguage: show.original_language ?? null,
    posterPath: show.poster_path,
    rating: show.vote_average ? show.vote_average.toFixed(1) : null,
    year: show.first_air_date ? show.first_air_date.slice(0, 4) : null,
    popularity: show.popularity ?? 0,
  };
}

function mapMovie(movie) {
  return {
    id: movie.id,
    mediaType: "movie",
    title: movie.title,
    originalTitle: movie.original_title ?? null,
    originalLanguage: movie.original_language ?? null,
    posterPath: movie.poster_path,
    rating: movie.vote_average ? movie.vote_average.toFixed(1) : null,
    year: movie.release_date ? movie.release_date.slice(0, 4) : null,
    popularity: movie.popularity ?? 0,
  };
}

function emptyPage(page) {
  return NextResponse.json({ results: [], totalResults: 0, totalPages: 0, page });
}

function filterMapped(results, { yearFrom, yearTo, languages }) {
  return results.filter((item) => {
    if (yearFrom || yearTo) {
      const year = Number(item.year);
      if (!Number.isFinite(year)) return false;
      if (yearFrom && year < Number(yearFrom)) return false;
      if (yearTo && year > Number(yearTo)) return false;
    }
    if (languages?.length) {
      if (!item.originalLanguage || !languages.includes(item.originalLanguage)) return false;
    }
    return true;
  });
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const genre = sp.get("genre") || undefined;
  // Movie and TV genre id spaces diverge (e.g. Action is 28 vs 10759).
  // Prefer explicit per-type ids when the client sends both; fall back to
  // the shared `genre` param for single-type requests.
  const genreMovie = sp.get("genreMovie") || genre || undefined;
  const genreTv = sp.get("genreTv") || genre || undefined;
  const yearFrom = sp.get("yearFrom") || undefined;
  const yearTo = sp.get("yearTo") || undefined;
  const platforms = (sp.get("platforms") || "").split(",").filter(Boolean);
  const languages = (sp.get("languages") || "").split(",").filter(Boolean);
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const contentType = sp.get("contentType"); // "movie" | "tv" | null (mixed)
  const list = sp.get("list") || "discover";
  const region = sp.get("region") || undefined;

  try {
    // Theater / calendar lists are movie-only. TV or platform filters that
    // those endpoints can't honor → empty page (heading stays client-side).
    if (list === "now_playing" || list === "upcoming") {
      if (contentType === "tv" || platforms.length > 0) return emptyPage(page);
      const data = list === "now_playing"
        ? await nowPlayingMovies(page)
        : await upcomingMovies(page);
      const mapped = filterMapped((data.results ?? []).map(mapMovie), { yearFrom, yearTo, languages });
      return NextResponse.json({
        results: mapped,
        totalResults: mapped.length ? (data.total_results ?? mapped.length) : 0,
        totalPages: mapped.length ? (data.total_pages ?? 1) : 0,
        page,
      });
    }

    if (list === "popular" || list === "top_rated") {
      // Platform filters aren't supported on these curated lists.
      if (platforms.length > 0) return emptyPage(page);

      const fetchMovie = list === "popular" ? popularMovies : topRatedMovies;
      const fetchShow = list === "popular" ? popularShows : topRatedShows;

      if (contentType === "movie") {
        const data = await fetchMovie(page);
        const mapped = filterMapped((data.results ?? []).map(mapMovie), { yearFrom, yearTo, languages });
        return NextResponse.json({
          results: mapped,
          totalResults: data.total_results ?? mapped.length,
          totalPages: data.total_pages ?? (mapped.length > 0 ? page : 0),
          page,
        });
      }
      if (contentType === "tv") {
        const data = await fetchShow(page);
        const mapped = filterMapped((data.results ?? []).map(mapShow), { yearFrom, yearTo, languages });
        return NextResponse.json({
          results: mapped,
          totalResults: data.total_results ?? mapped.length,
          totalPages: data.total_pages ?? (mapped.length > 0 ? page : 0),
          page,
        });
      }

      const [movieData, showData] = await Promise.all([fetchMovie(page), fetchShow(page)]);
      const results = filterMapped(
        [
          ...(movieData.results ?? []).map(mapMovie),
          ...(showData.results ?? []).map(mapShow),
        ].sort((a, b) => b.popularity - a.popularity),
        { yearFrom, yearTo, languages }
      );
      return NextResponse.json({
        results,
        totalResults: (movieData.total_results ?? 0) + (showData.total_results ?? 0),
        totalPages: Math.max(movieData.total_pages ?? 0, showData.total_pages ?? 0),
        page,
      });
    }

    const baseDiscover = { yearFrom, yearTo, platforms, languages, page, ...(region ? { region } : {}) };

    if (contentType === "movie") {
      if (!genreMovie && genreTv && !genre) return emptyPage(page);
      const data = await discoverMovieLibrary({ ...baseDiscover, genre: genreMovie });
      const results = (data.results ?? []).map(mapMovie);
      return NextResponse.json({ results, totalResults: data.total_results ?? results.length, totalPages: data.total_pages ?? (results.length > 0 ? page : 0), page });
    }
    if (contentType === "tv") {
      if (!genreTv && genreMovie && !genre) return emptyPage(page);
      const data = await discoverLibrary({ ...baseDiscover, genre: genreTv });
      const results = (data.results ?? []).map(mapShow);
      return NextResponse.json({ results, totalResults: data.total_results ?? results.length, totalPages: data.total_pages ?? (results.length > 0 ? page : 0), page });
    }

    // Mixed movie + TV: use the correct genre id space for each request.
    // A genre that only exists on one side (e.g. Music for movies, Kids for
    // TV) fetches that side alone so we never send an invalid with_genres.
    const fetchMovie = genreMovie || (!genreMovie && !genreTv)
      ? discoverMovieLibrary({ ...baseDiscover, genre: genreMovie })
      : Promise.resolve({ results: [], total_results: 0, total_pages: 0 });
    const fetchShow = genreTv || (!genreMovie && !genreTv)
      ? discoverLibrary({ ...baseDiscover, genre: genreTv })
      : Promise.resolve({ results: [], total_results: 0, total_pages: 0 });

    const [showData, movieData] = await Promise.all([fetchShow, fetchMovie]);
    const results = [
      ...(showData.results ?? []).map(mapShow),
      ...(movieData.results ?? []).map(mapMovie),
    ].sort((a, b) => b.popularity - a.popularity);

    return NextResponse.json({
      results,
      totalResults: (showData.total_results ?? 0) + (movieData.total_results ?? 0),
      totalPages: Math.max(showData.total_pages ?? 0, movieData.total_pages ?? 0),
      page,
    });
  } catch (err) {
    console.error("Failed to discover library:", err);
    return NextResponse.json({ results: [], totalResults: 0, totalPages: 0, page }, { status: 500 });
  }
}
