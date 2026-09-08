import {
  SCORE_WEIGHTS,
  HERO_RANK,
  MIN_VOTE_COUNT,
  MIN_HERO_VOTE_COUNT,
  MIN_HERO_SCORE,
  IMPRESSION_PENALTY_DAYS,
  HERO_IMPRESSION_DAYS,
} from "./constants";
import { decadeOf } from "./tasteProfile";
import { mediaKeyOf } from "./signals";

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function avgPref(map, keys) {
  if (!keys?.length || !map?.size) return 0;
  let sum = 0;
  let n = 0;
  for (const k of keys) {
    const v = map.get(String(k));
    if (v == null) continue;
    sum += Math.max(0, v);
    n += 1;
  }
  return n ? sum / n : 0;
}

function maxPref(map, keys) {
  if (!keys?.length || !map?.size) return 0;
  let m = 0;
  for (const k of keys) m = Math.max(m, Math.max(0, map.get(String(k)) ?? 0));
  return m;
}

function ratingConfidence(voteAverage, voteCount) {
  const votes = clamp01(Math.log10((voteCount || 0) + 1) / 4); // ~10k votes → 1
  const stars = clamp01((voteAverage || 0) / 10);
  return stars * 0.55 + votes * 0.45;
}

function popularityNorm(popularity) {
  return clamp01(Math.log10((popularity || 0) + 1) / 3);
}

function releaseRecencyScore(dateStr, now = Date.now()) {
  if (!dateStr) return 0.35;
  const t = Date.parse(dateStr);
  if (!Number.isFinite(t)) return 0.35;
  const ageDays = Math.max(0, (now - t) / (24 * 60 * 60 * 1000));
  if (ageDays < 30) return 1;
  if (ageDays < 180) return 0.85;
  if (ageDays < 365) return 0.65;
  if (ageDays < 365 * 3) return 0.45;
  return 0.25;
}

function impressionPenalty(key, impressions, days, now = Date.now()) {
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const hits = (impressions ?? []).filter((i) => i.key === key && (i.at ?? 0) >= cutoff);
  if (!hits.length) return 0;
  return Math.min(0.45, hits.length * 0.12);
}

/**
 * Candidate must include: id, mediaType, genreIds, keywordIds?, language,
 * countries?, actorIds?, directorIds?, dateStr, voteAverage, voteCount,
 * popularity, posterPath, backdropPath?, title, overview?
 */
export function scoreCandidate(candidate, profile, { impressions = [], now = Date.now(), discoveryBonus = 0 } = {}) {
  const key = mediaKeyOf(candidate);
  if (profile.exclude.has(key) || profile.notInterested.has(key) || profile.watched.has(key)) {
    return { key, score: -1, parts: {}, excluded: true };
  }

  const genre = avgPref(profile.genres, candidate.genreIds);
  const keyword = avgPref(profile.keywords, candidate.keywordIds ?? []);
  const language = maxPref(profile.languages, candidate.language ? [candidate.language] : []);
  const country = avgPref(profile.countries, candidate.countries ?? []);
  const people = Math.max(
    avgPref(profile.actors, candidate.actorIds ?? []),
    avgPref(profile.directors, candidate.directorIds ?? [])
  );
  const peopleBlend = people * 0.85 + country * 0.15;

  const conf = ratingConfidence(candidate.voteAverage, candidate.voteCount);
  const pop = popularityNorm(candidate.popularity);
  const recency = releaseRecencyScore(candidate.dateStr, now);
  const era = maxPref(profile.decades, [decadeOf(candidate.dateStr)].filter(Boolean));
  const media = maxPref(profile.mediaTypes, [candidate.mediaType]);

  let score =
    SCORE_WEIGHTS.genre * genre +
    SCORE_WEIGHTS.keyword * keyword +
    SCORE_WEIGHTS.language * language +
    SCORE_WEIGHTS.people * peopleBlend +
    SCORE_WEIGHTS.ratingConfidence * conf +
    SCORE_WEIGHTS.popularity * pop +
    SCORE_WEIGHTS.releaseRecency * recency +
    SCORE_WEIGHTS.preferredEra * era +
    SCORE_WEIGHTS.mediaType * media +
    SCORE_WEIGHTS.discovery * clamp01(discoveryBonus);

  // Penalties
  if ((candidate.voteCount ?? 0) < MIN_VOTE_COUNT) {
    score -= 0.12 * (1 - clamp01((candidate.voteCount ?? 0) / MIN_VOTE_COUNT));
  }
  score -= impressionPenalty(key, impressions, IMPRESSION_PENALTY_DAYS, now);

  return {
    key,
    score: clamp01(score),
    parts: { genre, keyword, language, people: peopleBlend, conf, pop, recency, era, media },
    excluded: false,
  };
}

export function scoreHeroCandidate(candidate, profile, scored, { impressions = [], now = Date.now() } = {}) {
  const key = mediaKeyOf(candidate);
  if (scored.excluded || scored.score < 0) return { key, score: -1 };
  if ((candidate.voteCount ?? 0) < MIN_HERO_VOTE_COUNT) return { key, score: -1 };
  if (!candidate.backdropPath) return { key, score: -1 };
  if (scored.score < MIN_HERO_SCORE) return { key, score: -1 };

  const backdrop = 0.75; // presence already required; TMDB doesn't expose sharpness
  const freshness = scored.parts.recency ?? releaseRecencyScore(candidate.dateStr, now);
  let score =
    HERO_RANK.personal * scored.score +
    HERO_RANK.backdrop * backdrop +
    HERO_RANK.popularity * (scored.parts.pop ?? 0) +
    HERO_RANK.ratingConfidence * (scored.parts.conf ?? 0) +
    HERO_RANK.freshness * freshness;

  score -= impressionPenalty(key, impressions.filter((i) => i.surface === "hero"), HERO_IMPRESSION_DAYS, now);
  return { key, score: clamp01(score) };
}
