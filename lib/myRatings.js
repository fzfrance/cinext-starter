// ---------------------------------------------------------------------------
// "My Ratings" assembly — every rated season across ALL of a user's shows
// ---------------------------------------------------------------------------
// Extracted out of Profile's own "My Ratings" preview row so the full
// "My Ratings" list page (app/(tabs)/profile/ratings/page.jsx) can share
// the exact same assembly logic instead of duplicating it — Profile just
// slices the first few off the front for its preview.

import { getAllSeasonRatingsForUser } from "@/lib/seasonRatings";
import { getRatedEpisodesAcrossShows } from "@/lib/episodeWatches";

// Manual season_ratings rows plus every auto-eligible season (rated via
// individual episode ratings, counted only once every episode in that
// season has actually been rated — see the total-episode-count check
// below) across every show, most-recent-activity first. Manual always
// wins over auto for the same (show, season) — a season the user
// actually rated shouldn't also show its own auto score as a separate/
// competing entry. Returns RAW title/originalTitle/originalLanguage
// fields, not yet resolved through resolveTitle — callers resolve at
// render time (same reasoning as the Activity feed fix: baking a
// resolved title into this fetched result would freeze it at whatever
// Readable Languages happened to be the moment this ran).
export async function getMyRatingsForUser(userId) {
  const [manualRows, autoRows] = await Promise.all([
    getAllSeasonRatingsForUser(userId),
    getRatedEpisodesAcrossShows(userId),
  ]);

  const manualKeys = new Set(manualRows.map((r) => `${r.showId}-${r.seasonNumber}`));
  const autoCandidates = autoRows.filter((r) => !manualKeys.has(`${r.showId}-${r.seasonNumber}`));

  let autoEligible = [];
  if (autoCandidates.length > 0) {
    const totalsRes = await fetch("/api/shows/season-episode-counts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seasons: autoCandidates.map((r) => ({ showId: r.showId, seasonNumber: r.seasonNumber })) }),
    });
    const { results: totals } = await totalsRes.json();
    const totalByKey = Object.fromEntries(totals.map((x) => [`${x.showId}-${x.seasonNumber}`, x.totalEpisodes]));
    autoEligible = autoCandidates.filter((r) => {
      const total = totalByKey[`${r.showId}-${r.seasonNumber}`];
      return total != null && r.ratedCount === total;
    });
  }

  const entries = [
    ...manualRows.map((r) => ({ ...r, isAuto: false, activityAt: r.savedAt })),
    ...autoEligible.map((r) => ({ showId: r.showId, seasonNumber: r.seasonNumber, rating: r.avg10, mood: null, characterName: null, text: "", isAuto: true, activityAt: r.lastRatedAt })),
  ].sort((a, b) => b.activityAt - a.activityAt);

  if (entries.length === 0) return [];

  const showIds = [...new Set(entries.map((e) => e.showId))];
  const res = await fetch(`/api/shows/batch?ids=${showIds.join(",")}`);
  const { results } = await res.json();
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));

  return entries.map((e) => ({
    ...e,
    title: byId[e.showId]?.title ?? "Unknown Show",
    originalTitle: byId[e.showId]?.originalTitle ?? null,
    originalLanguage: byId[e.showId]?.originalLanguage ?? null,
    posterPath: byId[e.showId]?.posterPath ?? null,
    backdropPath: byId[e.showId]?.backdropPath ?? null,
  }));
}
