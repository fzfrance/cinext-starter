import { NextResponse } from "next/server";
import { getShowDetails, getEpisodeDetails } from "@/lib/tmdb";
import { CAST_GRADIENTS, initialsOf } from "@/lib/theme";

// GET — episode payload for Home's Continue Watching quick-view overlay
// (same shape EpisodeDetail / the standalone episode page already use).
export async function GET(_request, { params }) {
  const showId = Number(params.id);
  const seasonNumber = Number(params.season);
  const episodeNumber = Number(params.ep);
  if (!showId || !Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)) {
    return NextResponse.json({ error: "Invalid episode" }, { status: 400 });
  }

  const [show, episode] = await Promise.all([
    getShowDetails(showId),
    getEpisodeDetails(showId, seasonNumber, episodeNumber),
  ]);

  const airDate = episode.air_date ? new Date(episode.air_date) : null;
  const daysUntil = airDate ? Math.ceil((airDate.getTime() - Date.now()) / 86400000) : null;

  const cast = (episode.credits?.cast ?? []).slice(0, 12).map((c, i) => ({
    id: c.id,
    name: c.name,
    originalName: c.original_name ?? null,
    role: c.character || "—",
    profilePath: c.profile_path,
    initials: initialsOf(c.name),
    grad: CAST_GRADIENTS[i % CAST_GRADIENTS.length],
    isCast: true,
  }));

  return NextResponse.json({
    showTitle: show.name ?? "",
    episode: {
      n: episode.episode_number,
      title: episode.name ?? "",
      date: episode.air_date ?? "TBA",
      runtime: episode.runtime ?? show.episode_run_time?.[0] ?? "",
      synopsis: episode.overview ?? "",
      posterPath: episode.still_path ?? show.backdrop_path,
      // Home's Continue Watching never queues an unaired episode, so a
      // missing air_date is treated as already aired (null), not TBA.
      // (JSON can't carry Infinity the way the server episode page does.)
      daysUntil: !episode.air_date
        ? null
        : (daysUntil != null && daysUntil > 0 ? daysUntil : null),
    },
    cast,
  });
}
