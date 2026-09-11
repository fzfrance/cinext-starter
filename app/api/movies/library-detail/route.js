import { NextResponse } from "next/server";
import { getMovieDetails } from "@/lib/tmdb";

export const maxDuration = 60;

const DETAIL_CONCURRENCY = 20;

// Mirrors app/api/shows/library-detail/route.js, one media type over —
// meaningfully simpler: no needsProgress/episode-resolution branch at all
// (a movie has no episodes, so its library status is always exactly what
// the user picked — see lib/userMovies.js), just the base TMDB detail
// shape the Library shelf's shows tab already returns for a show, minus
// the season/episode-specific fields.
//
// POST body: { ids: number[] }
async function resolveMovie(id) {
  const movie = await getMovieDetails(id);

  return {
    id: movie.id,
    title: movie.title ?? "",
    originalTitle: movie.original_title ?? null,
    originalLanguage: movie.original_language ?? null,
    posterPath: movie.poster_path,
    backdropPath: movie.backdrop_path ?? movie.poster_path,
    genre: (movie.genres ?? [])[0]?.name ?? "",
    // Full genre list — feeds the Library shelf's aisle-placement priority
    // resolver (lib/library.js's primaryGenreMovie), same reasoning as the
    // show route's own `genres` field.
    genres: (movie.genres ?? []).map((g) => g.name),
    tmdbRating: movie.vote_average ?? null,
    tagline: movie.tagline ?? "",
    year: movie.release_date ? movie.release_date.slice(0, 4) : "",
    // Real equivalent of the show route's "2 seasons · 20 episodes" case
    // label — a movie's own runtime, same format Movie Detail/the rating
    // screen already use.
    meta: movie.runtime ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` : "",
    tmdbStatus: movie.status ?? "",
  };
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function POST(request) {
  const { ids } = await request.json();
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ results: [] });

  const uniqueIds = [...new Set(ids.map(Number).filter(Number.isFinite))];
  // A full imported library can contain well over 1,000 movies. Keep TMDB
  // lookups bounded so one Library load does not fan out into thousands of
  // simultaneous requests and lose most results to rate limiting.
  const results = await mapWithConcurrency(uniqueIds, DETAIL_CONCURRENCY, (id) =>
    resolveMovie(id).catch((err) => {
        console.error(`Failed to resolve library detail for movie ${id}:`, err);
        return null;
      })
  );

  return NextResponse.json({ results: results.filter(Boolean) });
}
