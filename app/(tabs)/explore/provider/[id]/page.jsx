import { notFound } from "next/navigation";
import { getWatchProvidersList, getWatchProvidersListMovie } from "@/lib/tmdb";
import ProviderClient from "./ProviderClient";

export default async function Page({ params }) {
  const providerId = Number(params.id);
  if (!Number.isFinite(providerId) || providerId <= 0) notFound();

  const [tvProviders, movieProviders] = await Promise.all([
    getWatchProvidersList().catch(() => ({ results: [] })),
    getWatchProvidersListMovie().catch(() => ({ results: [] })),
  ]);

  const provider = [...(tvProviders.results ?? []), ...(movieProviders.results ?? [])]
    .find((p) => p.provider_id === providerId);

  if (!provider) notFound();

  return (
    <ProviderClient
      provider={{
        id: provider.provider_id,
        name: provider.provider_name,
        logoPath: provider.logo_path || null,
      }}
    />
  );
}
