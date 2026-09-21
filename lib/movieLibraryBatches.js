const DETAIL_BATCH_SIZE = 20;
const LOGO_BATCH_SIZE = 12;
const REQUEST_CONCURRENCY = 2;
const MAX_ATTEMPTS = 2;

async function runBatches(items, batchSize, load, onBatch) {
  if (items.length === 0) return { results: [], failedItems: [] };
  const batches = [];
  for (let i = 0; i < items.length; i += batchSize) batches.push(items.slice(i, i + batchSize));
  const results = new Array(batches.length);
  const failedItems = [];
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= batches.length) return;
      const batch = batches[index];
      let loaded = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          loaded = await load(batch);
          break;
        } catch (err) {
          if (attempt === MAX_ATTEMPTS) console.error("Movie Library batch failed:", err);
        }
      }
      if (loaded == null) {
        results[index] = [];
        failedItems.push(...batch);
        continue;
      }
      results[index] = loaded;
      onBatch?.(loaded);
    }
  }

  await Promise.all(Array.from({ length: Math.min(REQUEST_CONCURRENCY, batches.length) }, worker));
  return { results: results.flat(), failedItems };
}

export async function fetchMovieLibraryDetails(ids, onBatch) {
  const uniqueIds = [...new Set(ids.map(Number).filter(Number.isFinite))];
  return runBatches(uniqueIds, DETAIL_BATCH_SIZE, async (batch) => {
    const loadDetails = async (requestedIds) => {
      const response = await fetch("/api/movies/library-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ ids: requestedIds }),
      });
      if (!response.ok) throw new Error(`Movie details failed (${response.status})`);
      const payload = await response.json();
      if (!Array.isArray(payload?.results)) throw new Error("Movie details response was invalid");
      return payload.results;
    };

    const results = await loadDetails(batch);
    const returnedIds = new Set(results.map((movie) => Number(movie.id)));
    const missingIds = batch.filter((id) => !returnedIds.has(Number(id)));
    if (missingIds.length === 0) return results;

    // The route returns successful TMDB lookups even when a few individual
    // lookups were rate-limited. Retry only those missing IDs once instead
    // of silently treating the partial HTTP 200 response as a complete batch.
    const retryResults = await loadDetails(missingIds);
    return [...results, ...retryResults];
  }, onBatch);
}

export async function fetchMovieLibraryLogos(ids, readableLanguages, onBatch) {
  const uniqueIds = [...new Set(ids.map(Number).filter(Number.isFinite))];
  return runBatches(uniqueIds, LOGO_BATCH_SIZE, async (batch) => {
    const response = await fetch("/api/movies/logos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ ids: batch, readableLanguages }),
    });
    if (!response.ok) throw new Error(`Movie logos failed (${response.status})`);
    const payload = await response.json();
    if (!Array.isArray(payload?.results)) throw new Error("Movie logos response was invalid");
    return payload.results;
  }, onBatch);
}
