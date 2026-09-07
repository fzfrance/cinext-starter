import SearchClient from "./SearchClient";
import { getExploreData } from "@/lib/exploreData";
import { getWatchProvidersList, getWatchProvidersListMovie } from "@/lib/tmdb";

// Standalone top-level route (outside the (tabs) group) — reached from
// the global nav Search control. Mobile keeps Explore behind a bottom
// search bar; desktop (≥900px) uses a dedicated search page with filters.
export default async function Page() {
  const [{ trendingShows, trendingMovies, heroSlides }, tvProviders, movieProviders] = await Promise.all([
    getExploreData({ includeGenreRails: false }),
    getWatchProvidersList().catch(() => ({ results: [] })),
    getWatchProvidersListMovie().catch(() => ({ results: [] })),
  ]);
  const providerLogos = Object.fromEntries(
    [...(tvProviders.results ?? []), ...(movieProviders.results ?? [])]
      .filter((p) => p.logo_path)
      .map((p) => [p.provider_id, p.logo_path])
  );
  return (
    <SearchClient
      trendingShows={trendingShows}
      trendingMovies={trendingMovies}
      heroSlides={heroSlides}
      providerLogos={providerLogos}
    />
  );
}
