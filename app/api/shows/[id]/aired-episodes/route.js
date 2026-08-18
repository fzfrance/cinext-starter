import { NextResponse } from "next/server";
import { getAiredEpisodesForShow } from "@/lib/tmdb";

// Resolves every released REGULAR episode for a show (season 0/Specials
// excluded) — used by lib/userShows.js's markShowCompleted, for callers
// (Explore's search results) that need to bulk-mark a show watched but
// only have a tmdb_show_id, not full season data already loaded locally
// the way Show Detail has (see ShowDetailClient's markAllSeasonsWatched,
// which uses its own in-memory seasons instead of hitting this route).
// Specials are excluded here for the same reason ShowDetailClient's own
// markAllSeasonsWatched excludes them: bulk-completing a show must never
// silently mark its Specials watched too — those stay independently
// trackable, never swept in by an automatic/bulk completion action.
export async function GET(request, { params }) {
  const aired = await getAiredEpisodesForShow(params.id);
  return NextResponse.json({ episodes: aired.filter((e) => e.season !== 0).map(({ season, episode }) => ({ season, episode })) });
}
