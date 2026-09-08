import { titleSignalWeight, mediaKeyOf } from "./signals";
import { isSubstantialWatch, confidenceLevel, MIN_LANGUAGE_WATCHED } from "./confidence";

function bump(map, key, amount) {
  if (key == null || key === "" || !Number.isFinite(amount) || amount === 0) return;
  map.set(String(key), (map.get(String(key)) ?? 0) + amount);
}

function bumpCount(map, key) {
  if (key == null || key === "") return;
  map.set(String(key), (map.get(String(key)) ?? 0) + 1);
}

function normalizeMap(map) {
  if (!map.size) return new Map();
  let max = 0;
  for (const v of map.values()) max = Math.max(max, Math.abs(v));
  if (max <= 0) return new Map();
  const out = new Map();
  for (const [k, v] of map) out.set(k, v / max);
  return out;
}

function decadeOf(dateStr) {
  if (!dateStr || dateStr.length < 4) return null;
  const year = Number(dateStr.slice(0, 4));
  if (!Number.isFinite(year) || year < 1900) return null;
  return `${Math.floor(year / 10) * 10}s`;
}

function extractMeta(detail, mediaType) {
  if (!detail) return null;
  const genres = (detail.genres ?? []).map((g) => g.id).filter(Boolean);
  const keywords = mediaType === "movie"
    ? (detail.keywords?.keywords ?? []).map((k) => k.id ?? k.name).filter(Boolean)
    : (detail.keywords?.results ?? detail.keywords?.keywords ?? []).map((k) => k.id ?? k.name).filter(Boolean);
  const language = detail.original_language ?? null;
  const countries = mediaType === "movie"
    ? (detail.production_countries ?? []).map((c) => c.iso_3166_1).filter(Boolean)
    : (detail.origin_country ?? []);
  const cast = (detail.credits?.cast ?? detail.aggregate_credits?.cast ?? []).slice(0, 8);
  const crew = detail.credits?.crew ?? detail.aggregate_credits?.crew ?? [];
  const actors = cast.map((p) => p.id).filter(Boolean);
  const directors = crew
    .filter((p) => p.job === "Director" || p.department === "Directing")
    .slice(0, 4)
    .map((p) => p.id)
    .filter(Boolean);
  const dateStr = mediaType === "movie" ? detail.release_date : detail.first_air_date;
  return {
    id: detail.id,
    mediaType,
    title: mediaType === "movie" ? detail.title : detail.name,
    genres,
    keywords: keywords.map(String),
    language,
    countries,
    actors,
    directors,
    decade: decadeOf(dateStr),
    dateStr: dateStr ?? null,
    voteAverage: detail.vote_average ?? 0,
    voteCount: detail.vote_count ?? 0,
    popularity: detail.popularity ?? 0,
    posterPath: detail.poster_path ?? null,
    backdropPath: detail.backdrop_path ?? null,
    overview: detail.overview ?? "",
  };
}

/**
 * Build normalized 0–1 preference maps from user titles + TMDB seed details.
 * `detailsByKey` maps "tv-123" / "movie-456" → TMDB detail payloads.
 */
export function buildTasteProfile(titles, detailsByKey, now = Date.now()) {
  const genres = new Map();
  const keywords = new Map();
  const languages = new Map();
  const countries = new Map();
  const actors = new Map();
  const directors = new Map();
  const mediaTypes = new Map();
  const decades = new Map();

  const watchedGenreCounts = new Map();
  const watchedLanguageCounts = new Map();
  const watchedGenreLanguageCounts = new Map();

  const exclude = new Set();
  const watched = new Set();
  const notInterested = new Set();
  const positiveSeeds = [];
  let watchedTitleCount = 0;

  for (const title of titles ?? []) {
    const key = mediaKeyOf(title);
    const { weight } = titleSignalWeight(title, now);
    const substantial = isSubstantialWatch(title);
    if (title.notInterested) notInterested.add(key);
    if (substantial || title.status === "completed" || (title.progress ?? 0) > 0.15 || title.status === "watching") {
      watched.add(key);
    }
    if (title.status) exclude.add(key);
    if (title.notInterested) exclude.add(key);

    const detail = detailsByKey.get(key);
    const meta = extractMeta(detail, title.mediaType);
    if (!meta) continue;

    if (substantial) {
      watchedTitleCount += 1;
      for (const g of meta.genres) {
        bumpCount(watchedGenreCounts, g);
        if (meta.language) bumpCount(watchedGenreLanguageCounts, `${meta.language}|${g}`);
      }
      bumpCount(watchedLanguageCounts, meta.language);
    }

    if (weight === 0) continue;

    bump(mediaTypes, title.mediaType, weight);
    for (const g of meta.genres) bump(genres, g, weight);
    for (const k of meta.keywords) bump(keywords, k, weight);
    bump(languages, meta.language, weight);
    for (const c of meta.countries) bump(countries, c, weight);
    for (const a of meta.actors) bump(actors, a, weight * 0.85);
    for (const d of meta.directors) bump(directors, d, weight);
    bump(decades, meta.decade, weight);

    if (weight > 0 && substantial) {
      positiveSeeds.push({
        key,
        weight,
        id: title.id,
        mediaType: title.mediaType,
        title: meta.title,
        genres: meta.genres,
        language: meta.language,
        actors: meta.actors.slice(0, 3),
        directors: meta.directors.slice(0, 2),
      });
    }
  }

  positiveSeeds.sort((a, b) => b.weight - a.weight);

  const genreConfidence = new Map(
    [...watchedGenreCounts.entries()].map(([id, n]) => [id, confidenceLevel(n)])
  );
  const languageConfidence = new Map(
    [...watchedLanguageCounts.entries()].map(([id, n]) => [id, confidenceLevel(n)])
  );

  return {
    genres: normalizeMap(genres),
    keywords: normalizeMap(keywords),
    languages: normalizeMap(languages),
    countries: normalizeMap(countries),
    actors: normalizeMap(actors),
    directors: normalizeMap(directors),
    mediaTypes: normalizeMap(mediaTypes),
    decades: normalizeMap(decades),
    exclude,
    watched,
    notInterested,
    positiveSeeds: positiveSeeds.slice(0, 12),
    topGenres: [...normalizeMap(genres).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => Number(id) || id),
    topLanguages: [...normalizeMap(languages).entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id),
    topActors: [...normalizeMap(actors).entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => Number(id)),
    topDirectors: [...normalizeMap(directors).entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => Number(id)),
    watchedTitleCount,
    watchedGenreCounts,
    watchedLanguageCounts,
    watchedGenreLanguageCounts,
    genreConfidence,
    languageConfidence,
    overallConfidence: confidenceLevel(watchedTitleCount),
    canPersonalizeLanguage: (lang) => (watchedLanguageCounts.get(String(lang)) ?? 0) >= MIN_LANGUAGE_WATCHED,
  };
}

export { extractMeta, decadeOf };
