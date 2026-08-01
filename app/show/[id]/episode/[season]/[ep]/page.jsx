import EpisodeDetailClient from "./EpisodeDetailClient";
import { getShowDetails, getEpisodeDetails } from "@/lib/tmdb";
import { CAST_GRADIENTS, initialsOf } from "@/lib/theme";

async function getEpisodeData(showId, seasonNumber, episodeNumber) {
  const [show, episode] = await Promise.all([
    getShowDetails(showId),
    getEpisodeDetails(showId, seasonNumber, episodeNumber),
  ]);

  const airDate = episode.air_date ? new Date(episode.air_date) : null;
  const daysUntil = airDate ? Math.ceil((airDate.getTime() - Date.now()) / 86400000) : null;

  const cast = (episode.credits?.cast ?? []).slice(0, 12).map((c, i) => ({
    id: c.id,
    name: c.name,
    role: c.character || "—",
    profilePath: c.profile_path,
    initials: initialsOf(c.name),
    grad: CAST_GRADIENTS[i % CAST_GRADIENTS.length],
  }));

  return {
    showTitle: show.name ?? "",
    episode: {
      n: episode.episode_number,
      title: episode.name ?? "",
      date: episode.air_date ?? "TBA",
      runtime: episode.runtime ?? show.episode_run_time?.[0] ?? "",
      synopsis: episode.overview ?? "",
      posterPath: episode.still_path ?? show.backdrop_path,
      daysUntil: daysUntil != null && daysUntil > 0 ? daysUntil : null,
    },
    cast,
  };
}

export default async function Page({ params }) {
  const { showTitle, episode, cast } = await getEpisodeData(params.id, params.season, params.ep);
  return (
    <EpisodeDetailClient
      showId={Number(params.id)}
      showTitle={showTitle}
      seasonNumber={Number(params.season)}
      episode={episode}
      cast={cast}
    />
  );
}
