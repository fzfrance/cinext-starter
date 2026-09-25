// Deep links for "Where to Watch" / WATCH ON chips.
//
// TMDB's watch/providers `link` always points at themoviedb.org (which then
// embeds JustWatch). We never send users there — open the streaming brand's
// own search/browse page when we know the provider, otherwise JustWatch.

import { DEFAULT_WATCH_REGION } from "@/lib/discoverFilters";

function slugifyTitle(title) {
  return String(title ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function encodeQuery(title) {
  return encodeURIComponent(String(title ?? "").trim());
}

/** JustWatch country path segment for our watch region. */
function justWatchLocale(region = DEFAULT_WATCH_REGION) {
  const code = String(region || DEFAULT_WATCH_REGION).toLowerCase();
  return code || "th";
}

/**
 * Aggregator fallback (and JustWatch attribution target) — never TMDB.
 * Search is more reliable than guessing a title slug JustWatch may not use.
 */
export function justWatchTitleUrl({ title, region = DEFAULT_WATCH_REGION } = {}) {
  const q = encodeQuery(title);
  if (!q) return `https://www.justwatch.com/${justWatchLocale(region)}`;
  return `https://www.justwatch.com/${justWatchLocale(region)}/search?q=${q}`;
}

/**
 * Build a URL that opens on the streaming service itself (search with the
 * title). Provider IDs are TMDB/JustWatch ids; aliases (Disney+ 337/122)
 * share one destination.
 */
export function providerWatchUrl({
  providerId,
  providerName,
  title,
  region = DEFAULT_WATCH_REGION,
} = {}) {
  const id = Number(providerId);
  const q = encodeQuery(title);
  const slug = slugifyTitle(title);

  // Brand home / search destinations. Prefer search with the title so the
  // user lands near the title instead of a generic homepage.
  const byId = {
    8: q ? `https://www.netflix.com/search?q=${q}` : "https://www.netflix.com/",
    // Disney+ (global) + Disney+ Hotstar TH (122)
    337: q ? `https://www.disneyplus.com/search?q=${q}` : "https://www.disneyplus.com/",
    122: q ? `https://www.disneyplus.com/search?q=${q}` : "https://www.disneyplus.com/",
    9: q ? `https://www.primevideo.com/search/?phrase=${q}` : "https://www.primevideo.com/",
    119: q ? `https://www.primevideo.com/search/?phrase=${q}` : "https://www.primevideo.com/", // Amazon Prime Video alternate
    350: q ? `https://tv.apple.com/search?term=${q}` : "https://tv.apple.com/",
    2: q ? `https://tv.apple.com/search?term=${q}` : "https://tv.apple.com/", // Apple TV storefront (buy/rent)
    1899: q ? `https://www.max.com/search?q=${q}` : "https://www.max.com/",
    384: q ? `https://www.max.com/search?q=${q}` : "https://www.max.com/", // HBO Max legacy id
    15: q ? `https://www.hulu.com/search?q=${q}` : "https://www.hulu.com/",
    531: q ? `https://www.paramountplus.com/search/?q=${q}` : "https://www.paramountplus.com/",
    386: q ? `https://www.peacocktv.com/search?q=${q}` : "https://www.peacocktv.com/",
    283: q ? `https://www.crunchyroll.com/search?q=${q}` : "https://www.crunchyroll.com/",
    3: q ? `https://play.google.com/store/search?q=${q}&c=movies` : "https://play.google.com/store/movies",
    192: q ? `https://www.youtube.com/results?search_query=${q}` : "https://www.youtube.com/",
    10: q ? `https://www.amazon.com/s?k=${q}` : "https://www.amazon.com/", // Amazon Video
    68: "https://www.microsoft.com/store/movies-tv",
    7: q ? `https://www.vudu.com/content/movies/search?searchString=${q}` : "https://www.vudu.com/",
    // Common Asia / TH catalog brands
    73: q ? `https://www.viki.com/search?q=${q}` : "https://www.viki.com/",
    11: q ? `https://www.mubi.com/search/${slug || q}` : "https://www.mubi.com/",
    1853: q ? `https://www.paramountplus.com/search/?q=${q}` : "https://www.paramountplus.com/",
    1796: q ? `https://www.netflix.com/search?q=${q}` : "https://www.netflix.com/", // Netflix basic with ads etc.
  };

  if (Number.isFinite(id) && byId[id]) return byId[id];

  // Name fallback when TMDB introduces a new id we haven't mapped yet.
  const name = String(providerName ?? "").toLowerCase();
  if (name.includes("netflix")) return byId[8];
  if (name.includes("disney")) return byId[337];
  if (name.includes("prime") || name.includes("amazon")) return byId[9];
  if (name.includes("apple")) return byId[350];
  if (name === "max" || name.includes("hbo")) return byId[1899];
  if (name.includes("hulu")) return byId[15];
  if (name.includes("paramount")) return byId[531];
  if (name.includes("peacock")) return byId[386];
  if (name.includes("crunchyroll")) return byId[283];
  if (name.includes("youtube")) return byId[192];
  if (name.includes("viki")) return byId[73];
  if (name.includes("google")) return byId[3];

  return justWatchTitleUrl({ title, region });
}

/** Attach outbound hrefs onto mapped provider rows from page.jsx. */
export function withProviderWatchLinks(providers, { title, region = DEFAULT_WATCH_REGION } = {}) {
  if (!providers) return null;
  const mapItems = (items) =>
    (items ?? []).map((p) => ({
      ...p,
      href: providerWatchUrl({
        providerId: p.id,
        providerName: p.name,
        title,
        region,
      }),
    }));
  return {
    ...providers,
    flatrate: mapItems(providers.flatrate),
    rent: mapItems(providers.rent),
    buy: mapItems(providers.buy),
    // Replace TMDB /watch pages with JustWatch search for the title.
    link: justWatchTitleUrl({ title, region }),
  };
}
