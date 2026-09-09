// Title-match ranking for search Top Result / result ordering.
// TMDB /search/multi ranks by popularity, so exact-title hits (e.g. the
// K-drama "Abyss") can lose to longer popular titles that only contain
// the query ("Neo Angelique Abyss"). These helpers re-rank by how closely
// the title matches the query string.
//
// Also bridges digit ↔ number-word queries ("25 21" ↔ "Twenty Five Twenty
// One", "2521") so shorthand searches rank the intended title on top.

export function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function numberToWords(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 0 || num > 99) return null;
  if (num < 20) return ONES[num];
  const tens = Math.floor(num / 10);
  const ones = num % 10;
  return ones === 0 ? TENS[tens] : `${TENS[tens]} ${ONES[ones]}`;
}

// "25 21" → "twenty five twenty one"; "7" → "seven"
function digitsQueryToWords(normalized) {
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length === 0 || !parts.every((p) => /^\d{1,2}$/.test(p))) return null;
  const words = parts.map(numberToWords);
  if (words.some((w) => !w)) return null;
  return words.join(" ");
}

// Collapse digit tokens: "25 21" → "2521", "7 21 25" → "72125"
function compactDigits(normalized) {
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length < 2 || !parts.every((p) => /^\d+$/.test(p))) return null;
  return parts.join("");
}

// "twenty five twenty one" → "25 21" (best-effort for pairwise age-style titles)
function wordsToDigitPairs(normalized) {
  const tokens = normalized.split(" ").filter(Boolean);
  const values = [];
  let i = 0;
  while (i < tokens.length) {
    const a = tokens[i];
    const b = tokens[i + 1];
    const compound = b ? `${a} ${b}` : null;
    let matched = null;
    if (compound) {
      for (let n = 0; n <= 99; n += 1) {
        if (numberToWords(n) === compound) {
          matched = n;
          i += 2;
          break;
        }
      }
    }
    if (matched == null) {
      for (let n = 0; n <= 19; n += 1) {
        if (ONES[n] === a) {
          matched = n;
          i += 1;
          break;
        }
      }
    }
    if (matched == null) return null;
    values.push(String(matched));
  }
  return values.length ? values.join(" ") : null;
}

function scoreAgainst(title, q) {
  if (!title || !q) return 0;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (title === q) return 100;
  if (title.startsWith(`${q} `) || title.startsWith(`${q}:`) || title.startsWith(`${q}-`)) return 90;
  if (title.startsWith(q)) return 80;
  if (new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`).test(title)) return 70;
  if (title.includes(q)) return 40;
  return 0;
}

function titleCandidates(item) {
  return [
    item.title,
    item.name,
    item.originalTitle,
    item.originalName,
    item.original_title,
    item.original_name,
    ...(item.searchTitles ?? []),
  ].filter(Boolean);
}

function queryVariants(q) {
  const variants = new Set([q]);
  const asWords = digitsQueryToWords(q);
  if (asWords) variants.add(asWords);
  const compact = compactDigits(q);
  if (compact) variants.add(compact);
  // "2521" typed as one token
  if (/^\d{3,4}$/.test(q)) {
    const mid = Math.ceil(q.length / 2);
    const left = q.slice(0, mid);
    const right = q.slice(mid);
    const splitWords = digitsQueryToWords(`${left} ${right}`);
    if (splitWords) variants.add(splitWords);
    variants.add(`${left} ${right}`);
  }
  return [...variants];
}

function titleVariants(title) {
  const variants = new Set([title]);
  const digitForm = wordsToDigitPairs(title);
  if (digitForm) {
    variants.add(digitForm);
    const compact = compactDigits(digitForm);
    if (compact) variants.add(compact);
  }
  // Strip spaces from digit-only titles already normalized
  const digitsOnly = title.replace(/\s+/g, "");
  if (/^\d+$/.test(digitsOnly) && digitsOnly !== title) variants.add(digitsOnly);
  return [...variants];
}

export function mediaTitleMatchScore(item, query) {
  const q = normalizeSearchText(query);
  if (!q) return 0;
  const qVars = queryVariants(q);
  let best = 0;
  for (const raw of titleCandidates(item)) {
    const title = normalizeSearchText(raw);
    if (!title) continue;
    for (const tVar of titleVariants(title)) {
      for (const qVar of qVars) {
        best = Math.max(best, scoreAgainst(tVar, qVar));
      }
    }
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
    // People rail: same title/name match scoring as media.
    return compareSearchMedia(a, b, query);
  });
}

export function sortSearchRailMedia(items, query) {
  return [...(items ?? [])].sort((a, b) => compareSearchRailMedia(a, b, query));
}
