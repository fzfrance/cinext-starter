// ---------------------------------------------------------------------------
// Asia/Bangkok date helpers — shared source of truth
// ---------------------------------------------------------------------------
// This app anchors every user-facing "what day/month/year is it" calculation
// to Asia/Bangkok specifically (not the viewer's local timezone, not raw
// UTC) — the Upcoming countdown, Home's hero recency, and Highlights' Watch
// History calendar all rely on this being consistent. Centralized here so
// lib/episodeWatches.js (writing watched_on/watched_year/watched_month) and
// Highlights (reading/bucketing them) can't drift against each other by
// each keeping their own copy.

const BANGKOK_TZ = "Asia/Bangkok";
const dateKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: BANGKOK_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const partsFmt = new Intl.DateTimeFormat("en-US", { timeZone: BANGKOK_TZ, year: "numeric", month: "numeric", day: "numeric" });

// "YYYY-MM-DD" — a plain, sortable/dedupe-able key.
export function bangkokDateKey(isoTimestampOrDate) {
  return dateKeyFmt.format(new Date(isoTimestampOrDate));
}

export function bangkokParts(isoTimestampOrDate) {
  const parts = partsFmt.formatToParts(new Date(isoTimestampOrDate));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

// Bangkok "right now" — call fresh every time you need it, never cache the
// result at module scope. A browser tab/PWA session left open across a
// real Bangkok midnight would otherwise keep reading the *previous* day as
// "today" indefinitely (a real bug this app hit once already — see
// Highlights' own history), since a module-level `const` is only ever
// evaluated once per page load, not per render/call.
export function bangkokNow() {
  return bangkokParts(new Date());
}
