import { NextResponse } from "next/server";
import { getMovieDetails } from "@/lib/tmdb";

// Mirrors app/api/shows/batch/route.js exactly, one media type over —
// bridges client components (Favorites Movies, My Ratings' movie
// entries, Home's Upcoming Movies) that have a list of tmdb_movie_id
// values from Supabase but no way to resolve them to real movie info,
// since lib/tmdb.js needs the server-only TMDB_API_KEY.
//
// releaseDate/tmdbStatus are included unconditionally (cheap — already on
// getMovieDetails' response) so this one route can serve every current
// consumer, including Home's Upcoming Movies (which needs the real
// release date/status to decide "upcoming"), without three near-duplicate
// routes. releaseDate is the raw ISO "YYYY-MM-DD" TMDB returns, not a
// human-formatted string — callers that need to sort/compare it do so
// directly against this value.
export async function GET(request) {
  const idsParam = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = [...new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean))];
  if (ids.length === 0) return NextResponse.json({ results: [] });

  const movies = await Promise.all(
    ids.map((id) =>
      getMovieDetails(id).catch((err) => {
        console.error(`Failed to fetch movie ${id}:`, err);
        return null;
      })
    )
  );

  const results = movies.filter(Boolean).map((movie) => ({
    id: movie.id,
    title: movie.title,
    // resolveTitle (lib/languages.js) picks between this and title above,
    // client-side, based on the signed-in user's Readable Languages.
    originalTitle: movie.original_title ?? null,
    originalLanguage: movie.original_language ?? null,
    posterPath: movie.poster_path,
    backdropPath: movie.backdrop_path ?? null,
    genre: (movie.genres ?? [])[0]?.name ?? "",
    releaseDate: movie.release_date ?? null,
    tmdbStatus: movie.status ?? null,
    // Highlights' Top Movies fallback ranking metric for unrated movies
    // (mirrors a show's runtimeMinutes-based tiebreak) — already on
    // getMovieDetails' response, just not mapped through before now.
    runtime: movie.runtime ?? null,
  }));

  return NextResponse.json({ results });
}
