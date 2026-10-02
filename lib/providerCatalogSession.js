// Streaming-service catalog filters survive a trip into a title and back.
// The in-memory snapshot keeps the grid and scroll position for this tab.
// sessionStorage keeps the applied filters if that snapshot is gone.

const sessions = new Map();

export function providerFiltersStorageKey(providerId) {
  return `cinext:providerFilters:${providerId}`;
}

export function normalizeProviderFilters(value, { minYear = 1990, maxYear = 2100 } = {}) {
  if (!value || typeof value !== "object") return null;
  const contentType = value.contentType === "movie" || value.contentType === "tv" ? value.contentType : "all";
  const genreIds = Array.isArray(value.genreIds)
    ? [...new Set(value.genreIds.filter((id) => typeof id === "string" && id))]
    : [];
  const languages = Array.isArray(value.languages)
    ? [...new Set(value.languages.filter((code) => typeof code === "string" && code))]
    : [];
  const year = Number(value.yearFrom);
  const yearFrom = Number.isFinite(year)
    ? Math.min(maxYear, Math.max(minYear, Math.round(year)))
    : minYear;
  return { contentType, genreIds, yearFrom, languages };
}

export function readProviderCatalogSession(providerId) {
  return sessions.get(String(providerId)) ?? null;
}

export function writeProviderCatalogSession(providerId, session) {
  const appliedFilters = normalizeProviderFilters(session?.appliedFilters);
  if (providerId == null || !appliedFilters) return;
  sessions.set(String(providerId), {
    appliedFilters,
    items: Array.isArray(session.items) ? session.items : null,
    totalResults: session.totalResults ?? 0,
    page: session.page ?? 1,
    totalPages: session.totalPages ?? 0,
    scrollTop: Number(session.scrollTop) || 0,
  });
}

export function readStoredProviderFilters(storage, providerId, bounds) {
  if (!storage || providerId == null) return null;
  try {
    const raw = storage.getItem(providerFiltersStorageKey(providerId));
    if (!raw) return null;
    return normalizeProviderFilters(JSON.parse(raw), bounds);
  } catch {
    return null;
  }
}

export function writeStoredProviderFilters(storage, providerId, filters, bounds) {
  if (!storage || providerId == null) return;
  const normalized = normalizeProviderFilters(filters, bounds);
  if (!normalized) return;
  storage.setItem(providerFiltersStorageKey(providerId), JSON.stringify(normalized));
}
