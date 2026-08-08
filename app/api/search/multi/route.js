import { NextResponse } from "next/server";
import { searchMulti } from "@/lib/tmdb";

// Mixed-content search (movies + TV shows) for the global search bar
// (app/search/SearchClient.jsx) — TMDB's own /search/multi already
// returns both, plus people, each tagged with its own media_type, in one
// call with TMDB's own cross-type relevance ranking. Simpler and better
// than two separate /search/movie + /search/tv calls merged client-side,
// which would need its own re-ranking heuristic to interleave two
// separately-sorted result sets sensibly.
//
// app/api/search/shows/route.js (TV-only, /search/tv) is left as-is —
// still used by Profile > Collections' own "add a show" search, which is
// deliberately TV-only (Collections aren't wired up for movies in this
// pass).
export async function GET(request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query) return NextResponse.json({ results: [] });

  try {
    const data = await searchMulti(query);
    const results = (data.results ?? []).filter((r) => r.media_type === "movie" || r.media_type === "tv");
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Multi search failed:", err);
    return NextResponse.json({ results: [] }, { status: 500 });
  }
}
