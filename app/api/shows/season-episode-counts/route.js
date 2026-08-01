import { NextResponse } from "next/server";
import { getSeasonDetails } from "@/lib/tmdb";

// Profile's "My Ratings" row needs each auto-eligible season's REAL total
// episode count to know whether it's actually been rated in full (not
// just partially) — episode_watches alone can't answer that, since it
// only has however many episodes the user happened to rate, not how many
// the season actually has.
export async function POST(request) {
  const { seasons } = await request.json();
  if (!Array.isArray(seasons) || seasons.length === 0) return NextResponse.json({ results: [] });

  const results = await Promise.all(
    seasons.map(async ({ showId, seasonNumber }) => {
      try {
        const season = await getSeasonDetails(showId, seasonNumber);
        return { showId, seasonNumber, totalEpisodes: (season.episodes ?? []).length };
      } catch (err) {
        console.error(`Failed to fetch season ${showId}/${seasonNumber}:`, err);
        return { showId, seasonNumber, totalEpisodes: null };
      }
    })
  );

  return NextResponse.json({ results });
}
