import { mediaKeyOf } from "./signals";

/**
 * Greedy diversity pass — soft-penalize overrepresented genre/language/
 * country/franchise/actor while keeping score order roughly intact.
 */
export function diversify(items, { limit = 24, getMeta } = {}) {
  const picked = [];
  const genreCounts = new Map();
  const langCounts = new Map();
  const countryCounts = new Map();
  const actorCounts = new Map();
  const franchiseCounts = new Map();

  const soft = (map, key) => (map.get(key) ?? 0);

  for (const item of items) {
    if (picked.length >= limit) break;
    const meta = getMeta(item);
    if (!meta) continue;

    const g = meta.genreIds?.[0];
    const lang = meta.language;
    const country = meta.countries?.[0];
    const actor = meta.actorIds?.[0];
    const franchise = meta.franchiseKey;

    const penalty =
      soft(genreCounts, g) * 0.045 +
      soft(langCounts, lang) * 0.05 +
      soft(countryCounts, country) * 0.04 +
      soft(actorCounts, actor) * 0.035 +
      soft(franchiseCounts, franchise) * 0.08;

    item._divScore = (item.score ?? 0) - penalty;
  }

  const ranked = [...items].sort((a, b) => (b._divScore ?? b.score ?? 0) - (a._divScore ?? a.score ?? 0));

  for (const item of ranked) {
    if (picked.length >= limit) break;
    const meta = getMeta(item);
    if (!meta) continue;
    picked.push(item);
    const g = meta.genreIds?.[0];
    if (g != null) genreCounts.set(g, soft(genreCounts, g) + 1);
    if (meta.language) langCounts.set(meta.language, soft(langCounts, meta.language) + 1);
    const country = meta.countries?.[0];
    if (country) countryCounts.set(country, soft(countryCounts, country) + 1);
    const actor = meta.actorIds?.[0];
    if (actor) actorCounts.set(actor, soft(actorCounts, actor) + 1);
    if (meta.franchiseKey) franchiseCounts.set(meta.franchiseKey, soft(franchiseCounts, meta.franchiseKey) + 1);
  }

  return picked;
}

export function franchiseKeyFromTitle(title) {
  if (!title) return null;
  // crude: leading token before ":" or numeral sequel cues
  const base = String(title).split(":")[0].trim().toLowerCase();
  return base.replace(/\s+\d+$/, "").replace(/\s+(part|chapter)\s+\d+$/i, "") || null;
}

export { mediaKeyOf };
