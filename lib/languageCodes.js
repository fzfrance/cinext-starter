// Shared language codes — safe for server + client (no React).
// App Language drives TMDB `language` + UI chrome; Readable Languages
// still control original-vs-translated titles via resolveTitle().

export const LANGUAGES = [
  { code: "en", name: "English", native: "English" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "zh", name: "Mandarin Chinese", native: "中文" },
  { code: "th", name: "Thai", native: "ไทย" },
];

/** Language names in each App Language — used as the list subheading. */
export const LANGUAGE_NAMES_BY_UI = {
  en: {
    en: "English", ko: "Korean", ja: "Japanese", es: "Spanish", fr: "French",
    de: "German", pt: "Portuguese", it: "Italian", ru: "Russian", pl: "Polish",
    zh: "Mandarin Chinese", th: "Thai",
  },
  th: {
    en: "ภาษาอังกฤษ", ko: "ภาษาเกาหลี", ja: "ภาษาญี่ปุ่น", es: "ภาษาสเปน", fr: "ภาษาฝรั่งเศส",
    de: "ภาษาเยอรมัน", pt: "ภาษาโปรตุเกส", it: "ภาษาอิตาลี", ru: "ภาษารัสเซีย", pl: "ภาษาโปแลนด์",
    zh: "ภาษาจีนกลาง", th: "ภาษาไทย",
  },
  ko: {
    en: "영어", ko: "한국어", ja: "일본어", es: "스페인어", fr: "프랑스어",
    de: "독일어", pt: "포르투갈어", it: "이탈리아어", ru: "러시아어", pl: "폴란드어",
    zh: "중국어(만다린)", th: "태국어",
  },
  zh: {
    en: "英语", ko: "韩语", ja: "日语", es: "西班牙语", fr: "法语",
    de: "德语", pt: "葡萄牙语", it: "意大利语", ru: "俄语", pl: "波兰语",
    zh: "普通话", th: "泰语",
  },
  es: {
    en: "Inglés", ko: "Coreano", ja: "Japonés", es: "Español", fr: "Francés",
    de: "Alemán", pt: "Portugués", it: "Italiano", ru: "Ruso", pl: "Polaco",
    zh: "Chino mandarín", th: "Tailandés",
  },
  ja: {
    en: "英語", ko: "韓国語", ja: "日本語", es: "スペイン語", fr: "フランス語",
    de: "ドイツ語", pt: "ポルトガル語", it: "イタリア語", ru: "ロシア語", pl: "ポーランド語",
    zh: "中国語（普通話）", th: "タイ語",
  },
  fr: {
    en: "Anglais", ko: "Coréen", ja: "Japonais", es: "Espagnol", fr: "Français",
    de: "Allemand", pt: "Portugais", it: "Italien", ru: "Russe", pl: "Polonais",
    zh: "Chinois mandarin", th: "Thaï",
  },
  de: {
    en: "Englisch", ko: "Koreanisch", ja: "Japanisch", es: "Spanisch", fr: "Französisch",
    de: "Deutsch", pt: "Portugiesisch", it: "Italienisch", ru: "Russisch", pl: "Polnisch",
    zh: "Mandarin", th: "Thai",
  },
  pt: {
    en: "Inglês", ko: "Coreano", ja: "Japonês", es: "Espanhol", fr: "Francês",
    de: "Alemão", pt: "Português", it: "Italiano", ru: "Russo", pl: "Polonês",
    zh: "Chinês mandarim", th: "Tailandês",
  },
  it: {
    en: "Inglese", ko: "Coreano", ja: "Giapponese", es: "Spagnolo", fr: "Francese",
    de: "Tedesco", pt: "Portoghese", it: "Italiano", ru: "Russo", pl: "Polacco",
    zh: "Cinese mandarino", th: "Thai",
  },
  ru: {
    en: "Английский", ko: "Корейский", ja: "Японский", es: "Испанский", fr: "Французский",
    de: "Немецкий", pt: "Португальский", it: "Итальянский", ru: "Русский", pl: "Польский",
    zh: "Китайский (путунхуа)", th: "Тайский",
  },
  pl: {
    en: "Angielski", ko: "Koreański", ja: "Japoński", es: "Hiszpański", fr: "Francuski",
    de: "Niemiecki", pt: "Portugalski", it: "Włoski", ru: "Rosyjski", pl: "Polski",
    zh: "Chiński mandaryński", th: "Tajski",
  },
};

/** Bold = original-script name (English, 한국어, 中文, …) — never changes.
 *  Subheading = that language’s name in the active App Language. */
export function languageListLabels(lang, uiCode) {
  const ui = normalizeAppLanguage(uiCode);
  const translated = LANGUAGE_NAMES_BY_UI[ui]?.[lang.code];
  return {
    primary: lang.native,
    secondary: translated || lang.name,
  };
}

export const DEFAULT_READABLE_LANGUAGES = ["en"];
export const DEFAULT_APP_LANGUAGE = "en";
export const APP_LANGUAGE_STORAGE_KEY = "cinext-app-language";

/** TMDB accepts ISO 639-1; regional tags improve translation coverage. */
export const TMDB_LANGUAGE_TAGS = {
  en: "en-US",
  ko: "ko-KR",
  ja: "ja-JP",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  pt: "pt-BR",
  it: "it-IT",
  ru: "ru-RU",
  pl: "pl-PL",
  zh: "zh-CN",
  th: "th-TH",
};

export function normalizeAppLanguage(code) {
  return LANGUAGES.some((lang) => lang.code === code) ? code : DEFAULT_APP_LANGUAGE;
}

export function languageLabel(code) {
  return LANGUAGES.find((lang) => lang.code === code)?.name ?? code;
}

export function toTmdbLanguage(code) {
  const normalized = normalizeAppLanguage(code);
  return TMDB_LANGUAGE_TAGS[normalized] || normalized;
}

export function resolveTitle(item, readableLanguages) {
  if (item?.originalLanguage && item.originalTitle && readableLanguages?.includes(item.originalLanguage)) {
    return item.originalTitle;
  }
  return item?.title ?? item?.originalTitle ?? "";
}

// Prefer the person's own original-script name when that language is
// readable (e.g. Korean actor → 전여빈). Never use TMDB *translations*
// of a Latin name into Chinese/Japanese/etc. just because that language
// is readable — Claudia Doumit must stay "Claudia Doumit", not 克劳迪娅·杜米特.
const PERSON_NATIVE_NAME_HINTS = [
  { lang: "ko", re: /[\uac00-\ud7af]/ },
  { lang: "ja", re: /[\u3040-\u30ff]/ },
  { lang: "zh", re: /[\u4e00-\u9fff]/ },
  { lang: "th", re: /[\u0e00-\u0e7f]/ },
];

export function resolvePersonName(person, readableLanguages = []) {
  const fallback = person?.name ?? "";
  const original = String(person?.originalName ?? person?.original_name ?? "").trim();
  if (!original || !readableLanguages?.length) return fallback || original;

  for (const { lang, re } of PERSON_NATIVE_NAME_HINTS) {
    if (!readableLanguages.includes(lang)) continue;
    if (re.test(original)) return original;
  }
  return fallback || original;
}

/** Compact first token for cast chips — Hangul/CJK names keep the full string. */
export function personDisplayGivenName(person, readableLanguages = []) {
  const full = resolvePersonName(person, readableLanguages);
  if (!full) return "";
  if (PERSON_NATIVE_NAME_HINTS.some(({ re }) => re.test(full))) return full;
  return full.split(/\s+/)[0] || full;
}
