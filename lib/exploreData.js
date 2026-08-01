// ---------------------------------------------------------------------------
// Shared trending/hero data fetch for the Explore experience — extracted
// from app/(tabs)/explore/page.jsx so both that route AND app/search
// (which now shows this same, unchanged Explore content behind its search
// bar) can fetch it identically without duplicating this logic.
// ---------------------------------------------------------------------------

import { trendingShows, topRatedShows, discoverNewReleases, isExcludedShow, getGenres } from "@/lib/tmdb";

const HERO_SLIDE_COUNT = 5;
// How many of TMDB's top_rated pages (20 shows each) to pool together
// before sampling — a single page fetched every time gave the exact
// same 5 shows on every visit for as long as the underlying fetch stayed
// cached (lib/tmdb.js caches each page for an hour). Pooling several
// pages and randomly sampling on every request (this route is already
// fully dynamic, not statically generated) means the hero actually
// varies visit to visit instead of looking frozen, while still only
// ever drawing from genuinely top-rated shows.
const TOP_RATED_POOL_PAGES = 3;
// Same pooling rationale, for the new-releases pool that now gets first
// claim on hero slots (see heroShows below).
const NEW_RELEASE_POOL_PAGES = 2;

function shuffled(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Trending shows only carry genre_ids (numbers); resolve them against the
// real TV genre list so cards show names, not blank lines. Each show can
// have several genre_ids — the grid list (TrendingCard) shows one string
// and the genre-chip filter compares it by strict equality, so that list
// takes just the first id as the item's primary genre. The hero slides
// show up to two genres plus the air year, since there's room for it.
export async function getExploreData() {
  try {
    const [{ results }, topRatedPages, newReleasePages, { genres }] = await Promise.all([
      trendingShows(),
      Promise.all(Array.from({ length: TOP_RATED_POOL_PAGES }, (_, i) => topRatedShows(i + 1))),
      Promise.all(Array.from({ length: NEW_RELEASE_POOL_PAGES }, (_, i) => discoverNewReleases(i + 1))),
      getGenres(),
    ]);
    const genreName = new Map(genres.map((g) => [g.id, g.name]));
    const shows = results ?? [];

    const trending = shows.map((show) => ({
      id: show.id,
      title: show.name,
      originalTitle: show.original_name ?? null,
      originalLanguage: show.original_language ?? null,
      genre: genreName.get(show.genre_ids?.[0]) ?? "",
      posterPath: show.poster_path,
    }));

    // Hero used to pull only from top-rated (a different TMDB list than
    // the Trending Now row below, so the two sections wouldn't just
    // duplicate each other). Now it prioritizes what's currently trending
    // and newly released ahead of that evergreen top-rated ranking —
    // trending/new-release candidates fill the slots first, and top-rated
    // is only tapped to fill out any remainder. Animation ("cartoons")
    // and Indian-origin shows are excluded from every source (see
    // isExcludedShow). Everything is still pooled across several pages
    // and randomly sampled within its tier (see *_POOL_PAGES above)
    // instead of always the same first few results, so the hero varies
    // visit to visit rather than looking frozen. "Recommended for you"
    // slides get mixed in client-side (see ExploreClient) once the
    // signed-in user's own library is known — that part can only happen
    // client-side, since this app has no server-side session (no
    // @supabase/ssr).
    //
    // Each show is tagged with which tier it actually came from (_tier)
    // *before* the three pools get merged/deduped — carried through to
    // heroSlides' own `mode` below, so ExploreHero's badge always tells
    // the truth about why a given slide is showing (trending/new/actually
    // top-rated), instead of every slide claiming "TOP RATED" regardless
    // of source, even ones pulled from the new-release tier with only a
    // handful of votes so far.
    const trendingTagged = shows.map((s) => ({ ...s, _tier: "trending" }));
    const newReleaseTagged = newReleasePages.flatMap((p) => p.results ?? []).map((s) => ({ ...s, _tier: "new" }));
    // trending listed last so it wins ties in the dedup Map below (a show
    // that's both trending and a new release reads better as "trending").
    const priorityPool = [...new Map(
      [...newReleaseTagged, ...trendingTagged]
        .filter((show) => !isExcludedShow(show))
        .map((show) => [show.id, show])
    ).values()];
    const topRatedPool = topRatedPages.flatMap((p) => p.results ?? []).map((s) => ({ ...s, _tier: "toprated" }));
    const priorityIds = new Set(priorityPool.map((show) => show.id));
    const fallbackPool = [...new Map(
      topRatedPool
        .filter((show) => !isExcludedShow(show) && !priorityIds.has(show.id))
        .map((show) => [show.id, show])
    ).values()];

    const shuffledPriority = shuffled(priorityPool);
    const heroShows = shuffledPriority.length >= HERO_SLIDE_COUNT
      ? shuffledPriority
      : [...shuffledPriority, ...shuffled(fallbackPool)];
    const heroSlides = heroShows.slice(0, HERO_SLIDE_COUNT).map((show) => {
      const showGenres = (show.genre_ids ?? []).slice(0, 2).map((id) => genreName.get(id)).filter(Boolean);
      const year = show.first_air_date ? show.first_air_date.slice(0, 4) : null;
      return {
        id: show.id,
        mode: show._tier,
        title: show.name,
        originalTitle: show.original_name ?? null,
        originalLanguage: show.original_language ?? null,
        meta: [...showGenres, year].filter(Boolean).join(" · "),
        rating: show.vote_average ? show.vote_average.toFixed(1) : "",
        posterPath: show.backdrop_path ?? show.poster_path,
      };
    });

    return { trending, heroSlides };
  } catch (err) {
    console.error("Failed to fetch trending shows:", err);
    return { trending: [], heroSlides: [] };
  }
}
