import ExploreClient from "./ExploreClient";
import { getExploreData } from "@/lib/exploreData";
import { getWatchProvidersList, getWatchProvidersListMovie } from "@/lib/tmdb";

export default async function Page() {
  const [{ trendingShows, trendingMovies, heroSlides, genreRails }, tvProviders, movieProviders] = await Promise.all([
    getExploreData(),
    getWatchProvidersList().catch(() => ({ results: [] })),
    getWatchProvidersListMovie().catch(() => ({ results: [] })),
  ]);
  const providers = [...new Map([...(tvProviders.results ?? []), ...(movieProviders.results ?? [])].map((p) => [p.provider_id, p])).values()]
    .filter((p) => p.logo_path)
    .sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999));
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
