// In-tab session caches for Home / Highlights. Cleared when library status
// changes (especially Remove) so Continue Watching and related surfaces
// don't keep showing wiped shows until a full reload.

export const homeSessionCache = new Map();
export const highlightsSessionCache = new Map();

export function invalidateHomeSessionCache(userId) {
  if (userId == null) homeSessionCache.clear();
  else homeSessionCache.delete(userId);
}

export function invalidateHighlightsSessionCache(userId) {
  if (userId == null) {
    highlightsSessionCache.clear();
    return;
  }
  for (const key of [...highlightsSessionCache.keys()]) {
    if (String(key).startsWith(`${userId}|`)) highlightsSessionCache.delete(key);
  }
}

/** Call after Remove / watch-history wipes so every tab surfaces fresh data. */
export function invalidateWatchCaches(userId) {
  invalidateHomeSessionCache(userId);
  invalidateHighlightsSessionCache(userId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("cinext:watch-data-changed", { detail: { userId } }));
    try { localStorage.setItem("cinext:watch-data-changed", JSON.stringify({ userId, nonce: crypto.randomUUID() })); } catch { /* Private browsing may disable storage. */ }
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== "cinext:watch-data-changed" || !event.newValue) return;
    try {
      const { userId } = JSON.parse(event.newValue);
      invalidateHomeSessionCache(userId);
      invalidateHighlightsSessionCache(userId);
      window.dispatchEvent(new CustomEvent("cinext:watch-data-changed", { detail: { userId } }));
    } catch { /* Unavailable storage or an older payload must not break navigation. */ }
  });
}
