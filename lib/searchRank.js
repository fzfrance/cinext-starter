// Title-match ranking for search Top Result / result ordering.
// TMDB /search/multi ranks by popularity, so exact-title hits (e.g. the
// K-drama "Abyss") can lose to longer popular titles that only contain
// the query ("Neo Angelique Abyss"). These helpers re-rank by how closely
// the title matches the query string.

export function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCandidates(item) {
  return [
    item.title,
    item.name,
    item.originalTitle,
    item.original_title,
    item.original_name,
    ...(item.searchTitles ?? []),
  ].filter(Boolean);
}

export function mediaTitleMatchScore(item, query) {
  const q = normalizeSearchText(query);
  if (!q) return 0;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let best = 0;
  for (const raw of titleCandidates(item)) {
    const title = normalizeSearchText(raw);
    if (!title) continue;
    if (title === q) best = Math.max(best, 100);
    else if (title.startsWith(`${q} `) || title.startsWith(`${q}:`) || title.startsWith(`${q}-`)) best = Math.max(best, 90);
    else if (title.startsWith(q)) best = Math.max(best, 80);
    else if (new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`).test(title)) best = Math.max(best, 70);
    else if (title.includes(q)) best = Math.max(best, 40);
  }
  return best;
}

function voteCount(item) {
  return item.vote_count ?? item.votes ?? 0;
}

function popularity(item) {
  return item.popularity ?? 0;
}

function titleRelevanceBand(score) {
  // Strong = exact / starts-with / whole-word; medium = loose contains.
  if (score >= 70) return 2;
  if (score >= 40) return 1;
  return 0;
}

// Combined recognition signal: votes dominate, popularity breaks ties.
function recognitionScore(item) {
  const votes = voteCount(item);
  const pop = popularity(item);
  return Math.log10(votes + 1) * 40 + Math.min(pop, 120);
}

// Top Result: prefer the closest title match (exact "Abyss" over
// "Neo Angelique Abyss"), then recognition.
export function compareSearchMedia(a, b, query) {
  const scoreA = mediaTitleMatchScore(a, query);
  const scoreB = mediaTitleMatchScore(b, query);
  if (scoreA !== scoreB) return scoreB - scoreA;
  const recognitionA = recognitionScore(a);
  const recognitionB = recognitionScore(b);
  if (recognitionA !== recognitionB) return recognitionB - recognitionA;
  return popularity(b) - popularity(a);
}

// Movies / Shows rails: keep titles relevant, but within a relevance band
// prefer well-known titles so obscure exact-name indies don't fill the row.
export function compareSearchRailMedia(a, b, query) {
  const scoreA = mediaTitleMatchScore(a, query);
  const scoreB = mediaTitleMatchScore(b, query);
  const bandA = titleRelevanceBand(scoreA);
  const bandB = titleRelevanceBand(scoreB);
  if (bandA !== bandB) return bandB - bandA;

  const recognitionA = recognitionScore(a);
  const recognitionB = recognitionScore(b);
  if (Math.abs(recognitionA - recognitionB) > 0.5) return recognitionB - recognitionA;

  // Soft title preference inside the same recognition tier.
  if (scoreA !== scoreB) return scoreB - scoreA;
  return popularity(b) - popularity(a);
}

export function pickTopSearchResult(items, query) {
  const media = (items ?? []).filter((item) => {
    const type = item.mediaType || item.media_type;
    return type === "movie" || type === "tv";
  });
  if (media.length === 0) return null;
  return media.reduce((best, item) => (compareSearchMedia(item, best, query) < 0 ? item : best));
}

export function sortSearchMedia(items, query) {
  return [...(items ?? [])].sort((a, b) => {
    const typeA = a.mediaType || a.media_type;
    const typeB = b.mediaType || b.media_type;
    const aMedia = typeA === "movie" || typeA === "tv";
    const bMedia = typeB === "movie" || typeB === "tv";
    if (aMedia && bMedia) return compareSearchMedia(a, b, query);
    if (aMedia !== bMedia) return aMedia ? -1 : 1;
    return 0;
  });
}

export function sortSearchRailMedia(items, query) {
  return [...(items ?? [])].sort((a, b) => compareSearchRailMedia(a, b, query));
}
