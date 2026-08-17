import { NextResponse } from "next/server";
import { searchMulti } from "@/lib/tmdb";

// Mixed-content search (movies + TV shows + people) for the global search
// bar (app/search/SearchClient.jsx) — TMDB's own /search/multi already
// returns all three, each tagged with its own media_type, in one call
// with TMDB's own cross-type relevance ranking. Simpler and better than
// separate /search/movie + /search/tv + /search/person calls merged
// client-side, which would need its own re-ranking heuristic to
// interleave three separately-sorted result sets sensibly.
//
// People used to be filtered out here entirely, even though the search
// bar's own placeholder ("Search by title or actor") promised cast
// search — TMDB's search already matches a title or person name in
// either its original-language form or English (confirmed directly
// against the API: a Korean query like "무빙" surfaces "Moving", and
// "Moving" surfaces the same show back — no language param needed, TMDB
// indexes both), so the only real gap was this route silently dropping
// every person match before the client ever saw one.
//
// app/api/search/shows/route.js (TV-only, /search/tv) is left as-is —
// still used by Profile > Collections' own "add a show" search, which is
// deliberately TV-only (Collections aren't wired up for movies in this
// pass) and has no cast-search concept.
export async function GET(request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query) return NextResponse.json({ results: [] });

  try {
    const data = await searchMulti(query);
    const results = (data.results ?? []).filter((r) => r.media_type === "movie" || r.media_type === "tv" || r.media_type === "person");
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Multi search failed:", err);
    return NextResponse.json({ results: [] }, { status: 500 });
  }
}
