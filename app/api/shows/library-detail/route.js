import { NextResponse } from "next/server";
import { getShowDetails, getAiredEpisodesForShow } from "@/lib/tmdb";

// One retry, short delay — a transient TMDB connectivity blip (seen in
// practice: intermittent ConnectTimeoutError reaching TMDB's API) used to
// make resolveShow reject outright, and since the POST handler below
// drops any show whose resolution fails entirely (results.filter(Boolean)),
// that one flaky request could wipe a show out of Home's Continue
// Watching/In Progress completely — even though nothing about the show's
// real data had changed. A single retry after a short pause is enough to
// ride out a brief blip without making a genuinely-down TMDB hang the
// whole page load for too long.
async function withRetry(fn, retries = 1, delayMs = 500) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

// Single TMDB-resolution point for every Home section (Continue Watching /
// In Progress / Watchlist / Upcoming) — each show is fetched via
// getShowDetails exactly once here regardless of how many sections it
// appears in, and lib/tmdb.js's tmdbFetch already edge-caches that response
// for an hour, so re-running this across page loads doesn't refetch either.
// Season-by-season episode data (needed to find the next unwatched episode
// and compute progress) is the expensive part — only fetched when the
// caller marks a show needsProgress: true (i.e. it's a "watching" show
// Home needs a queued episode for). Watchlist/Upcoming-only shows never
// pay for it.
//
// POST body: { shows: [{ id, needsProgress: boolean, watched?: string[], skipped?: string[] }] }
// watched: "season-episode" keys already watched, from
// lib/episodeWatches.js's getShowWatchSummary — only meaningful (and only
// needed) when needsProgress is true. skipped: same key shape, from
// lib/episodeSkips.js's getShowSkipSummary — optional, omit/empty if the
// caller doesn't track skips (every field below still works, a skipped
// episode just isn't distinguished from a not-watched one).
async function resolveShow({ id, needsProgress, watched, skipped }) {
  const show = await getShowDetails(id);

  const seasonCount = show.number_of_seasons ?? 0;
  const episodeCount = show.number_of_episodes ?? 0;

  const base = {
    id: show.id,
    title: show.name ?? "",
    // Original-language title + language code — resolveTitle (lib/languages.js)
    // decides client-side whether to show this instead of the title above,
    // based on the signed-in user's Readable Languages preference.
    originalTitle: show.original_name ?? null,
    originalLanguage: show.original_language ?? null,
    posterPath: show.poster_path,
    backdropPath: show.backdrop_path ?? show.poster_path,
    genre: (show.genres ?? [])[0]?.name ?? "",
    // Full genre list — feeds the Library shelf's aisle-placement priority
    // resolver (lib/library.js's primaryGenre/GENRE_PRIORITY), which needs
    // every tag a show carries, not just the first one `genre` above uses.
    genres: (show.genres ?? []).map((g) => g.name),
    // TMDB's own rating, shown raw (not halved/normalized) — backs the
    // Library shelf's "Highly Recommended" row.
    tmdbRating: show.vote_average ?? null,
    tagline: show.tagline ?? "",
    year: show.first_air_date ? show.first_air_date.slice(0, 4) : "",
    // Real equivalent of the old mock data's "S2 · 10 episodes" display
    // string, for the Library shelf's case labels.
    meta: seasonCount
      ? `${seasonCount} season${seasonCount === 1 ? "" : "s"}${episodeCount ? ` · ${episodeCount} episodes` : ""}`
      : "",
    // "Returning Series" | "Ended" | "Canceled" | "In Production" | "Planned" | "Pilot"
    tmdbStatus: show.status ?? "",
    nextEpisodeToAir: show.next_episode_to_air
      ? {
          season: show.next_episode_to_air.season_number,
          episode: show.next_episode_to_air.episode_number,
          title: show.next_episode_to_air.name ?? "",
          airDate: show.next_episode_to_air.air_date,
        }
      : null,
  };

  if (!needsProgress) return base;

  const watchedSet = new Set(watched ?? []);
  const skippedSet = new Set(skipped ?? []);
  // Regular episodes only — season 0 (Specials) never counts toward
  // completion (progress, "caught up", episodesLeft, or the "next
  // episode" pointer below), matching Show Detail's own rule: Specials
  // stay independently trackable but never gate/represent the main
  // show's progress. getAiredEpisodesForShow still returns them (some
  // other caller might need the full list), this just filters them back
  // out here, at the one place completion math for this response happens.
  const aired = (await getAiredEpisodesForShow(id, show)).filter((e) => e.season !== 0);

  const isResolved = (e) => { const key = `${e.season}-${e.episode}`; return watchedSet.has(key) || skippedSet.has(key); };
  const nextUp = aired.find((e) => !isResolved(e));
  const watchedAiredCount = aired.filter((e) => watchedSet.has(`${e.season}-${e.episode}`)).length;
  const resolvedAiredCount = aired.filter(isResolved).length;
  const caughtUp = !nextUp;
  // Caught up: reference the most recent aired episode instead of leaving
  // the card pointing at nothing. Still mid-season with a gap: point at the
  // first unwatched/unskipped one, matching Show Detail's own "earlier
  // unwatched" ordering (app/show/[id]/ShowDetailClient.jsx).
  const current = nextUp ?? aired[aired.length - 1] ?? null;

  return {
    ...base,
    season: current?.season ?? null,
    episode: current?.episode ?? null,
    epTitle: current?.title ?? "",
    epPosterPath: current?.stillPath ?? null,
    // Backs Home's Continue Watching hero card marking this episode
    // watched + opening EpisodeRatingFlow directly (its Watch Date sheet
    // needs a real air date for Release date/Release month, and the
    // "Watched · Xm" badge needs a real runtime) — same fields
    // ShowDetailClient/EpisodeDetailClient already have from their own
    // season-details fetch, just not previously threaded through here.
    epRuntime: current?.runtime ?? null,
    epAirDate: current?.airDate ?? null,
    episodesLeft: caughtUp ? 0 : aired.length - resolvedAiredCount,
    progressPct: aired.length > 0 ? Math.round((resolvedAiredCount / aired.length) * 100) : 0,
    caughtUp,
    // Raw counts, not just the derived episodesLeft/progressPct above —
    // lib/statusResolver.js's resolveShowStatus takes these directly, so
    // every caller resolves status the same way instead of each
    // reverse-engineering it from a percentage. watchedReleasedEpisodes
    // is real watches only (for "X watched" stats/labels);
    // resolvedReleasedEpisodes additionally counts skips (for the actual
    // completion decision) — see resolveShowStatus's own doc comment.
    releasedEpisodes: aired.length,
    watchedReleasedEpisodes: watchedAiredCount,
    resolvedReleasedEpisodes: resolvedAiredCount,
  };
}

export async function POST(request) {
  const { shows } = await request.json();
  if (!Array.isArray(shows) || shows.length === 0) return NextResponse.json({ results: [] });

  const results = await Promise.all(
    shows.map((s) =>
      withRetry(() => resolveShow(s)).catch((err) => {
        console.error(`Failed to resolve library detail for show ${s.id} after retry:`, err);
        return null;
      })
    )
  );

  return NextResponse.json({ results: results.filter(Boolean) });
}
