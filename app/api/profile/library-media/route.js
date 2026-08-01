import { NextResponse } from "next/server";
import { getShowDetails, getShowImages } from "@/lib/tmdb";

// How many of the caller's library shows to actually pool media from, and
// how many backdrops/cast members to take per show — this app has no
// server-side session (no @supabase/ssr), so the caller (Edit Profile)
// passes its own already-fetched library show ids; capped here so a huge
// library can't fan out into dozens of concurrent TMDB requests on every
// picker open.
// Bumped 24 -> 60 — the previous cap was noticeably smaller than a
// typical active user's real library, silently dropping most shows out
// of the artwork/character pool ("a lot seems missing" — the pool was
// never actually broken, just capped well below what people expected).
// TMDB responses are edge-cached for an hour (lib/tmdb.js), so repeat
// picker opens for the same shows don't refire these requests — the real
// cost is only the first, uncached open for a given show.
const MAX_SHOWS = 60;
const MAX_BACKDROPS_PER_SHOW = 3;
const MAX_CAST_PER_SHOW = 6;

// Backs Edit Profile's "Choose Artwork" (background) and "Choose
// Character" (avatar) pickers — real backdrop stills and real cast
// headshots, pooled across the shows already in the caller's library,
// instead of requiring an upload for either.
async function resolveShowMedia(showId) {
  const show = await getShowDetails(showId);
  const images = await getShowImages(showId, show.original_language);
  const showTitle = show.name ?? "";

  const backdrops = (images.backdrops ?? [])
    .slice()
    .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
    .slice(0, MAX_BACKDROPS_PER_SHOW)
    .map((img) => ({ showId, showTitle, filePath: img.file_path }));

  // Requires both a photo AND a real character credit — this backs a
  // "choose a character" picker, captioned by character name (see
  // app/(tabs)/profile/edit/page.jsx), not an actor headshot browser, so
  // an entry with no character attribution (host/self appearances,
  // occasionally a guest credit) can't serve that purpose even though it
  // has a photo.
  const characters = (show.credits?.cast ?? [])
    .filter((c) => c.profile_path && c.character)
    .slice(0, MAX_CAST_PER_SHOW)
    .map((c) => ({ showId, showTitle, personId: c.id, character: c.character, profilePath: c.profile_path }));

  return { backdrops, characters };
}

// POST body: { showIds: number[] }
export async function POST(request) {
  const { showIds = [] } = await request.json();
  const ids = [...new Set(showIds)].slice(0, MAX_SHOWS);
  if (ids.length === 0) return NextResponse.json({ backdrops: [], characters: [] });

  const results = await Promise.all(
    ids.map((id) =>
      resolveShowMedia(id).catch((err) => {
        console.error(`Failed to resolve profile media for show ${id}:`, err);
        return { backdrops: [], characters: [] };
      })
    )
  );

  return NextResponse.json({
    backdrops: results.flatMap((r) => r.backdrops),
    characters: results.flatMap((r) => r.characters),
  });
}
