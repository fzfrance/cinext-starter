// ---------------------------------------------------------------------------
// Activity feed — pure functions over already-fetched data
// ---------------------------------------------------------------------------
// No Supabase/network calls here — the Activity page fetches userShows
// (lib/userShows.js), episode watches (lib/episodeWatches.js's
// getRecentEpisodeWatches), season ratings (lib/seasonRatings.js's
// getAllSeasonRatingsForUser), and per-show episode progress (needed to
// tell real completion apart from the raw `status` column — see
// buildActivityEvents below) itself, then hands the results here. "Me"-only
// for now (per the current scope of this feature): there's no
// friends/following system in this app yet, so every event is always the
// signed-in user's own action.
//
// Deliberately excluded (per the product spec this was built against):
// Paused / Dropped / Currently Watching are status changes, not
// noteworthy feed events.

import { resolveShowStatus } from "@/lib/statusResolver";

const DAY_MS = 24 * 60 * 60 * 1000;

// userShows: [{ showId, status, favorite, addedAt, updatedAt }]
// episodeWatches: getRecentEpisodeWatches's return value, ascending watched_at
// seasonRatings: getAllSeasonRatingsForUser's return value
// collectionAdditions: lib/collections.js's getRecentCollectionAdditions return value
// progressByShowId: { [showId]: { releasedEpisodes, watchedReleasedEpisodes } }
//   — only needed for shows whose raw status ISN'T already "completed" (see
//   below); same shape /api/shows/library-detail returns with
//   needsProgress:true, same fields lib/statusResolver.js's
//   resolveShowStatus takes directly.
export function buildActivityEvents({ userShows, episodeWatches, seasonRatings, collectionAdditions = [], progressByShowId = {} }) {
  const events = [];

  // Last watched_at per show — the best available timestamp for "when
  // this was actually finished" for a show that reached 100% purely by
  // checking off episodes (no explicit "Completed" pick ever made it into
  // user_shows, so there's no status-change history to source a real
  // completion timestamp from otherwise).
  const lastWatchedAtByShow = {};
  for (const w of episodeWatches) {
    if (!lastWatchedAtByShow[w.showId] || w.watchedAt > lastWatchedAtByShow[w.showId]) {
      lastWatchedAtByShow[w.showId] = w.watchedAt;
    }
  }

  for (const s of userShows) {
    events.push({ type: "added", showId: s.showId, timestamp: new Date(s.addedAt) });

    if (s.status === "completed") {
      // Raw `status === "completed"` — the single canonical token (see
      // lib/userShows.js's own header comment on why there's no second
      // "watched" token to also check). updatedAt is the closest real
      // timestamp available for an EXPLICIT completion.
      events.push({ type: "completed", showId: s.showId, timestamp: new Date(s.updatedAt) });
    } else {
      // Not explicitly marked Completed — still resolve through
      // resolveShowStatus (same function Show Detail/Library/Explore use)
      // so a show finished purely by watching every released episode
      // shows up as Completed here too, not just shows where the status
      // menu was actually touched.
      const progress = progressByShowId[s.showId];
      if (progress) {
        const resolved = resolveShowStatus({
          explicitStatus: s.status,
          watchedReleasedEpisodes: progress.watchedReleasedEpisodes ?? 0,
          releasedEpisodes: progress.releasedEpisodes ?? 0,
        });
        if (resolved === "completed" && lastWatchedAtByShow[s.showId]) {
          events.push({ type: "completed", showId: s.showId, timestamp: lastWatchedAtByShow[s.showId] });
        }
      }
    }
  }

  const seenEpisodeKeys = new Set();
  for (const w of episodeWatches) {
    const key = `${w.showId}-${w.seasonNumber}-${w.episodeNumber}`;
    const isRewatch = seenEpisodeKeys.has(key);
    seenEpisodeKeys.add(key);
    events.push({
      type: isRewatch ? "rewatched" : "watched",
      showId: w.showId,
      seasonNumber: w.seasonNumber,
      episodeNumber: w.episodeNumber,
      rating: w.rating,
      timestamp: w.watchedAt,
    });
  }

  for (const r of seasonRatings) {
    events.push({
      type: "rated",
      showId: r.showId,
      seasonNumber: r.seasonNumber,
      rating: r.rating,
      timestamp: r.savedAt,
    });
  }

  for (const c of collectionAdditions) {
    events.push({
      type: "addedToCollection",
      showId: c.showId,
      collectionName: c.collectionName,
      timestamp: c.addedAt,
    });
  }

  return events.sort((a, b) => b.timestamp - a.timestamp);
}

// Groups already-sorted (descending) events into Today / Yesterday /
// Last 7 Days / Last 30 Days+, dropping any empty group — `now` is
// injected (not read internally) so this stays a pure function callers
// can pass a real `new Date()` into themselves. "Last 30 Days+" is a
// catch-all for anything older than a week, not a hard 30-day cutoff —
// the "+" signals it can run well past 30 days too, same as the "Earlier"
// bucket it replaces.
export function groupActivityByRecency(events, now) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - DAY_MS);
  const startOfWeek = new Date(startOfToday.getTime() - 7 * DAY_MS);

  const buckets = { Today: [], Yesterday: [], "Last 7 Days": [], "Last 30 Days+": [] };
  for (const e of events) {
    if (e.timestamp >= startOfToday) buckets.Today.push(e);
    else if (e.timestamp >= startOfYesterday) buckets.Yesterday.push(e);
    else if (e.timestamp >= startOfWeek) buckets["Last 7 Days"].push(e);
    else buckets["Last 30 Days+"].push(e);
  }
  return Object.entries(buckets).filter(([, items]) => items.length > 0);
}

// "5h ago" while still today, "Yesterday" for yesterday's bucket, "3d ago"
// within the week, a plain date beyond that — matches the reference
// example feed's own mix of relative/absolute timestamps per group.
export function formatActivityTime(timestamp, now) {
  const diffMs = now - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - DAY_MS);

  if (timestamp >= startOfToday) {
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    return `${diffHr}h ago`;
  }
  if (timestamp >= startOfYesterday) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return timestamp.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
