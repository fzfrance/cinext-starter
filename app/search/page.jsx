import SearchClient from "./SearchClient";
import { getExploreData } from "@/lib/exploreData";
import { getWatchProvidersList, getWatchProvidersListMovie } from "@/lib/tmdb";
import { buildProviderLogoMap } from "@/lib/discoverFilters";

// Standalone top-level route (outside the (tabs) group) — reached from
// the global nav Search control. Mobile keeps Explore behind a bottom
// search bar; desktop (≥900px) uses a dedicated search page with filters.
export default async function Page() {
  const [{ trendingShows, trendingMovies, heroSlides }, tvProviders, movieProviders] = await Promise.all([
    getExploreData({ includeGenreRails: false }),
    getWatchProvidersList().catch(() => ({ results: [] })),
    getWatchProvidersListMovie().catch(() => ({ results: [] })),
  ]);
  const providerLogos = buildProviderLogoMap([
    ...(tvProviders.results ?? []),
    ...(movieProviders.results ?? []),
  ]);
  return (
    <SearchClient
      trendingShows={trendingShows}
      trendingMovies={trendingMovies}
      heroSlides={heroSlides}
      providerLogos={providerLogos}
    />
  );
}
