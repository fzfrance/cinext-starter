import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeProviderFilters,
  readProviderCatalogSession,
  readStoredProviderFilters,
  writeProviderCatalogSession,
  writeStoredProviderFilters,
} from "../lib/providerCatalogSession.js";

test("normalizes a saved streaming-service filter", () => {
  assert.deepEqual(
    normalizeProviderFilters({
      contentType: "movie",
      genreIds: ["m-action", "m-action", ""],
      yearFrom: 2010.4,
      languages: ["en", "en"],
    }, { minYear: 1990, maxYear: 2026 }),
    { contentType: "movie", genreIds: ["m-action"], yearFrom: 2010, languages: ["en"] }
  );
});

test("drops an unusable filter payload", () => {
  assert.equal(normalizeProviderFilters(null), null);
  assert.equal(normalizeProviderFilters("movie"), null);
});

test("a provider session round-trips without leaking into another service", () => {
  writeProviderCatalogSession(8, {
    appliedFilters: { contentType: "tv", genreIds: ["t-drama"], yearFrom: 2018, languages: ["ko"] },
    items: [{ id: 1 }],
    totalResults: 12,
    page: 2,
    totalPages: 4,
    scrollTop: 640,
  });
  writeProviderCatalogSession(337, {
    appliedFilters: { contentType: "all", genreIds: [], yearFrom: 1990, languages: [] },
    items: [],
    scrollTop: 0,
  });
  const netflix = readProviderCatalogSession(8);
  assert.equal(netflix.appliedFilters.contentType, "tv");
  assert.deepEqual(netflix.items, [{ id: 1 }]);
  assert.equal(netflix.scrollTop, 640);
  assert.equal(readProviderCatalogSession(337).appliedFilters.contentType, "all");
  assert.equal(readProviderCatalogSession(99), null);
});

test("sessionStorage keeps filters when the in-memory grid is gone", () => {
  const storage = new Map();
  const api = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, value),
  };
  writeStoredProviderFilters(api, 8, {
    contentType: "movie",
    genreIds: ["m-thriller"],
    yearFrom: 2005,
    languages: ["en"],
  });
  assert.deepEqual(readStoredProviderFilters(api, 8), {
    contentType: "movie",
    genreIds: ["m-thriller"],
    yearFrom: 2005,
    languages: ["en"],
  });
  assert.equal(readStoredProviderFilters(api, 15), null);
});
