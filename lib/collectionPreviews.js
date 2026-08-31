// Resolves the lightweight collection rows from lib/collections.js into
// mixed show + movie poster previews. Keeping this in one place prevents
// Collection pickers and Profile from quietly counting only one media type.

function previewRefs(collection, limit) {
  const shows = collection.showIds ?? [];
  const movies = collection.movieIds ?? [];
  const refs = [];
  const longest = Math.max(shows.length, movies.length);

  // Alternate media types so a mixed collection's preview represents both
  // sides instead of filling every available slot with shows first.
  for (let i = 0; i < longest && refs.length < limit; i += 1) {
    if (shows[i] != null) refs.push({ id: Number(shows[i]), mediaType: "tv" });
    if (refs.length < limit && movies[i] != null) refs.push({ id: Number(movies[i]), mediaType: "movie" });
  }
  return refs;
}

async function fetchBatch(path, ids) {
  if (ids.length === 0) return [];
  const response = await fetch(`${path}?ids=${ids.join(",")}`);
  if (!response.ok) throw new Error(`Failed to load collection posters (${response.status})`);
  const data = await response.json();
  return data.results ?? [];
}

export async function hydrateCollectionPreviews(collections, limit = 5) {
  const refsByCollection = new Map();
  const showIds = new Set();
  const movieIds = new Set();

  for (const collection of collections) {
    const refs = previewRefs(collection, limit);
    refsByCollection.set(collection.id, refs);
    for (const ref of refs) {
      (ref.mediaType === "movie" ? movieIds : showIds).add(ref.id);
    }
  }

  const [shows, movies] = await Promise.all([
    fetchBatch("/api/shows/batch", [...showIds]),
    fetchBatch("/api/movies/batch", [...movieIds]),
  ]);
  const byKey = new Map([
    ...shows.map((item) => [`tv-${item.id}`, { ...item, mediaType: "tv" }]),
    ...movies.map((item) => [`movie-${item.id}`, { ...item, mediaType: "movie" }]),
  ]);

  return collections.map((collection) => ({
    ...collection,
    count: (collection.showIds?.length ?? 0) + (collection.movieIds?.length ?? 0),
    covers: (refsByCollection.get(collection.id) ?? [])
      .map((ref) => byKey.get(`${ref.mediaType}-${ref.id}`))
      .filter(Boolean),
  }));
}
