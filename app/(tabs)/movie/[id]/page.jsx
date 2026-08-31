import MovieDetailClient from "./MovieDetailClient";
import { getMovieDetails, getMovieRecommendations, getMovieWatchProviders, getLocalizedMovieVideos } from "@/lib/tmdb";
import { CAST_GRADIENTS, initialsOf } from "@/lib/theme";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Same plain calendar-date display as Show Detail's page.jsx (same
// function, copied rather than shared — see that file's own comment on
// why the Y-M-D fields are parsed directly instead of `new Date(dateStr)`).
function formatAirDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

// TMDB's raw movie.status strings, cleaned up for the Details tab's
// Runtime row (only shown when not "Released" — a released movie's status
// isn't interesting to call out next to its runtime).
const STATUS_LABELS = {
  Released: "Released",
  "Post Production": "Post Production",
  "In Production": "In Production",
  Planned: "Upcoming",
  Rumored: "Rumored",
  Canceled: "Cancelled",
};

async function getMovieData(movieId) {
  const movie = await getMovieDetails(movieId);

  const [recommendations, watchProvidersRaw] = await Promise.all([
    // "You May Also Like" is a nice-to-have — degrade to an empty row
    // instead of failing the whole page if it errors (same as Show Detail).
    getMovieRecommendations(movieId).catch(() => ({ results: [] })),
    getMovieWatchProviders(movieId).catch(() => ({ results: {} })),
  ]);

  // Same TH-region mapping as Show Detail's page.jsx — see that file's own
  // comment on why a missing TH entry is the normal case, not an error.
  const providersTH = watchProvidersRaw.results?.TH ?? null;
  const mapProvider = (p) => ({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path });
  const watchProviders = providersTH ? {
    link: providersTH.link,
    flatrate: (providersTH.flatrate ?? []).map(mapProvider),
    rent: (providersTH.rent ?? []).map(mapProvider),
    buy: (providersTH.buy ?? []).map(mapProvider),
  } : null;

  // A movie has one flat cast/crew list (movie.credits, no aggregate_credits
  // equivalent needed — see lib/tmdb.js's getMovieDetails comment). Same
  // shape/cap as Show Detail's castEntries/crewEntries so CastGallery works
  // unchanged: { id, name, role, profilePath, isCast }.
  const rawCast = movie.credits?.cast ?? [];
  const rawCrew = movie.credits?.crew ?? [];
  // TMDB's plain movie credits.cast can (rarely) repeat a person id — e.g.
  // a dual/voice role — so this dedupes by id too, same as crew below,
  // keeping the earliest (best-billed) occurrence.
  const seenCastIds = new Set();
  const castEntries = [...rawCast]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .filter((c) => (seenCastIds.has(c.id) ? false : (seenCastIds.add(c.id), true)))
    .map((c) => ({ id: c.id, name: c.name, role: c.character || c.name, profilePath: c.profile_path, isCast: true }));
  // Unlike a TV show's aggregate_credits (one entry per person, jobs
  // already merged into a `jobs` array), a movie's plain credits.crew has
  // one entry PER (person, job) pair — the same person id repeats once
  // per job they're credited for (e.g. a director who's also a writer).
  // Grouped here by id and every job joined into one line, mirroring how
  // ShowDetailClient's page.jsx merges aggregate_credits' roles — without
  // this, the same crew member rendered as multiple separate cards with
  // duplicate React keys (CastGallery keys on c.id).
  const crewById = new Map();
  for (const c of rawCrew) {
    if (castEntries.some((existing) => existing.id === c.id)) continue;
    const jobs = crewById.get(c.id)?.jobs ?? [];
    crewById.set(c.id, { id: c.id, name: c.name, profilePath: c.profile_path, jobs: [...jobs, c.job].filter(Boolean) });
  }
  const crewEntries = [...crewById.values()].map((c) => ({
    id: c.id,
    name: c.name,
    role: [...new Set(c.jobs)].join(" / ") || "Crew",
    profilePath: c.profilePath,
    isCast: false,
  }));

  const cast = [...castEntries.slice(0, 40), ...crewEntries.slice(0, 20)].map((c, i) => ({
    ...c,
    initials: initialsOf(c.name),
    grad: CAST_GRADIENTS[i % CAST_GRADIENTS.length],
  }));

  const director = rawCrew.filter((c) => c.job === "Director").map((c) => c.name).join(", ") || "—";
  const productionCompany = (movie.production_companies ?? []).map((c) => c.name).join(", ") || "—";

  const genres = (movie.genres ?? []).map((g) => g.name).join(", ");
  const year = movie.release_date ? movie.release_date.slice(0, 4) : "";
  const overview = movie.overview ?? "";

  // Same trailer/bonus-video shaping as Show Detail's page.jsx, verbatim.
  let rawVideos = (movie.videos?.results ?? []).filter((v) => v.site === "YouTube");
  if (rawVideos.length === 0) {
    rawVideos = (await getLocalizedMovieVideos(movieId, movie.original_language)).filter((v) => v.site === "YouTube");
  }
  const BONUS_VIDEO_TYPES = ["Teaser", "Featurette", "Behind the Scenes", "Clip", "Bloopers", "Opening Credits"];
  const trailerVideos = rawVideos.filter((v) => v.type === "Trailer").sort((a, b) => (b.official ? 1 : 0) - (a.official ? 1 : 0));
  const bonusVideos = rawVideos.filter((v) => BONUS_VIDEO_TYPES.includes(v.type));
  const otherVideos = rawVideos.filter((v) => v.type !== "Trailer" && !BONUS_VIDEO_TYPES.includes(v.type));
  const videoList = [...trailerVideos, ...bonusVideos, ...otherVideos].slice(0, 10).map((v) => ({ key: v.key, name: v.name, type: v.type }));

  const similar = (recommendations.results ?? []).slice(0, 12).map((s) => ({
    id: s.id,
    title: s.title,
    originalTitle: s.original_title ?? null,
    originalLanguage: s.original_language ?? null,
    posterPath: s.poster_path,
  }));

  return {
    movie: {
      title: movie.title ?? "",
      // resolveTitle (lib/languages.js) picks between this and title
      // above, client-side, per the signed-in user's Readable Languages —
      // same pattern as Show Detail.
      originalTitle: movie.original_title ?? null,
      originalLanguage: movie.original_language ?? null,
      year,
      genres,
      genresList: (movie.genres ?? []).map((g) => g.name),
      rating: movie.vote_average ? movie.vote_average.toFixed(1) : "",
      voteCount: movie.vote_count ?? 0,
      tagline: movie.tagline ?? "",
      descriptionFull: overview,
      posterPath: movie.poster_path,
      backdropPath: movie.backdrop_path ?? movie.poster_path,
      runtime: movie.runtime ?? null,
      director,
      productionCompany,
      status: movie.status ?? "",
      statusLabel: STATUS_LABELS[movie.status] ?? movie.status ?? "",
      releaseDate: formatAirDate(movie.release_date),
    },
    cast,
    videos: videoList,
    similar,
    watchProviders,
  };
}

export default async function Page({ params }) {
  const { movie, cast, videos, similar, watchProviders } = await getMovieData(params.id);
  return (
    <MovieDetailClient
      movieId={Number(params.id)}
      movie={movie}
      cast={cast}
      videos={videos}
      similar={similar}
      watchProviders={watchProviders}
    />
  );
}
