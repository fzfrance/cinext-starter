import { NextResponse } from "next/server";
import { getShowDetails, getShowImages, pickBestLogo } from "@/lib/tmdb";

// Batched "best logo per show" lookup for the Library shelf's DVD
// spines/disc + Show Detail's auto title logo — pickBestLogo prefers
// original language, then English, then other readable languages (so a
// non-Thai show doesn't get a Thai market logo just because Thai is readable).
// getShowDetails is already called (and edge-cached for an hour) by
// /api/shows/library-detail for these same ids, so this doesn't add a
// genuine second TMDB hit per show within that window.
async function resolveLogo(id, readableLanguages) {
  try {
    const show = await getShowDetails(id);
    const images = await getShowImages(id, show.original_language, readableLanguages);
    const best = pickBestLogo(images.logos ?? [], readableLanguages, show.original_language);
    return { id, logoPath: best?.file_path ?? null };
  } catch (err) {
    console.error(`Failed to resolve logo for show ${id}:`, err);
    return { id, logoPath: null };
  }
}

export async function POST(request) {
  const { ids, readableLanguages } = await request.json();
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ results: [] });
  const results = await Promise.all(ids.map((id) => resolveLogo(id, readableLanguages ?? [])));
  return NextResponse.json({ results });
}
