import { NextResponse } from "next/server";
import {
  getShowDetails,
  getMovieDetails,
  getLocalizedShowVideos,
  getLocalizedMovieVideos,
  pickPlayableTrailerKey,
} from "@/lib/tmdb";

// GET ?mediaType=tv|movie&id= — YouTube key for Explore desktop hero autoplay.
// Only returns a key that still resolves on YouTube (Trailer/Teaser).
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
      return NextResponse.json({ key: await pickPlayableTrailerKey(videos) });
    }

    const movie = await getMovieDetails(id);
    let videos = movie?.videos?.results ?? [];
    if (videos.length === 0) {
      videos = await getLocalizedMovieVideos(id, movie?.original_language);
    }
    return NextResponse.json({ key: await pickPlayableTrailerKey(videos) });
  } catch {
    return NextResponse.json({ key: null });
  }
}
