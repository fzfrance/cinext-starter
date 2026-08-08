import { NextResponse } from "next/server";
import { getMovieDetails } from "@/lib/tmdb";
import { CAST_GRADIENTS, initialsOf } from "@/lib/theme";

// Fork of app/api/shows/[id]/cast/route.js, one media type over — just
// the cast list (id/role/photo), for callers that need "who's your
// favorite character" voting (MovieRatingScreen) without already having a
// movie's full credits loaded (Highlights' "Rate this Movie" long-press
// rates a movie without ever fetching the rest of it, same reasoning as
// the show route's own docstring).
export async function GET(request, { params }) {
  const movie = await getMovieDetails(params.id);
  const cast = (movie.credits?.cast ?? [])
    .slice(0, 12)
    .map((c, i) => ({
      id: c.id,
      name: c.name,
      role: c.character || "—",
      profilePath: c.profile_path,
      initials: initialsOf(c.name),
      grad: CAST_GRADIENTS[i % CAST_GRADIENTS.length],
    }));
  return NextResponse.json({ cast });
}
