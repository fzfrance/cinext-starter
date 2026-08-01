import { NextResponse } from "next/server";
import { getShowDetails, getShowRecommendations, discoverShowsByGenre, discoverNewReleasesByGenre, getGenres, isExcludedShow } from "@/lib/tmdb";

const MAX_ITEMS = 12;
const MAX_SEED_GENRES = 3;

// Real per-user "Recommended for You" — Explore's hero mixes a few of
// these in alongside Top Rated, and a dedicated row/grid shows the rest
// (see ExploreClient.jsx). This app has no server-side session (no
// @supabase/ssr — auth only lives in the browser client), so it can't
// look up "the signed-in user's library" itself; the caller passes a
// handful of the user's own show ids as seeds.
//
// Genre affinity, not per-show similarity, drives this: TMDB's per-show
// /recommendations endpoint returns shows *similar to one specific
// show* by its own opaque algorithm, which tends to read as a generic
// "more like this" list rather than something shaped by the user's
// actual taste across their whole library. Tallying genres across every
// seed show and discovering more of whichever genres show up most is
// what actually reflects "the genres/types of show this person
// watches." Per-show recommendations are still used, but only as a
// fallback if genre discovery alone doesn't turn up enough shows (e.g.
// a very narrow or unusual genre mix).
//
// Deliberately does NOT pull from currently-trending shows: Explore's own
// "Trending Now" row is sourced from the exact same TMDB trending
// endpoint, so folding it in here made this section mostly reproduce
// that row instead of reflecting this user's own taste. excludeIds is
// also expected to include whatever's currently shown as trending on the
// client, as a second guard against the same show appearing in both.
//
// POST body: { seedIds: number[], excludeIds: number[] }
export async function POST(request) {
  const { seedIds = [], excludeIds = [] } = await request.json();
  if (seedIds.length === 0) return NextResponse.json({ items: [] });

  const excludeSet = new Set(excludeIds.map(Number));
  const [{ genres }, seedShows] = await Promise.all([
    getGenres(),
    Promise.all(seedIds.map((id) => getShowDetails(id).catch(() => null))),
  ]);
  const genreName = new Map(genres.map((g) => [g.id, g.name]));

  const genreCounts = new Map();
  for (const show of seedShows) {
    for (const g of show?.genres ?? []) {
      genreCounts.set(g.id, (genreCounts.get(g.id) ?? 0) + 1);
    }
  }

  const topGenreIds = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SEED_GENRES)
    .map(([id]) => id);

  const byId = new Map();
  // Which top genre's discover call actually surfaced each show — the
  // true reason it's here, unlike the old per-show "shares the most
  // genres with X" guess (two shows can both be tagged "Drama" without
  // being remotely similar, which is what made "Similar to X" read as
  // random). Only set for genre-sourced items; the per-show
  // recommendations fallback below has no single driving genre, so
  // those items get no attribution and fall back to the generic label.
  const sourceGenreOf = new Map();
  const addResults = (results, genreId) => {
    for (const show of results ?? []) {
      if (excludeSet.has(show.id) || byId.has(show.id) || isExcludedShow(show)) continue;
      byId.set(show.id, show);
      if (genreId != null) sourceGenreOf.set(show.id, genreId);
    }
  };

  // Priority order (first-added wins ties via addResults' Map dedup):
  // 1. newest releases within the user's top genres.
  // 2. the existing popularity-ranked genre discovery.
  // 3. per-show recommendations, as the original fallback.
  if (topGenreIds.length > 0) {
    const newReleasePages = await Promise.all(topGenreIds.map((id) => discoverNewReleasesByGenre(id).catch(() => ({ results: [] }))));
    newReleasePages.forEach((page, i) => addResults(page.results, topGenreIds[i]));
  }

  if (topGenreIds.length > 0) {
    const discoverPages = await Promise.all(topGenreIds.map((id) => discoverShowsByGenre(id).catch(() => ({ results: [] }))));
    discoverPages.forEach((page, i) => addResults(page.results, topGenreIds[i]));
  }

  // Fallback only — either no genre signal at all (TMDB lookups failed
  // for every seed) or genre discovery alone didn't reach MAX_ITEMS.
  if (byId.size < MAX_ITEMS) {
    const recLists = await Promise.all(seedIds.map((id) => getShowRecommendations(id).catch(() => ({ results: [] }))));
    recLists.forEach((list) => addResults(list.results));
  }

  const items = [...byId.values()].slice(0, MAX_ITEMS).map((show) => {
    const showGenres = (show.genre_ids ?? []).slice(0, 2).map((id) => genreName.get(id)).filter(Boolean);
    const year = show.first_air_date ? show.first_air_date.slice(0, 4) : null;
    return {
      id: show.id,
      title: show.name,
      originalTitle: show.original_name ?? null,
      originalLanguage: show.original_language ?? null,
      genre: showGenres[0] ?? "",
      meta: [...showGenres, year].filter(Boolean).join(" · "),
      date: show.first_air_date ?? "",
      rating: show.vote_average ? show.vote_average.toFixed(1) : "",
      // The genre that actually drove this show's discovery — "Because
      // you watch {genre}" on Explore's hero, only ever a claim this
      // route can actually back up. null falls back to the generic
      // "Recommended for You" label.
      becauseOfGenre: genreName.get(sourceGenreOf.get(show.id)) ?? null,
      // Two separate fields, not one: these items render in two very
      // different shapes — vertical 2:3 cards in the row/grid (want the
      // real portrait poster, with its official title treatment baked
      // in) and a full-bleed landscape background when mixed into the
      // hero (want the backdrop instead). A single backdrop-first
      // posterPath (copied from how the hero-only Top Rated slides are
      // built in page.jsx) looked wrong on the vertical cards — a
      // cropped, often textless landscape still standing in for the
      // actual poster.
      posterPath: show.poster_path,
      backdropPath: show.backdrop_path ?? show.poster_path,
    };
  });

  return NextResponse.json({ items });
}
