import { NextResponse } from "next/server";
import { getShowDetails } from "@/lib/tmdb";

// Bridges client components (Profile/Favorites/Collections — all
// client-rendered since auth only lives in the browser) that have a list of
// tmdb_show_id values from Supabase but no way to resolve them to real show
// info, since lib/tmdb.js needs the server-only TMDB_API_KEY.
export async function GET(request) {
  const idsParam = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = [...new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean))];
  if (ids.length === 0) return NextResponse.json({ results: [] });

  const shows = await Promise.all(
    ids.map((id) =>
      getShowDetails(id).catch((err) => {
        console.error(`Failed to fetch show ${id}:`, err);
        return null;
      })
    )
  );

  const results = shows.filter(Boolean).map((show) => ({
    id: show.id,
    title: show.name,
    // resolveTitle (lib/languages.js) picks between this and title above,
    // client-side, based on the signed-in user's Readable Languages.
    originalTitle: show.original_name ?? null,
    originalLanguage: show.original_language ?? null,
    posterPath: show.poster_path,
    // Added for the Collector Box Set collection-cover style (its front
    // slipcase wants a real backdrop photo, not just a poster crop) — every
    // existing caller already just spreads/ignores unrecognized fields.
    backdropPath: show.backdrop_path ?? null,
    genre: (show.genres ?? [])[0]?.name ?? "",
    // Profile's Time Machine year-detail list ("N Seasons") — already on
    // getShowDetails' raw TMDB response (same field library-detail/
    // route.js reads for progress), just not mapped through before now.
    numberOfSeasons: show.number_of_seasons ?? null,
  }));

  return NextResponse.json({ results });
}
