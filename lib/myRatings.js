// ---------------------------------------------------------------------------
// "My Ratings" assembly — every rated season across ALL of a user's shows,
// PLUS every rated movie, merged into one undivided list
// ---------------------------------------------------------------------------
// Extracted out of Profile's own "My Ratings" preview row so the full
// "My Ratings" list page (app/(tabs)/profile/ratings/page.jsx) can share
// the exact same assembly logic instead of duplicating it — Profile just
// slices the first few off the front for its preview.
//
// Movies (movies-as-content-type plan) merge in as a third source, tagged
// mediaType: "tv" | "movie" on every entry so callers can branch rendering
// (a movie entry has no seasonNumber/isAuto — see below) — but they are
// NOT grouped separately or given their own section: the whole point of
// this merge is one flat list sorted by recency, no division by type.
// Movies have no "auto" rating concept at all (no per-episode ratings to
// average — see lib/movieRatings.js), so only getAllMovieRatingsForUser's
// manual rows are merged in, nothing auto-eligible to compute for them.

import { getAllSeasonRatingsForUser } from "@/lib/seasonRatings";
import { getRatedEpisodesAcrossShows } from "@/lib/episodeWatches";
import { getAllMovieRatingsForUser } from "@/lib/movieRatings";

const METADATA_BATCH_SIZE = 20;
const METADATA_CONCURRENCY = 3;

async function fetchMetadataBatches(path, ids) {
  if (ids.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < ids.length; i += METADATA_BATCH_SIZE) chunks.push(ids.slice(i, i + METADATA_BATCH_SIZE));
  const results = new Array(chunks.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= chunks.length) return;
      const chunk = chunks[index];
      try {
        const response = await fetch(`${path}?ids=${chunk.join(",")}`);
        if (!response.ok) throw new Error(`${path} failed (${response.status})`);
        const payload = await response.json();
        results[index] = Array.isArray(payload?.results) ? payload.results : [];
      } catch (err) {
        console.error(`Failed to enrich rating metadata (${path}):`, err);
        results[index] = [];
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(METADATA_CONCURRENCY, chunks.length) }, worker));
  return results.flat();
}

async function fetchSeasonTotals(seasons) {
  if (seasons.length === 0) return [];
  const results = [];
  for (let i = 0; i < seasons.length; i += METADATA_BATCH_SIZE) {
    const chunk = seasons.slice(i, i + METADATA_BATCH_SIZE);
    try {
      const response = await fetch("/api/shows/season-episode-counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasons: chunk }),
      });
      if (!response.ok) throw new Error(`season totals failed (${response.status})`);
      const payload = await response.json();
      if (Array.isArray(payload?.results)) results.push(...payload.results);
    } catch (err) {
      // Manual season/movie ratings remain useful even when auto-rating
      // eligibility cannot be resolved for one transient TMDB batch.
      console.error("Failed to resolve auto-rating season totals:", err);
    }
  }
  return results;
}

// Manual season_ratings rows plus every auto-eligible season (rated via
// individual episode ratings, counted only once every episode in that
// season has actually been rated — see the total-episode-count check
// below) across every show, PLUS every manual movie rating — all merged
// into one array, most-recent-activity first. Manual always wins over
// auto for the same (show, season) — a season the user actually rated
// shouldn't also show its own auto score as a separate/competing entry.
// Returns RAW title/originalTitle/originalLanguage fields, not yet
// resolved through resolveTitle — callers resolve at render time (same
// reasoning as the Activity feed fix: baking a resolved title into this
// fetched result would freeze it at whatever Readable Languages happened
// to be the moment this ran).
export async function getMyRatingsForUser(userId, { limit = null } = {}) {
  // getAllMovieRatingsForUser gets its own catch — a movie-side failure
  // (e.g. movie_ratings not existing yet) must degrade to "no movie
  // ratings" instead of rejecting this whole Promise.all and blanking out
  // the user's real TV ratings too (the exact bug this comment is fixing:
  // Profile's "My Ratings" section disappearing entirely for a user who
  // only has TV ratings, because the movie query alone was failing).
  const sourceResults = await Promise.allSettled([
    getAllSeasonRatingsForUser(userId),
    getRatedEpisodesAcrossShows(userId),
    getAllMovieRatingsForUser(userId),
  ]);
  for (const result of sourceResults) if (result.status === "rejected") console.error(result.reason);
  if (sourceResults.every((result) => result.status === "rejected")) {
    throw new Error("All rating data sources failed to load.");
  }
  const [manualRows, autoRows, movieRows] = sourceResults.map((result) => result.status === "fulfilled" ? result.value : []);

  const manualKeys = new Set(manualRows.map((r) => `${r.showId}-${r.seasonNumber}`));
  const autoCandidates = autoRows.filter((r) => !manualKeys.has(`${r.showId}-${r.seasonNumber}`));

  let autoEligible = [];
  if (autoCandidates.length > 0) {
    const totals = await fetchSeasonTotals(autoCandidates.map((r) => ({ showId: r.showId, seasonNumber: r.seasonNumber })));
    const totalByKey = Object.fromEntries(totals.map((x) => [`${x.showId}-${x.seasonNumber}`, x.totalEpisodes]));
    autoEligible = autoCandidates.filter((r) => {
      const total = totalByKey[`${r.showId}-${r.seasonNumber}`];
      return total != null && r.ratedCount === total;
    });
  }

  // activityAt drives the sort — reviewDate (when the user says they
  // watched/reviewed it), not savedAt/updated_at (when the row was last
  // edited, which can drift long after the fact from an unrelated tweak
  // like fixing a typo). Auto-eligible seasons have no review_date at all
  // (no season_ratings row exists for them — see lib/seasonRatings.js),
  // so lastRatedAt (their own most recent episode-rating timestamp)
  // remains their activity marker; there's no "review date" concept to
  // prefer instead for those.
  //
  // reviewDate is a bare "YYYY-MM-DD" (day precision only), so
  // `new Date(r.reviewDate)` collapses every rating logged on the same
  // calendar day to the exact same midnight timestamp — every one of
  // today's ratings ties. Array.prototype.sort is stable, so those ties
  // used to fall back to whatever order the Supabase query happened to
  // return them in (effectively insertion/creation order, oldest first),
  // meaning the FIRST thing you rated today displayed above everything
  // you rated after it that same day — exactly backwards from "the
  // latest rated ones first", and confusing enough that a same-day batch
  // of new ratings could look like they "didn't show up" if enough same-
  // day entries pushed the real latest one past the preview's slice(0,10)
  // cutoff. createdAt (a real timestamp, always distinct) breaks the tie
  // in the correct direction — most-recently-logged same-day rating first
  // — without changing anything about how different days compare.
  const allEntries = [
    ...manualRows.map((r) => ({ ...r, mediaType: "tv", isAuto: false, activityAt: new Date(r.reviewDate) })),
    ...autoEligible.map((r) => ({ showId: r.showId, seasonNumber: r.seasonNumber, mediaType: "tv", rating: r.avg10, mood: null, characterName: null, text: "", isAuto: true, activityAt: r.lastRatedAt, createdAt: r.lastRatedAt })),
    ...movieRows.map((r) => ({ movieId: r.movieId, seasonNumber: null, mediaType: "movie", rating: r.rating, mood: r.mood, characterName: r.characterName, text: r.text, isAuto: false, activityAt: new Date(r.reviewDate), createdAt: r.createdAt })),
  ].sort((a, b) => (b.activityAt - a.activityAt) || (b.createdAt - a.createdAt));

  const entries = Number.isInteger(limit) && limit >= 0 ? allEntries.slice(0, limit) : allEntries;
  if (entries.length === 0) return [];

  const showIds = [...new Set(entries.filter((e) => e.mediaType === "tv").map((e) => e.showId))];
  const movieIds = [...new Set(entries.filter((e) => e.mediaType === "movie").map((e) => e.movieId))];
  const [shows, movies] = await Promise.all([
    fetchMetadataBatches("/api/shows/batch", showIds),
    fetchMetadataBatches("/api/movies/batch", movieIds),
  ]);
  const showById = Object.fromEntries(shows.map((r) => [r.id, r]));
  const movieById = Object.fromEntries(movies.map((r) => [r.id, r]));

  return entries.map((e) => {
    const meta = e.mediaType === "movie" ? movieById[e.movieId] : showById[e.showId];
    return {
      ...e,
      title: meta?.title ?? (e.mediaType === "movie" ? "Unknown Movie" : "Unknown Show"),
      originalTitle: meta?.originalTitle ?? null,
      originalLanguage: meta?.originalLanguage ?? null,
      posterPath: meta?.posterPath ?? null,
      backdropPath: meta?.backdropPath ?? null,
      year: e.mediaType === "movie" && meta?.releaseDate
        ? meta.releaseDate.slice(0, 4)
        : null,
      runtime: e.mediaType === "movie" ? (meta?.runtime ?? null) : null,
    };
  });
}

// Resolves just the (showId, seasonNumber) pairs the caller asks for,
// applying the exact same manual-wins-over-auto-eligible rule
// getMyRatingsForUser applies unscoped (see above) — extracted separately
// rather than reused inline so Highlights' Top Shows ranking (touching
// only a handful of seasons per month) doesn't pay for the user's ENTIRE
// rating history's worth of season-episode-count lookups on every month
// view. Returns Map<"showId-seasonNumber", rating> — only keys with a
// resolvable rating (manual or fully-auto-eligible) are present; an
// absent key means "not rated," same as getMyRatingsForUser never
// including an unrated season at all.
export async function resolveSeasonRatings(userId, pairs) {
  if (pairs.length === 0) return new Map();

  const manualRows = await getAllSeasonRatingsForUser(userId);
  const manualMap = new Map(manualRows.map((r) => [`${r.showId}-${r.seasonNumber}`, r.rating]));

  const result = new Map();
  const autoCandidates = [];
  for (const { showId, seasonNumber } of pairs) {
    const key = `${showId}-${seasonNumber}`;
    if (manualMap.has(key)) { result.set(key, manualMap.get(key)); continue; }
    autoCandidates.push({ showId, seasonNumber });
  }
  if (autoCandidates.length === 0) return result;

  const autoRows = await getRatedEpisodesAcrossShows(userId);
  const autoByKey = new Map(autoRows.map((r) => [`${r.showId}-${r.seasonNumber}`, r]));
  const eligible = autoCandidates
    .map(({ showId, seasonNumber }) => autoByKey.get(`${showId}-${seasonNumber}`))
    .filter(Boolean);
  if (eligible.length === 0) return result;

  const totalsRes = await fetch("/api/shows/season-episode-counts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seasons: eligible.map((r) => ({ showId: r.showId, seasonNumber: r.seasonNumber })) }),
  });
  const { results: totals } = await totalsRes.json();
  const totalByKey = Object.fromEntries(totals.map((x) => [`${x.showId}-${x.seasonNumber}`, x.totalEpisodes]));
  for (const r of eligible) {
    const key = `${r.showId}-${r.seasonNumber}`;
    if (totalByKey[key] != null && r.ratedCount === totalByKey[key]) result.set(key, r.avg10);
  }
  return result;
}
