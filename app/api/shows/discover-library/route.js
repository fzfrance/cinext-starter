import { NextResponse } from "next/server";
import { discoverLibrary, discoverMovieLibrary } from "@/lib/tmdb";

// Backs Explore's "Full Library" browser — combines the genre chip
// (always visible, outside the filter sheet) with the filter sheet's own
// axes (year range, platforms, languages, content type) into one
// discover call per media type, the same call regardless of genre
// (including "All", genre=undefined — no with_genres param, not a
// separate hardcoded list). `page` is real pagination, not a fixed
// page-1 slice: the client drives this forward (infinite scroll) to
// actually reach the totalResults promises, instead of showing that
// count while silently capping the grid at whatever page 1 happens to
// contain.
//
// Deliberately does NOT apply the hero's isExcludedShow/isExcludedMovie
// filter (no cartoons/Indian content) — that's a personalization choice
// for Explore's curated hero slides, not appropriate for a page whose
// whole point is letting the user comprehensively browse everything,
// including "Animation" as one of its own genre chip options.
//
// contentType unset (mixed default, per the movies-as-content-type plan)
// pools BOTH /discover/tv and /discover/movie for this same page index,
// re-sorted by TMDB's own popularity score — same total_results-sum /
// total_pages-max merge rule discoverLibrary's own per-language fan-out
// already uses, just one level up (media type instead of language).
//
// GET ?genre=&yearFrom=&yearTo=&platforms=1,2&languages=en,ko&contentType=movie|tv&page=1
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

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const genre = sp.get("genre") || undefined;
  const yearFrom = sp.get("yearFrom") || undefined;
  const yearTo = sp.get("yearTo") || undefined;
  const platforms = (sp.get("platforms") || "").split(",").filter(Boolean);
  const languages = (sp.get("languages") || "").split(",").filter(Boolean);
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const contentType = sp.get("contentType"); // "movie" | "tv" | null (mixed)

  const discoverArgs = { genre, yearFrom, yearTo, platforms, languages, page };

  try {
    if (contentType === "movie") {
      const data = await discoverMovieLibrary(discoverArgs);
      const results = (data.results ?? []).map(mapMovie);
      return NextResponse.json({ results, totalResults: data.total_results ?? results.length, totalPages: data.total_pages ?? (results.length > 0 ? page : 0), page });
    }
    if (contentType === "tv") {
      const data = await discoverLibrary(discoverArgs);
      const results = (data.results ?? []).map(mapShow);
      return NextResponse.json({ results, totalResults: data.total_results ?? results.length, totalPages: data.total_pages ?? (results.length > 0 ? page : 0), page });
    }

    const [showData, movieData] = await Promise.all([
      discoverLibrary(discoverArgs),
      discoverMovieLibrary(discoverArgs),
    ]);
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
