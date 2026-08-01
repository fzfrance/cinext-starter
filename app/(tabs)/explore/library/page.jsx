import { getWatchProvidersList } from "@/lib/tmdb";
import LibraryClient from "./LibraryClient";

// Genre chips are a curated fixed set (see LibraryClient's own GENRES
// constant), not TMDB's raw genre list, so there's nothing to fetch for
// them here — only the real provider logos need a server-side call.
export default async function Page() {
  const providersData = await getWatchProvidersList();
  const providerLogos = Object.fromEntries(
    (providersData.results ?? []).map((p) => [p.provider_id, p.logo_path])
  );
  return <LibraryClient providerLogos={providerLogos} />;
}
