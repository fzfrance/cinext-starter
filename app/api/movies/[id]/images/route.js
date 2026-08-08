import { NextResponse } from "next/server";
import { getMovieDetails, getMovieImages } from "@/lib/tmdb";

const FIELD_BY_TYPE = { backdrop: "backdrops", poster: "posters", logo: "logos" };

// Fork of app/api/shows/[id]/images/route.js, one media type over — GET
// ?type=backdrop|poster|logo backs Movie Detail's Change covers/Change
// poster/Change logo pickers. getMovieImages already mirrors
// getShowImages exactly (same include_image_language widening).
export async function GET(request, { params }) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const field = FIELD_BY_TYPE[type];
  if (!field) return NextResponse.json({ error: "type must be backdrop, poster, or logo" }, { status: 400 });

  const movie = await getMovieDetails(params.id);
  const images = await getMovieImages(params.id, movie.original_language);

  const items = (images[field] ?? [])
    .map((img) => ({ filePath: img.file_path, width: img.width, height: img.height, voteAverage: img.vote_average ?? 0 }))
    .sort((a, b) => b.voteAverage - a.voteAverage);

  return NextResponse.json({ items });
}
