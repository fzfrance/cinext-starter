// Trailer & More language policy.
//
// TMDB returns the same Netflix trailer once per dub (Malayalam, Telugu,
// Tamil, …), often tagged with English subtitles. Playback should stay on
// the title's original language, with or without English subtitles. A
// separate trailer or teaser still belongs in the row. Another language's
// copy of the same trailer does not.

const LANGUAGE_WORDS = [
  ["malayalam", "ml"],
  ["malaysian", "ms"],
  ["indonesian", "id"],
  ["portuguese", "pt"],
  ["cantonese", "zh"],
  ["mandarin", "zh"],
  ["japanese", "ja"],
  ["spanish", "es"],
  ["chinese", "zh"],
  ["english", "en"],
  ["korean", "ko"],
  ["german", "de"],
  ["french", "fr"],
  ["italian", "it"],
  ["russian", "ru"],
  ["turkish", "tr"],
  ["arabic", "ar"],
  ["hindi", "hi"],
  ["telugu", "te"],
  ["kannada", "kn"],
  ["bengali", "bn"],
  ["punjabi", "pa"],
  ["marathi", "mr"],
  ["gujarati", "gu"],
  ["tamil", "ta"],
  ["malay", "ms"],
  ["thai", "th"],
  ["vietnamese", "vi"],
  ["filipino", "tl"],
  ["tagalog", "tl"],
  ["polish", "pl"],
  ["dutch", "nl"],
  ["swedish", "sv"],
  ["norwegian", "no"],
  ["danish", "da"],
  ["finnish", "fi"],
  ["greek", "el"],
  ["hebrew", "he"],
  ["ukrainian", "uk"],
  ["romanian", "ro"],
  ["hungarian", "hu"],
  ["czech", "cs"],
  ["persian", "fa"],
  ["farsi", "fa"],
  ["urdu", "ur"],
  ["sinhala", "si"],
  ["nepali", "ne"],
];

const UNKNOWN_ISO = new Set(["", "xx", "und", "zxx", "none", "null"]);

function languageCodeForWord(word) {
  const hit = LANGUAGE_WORDS.find(([label]) => label === word);
  return hit ? hit[1] : null;
}

function languageAtStart(text) {
  const s = String(text || "").trim().toLowerCase().replace(/^official\s+/, "");
  for (const [word, code] of LANGUAGE_WORDS) {
    if (new RegExp(`^${word}\\b`, "i").test(s)) return code;
  }
  return null;
}

function nonEnglishLanguageIn(text) {
  const s = String(text || "").toLowerCase();
  for (const [word, code] of LANGUAGE_WORDS) {
    if (code === "en") continue;
    if (new RegExp(`\\b${word}\\b`, "i").test(s)) return code;
  }
  return null;
}

/**
 * Spoken-language dub named in the title. "English Subtitled" is a subtitle
 * track, not a dub. A leading or bracketed language ("MALAYALAM TRAILER",
 * "Official Tamil Trailer") is a dub even when the title also says English
 * subtitles. Words inside the work's own title ("The French Dispatch") are
 * left alone.
 */
export function dubbedLanguageFromTitle(name) {
  const raw = String(name || "");
  const decorations = [...raw.matchAll(/[\[(]([^)\]]+)[\])]/g)].map((match) => match[1]);
  for (const chunk of decorations) {
    const dubbed = nonEnglishLanguageIn(chunk);
    if (dubbed) return dubbed;
  }
  const lead = languageAtStart(raw);
  if (lead && lead !== "en") return lead;
  // "Malayalam Trailer" can sit after a movie title. Require the language
  // word to introduce the trailer itself so "The French Dispatch" stays.
  const labels = LANGUAGE_WORDS.map(([word]) => word).join("|");
  const beforeKind = raw.match(new RegExp(`\\b(${labels})\\s+(?:official\\s+)?(?:trailers?|teasers?)\\b`, "i"));
  if (beforeKind) {
    const code = languageCodeForWord(beforeKind[1].toLowerCase());
    if (code && code !== "en") return code;
  }
  const inLanguage = raw.match(/\bin\s+([a-z]+)\b/i);
  if (inLanguage) {
    const code = languageCodeForWord(inLanguage[1].toLowerCase());
    if (code && code !== "en") return code;
  }
  const kind = raw.match(/\b([a-z]+)\s+(?:dub(?:bed)?|audio|version)\b/i);
  if (kind) {
    const code = languageCodeForWord(kind[1].toLowerCase());
    if (code && code !== "en") return code;
  }
  return null;
}

function isoLanguage(video) {
  const iso = String(video?.iso_639_1 ?? "").trim().toLowerCase();
  if (UNKNOWN_ISO.has(iso)) return null;
  return iso;
}

/** Language this cut is spoken in. Null means TMDB never labeled it. */
export function trailerSpokenLanguage(video) {
  return dubbedLanguageFromTitle(video?.name) || isoLanguage(video);
}

function languageRank(video, originalLanguage) {
  const spoken = trailerSpokenLanguage(video);
  const original = String(originalLanguage || "").trim().toLowerCase();
  if (original && spoken === original) return 0;
  if (!spoken) return 1;
  if (spoken === "en") return original === "en" ? 0 : 2;
  return 3;
}

function isPreferredCut(video, originalLanguage) {
  return languageRank(video, originalLanguage) < 3;
}

function hasSubtitleNote(video) {
  return /\b(sub|subs|subtitle|subtitles|subtitled|subbed)\b/i.test(video?.name || "");
}

/** Identity of the cut, ignoring dub language and subtitle notes. */
export function trailerIdentity(video) {
  let name = String(video?.name || "").toLowerCase();
  name = name.replace(/\[[^\]]*\]|\([^)]*\)/g, " ");
  for (const [word] of LANGUAGE_WORDS) {
    name = name.replace(new RegExp(`\\b${word}\\b`, "g"), " ");
  }
  name = name.replace(/\b(subtitled|subtitles|subtitle|subbed|subs|sub|dubbed|dub|hd|uhd|4k|official|netflix|full|video|the|with|eng|audio|version)\b/g, " ");
  name = name.replace(/\b(trailer|teaser)s?\b/g, " ");
  name = name.replace(/[^a-z0-9]+/g, " ").trim();
  const type = String(video?.type || "Trailer").toLowerCase();
  return `${type}:${name}`;
}

function variantRank(video, originalLanguage) {
  return [
    languageRank(video, originalLanguage),
    video?.official ? 0 : 1,
    hasSubtitleNote(video) ? 1 : 0,
  ];
}

function displayRank(video, originalLanguage) {
  const typeRank = video?.type === "Trailer" ? 0 : video?.type === "Teaser" ? 1 : 2;
  const residue = trailerIdentity(video).split(":").slice(1).join(":");
  return [
    typeRank,
    languageRank(video, originalLanguage),
    video?.official ? 0 : 1,
    residue ? 1 : 0,
    hasSubtitleNote(video) ? 1 : 0,
  ];
}

function compareRanks(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * One row of distinct trailers and teasers.
 * Prefers the original language, then an unlabeled cut, then English
 * (subtitle or original). Other dubs of the same trailer are dropped.
 * When nothing in those languages exists, keeps a single fallback cut
 * per distinct trailer instead of every regional upload.
 */
export function selectTrailerVideos(videos, originalLanguage) {
  const list = (videos ?? []).filter((video) => (
    video?.key
    && (video.type === "Trailer" || video.type === "Teaser")
    && (video.site == null || video.site === "YouTube")
  ));
  const preferred = list.filter((video) => isPreferredCut(video, originalLanguage));
  const pool = preferred.length > 0 ? preferred : list;
  const bestByIdentity = new Map();
  for (const video of pool) {
    const id = trailerIdentity(video);
    const prev = bestByIdentity.get(id);
    if (!prev || compareRanks(variantRank(video, originalLanguage), variantRank(prev, originalLanguage)) < 0) {
      bestByIdentity.set(id, video);
    }
  }
  return [...bestByIdentity.values()].sort((a, b) => (
    compareRanks(displayRank(a, originalLanguage), displayRank(b, originalLanguage))
  ));
}
