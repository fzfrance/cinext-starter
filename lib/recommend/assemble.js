import { FOR_YOU_MIX } from "./constants";
import { diversify, franchiseKeyFromTitle } from "./diversify";
import { scoreHeroCandidate } from "./score";
import { mediaKeyOf } from "./signals";

function takeUnique(pool, n, used) {
  const out = [];
  for (const item of pool) {
    if (out.length >= n) break;
    const key = item.key || mediaKeyOf(item);
    if (used.has(key)) continue;
    used.add(key);
    out.push(item);
  }
  return out;
}

function byScoreDesc(a, b) {
  return (b.score ?? 0) - (a.score ?? 0);
}

function shelfMeta(item) {
  return {
    genreIds: item.genreIds,
    language: item.language,
    countries: item.countries,
    actorIds: item.actorIds,
    franchiseKey: franchiseKeyFromTitle(item.title),
  };
}

/**
 * Mix For You buckets then diversify.
 */
export function assembleForYou(scored, { limit = 36 } = {}) {
  const eligible = scored.filter((s) => !s.excluded && s.score >= 0).sort(byScoreDesc);
  const used = new Set();

  const strongCut = eligible.length ? eligible[Math.floor(eligible.length * 0.2)]?.score ?? 0.55 : 0.55;
  const strong = eligible.filter((s) => s.score >= Math.max(0.55, strongCut * 0.95));
  const adjacent = eligible.filter((s) => s.score >= 0.35 && s.score < Math.max(0.55, strongCut * 0.95));
  const qualityPopular = [...eligible].sort((a, b) => {
    const aq = (a.parts?.conf ?? 0) * 0.6 + (a.parts?.pop ?? 0) * 0.4;
    const bq = (b.parts?.conf ?? 0) * 0.6 + (b.parts?.pop ?? 0) * 0.4;
    return bq - aq;
  });
  const fresh = [...eligible].sort((a, b) => (b.parts?.recency ?? 0) - (a.parts?.recency ?? 0));
  const wildcard = [...eligible].sort((a, b) => (b.parts?.pop ?? 0) - (a.parts?.pop ?? 0));

  const counts = {
    strong: Math.round(limit * FOR_YOU_MIX.strong),
    adjacent: Math.round(limit * FOR_YOU_MIX.adjacent),
    qualityPopular: Math.round(limit * FOR_YOU_MIX.qualityPopular),
    newReleases: Math.round(limit * FOR_YOU_MIX.newReleases),
    wildcard: Math.max(1, Math.round(limit * FOR_YOU_MIX.wildcard)),
  };

  let mixed = [
    ...takeUnique(strong, counts.strong, used),
    ...takeUnique(adjacent, counts.adjacent, used),
    ...takeUnique(qualityPopular, counts.qualityPopular, used),
    ...takeUnique(fresh, counts.newReleases, used),
    ...takeUnique(wildcard, counts.wildcard, used),
  ];

  if (mixed.length < limit) {
    mixed = [...mixed, ...takeUnique(eligible, limit - mixed.length, used)];
  }

  return diversify(mixed, { limit, getMeta: shelfMeta });
}

export function assembleHero(scored, profile, { impressions = [], limit = 5 } = {}) {
  const ranked = scored
    .map((item) => {
      const hero = scoreHeroCandidate(item, profile, item, { impressions });
      return { ...item, heroScore: hero.score };
    })
    .filter((item) => item.heroScore >= 0)
    .sort((a, b) => b.heroScore - a.heroScore);

  const used = new Set();
  return takeUnique(ranked, limit, used).map((item) => ({
    ...item,
    mode: "recommended",
    score: item.heroScore,
  }));
}

/**
 * Personalized attributed shelves ("Because You Watched", "Because You Like",
 * "More Like", language-genre rows) were removed — they were weaker than the
 * basic For You + genre rails path. Kept as a no-op so the recommend API
 * shape stays stable if anything still asks for `sections`.
 */
export function assembleExploreSections() {
  return [];
}

/**
 * Genre rails are the backbone. Personal rows used to interleave here;
 * that path is retired — return genre rails only.
 */
export function interleaveExploreRows(genreRails = [], _personalSections = []) {
  return [...(genreRails ?? [])].map((rail) => ({ type: "genre", rail }));
}
