import { NextResponse } from "next/server";
import { searchShows } from "@/lib/tmdb";

// lib/tmdb.js's fetch helpers use TMDB_API_KEY (server-only, no
// NEXT_PUBLIC_ prefix), so they can't be called directly from the
// search input's client component — this route is the bridge.
export async function GET(request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (!query) return NextResponse.json({ results: [] });
  const readableLanguages = String(url.searchParams.get("langs") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const data = await searchShows(query, 1, readableLanguages);
    return NextResponse.json({ results: data.results ?? [] });
  } catch (err) {
    console.error("Show search failed:", err);
    return NextResponse.json({ results: [] }, { status: 500 });
  }
}
