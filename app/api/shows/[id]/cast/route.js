import { NextResponse } from "next/server";
import { getShowDetails } from "@/lib/tmdb";
import { CAST_GRADIENTS, initialsOf } from "@/lib/theme";

// GET — just the cast list (id/name/character/photo), for callers that
// need "who's your favorite character" voting (EpisodeRatingFlow /
// SeasonRatingScreen) but don't already have a show's full credits loaded
// the way Show Detail does (Home's hero Watch button, Highlights' rating
// flow — both rate an episode without ever fetching the rest of the
// show). Same shape/derivation as ShowDetailClient's own cast array
// (initials/grad computed the same way) so both feed the same voting UI
// consistently, just via a lighter on-demand call instead of the full
// show-detail payload this show may never otherwise need.
export async function GET(request, { params }) {
  const show = await getShowDetails(params.id);
  const cast = (show.credits?.cast ?? [])
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
