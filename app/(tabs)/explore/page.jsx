import ExploreClient from "./ExploreClient";
import { getExploreData } from "@/lib/exploreData";
import { getWatchProvidersList, getWatchProvidersListMovie } from "@/lib/tmdb";
import { expandWatchProviderIds, SEARCH_PLATFORMS } from "@/lib/discoverFilters";

function canonicalizeExploreProviders(rows) {
  // Prefer stable chip ids (Disney+ = 337) even when JustWatch lists
  // the regional alias (122 in TH).
  const byCanonical = new Map();
  for (const row of rows) {
    if (!row?.logo_path) continue;
    const chip = SEARCH_PLATFORMS.find((p) =>
      expandWatchProviderIds([p.id]).includes(row.provider_id)
    );
    const canonicalId = chip?.id ?? row.provider_id;
    const existing = byCanonical.get(canonicalId);
    if (existing && (existing.display_priority ?? 999) <= (row.display_priority ?? 999)) continue;
    byCanonical.set(canonicalId, {
      ...row,
      provider_id: canonicalId,
      provider_name: chip?.name ?? row.provider_name,
    });
  }
  return [...byCanonical.values()].sort(
    (a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999)
  );
}

export default async function Page() {
  const [{ trendingShows, trendingMovies, heroSlides, genreRails }, tvProviders, movieProviders] = await Promise.all([
    getExploreData(),
    getWatchProvidersList().catch(() => ({ results: [] })),
    getWatchProvidersListMovie().catch(() => ({ results: [] })),
  ]);
  const providers = canonicalizeExploreProviders([
    ...(tvProviders.results ?? []),
    ...(movieProviders.results ?? []),
  ]);
  return (
    <ExploreClient
      trendingShows={trendingShows}
      trendingMovies={trendingMovies}
      heroSlides={heroSlides}
      genreRails={genreRails}
      providers={providers}
    />
  );
}
