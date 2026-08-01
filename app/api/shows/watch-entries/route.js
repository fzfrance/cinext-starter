import { NextResponse } from "next/server";
import { getShowDetails, getSeasonDetails } from "@/lib/tmdb";

// Enriches a month's raw watch-event rows with real display info — backs
// every card on Highlights' overview (hours, Top Shows, Top Genres,
// personality) and the Watch History calendar's day-detail panel (show
// title/poster, episode title/still, runtime). One entry per watch
// EVENT, not per distinct episode — a rewatch produces its own separate
// row with its own timestamp, same as episode_watches itself, so summing
// runtimeMinutes across every returned entry is the correct total
// watched time. Deliberately scoped to one month at a time by the
// caller, not a whole year, to keep each request small.
//
// POST body: { episodes: [{ id, showId, season, episode, watchedAt,
// watchDatePrecision, watchedOn, watchedYear, watchedMonth,
// watchDateSource, rating }] } — watchedAt, the watch_date_* fields, and
// rating pass through unchanged so the caller can bucket/precision-filter
// entries and render a personal-rating badge without a second round trip;
// id (the underlying episode_watches row id) passes through the same way
// so the caller can target one specific watch event for removal or a
// Watch Date edit without a second lookup.
// getShowDetails/getSeasonDetails failures are caught individually here,
// not left to reject the whole resolveShowEntries call — a Promise.all
// over every season with a watch this month used to mean one bad/missing
// season (an incomplete TMDB entry, a transient fetch error) silently
// dropped *every* watched episode for this show that month, including
// ones from seasons that fetched fine. The underlying episode_watches row
// was always there; it just never made it into what Highlights displays,
// which read as "I marked this watched and it didn't show up" with
// nothing but a server-side console.error to explain why. Degrading to a
// placeholder/empty result per failed fetch instead means a watch always
// at least counts (hours, calendar dot, Top Shows/Genres), even if one
// show's title or one season's episode metadata couldn't be resolved.
async function resolveShowEntries(showId, episodes) {
  const show = await getShowDetails(showId).catch((err) => {
    console.error(`Failed to fetch show details for ${showId}:`, err);
    return null;
  });
  const fallbackMinutes = show?.episode_run_time?.[0] ?? 0;
  const genres = (show?.genres ?? []).map((g) => g.name);
  // Already present on the same getShowDetails response fetched above —
  // no extra TMDB call needed. Backs the Explorer personality's "2 shows
  // from different countries/languages" check (lib/highlights.js).
  const originCountry = show?.origin_country ?? [];
  const originalLanguage = show?.original_language ?? null;

  const seasonNumbers = [...new Set(episodes.map((e) => e.season))];
  const seasons = await Promise.all(
    seasonNumbers.map((n) =>
      getSeasonDetails(showId, n).catch((err) => {
        console.error(`Failed to fetch season ${n} details for show ${showId}:`, err);
        return { season_number: n, episodes: [] };
      })
    )
  );

  const byKey = new Map();
  // Real per-season episode totals (from the same fetch, not TMDB's
  // separate top-level show.seasons summary) — Highlights' Completionist
  // signal needs to compare "episodes of this season watched this month"
  // against "how many episodes this season actually has" to tell a
  // finished season apart from a partially-watched one.
  const seasonEpisodeCounts = new Map();
  for (const season of seasons) {
    seasonEpisodeCounts.set(season.season_number, (season.episodes ?? []).length);
    for (const ep of season.episodes ?? []) {
      byKey.set(`${season.season_number}-${ep.episode_number}`, {
        title: ep.name ?? "",
        runtime: ep.runtime ?? fallbackMinutes,
        stillPath: ep.still_path ?? null,
        airDate: ep.air_date ?? null,
      });
    }
  }

  return episodes.map((e) => {
    const hit = byKey.get(`${e.season}-${e.episode}`);
    return {
      id: e.id,
      showId,
      season: e.season,
      episode: e.episode,
      watchedAt: e.watchedAt,
      showTitle: show?.name ?? "",
      // originalTitle + originalLanguage together let callers run this
      // through resolveTitle (lib/languages.js) — same Readable Languages
      // rule every other show list in the app already applies, which Top
      // Shows/computeTopShows previously skipped (always showed showTitle
      // verbatim, TMDB's English name, regardless of the user's Readable
      // Languages picks).
      originalTitle: show?.original_name ?? null,
      posterPath: show?.poster_path ?? null,
      // Fallback chain the caller renders (episode still -> show backdrop
      // -> show poster -> PosterArt's own decorative placeholder) needs
      // all three source paths, not just one pre-resolved one, since
      // which one actually has art varies per episode/show.
      backdropPath: show?.backdrop_path ?? null,
      genres,
      originCountry,
      originalLanguage,
      episodeTitle: hit?.title || `Episode ${e.episode}`,
      stillPath: hit?.stillPath ?? null,
      runtimeMinutes: hit?.runtime ?? fallbackMinutes,
      seasonEpisodeCount: seasonEpisodeCounts.get(e.season) ?? null,
      // The episode's real TMDB air date — backs the Watch Date sheet's
      // Release date/Release month options when reopened from Highlights.
      episodeAirDate: hit?.airDate ?? null,
      // Pass-through, not derived here — same reasoning as id/watchedAt
      // above: these already reflect exactly what's stored for this row.
      watchDatePrecision: e.watchDatePrecision,
      watchedOn: e.watchedOn,
      watchedYear: e.watchedYear,
      watchedMonth: e.watchedMonth,
      watchDateSource: e.watchDateSource,
      // Same pass-through — backs the personal-rating badge on the Watch
      // History day view's episode thumbnails (null when never rated).
      rating: e.rating ?? null,
    };
  });
}

export async function POST(request) {
  const { episodes } = await request.json();
  if (!Array.isArray(episodes) || episodes.length === 0) return NextResponse.json({ entries: [] });

  const byShow = new Map();
  for (const e of episodes) {
    if (!byShow.has(e.showId)) byShow.set(e.showId, []);
    byShow.get(e.showId).push(e);
  }

  const results = await Promise.all(
    [...byShow.entries()].map(([showId, eps]) =>
      resolveShowEntries(showId, eps).catch((err) => {
        console.error(`Failed to resolve watch entries for show ${showId}:`, err);
        return [];
      })
    )
  );

  return NextResponse.json({ entries: results.flat() });
}
