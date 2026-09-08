import {
  getShowDetails,
  getMovieDetails,
  getShowRecommendations,
  getMovieRecommendations,
  discoverShowsForTaste,
  discoverMoviesForTaste,
  discoverShowsByGenre,
  discoverMoviesByGenre,
  discoverNewReleasesByGenre,
  discoverNewMovieReleasesByGenre,
  trendingShows,
  trendingMovies,
  getGenres,
  getMovieGenres,
  isExcludedShow,
  isExcludedMovie,
} from "@/lib/tmdb";
import { mediaKey } from "@/lib/media";
import { buildTasteProfile, extractMeta } from "./tasteProfile";
import { scoreCandidate } from "./score";
import { assembleForYou, assembleHero, assembleExploreSections } from "./assemble";
import { titleSignalWeight } from "./signals";

function toCandidateFromListItem(raw, mediaType, extras = {}) {
  const excluded = mediaType === "movie" ? isExcludedMovie(raw) : isExcludedShow(raw);
  if (excluded) return null;
  return {
    id: raw.id,
    mediaType,
    title: mediaType === "movie" ? raw.title : raw.name,
    originalTitle: mediaType === "movie" ? raw.original_title : raw.original_name,
    originalLanguage: raw.original_language ?? null,
    language: raw.original_language ?? null,
    genreIds: raw.genre_ids ?? [],
    keywordIds: extras.keywordIds ?? [],
    countries: raw.origin_country ?? extras.countries ?? [],
    actorIds: extras.actorIds ?? [],
    directorIds: extras.directorIds ?? [],
    dateStr: mediaType === "movie" ? raw.release_date : raw.first_air_date,
    voteAverage: raw.vote_average ?? 0,
    voteCount: raw.vote_count ?? 0,
    popularity: raw.popularity ?? 0,
    posterPath: raw.poster_path ?? null,
    backdropPath: raw.backdrop_path ?? null,
    overview: raw.overview ?? "",
  };
}

function toCandidateFromMeta(meta) {
  if (!meta?.id) return null;
  return {
    id: meta.id,
    mediaType: meta.mediaType,
    title: meta.title,
    originalTitle: meta.title,
    originalLanguage: meta.language,
    language: meta.language,
    genreIds: meta.genres,
    keywordIds: meta.keywords,
    countries: meta.countries,
    actorIds: meta.actors,
    directorIds: meta.directors,
    dateStr: meta.dateStr,
    voteAverage: meta.voteAverage,
    voteCount: meta.voteCount,
    popularity: meta.popularity,
    posterPath: meta.posterPath,
    backdropPath: meta.backdropPath,
    overview: meta.overview,
  };
}

function shapeOut(item) {
  const year = item.dateStr ? String(item.dateStr).slice(0, 4) : "";
  return {
    id: item.id,
    mediaType: item.mediaType,
    title: item.title,
    originalTitle: item.originalTitle ?? item.title,
    originalLanguage: item.language,
    genre: "",
    meta: year,
    date: item.dateStr ?? "",
    year,
    overview: item.overview ?? "",
    rating: item.voteAverage ? Number(item.voteAverage).toFixed(1) : "",
    posterPath: item.posterPath,
    backdropPath: item.backdropPath ?? item.posterPath,
    mode: item.mode || "recommended",
    score: item.score,
  };
}

async function loadSeedDetails(titles) {
  const ranked = [...titles]
    .map((t) => ({ t, w: titleSignalWeight(t).weight }))
    .sort((a, b) => b.w - a.w)
    .slice(0, 16)
    .map((x) => x.t);

  const detailsByKey = new Map();
  await Promise.all(ranked.map(async (title) => {
    try {
      const detail = title.mediaType === "movie"
        ? await getMovieDetails(title.id)
        : await getShowDetails(title.id);
      detailsByKey.set(mediaKey(title), detail);
    } catch {
      /* skip broken ids */
    }
  }));
  return detailsByKey;
}

async function gatherCandidates(profile) {
  const byKey = new Map();
  const add = (cand, discoveryBonus = 0) => {
    if (!cand?.id) return;
    const key = mediaKey(cand);
    if (byKey.has(key)) {
      const prev = byKey.get(key);
      prev._discoveryBonus = Math.max(prev._discoveryBonus ?? 0, discoveryBonus);
      return;
    }
    byKey.set(key, { ...cand, _discoveryBonus: discoveryBonus });
  };

  const jobs = [];

  // Similar-to-seeds
  for (const seed of profile.positiveSeeds.slice(0, 8)) {
    jobs.push(
      (seed.mediaType === "movie" ? getMovieRecommendations(seed.id) : getShowRecommendations(seed.id))
        .then((page) => {
          for (const raw of page.results ?? []) {
            add(toCandidateFromListItem(raw, seed.mediaType), 0.85);
          }
        })
        .catch(() => {})
    );
  }

  // Genre × language taste discovers
  for (const genreId of profile.topGenres.slice(0, 4)) {
    for (const language of profile.topLanguages.slice(0, 2)) {
      jobs.push(
        discoverShowsForTaste({ genreId, language }).then((p) => {
          for (const raw of p.results ?? []) add(toCandidateFromListItem(raw, "tv"), 0.35);
        }).catch(() => {})
      );
      jobs.push(
        discoverMoviesForTaste({ genreId, language }).then((p) => {
          for (const raw of p.results ?? []) add(toCandidateFromListItem(raw, "movie"), 0.35);
        }).catch(() => {})
      );
    }
    jobs.push(
      discoverShowsByGenre(genreId).then((p) => {
        for (const raw of p.results ?? []) add(toCandidateFromListItem(raw, "tv"), 0.2);
      }).catch(() => {})
    );
    jobs.push(
      discoverMoviesByGenre(genreId).then((p) => {
        for (const raw of p.results ?? []) add(toCandidateFromListItem(raw, "movie"), 0.2);
      }).catch(() => {})
    );
    jobs.push(
      discoverNewReleasesByGenre(genreId).then((p) => {
        for (const raw of p.results ?? []) add(toCandidateFromListItem(raw, "tv"), 0.45);
      }).catch(() => {})
    );
    jobs.push(
      discoverNewMovieReleasesByGenre(genreId).then((p) => {
        for (const raw of p.results ?? []) add(toCandidateFromListItem(raw, "movie"), 0.45);
      }).catch(() => {})
    );
  }

  jobs.push(
    trendingShows("week").then((p) => {
      for (const raw of p.results ?? []) add(toCandidateFromListItem(raw, "tv"), 0.55);
    }).catch(() => {}),
    trendingMovies("week").then((p) => {
      for (const raw of p.results ?? []) add(toCandidateFromListItem(raw, "movie"), 0.55);
    }).catch(() => {})
  );

  await Promise.all(jobs);
  return [...byKey.values()];
}

/**
 * Full recommendation run from client-provided title signals + impressions.
 */
export async function runRecommendationEngine({ titles = [], impressions = [] }) {
  if (!titles.length) {
    return { forYou: { tvItems: [], movieItems: [], items: [] }, hero: [], sections: [], profile: null };
  }

  const detailsByKey = await loadSeedDetails(titles);
  const profile = buildTasteProfile(titles, detailsByKey);

  // Enrich seed metas into candidate map for people/keyword scoring on similar titles
  for (const [key, detail] of detailsByKey) {
    const mediaType = key.startsWith("movie-") ? "movie" : "tv";
    const meta = extractMeta(detail, mediaType);
    // no-op keep for profile seeds only
    void meta;
  }

  const candidates = await gatherCandidates(profile);

  // Optionally enrich top candidates with credits/keywords (bounded)
  const topForEnrich = [...candidates]
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, 24);

  await Promise.all(topForEnrich.map(async (cand) => {
    try {
      const detail = cand.mediaType === "movie"
        ? await getMovieDetails(cand.id)
        : await getShowDetails(cand.id);
      const meta = extractMeta(detail, cand.mediaType);
      const enriched = toCandidateFromMeta(meta);
      if (!enriched) return;
      Object.assign(cand, {
        keywordIds: enriched.keywordIds,
        actorIds: enriched.actorIds,
        directorIds: enriched.directorIds,
        countries: enriched.countries?.length ? enriched.countries : cand.countries,
        backdropPath: enriched.backdropPath || cand.backdropPath,
        voteCount: enriched.voteCount || cand.voteCount,
      });
    } catch {
      /* keep list-level candidate */
    }
  }));

  const scored = candidates.map((cand) => {
    const result = scoreCandidate(cand, profile, {
      impressions,
      discoveryBonus: cand._discoveryBonus ?? 0,
    });
    return {
      ...cand,
      ...result,
      key: result.key,
    };
  });

  const [{ genres: tvGenres }, { genres: movieGenres }] = await Promise.all([getGenres(), getMovieGenres()]);
  const genreNames = new Map([
    ...tvGenres.map((g) => [g.id, g.name]),
    ...movieGenres.map((g) => [g.id, g.name]),
  ]);

  const forYouMixed = assembleForYou(scored, { limit: 40 }).map(shapeOut);
  const tvItems = forYouMixed.filter((i) => i.mediaType === "tv");
  const movieItems = forYouMixed.filter((i) => i.mediaType === "movie");

  const hero = assembleHero(scored, profile, { impressions, limit: 5 }).map((item) => ({
    ...shapeOut(item),
    posterPath: item.backdropPath || item.posterPath,
    mode: "recommended",
  }));

  const sections = assembleExploreSections(scored, profile, { genreNames }).map((section) => ({
    ...section,
    items: section.items.map(shapeOut),
  }));

  return {
    forYou: { items: forYouMixed, tvItems, movieItems },
    hero,
    sections,
    profile: {
      topGenres: profile.topGenres,
      topLanguages: profile.topLanguages,
      seedTitles: profile.positiveSeeds.map((s) => ({ key: s.key, title: s.title, mediaType: s.mediaType, id: s.id })),
    },
  };
}
