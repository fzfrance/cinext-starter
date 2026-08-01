import { NextResponse } from "next/server";
import { getShowDetails, getShowImages } from "@/lib/tmdb";

const FIELD_BY_TYPE = { backdrop: "backdrops", poster: "posters", logo: "logos" };

// GET ?type=backdrop|poster|logo — backs Show Detail's Change covers/
// Change poster/Change logo pickers. Fetches the show once (for its
// original_language, which widens the logo results — see
// lib/tmdb.js's getShowImages) and returns just the one requested
// category, sorted best-first by TMDB's own vote_average so the most
// commonly-picked art leads the grid instead of insertion order.
export async function GET(request, { params }) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const field = FIELD_BY_TYPE[type];
  if (!field) return NextResponse.json({ error: "type must be backdrop, poster, or logo" }, { status: 400 });

  const show = await getShowDetails(params.id);
  const images = await getShowImages(params.id, show.original_language);

  const items = (images[field] ?? [])
    .map((img) => ({ filePath: img.file_path, width: img.width, height: img.height, voteAverage: img.vote_average ?? 0 }))
    .sort((a, b) => b.voteAverage - a.voteAverage);

  return NextResponse.json({ items });
}
