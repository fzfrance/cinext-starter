"use client";

import { mediaKey } from "@/lib/media";

const storageKey = (userId) => `cinext:rec-impressions:${userId || "anon"}`;

export function loadImpressions(userId) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - 45 * 24 * 60 * 60 * 1000;
    return parsed.filter((row) => row?.key && (row.at ?? 0) >= cutoff);
  } catch {
    return [];
  }
}

export function recordImpressions(userId, entries) {
  if (typeof window === "undefined" || !entries?.length) return;
  try {
    const prev = loadImpressions(userId);
    const next = [...entries.map((e) => ({
      key: e.key || mediaKey(e),
      surface: e.surface || "foryou",
      at: e.at || Date.now(),
    })), ...prev].slice(0, 400);
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

export function recordHeroImpression(userId, item) {
  if (!item) return;
  recordImpressions(userId, [{ key: mediaKey(item), surface: "hero", at: Date.now() }]);
}
