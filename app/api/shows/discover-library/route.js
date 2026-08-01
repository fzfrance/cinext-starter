import { NextResponse } from "next/server";
import { discoverLibrary } from "@/lib/tmdb";

// Backs Explore's "Full Library" browser — combines the genre chip
// (always visible, outside the filter sheet) with the filter sheet's own
// axes (year range, platforms, languages) into one discover call, the
// same call regardless of genre (including "All", genre=undefined — no
// with_genres param, not a separate hardcoded list). `page` is real
// pagination, not a fixed page-1 slice: the client drives this forward
// (infinite scroll) to actually reach the shows total_results promises,
// instead of showing that count while silently capping the grid at
// whatever page 1 happens to contain.
//
// Deliberately does NOT apply the hero's isExcludedShow filter (no
// cartoons/Indian shows) — that's a personalization choice for Explore's
// curated hero slides, not appropriate for a page whose whole point is
// letting the user comprehensively browse everything, including
// "Animation" as one of its own genre chip options.
//
// GET ?genre=&yearFrom=&yearTo=&platforms=1,2&languages=en,ko&page=1
export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const genre = sp.get("genre") || undefined;
  const yearFrom = sp.get("yearFrom") || undefined;
  const yearTo = sp.get("yearTo") || undefined;
  const platforms = (sp.get("platforms") || "").split(",").filter(Boolean);
  const languages = (sp.get("languages") || "").split(",").filter(Boolean);
  const page = Math.max(1, Number(sp.get("page")) || 1);

  try {
    const data = await discoverLibrary({ genre, yearFrom, yearTo, platforms, languages, page });
    const results = data.results ?? [];
    return NextResponse.json({
      results: results.map((show) => ({
        id: show.id,
        title: show.name,
        originalTitle: show.original_name ?? null,
        originalLanguage: show.original_language ?? null,
        posterPath: show.poster_path,
        rating: show.vote_average ? show.vote_average.toFixed(1) : null,
        year: show.first_air_date ? show.first_air_date.slice(0, 4) : null,
      })),
      totalResults: data.total_results ?? results.length,
      totalPages: data.total_pages ?? (results.length > 0 ? page : 0),
      page,
    });
  } catch (err) {
    console.error("Failed to discover library:", err);
    return NextResponse.json({ results: [], totalResults: 0, totalPages: 0, page }, { status: 500 });
  }
}
