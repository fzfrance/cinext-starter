import test from "node:test";
import assert from "node:assert/strict";
import { chunkIds, fetchMediaByIds } from "../lib/favoriteMedia.js";

test("favorite ids are split into batches of 20 without duplicates", () => {
  const ids = [1, 1, "2", 0, -3, ...Array.from({ length: 25 }, (_, i) => i + 3)];
  const chunks = chunkIds(ids);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, 20);
  assert.equal(chunks[1].length, 7);
  assert.deepEqual(chunks[0].slice(0, 3), [1, 2, 3]);
});

test("a failed batch does not drop the favorites that already loaded", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes("ids=21")) {
      return { ok: false, status: 500, json: async () => ({}) };
    }
    const ids = new URL(url, "https://cinext.local").searchParams.get("ids").split(",");
    return { ok: true, json: async () => ({ results: ids.map((id) => ({ id: Number(id) })) }) };
  };
  const seen = [];
  const results = await fetchMediaByIds("/api/shows/batch", Array.from({ length: 25 }, (_, i) => i + 1), {
    fetchImpl,
    onChunk: (chunk) => seen.push(...chunk.map((item) => item.id)),
  });
  assert.equal(calls.length, 2);
  assert.equal(results.length, 20);
  assert.deepEqual(seen, results.map((item) => item.id));
});
