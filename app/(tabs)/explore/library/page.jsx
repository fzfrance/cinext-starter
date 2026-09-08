import { getWatchProvidersList } from "@/lib/tmdb";
import { buildProviderLogoMap } from "@/lib/discoverFilters";
import LibraryClient from "./LibraryClient";

// Genre chips are a curated fixed set (see LibraryClient's own GENRES
// constant), not TMDB's raw genre list, so there's nothing to fetch for
// them here — only the real provider logos need a server-side call.
export default async function Page() {
  const providersData = await getWatchProvidersList();
  const providerLogos = buildProviderLogoMap(providersData.results ?? []);
  return <LibraryClient providerLogos={providerLogos} />;
}
