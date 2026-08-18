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
      // Infinity, not null, when there's no air_date at all — see
      // app/(tabs)/show/[id]/page.jsx's identical comment (same
      // TMDB-placeholder-episode reasoning). Not expected to actually be
      // hit on this route today (only reachable via Home's Continue
      // Watching hero, which never queues an unaired episode), but this
      // stays consistent with every other daysUntil computation in the
      // app rather than being the one place still treating "no date at
      // all" as "already aired."
      daysUntil: !episode.air_date ? Infinity : (daysUntil != null && daysUntil > 0 ? daysUntil : null),
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
