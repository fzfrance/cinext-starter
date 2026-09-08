import { NextResponse } from "next/server";
import { EXPLORE_GENRE_RAILS, fetchGenreRailPages } from "@/lib/exploreGenreRails";

// GET ?name=Comedy&page=3 — next TMDB discover page for an Explore genre shelf.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const rail = EXPLORE_GENRE_RAILS.find((r) => r.name === name);
  if (!rail) return NextResponse.json({ error: "unknown genre rail" }, { status: 400 });

  try {
    const { items, hasMore } = await fetchGenreRailPages(rail, page, page);
    return NextResponse.json({ items, page, hasMore });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ items: [], page, hasMore: false });
  }
}
