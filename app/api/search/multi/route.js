import { NextResponse } from "next/server";
import { searchMulti, searchPerson, searchShows, searchMovies } from "@/lib/tmdb";
import { sortSearchMedia } from "@/lib/searchRank";

function parseReadableLanguages(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Mixed-content search (movies + TV shows + people) for the global search
// bar. TMDB /search/multi ranks by popularity, so we also pull dedicated
// TV/movie pages and re-rank by title match (exact name beats a longer
// popular title that only contains the query). Person hits are merged
// from /search/person so the People rail stays populated.
// Optional `langs` = Readable Languages — searched as extra TMDB language
// tags so Hangul/Thai/CJK titles and names resolve even for Latin queries.
export async function GET(request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (!query) return NextResponse.json({ results: [] });
  const readableLanguages = parseReadableLanguages(url.searchParams.get("langs"));

  try {
    const [multi, tv, movies, people] = await Promise.all([
      searchMulti(query, 1, readableLanguages),
      searchShows(query, 1, readableLanguages).catch(() => ({ results: [] })),
      searchMovies(query, 1, readableLanguages).catch(() => ({ results: [] })),
      searchPerson(query, 1, readableLanguages).catch(() => ({ results: [] })),
    ]);

    const seen = new Set();
    const results = [];

    const pushMedia = (item, mediaType) => {
      const key = `${mediaType}-${item.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      results.push({ ...item, media_type: mediaType });
    };

    for (const r of multi.results ?? []) {
      if (r.media_type === "movie" || r.media_type === "tv") pushMedia(r, r.media_type);
      else if (r.media_type === "person") {
        const key = `person-${r.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(r);
      }
    }

    for (const r of tv.results ?? []) pushMedia(r, "tv");
    for (const r of movies.results ?? []) pushMedia(r, "movie");

    for (const r of people.results ?? []) {
      const key = `person-${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ ...r, media_type: "person" });
    }

    return NextResponse.json({ results: sortSearchMedia(results, query) });
  } catch (err) {
    console.error("Multi search failed:", err);
    return NextResponse.json({ results: [] }, { status: 500 });
  }
}
