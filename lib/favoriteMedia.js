// Desktop Favorite Shows / Movies can be much longer than a preview row.
// One batch URL of every id is slow enough to time out, so metadata is
// loaded in small independent requests. A failed chunk is skipped so the
// rest of the list still arrives.

export const FAVORITE_MEDIA_BATCH_SIZE = 20;

export function chunkIds(ids, size = FAVORITE_MEDIA_BATCH_SIZE) {
  const unique = [];
  const seen = new Set();
  for (const raw of ids ?? []) {
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  const chunks = [];
  for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size));
  return chunks;
}

export async function fetchMediaByIds(path, ids, { fetchImpl = fetch, onChunk } = {}) {
  const collected = [];
  for (const chunk of chunkIds(ids)) {
    try {
      const response = await fetchImpl(`${path}?ids=${chunk.join(",")}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`${path} failed (${response.status})`);
      const payload = await response.json();
      const results = Array.isArray(payload?.results) ? payload.results : [];
      collected.push(...results);
      onChunk?.(results);
    } catch (err) {
      console.error(`Failed to load favorite media batch (${path}):`, err);
    }
  }
  return collected;
}
