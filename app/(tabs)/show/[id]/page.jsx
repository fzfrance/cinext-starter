import ShowDetailClient from "./ShowDetailClient";
import { getShowDetails, getSeasonDetails, getShowRecommendations, getWatchProviders } from "@/lib/tmdb";
import { CAST_GRADIENTS, initialsOf } from "@/lib/theme";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Plain calendar-date display, not a countdown — parsing the Y-M-D
// fields directly (not `new Date(dateStr)`, which treats the bare date
// as UTC midnight) avoids the same off-by-one-day risk this app's other
// air-date handling (lib/tmdb.js's getAiredEpisodesForShow, Home's
// Upcoming countdown) is already careful about, even though there's no
// "today" comparison here to actually shift.
function formatAirDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

// TMDB's raw show.status strings, cleaned up for display next to the
// season/episode count (e.g. "3 Seasons · 24 Episodes · Returning").
const STATUS_LABELS = {
  "Returning Series": "Returning",
  Ended: "Ended",
  Canceled: "Cancelled",
  "In Production": "In Production",
  Planned: "Upcoming",
  Pilot: "Pilot",
};

async function getShowData(showId) {
  const show = await getShowDetails(showId);

  // season_number 0 is TMDB's "Specials" bucket — now included (some
  // shows, e.g. behind-the-scenes/bonus content, genuinely have real
  // episodes there), appended AFTER every real numbered season rather
  // than sorted to the front by its literal 0 — Specials conventionally
  // reads as a bonus extra tacked on at the end, not "before Season 1".
  const realSeasonNumbers = (show.seasons ?? [])
    .map((s) => s.season_number)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const hasSpecials = (show.seasons ?? []).some((s) => s.season_number === 0);
  const seasonNumbers = hasSpecials ? [...realSeasonNumbers, 0] : realSeasonNumbers;

  // TMDB's own show.type ("Scripted", "Miniseries", "Documentary", etc.)
  // — a real one-and-done limited series, not just any show that
  // currently happens to have one season out (a new ongoing series not
  // yet renewed shouldn't be mislabeled this way, hence gating on TMDB's
  // own type rather than seasonNumbers.length alone). Based on
  // realSeasonNumbers specifically — a miniseries that also happens to
  // have a Specials bucket is still a one-season miniseries, not a
  // "2 season" show.
  const isLimitedSeries = show.type === "Miniseries" && realSeasonNumbers.length === 1;

  const [seasonDetails, recommendations, watchProvidersRaw] = await Promise.all([
    Promise.all(seasonNumbers.map((n) => getSeasonDetails(showId, n))),
    // "You May Also Like" is a nice-to-have, not core to the page — degrade
    // to an empty row instead of failing the whole show page if it errors.
    getShowRecommendations(showId).catch(() => ({ results: [] })),
    // Same degrade-gracefully treatment — Details tab's "Where to
    // Watch" just shows its own "not available" state if this fails.
    getWatchProviders(showId).catch(() => ({ results: {} })),
  ]);

  // Thailand specifically, per the Details tab's requirements — TMDB's
  // watch-providers data is grouped by region and most shows simply
  // don't have a TH entry, which is the normal/expected case, not an
  // error.
  const providersTH = watchProvidersRaw.results?.TH ?? null;
  const mapProvider = (p) => ({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path });
  const watchProviders = providersTH ? {
    link: providersTH.link,
    flatrate: (providersTH.flatrate ?? []).map(mapProvider),
    rent: (providersTH.rent ?? []).map(mapProvider),
    buy: (providersTH.buy ?? []).map(mapProvider),
  } : null;

  const seasons = seasonDetails.map((season) => ({
    id: season.season_number,
    // "Limited Series" instead of TMDB's own "Season 1" for real
    // miniseries — every downstream consumer (SeasonBanner,
    // SeasonRatingScreen, ShareRatingCard, the Episodes tab accordion)
    // reads this same `.title` field, so overriding it once here at the
    // source covers all of them without touching each individually.
    // Never applies to Specials (season 0) — a miniseries's one real
    // season becomes "Limited Series", but its Specials bucket would
    // otherwise inherit that exact same label too, reading as a second
    // identical "Limited Series" card with no way to tell them apart.
    title: season.season_number === 0 ? "Specials" : isLimitedSeries ? "Limited Series" : season.name,
    posterPath: season.poster_path ?? show.poster_path,
    episodes: (season.episodes ?? []).map((ep) => {
      const airDate = ep.air_date ? new Date(ep.air_date) : null;
      const daysUntil = airDate ? Math.ceil((airDate.getTime() - Date.now()) / 86400000) : null;
      return {
        n: ep.episode_number,
        title: ep.name,
        date: ep.air_date ?? "TBA",
        runtime: ep.runtime ?? show.episode_run_time?.[0] ?? "",
        synopsis: ep.overview,
        // Older or sparsely maintained TMDB records often have no
        // episode-specific stills. Keep episode cards, quick view, and the
        // rating flow visually useful by falling back to the show's backdrop.
        posterPath: ep.still_path ?? show.backdrop_path,
        // watched/watchCount/myRating are seeded client-side from
        // episode_watches once the signed-in user is known; skipped from
        // episode_skips the same way.
        watched: false,
        watchCount: 0,
        skipped: false,
        myRating: null,
        // Infinity, not null, for an episode with NO air_date at all —
        // TMDB creates a placeholder ("Season N, Episode 1", null
        // air_date) the moment a show is renewed for a season that
        // hasn't actually been scheduled yet (confirmed against the API
        // for show 233347/"Moving", renewed for a still-unscheduled
        // Season 2). Every consumer of daysUntil in this app (this
        // file's own render, ShowDetailClient's completion math/gap
        // detection/bulk-mark-watched, EpisodeDetail's disabled-button
        // check) treats `daysUntil == null` as "this has genuinely
        // aired, go mark it watched" — that must never be true for a
        // stub with no real date, or the show could never reach
        // "completed" even after every actually-released episode is
        // watched, since this phantom episode can never be marked done.
        // Infinity satisfies every `!= null` check the same way a real
        // future daysUntil already does, without a second "and does it
        // actually have a date" condition needed at each call site — the
        // one place that DOES need to tell the two apart (the "N DAYS"
        // countdown chip below) special-cases it directly.
        daysUntil: !ep.air_date ? Infinity : (daysUntil != null && daysUntil > 0 ? daysUntil : null),
      };
    }),
  }));

  // "Cast & Crew" tab (and the season/episode rating "favorite character"
  // pickers) need the full ensemble — aggregate_credits (not plain
  // credits) merges each person's appearances across EVERY season/episode
  // into one entry with a `roles` array, since TMDB's plain `credits` on a
  // TV show only reflects whoever's billed on the latest season, silently
  // dropping most earlier-season regulars from every cast-picking UI in
  // the app. Sorted by total_episode_count (falls back to plain credits'
  // flat shape when aggregate_credits is unavailable for some reason) so
  // a one-episode guest never bumps a multi-season regular out of the
  // capped list below. Crew members who are also cast (rare, but happens
  // — e.g. an actor who also created the show) are deduped in favor of
  // their cast entry so they show a character, not a job title.
  const aggCast = show.aggregate_credits?.cast ?? show.credits?.cast ?? [];
  const aggCrew = show.aggregate_credits?.crew ?? show.credits?.crew ?? [];
  const castEntries = [...aggCast]
    .sort((a, b) => (b.total_episode_count ?? 0) - (a.total_episode_count ?? 0))
    .map((c) => {
      const roleNames = [...new Set((c.roles ?? []).map((r) => r.character).filter(Boolean))];
      // Actor's own name, not "—", when TMDB has no character name at all
      // (e.g. a "Self" appearance) — an empty-looking dash read as a
      // broken/missing entry rather than a deliberate fallback.
      const role = roleNames.length > 0 ? roleNames.join(" / ") : (c.character || c.name);
      return { id: c.id, name: c.name, role, profilePath: c.profile_path, isCast: true };
    });
  const crewEntries = aggCrew
    .filter((c) => !castEntries.some((existing) => existing.id === c.id))
    .map((c) => {
      const jobNames = [...new Set((c.jobs ?? []).map((j) => j.job).filter(Boolean))];
      const role = jobNames.length > 0 ? jobNames.join(" / ") : (c.job || c.department || "Crew");
      return { id: c.id, name: c.name, role, profilePath: c.profile_path, isCast: false };
    });

  // Tapping a cast/crew row navigates to /person/[id], which fetches its
  // own bio/birthday/birthplace/filmography — not fetched here, which
  // would mean N extra TMDB requests on every show page load for details
  // most visitors never open. Capped generously (was 12 combined, which
  // starved the rating pickers of real main characters) rather than left
  // uncapped — a long-running ensemble show can have 100+ credited people,
  // most of them one-line background/guest roles nobody needs to scroll
  // past just to rate their favorite character.
  const cast = [...castEntries.slice(0, 40), ...crewEntries.slice(0, 20)].map((c, i) => ({
    ...c,
    initials: initialsOf(c.name),
    grad: CAST_GRADIENTS[i % CAST_GRADIENTS.length],
  }));

  const genres = (show.genres ?? []).map((g) => g.name).join(", ");
  const startYear = show.first_air_date ? show.first_air_date.slice(0, 4) : "";
  const endYear = show.last_air_date ? show.last_air_date.slice(0, 4) : "";
  const yearsRange = endYear && endYear !== startYear ? `${startYear}–${endYear}` : startYear;
  const overview = show.overview ?? "";

  // Every playable YouTube video TMDB has for this show — not just one
  // trailer (plenty of shows have several, or none at all under "Trailer"
  // specifically but do have other real promotional content). Trailers
  // lead (official ones first), followed by teasers/featurettes/behind-
  // the-scenes/clips/bloopers as "bonus" content — TMDB has no literal
  // "Interview" type, but Featurette is the closest general bucket and
  // plenty of real interview videos get tagged that way. Capped at 10
  // total so an unusually video-heavy show doesn't produce an endless list.
  const rawVideos = (show.videos?.results ?? []).filter((v) => v.site === "YouTube");
  const BONUS_VIDEO_TYPES = ["Teaser", "Featurette", "Behind the Scenes", "Clip", "Bloopers", "Opening Credits"];
  const trailerVideos = rawVideos.filter((v) => v.type === "Trailer").sort((a, b) => (b.official ? 1 : 0) - (a.official ? 1 : 0));
  const bonusVideos = rawVideos.filter((v) => BONUS_VIDEO_TYPES.includes(v.type));
  const videoList = [...trailerVideos, ...bonusVideos].slice(0, 10).map((v) => ({ key: v.key, name: v.name, type: v.type }));

  const similar = (recommendations.results ?? []).slice(0, 12).map((s) => ({
    id: s.id,
    title: s.name,
    originalTitle: s.original_name ?? null,
    originalLanguage: s.original_language ?? null,
    posterPath: s.poster_path,
  }));

  return {
    show: {
      title: show.name ?? "",
      // resolveTitle (lib/languages.js) picks between this and title
      // above, client-side, per the signed-in user's Readable Languages.
      originalTitle: show.original_name ?? null,
      originalLanguage: show.original_language ?? null,
      yearsRange,
      genres,
      // Array form, for the Details tab's genre chips — `genres` above
      // stays a joined string since other spots (the tagline-adjacent
      // meta line) already read it that way.
      genresList: (show.genres ?? []).map((g) => g.name),
      rating: show.vote_average ? show.vote_average.toFixed(1) : "",
      voteCount: show.vote_count ?? 0,
      tagline: show.tagline ?? "",
      descriptionFull: overview,
      posterPath: show.poster_path,
      backdropPath: show.backdrop_path ?? show.poster_path,
      creator: (show.created_by ?? []).map((p) => p.name).join(", ") || "—",
      network: (show.networks ?? []).map((n) => n.name).join(", ") || "—",
      // realSeasonNumbers, not the Specials-inclusive seasonNumbers — matches
      // both TMDB's own number_of_seasons (which never counts Specials) and
      // episodeCount right below (show.number_of_episodes, also
      // Specials-exclusive), so "X Seasons · Y Episodes" stays internally
      // consistent instead of a bumped season count with no matching bump
      // in the episode count next to it.
      seasonsCount: realSeasonNumbers.length,
      episodeCount: show.number_of_episodes ?? null,
      status: show.status ?? "",
      statusLabel: STATUS_LABELS[show.status] ?? show.status ?? "",
      firstAirDate: formatAirDate(show.first_air_date),
    },
    seasons,
    cast,
    videos: videoList,
    similar,
    watchProviders,
  };
}

export default async function Page({ params }) {
  const { show, seasons, cast, videos, similar, watchProviders } = await getShowData(params.id);
  return (
    <ShowDetailClient
      showId={Number(params.id)}
      show={show}
      initialSeasons={seasons}
      cast={cast}
      videos={videos}
      similar={similar}
      watchProviders={watchProviders}
    />
  );
}
