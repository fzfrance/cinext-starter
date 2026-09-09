import { FOR_YOU_MIX } from "./constants";
import { diversify, franchiseKeyFromTitle } from "./diversify";
import { scoreHeroCandidate } from "./score";
import { mediaKeyOf } from "./signals";
import {
  MIN_LANGUAGE_WATCHED,
  MIN_OVERALL_FOR_PERSONAL_ROWS,
} from "./confidence";
import { languageLabel } from "@/lib/languageCodes";

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

function packSection({ id, title, kind, items, evidence = 0 }) {
  if (!title || !items || items.length < 5) return null;
  return {
    id,
    title,
    kind,
    evidence,
    items: diversify(items, { limit: 16, getMeta: shelfMeta }),
  };
}

/** Natural short labels for personalized row titles (not raw TMDB). */
export function displayGenreLabel(rawName) {
  if (!rawName) return null;
  const name = String(rawName).trim();
  const map = {
    "Science Fiction": "Sci-Fi",
    "Sci-Fi & Fantasy": "Sci-Fi & Fantasy",
    "Science Fiction & Fantasy": "Sci-Fi & Fantasy",
    "Action & Adventure": "Action & Adventure",
    "TV Movie": null,
  };
  if (Object.prototype.hasOwnProperty.call(map, name)) return map[name];
  return name;
}

/** Languages that form natural “[Language] [Genre]” shelves (never English). */
const NATURAL_SHELF_LANGUAGES = new Set(["ko", "ja", "es", "fr", "de", "it", "zh", "th", "hi", "sv", "no", "da"]);

function naturalLangGenreTitle(lang, genreLabel) {
  if (!lang || lang === "en" || !NATURAL_SHELF_LANGUAGES.has(lang)) return null;
  const short = displayGenreLabel(genreLabel);
  if (!short) return null;
  // Skip awkward English-style broad combos even for other languages when too generic
  // unless culturally natural (Korean Dramas, Japanese Horror, etc.)
  const langName = languageLabel(lang);
  const plural = (() => {
    const s = short;
    if (/thriller/i.test(s)) return "Thrillers";
    if (/horror/i.test(s)) return "Horror";
    if (/drama/i.test(s)) return "Dramas";
    if (/comed/i.test(s)) return "Comedies";
    if (/myster/i.test(s)) return "Mysteries";
    if (/romance/i.test(s)) return "Romances";
    if (/sci-?fi/i.test(s)) return "Sci-Fi";
    if (/fantasy/i.test(s)) return "Fantasy";
    if (/crime/i.test(s)) return "Crime";
    if (/document/i.test(s)) return "Documentaries";
    return s;
  })();

  // Korean Dramas / Japanese Horror / Korean Thrillers — allow Drama only for ko
  if (/^drama/i.test(short) && lang !== "ko") return null;
  if (/^comed/i.test(short)) return null; // "Korean Comedies" rarely useful vs genre rail
  if (/^action/i.test(short)) return null;

  return `${langName} ${plural}`;
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
 * Strict Explore personalization — More Like + rare natural-language
 * shelves only. "Because You Watched" / "Because You Like [Genre]" were
 * too generic/awkward (e.g. Drama) and are intentionally not generated.
 */
export function assembleExploreSections(scored, profile, { genreNames = new Map() } = {}) {
  const eligible = scored.filter((s) => !s.excluded && s.score >= 0).sort(byScoreDesc);
  const watchedCount = profile.watchedTitleCount ?? 0;
  if (watchedCount < MIN_OVERALL_FOR_PERSONAL_ROWS) return [];

  const candidates = [];

  // --- More Like [Title] — strong single-title relationship only
  const seed = profile.positiveSeeds?.[0];
  if (seed && (seed.weight ?? 0) >= 4) {
    const related = eligible
      .filter((item) => mediaKeyOf(item) !== seed.key)
      .filter((item) => {
        const genreHit = (item.genreIds ?? []).some((g) => seed.genres.includes(g));
        const langHit = seed.language && item.language === seed.language;
        const peopleHit = (item.actorIds ?? []).some((id) => (seed.actors ?? []).includes(id))
          || (item.directorIds ?? []).some((id) => (seed.directors ?? []).includes(id));
        const strongScore = (item.score ?? 0) >= 0.48;
        return strongScore && (genreHit || langHit || peopleHit);
      })
      .slice(0, 20);

    const avg = related.length
      ? related.reduce((s, i) => s + (i.score ?? 0), 0) / related.length
      : 0;

    if (related.length >= 5 && avg >= 0.45) {
      candidates.push(packSection({
        id: `more-like-${seed.key}`,
        title: `More Like ${seed.title}`,
        kind: "moreLike",
        items: related,
        evidence: 5 + Math.min(3, seed.weight || 0) + avg,
      }));
    }
  }

  // --- Natural language shelves only (e.g. Korean Thrillers) — never English + genre
  const langGenreEntries = [...(profile.watchedGenreLanguageCounts ?? new Map()).entries()]
    .sort((a, b) => b[1] - a[1]);

  for (const [pair, count] of langGenreEntries) {
    const [lang, genreId] = String(pair).split("|");
    if (!lang || !genreId) continue;
    if ((profile.watchedLanguageCounts?.get(lang) ?? 0) < MIN_LANGUAGE_WATCHED) continue;
    if (count < 3) continue; // strong pair evidence
    const raw = genreNames.get(Number(genreId)) || genreNames.get(String(genreId));
    const title = naturalLangGenreTitle(lang, raw);
    if (!title) continue;

    const items = eligible
      .filter((item) => item.language === lang && (item.genreIds ?? []).map(Number).includes(Number(genreId)))
      .filter((item) => (item.score ?? 0) >= 0.35)
      .slice(0, 20);
    const section = packSection({
      id: `lang-genre-${lang}-${genreId}`,
      title,
      kind: "langGenre",
      items,
      evidence: 6 + Math.min(4, count),
    });
    if (section) {
      candidates.push(section);
      break;
    }
  }

  // Strongest 1–2 only; skip weak/awkward (already filtered). Prefer variety.
  const picked = candidates.filter(Boolean).sort((a, b) => (b.evidence ?? 0) - (a.evidence ?? 0));
  const selected = [];
  const usedKinds = new Set();
  for (const row of picked) {
    if (selected.length >= 2) break;
    if (usedKinds.has(row.kind)) continue;
    usedKinds.add(row.kind);
    selected.push(row);
  }

  return selected;
}

/**
 * Genre rails are the backbone. Insert 1–3 personalized rows sparsely
 * when present — never force, never stack more than one back-to-back.
 */
export function interleaveExploreRows(genreRails = [], personalSections = []) {
  const dynamics = (personalSections ?? []).slice(0, 3);
  const genres = [...(genreRails ?? [])];
  if (dynamics.length === 0) {
    return genres.map((rail) => ({ type: "genre", rail }));
  }
  if (genres.length === 0) {
    return dynamics.map((section) => ({ type: "personal", section }));
  }

  const out = [];
  let di = 0;
  // Insert after 1st, 3rd, and 6th genre when we still have rows
  const insertAfterIndex = new Set([0, 2, 5]);

  for (let gi = 0; gi < genres.length; gi += 1) {
    out.push({ type: "genre", rail: genres[gi] });
    if (di < dynamics.length && insertAfterIndex.has(gi)) {
      out.push({ type: "personal", section: dynamics[di++] });
    }
  }

  return out;
}
