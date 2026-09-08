import { NextResponse } from "next/server";
import {
  getShowDetails,
  getMovieDetails,
  getLocalizedShowVideos,
  getLocalizedMovieVideos,
} from "@/lib/tmdb";

function pickTrailerKey(videos) {
  const youtube = (videos ?? []).filter((v) => v?.site === "YouTube" && v?.key);
  if (youtube.length === 0) return null;
  const trailers = youtube
    .filter((v) => v.type === "Trailer")
    .sort((a, b) => (b.official ? 1 : 0) - (a.official ? 1 : 0));
  const teaser = youtube.find((v) => v.type === "Teaser");
  return (trailers[0] || teaser || youtube[0])?.key ?? null;
}

// GET ?mediaType=tv|movie&id= — YouTube key for Explore desktop hero autoplay.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mediaType = searchParams.get("mediaType");
  const id = Number(searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  if (mediaType !== "tv" && mediaType !== "movie") {
    return NextResponse.json({ error: "mediaType must be tv or movie" }, { status: 400 });
  }

  try {
    if (mediaType === "tv") {
      const show = await getShowDetails(id);
      let videos = show?.videos?.results ?? [];
      if (videos.length === 0) {
        videos = await getLocalizedShowVideos(id, show?.original_language);
      }
      return NextResponse.json({ key: pickTrailerKey(videos) });
    }

    const movie = await getMovieDetails(id);
    let videos = movie?.videos?.results ?? [];
    if (videos.length === 0) {
      videos = await getLocalizedMovieVideos(id, movie?.original_language);
    }
    return NextResponse.json({ key: pickTrailerKey(videos) });
  } catch {
    return NextResponse.json({ key: null });
  }
}
