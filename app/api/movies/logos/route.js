import { NextResponse } from "next/server";
import { getMovieDetails, getMovieImages, pickBestLogo } from "@/lib/tmdb";

// Mirrors app/api/shows/logos/route.js exactly, one media type over —
// see that file's own comment for the full reasoning (pickBestLogo
// matches the caller's Readable Languages instead of TMDB's raw
// highest-voted logo).
async function resolveLogo(id, readableLanguages) {
  try {
    const movie = await getMovieDetails(id);
    const images = await getMovieImages(id, movie.original_language, readableLanguages);
    const best = pickBestLogo(images.logos ?? [], readableLanguages, movie.original_language);
    return { id, logoPath: best?.file_path ?? null };
  } catch (err) {
    console.error(`Failed to resolve logo for movie ${id}:`, err);
    return { id, logoPath: null };
  }
}

export async function POST(request) {
  const { ids, readableLanguages } = await request.json();
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ results: [] });
  const results = await Promise.all(ids.map((id) => resolveLogo(id, readableLanguages ?? [])));
  return NextResponse.json({ results });
}
