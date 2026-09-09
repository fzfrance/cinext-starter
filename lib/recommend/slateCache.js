"use client";

/** Explore For You / personal shelves rotate on this cadence — not every refresh. */
export const RECOMMEND_SLATE_PERIOD_MS = 2 * 24 * 60 * 60 * 1000;

const storageKey = (userId) => `cinext:rec-slate:v2:${userId || "anon"}`;

export function recommendationSlateBucket(now = Date.now()) {
  return Math.floor(now / RECOMMEND_SLATE_PERIOD_MS);
}

/** Deterministic shuffle — same seed → same order (stable within a slate bucket). */
export function seededShuffle(array, seed) {
  const copy = [...(array ?? [])];
  let s = Number(seed) || 1;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function loadRecommendSlate(userId) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.bucket !== recommendationSlateBucket()) return null;
    if (!parsed.payload || typeof parsed.payload !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveRecommendSlate(userId, payload) {
  if (typeof window === "undefined" || !payload) return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify({
      bucket: recommendationSlateBucket(),
      savedAt: Date.now(),
      payload,
    }));
  } catch {
    /* ignore quota */
  }
}
