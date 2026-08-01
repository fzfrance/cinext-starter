import { NextResponse } from "next/server";
import { getAiredEpisodesForShow } from "@/lib/tmdb";

// Resolves every released episode for a show — used by
// lib/userShows.js's markShowCompleted, for callers (Explore's search
// results) that need to bulk-mark a show watched but only have a
// tmdb_show_id, not full season data already loaded locally the way Show
// Detail has (see ShowDetailClient's markAllSeasonsWatched, which uses its
// own in-memory seasons instead of hitting this route).
export async function GET(request, { params }) {
  const aired = await getAiredEpisodesForShow(params.id);
  return NextResponse.json({ episodes: aired.map(({ season, episode }) => ({ season, episode })) });
}
