"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import Grain from "@/components/ui/Grain";
import GlassCircle from "@/components/ui/GlassCircle";
import PosterCard from "@/components/ui/PosterCard";
import PosterQuickStatusMenu from "@/components/ui/PosterQuickStatusMenu";
import PosterArt from "@/components/ui/PosterArt";
import StarInput from "@/components/ui/StarInput";
import TimeMachineSection from "@/components/profile/TimeMachineSection";
import { useAuth } from "@/lib/auth-context";
import { useFavorites } from "@/lib/favorites-context";
import { useMovieFavorites } from "@/lib/movie-favorites-context";
import { getUserMoviesWatchedInYear, getAllUserMoviesWatched } from "@/lib/userMovies";
import { getWatchedEpisodesForYear, getWatchedYears } from "@/lib/episodeWatches";
import { getMyRatingsForUser } from "@/lib/myRatings";
import { getCollections } from "@/lib/collections";
import { hydrateCollectionPreviews } from "@/lib/collectionPreviews";
import { getProfile } from "@/lib/profile";
import { fallbackPalette, seasonLabel } from "@/lib/library";
import { tmdbImage } from "@/lib/tmdb";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { themes, DEFAULT_ACCENT, collectionPalette } from "@/lib/theme";
import { computeRewatchCount } from "@/lib/highlights";
import { bangkokNow as getBangkokNow } from "@/lib/bangkokDate";
import CollectionBoxSet from "@/components/CollectionBoxSet";
import {
  FAVORITE_SHOWS_ORDER_KEY, FAVORITE_SHOWS_SORT_KEY, FAVORITE_MOVIES_ORDER_KEY, FAVORITE_MOVIES_SORT_KEY,
  loadFavoriteOrder, loadFavoriteSort, sortFavorites,
} from "@/lib/favoritesOrder";

const t = themes.dark;
const accent = DEFAULT_ACCENT;
const profileFavoritesSessionCache = new Map();

// Two-cover blended backdrop for collection cards — distinct from
// PosterArt's single-cover gradient, no shared equivalent.
function CollectionBackdrop({ covers }) {
  const c1 = covers[0] || { base: "#221a14", glow: accent };
  const c2 = covers[1] || c1;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: `linear-gradient(120deg, ${c1.glow}40 0%, ${c1.base} 45%, ${c2.base} 100%)` }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 25% 30%, ${c1.glow}45, transparent 60%)` }} />
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 80% 70%, ${c2.glow}30, transparent 55%)` }} />
      <Grain />
    </div>
  );
}

// Neutral radial-glow header backdrop — generic, no shared equivalent.
// Renders the user's saved background image (if any) under the same
// gradient/grain treatment, so the empty hero area gets real content
// without changing the existing readable-dark-gradient look when there's
// no image to show. Base gradient and ambient glow are both neutral
// gray/white now (were warm brown + amber) — amber is reserved for
// functional accents (buttons/progress/ratings/active states), not a
// decorative background wash.
function AtmosBackdrop({ imageUrl }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "linear-gradient(160deg, #232323 0%, #17171a 55%, #0a0a0c 100%)" }}>
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- a Storage URL, not a TMDB path PosterArt/next-image is built for
        <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} />
      )}
      <div style={{ position: "absolute", right: -60, top: "10%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)", filter: "blur(20px)" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, #0A0A0C 0%, rgba(10,10,12,0.2) 55%, rgba(0,0,0,0.15) 100%)" }} />
      <Grain />
    </div>
  );
}

export default function Page() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { isFavorite, toggleFavorite, favoriteEntries, loading: favoritesCtxLoading } = useFavorites();
  const { isFavorite: isMovieFavorite, toggleFavorite: toggleMovieFavorite, favoriteEntries: movieFavoriteEntries, loading: movieFavoritesCtxLoading } = useMovieFavorites();
  const readableLanguages = useReadableLanguages();
  const initialFavoriteRows = user ? profileFavoritesSessionCache.get(user.id) : null;
  const [showFavorites, setShowFavorites] = useState(() => initialFavoriteRows?.shows ?? []);
  const [showFavoritesLoading, setShowFavoritesLoading] = useState(() => !initialFavoriteRows);
  // "Favorite Movies" preview row — a lightweight one-shot fetch keyed on
  // the favorited-id set's own identity, unlike the dedicated Favorites
  // Movies page's incremental sync-diff (app/(tabs)/profile/favorites/
  // movies/page.jsx): this row only ever shows 6 items, so refetching the
  // small batch whenever the set of favorited movie ids changes is simpler
  // and cheap enough not to need that page's more careful diffing.
  const [movieFavorites, setMovieFavorites] = useState(() => initialFavoriteRows?.movies ?? []);
  // Same sort mode + hand-arranged order the full Favorites list pages
  // (app/(tabs)/profile/favorites, .../favorites/movies) read and write —
  // see lib/favoritesOrder.js. Hydrated on mount (this page remounts on
  // every navigation back to it, so no extra sync needed) so a choice
  // made on either full list page is reflected here too and survives a
  // refresh either way.
  const [showFavSort, setShowFavSort] = useState("firstAdded");
  const [showFavOrder, setShowFavOrder] = useState([]);
  const [movieFavSort, setMovieFavSort] = useState("firstAdded");
  const [movieFavOrder, setMovieFavOrder] = useState([]);
  useEffect(() => {
    setShowFavSort(loadFavoriteSort(FAVORITE_SHOWS_SORT_KEY));
    setShowFavOrder(loadFavoriteOrder(FAVORITE_SHOWS_ORDER_KEY));
    setMovieFavSort(loadFavoriteSort(FAVORITE_MOVIES_SORT_KEY));
    setMovieFavOrder(loadFavoriteOrder(FAVORITE_MOVIES_ORDER_KEY));
  }, []);
  const [longPress, setLongPress] = useState(null);
  // Backgrounds-then-returns refetch, same reasoning and pattern as
  // app/(tabs)/home/page.jsx's own two listener effects below (see their
  // comments for the full rationale) — this page had NEITHER a
  // visibility/focus listener NOR bfcache/pageshow handling at all before
  // this, unlike Home. Every section here (favorites, month stats, "My
  // Ratings" preview, Collections, Time Machine) fetched once on mount and
  // then never again for as long as the page instance stayed alive, so
  // e.g. finishing an episode on Show Detail and coming back to Profile
  // (via a tab switch, the phone's app switcher, or a browser back/swipe
  // that restores this page from bfcache) kept showing whatever library
  // status/ratings/stats were true at the moment this page was first
  // mounted, until something else forced a real remount. One shared token
  // (not a separate one per section) since every section below reads the
  // same underlying watch/rating data and should refresh together.
  const [pageRefreshToken, setPageRefreshToken] = useState(0);
  const lastPageFetchAtRef = useRef(0);
  const [collections, setCollections] = useState([]);
  const [profile, setProfile] = useState(null);
  const [monthStats, setMonthStats] = useState(null);
  const [myRatings, setMyRatings] = useState([]);
  // "Time Machine" — one card per calendar year with any watch activity
  // (TV or movie), newest first. See the fetch effect below for how this
  // is built.
  const [timeMachineYears, setTimeMachineYears] = useState([]);
  const [timeMachineLoading, setTimeMachineLoading] = useState(true);

  // 30s stale threshold — between Home's 20s (near-real-time hero) and
  // Highlights' 60s (monthly aggregates); this page is a mix of both. The
  // timestamp is stamped here, at trigger time, rather than inside each of
  // the five effects below that key off pageRefreshToken — with several
  // independent consumers of one token there's no single "the fetch
  // started" moment to hang it on, and gating re-triggers by "time since
  // we last decided to refresh" is an equally good defense against a
  // refresh-storm from rapid tab-switching.
  const PAGE_STALE_AFTER_MS = 30_000;
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastPageFetchAtRef.current < PAGE_STALE_AFTER_MS) return;
      lastPageFetchAtRef.current = Date.now();
      setPageRefreshToken((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  // bfcache restore (back/swipe navigation into this page) — see
  // app/(tabs)/home/page.jsx's identical listener for the full rationale.
  // No staleness threshold: a persisted pageshow means nothing here re-ran
  // at all, so it always needs a fresh fetch regardless of elapsed time.
  useEffect(() => {
    const onPageShow = (event) => {
      if (!event.persisted) return;
      lastPageFetchAtRef.current = Date.now();
      setPageRefreshToken((n) => n + 1);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  // Display name/bio/avatar/background — null (not yet saved) falls back
  // to the account email + decorative gradient placeholders below.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getProfile(user.id).then((p) => { if (!cancelled) setProfile(p); }).catch(console.error);
    return () => { cancelled = true; };
  }, [user]);

  // This-month stats widget — a direct duplicate of Highlights' own four
  // stat cards (episodes/shows/active days/rewatched), same current-month
  // scope Highlights defaults to on open. Deliberately its own small,
  // self-contained fetch rather than reusing Highlights' full state
  // machine (year rows + silent background refresh + retry tokens + TMDB
  // enrichment) — none of that is needed here since every number below
  // only needs the raw episode_watches rows, not enriched show/episode
  // data: uniqueShowCount only needs tmdb_show_id (already on the raw
  // row), activeDayCount only needs watched_on for day-precision rows,
  // and computeRewatchCount (lib/highlights.js) already operates on raw
  // rows directly. null (not []) until loaded so this section doesn't
  // flash a misleading "0" row before the real numbers arrive.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const now = getBangkokNow();
    Promise.all([
      getWatchedEpisodesForYear(user.id, now.year),
      // Independently caught — a movie-side failure must degrade to 0
      // rather than blanking the whole widget row (same reasoning as
      // every other TV+movie merge this session).
      getUserMoviesWatchedInYear(user.id, now.year).catch((err) => { console.error(err); return []; }),
    ]).then(([rows, movieRows]) => {
      if (cancelled) return;
      const monthRows = rows.filter((r) =>
        (r.watch_date_precision === "day" || r.watch_date_precision === "month") &&
        r.watched_year === now.year && r.watched_month === now.month
      );
      // user_movies now carries the same watched_year/watched_month
      // columns episode_watches has (precision parity) — read those
      // directly rather than parsing watchedOn, which is null for
      // month/year-precision rows.
      const monthMovies = movieRows.filter((r) => r.watchedYear === now.year && r.watchedMonth === now.month);
      setMonthStats({
        shows: new Set(monthRows.map((r) => r.tmdb_show_id)).size,
        movies: monthMovies.length,
        activeDays: new Set(monthRows.filter((r) => r.watch_date_precision === "day").map((r) => r.watched_on)).size,
        rewatched: computeRewatchCount(monthRows),
      });
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [user, pageRefreshToken]);

  // Favorite Shows preview — this row only needs title/poster metadata for
  // the actual favorite ids. It previously waited for every show in the
  // library to resolve every season's progress and then fetched every logo,
  // which made this small row consistently finish last on Profile.
  useEffect(() => {
    if (!user) { setShowFavorites([]); setShowFavoritesLoading(false); return; }
    const cached = profileFavoritesSessionCache.get(user.id);
    if (cached?.shows) {
      setShowFavorites(cached.shows);
      setShowFavoritesLoading(false);
    }
    if (favoritesCtxLoading) { if (!cached?.shows) setShowFavoritesLoading(true); return; }
    const ids = favoriteEntries.map((entry) => entry.id);
    if (ids.length === 0) {
      setShowFavorites([]);
      setShowFavoritesLoading(false);
      profileFavoritesSessionCache.set(user.id, { ...profileFavoritesSessionCache.get(user.id), shows: [] });
      return;
    }
    let cancelled = false;
    setShowFavoritesLoading(true);
    fetch(`/api/shows/batch?ids=${ids.join(",")}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Favorite shows failed (${res.status})`);
        return res.json();
      })
      .then(({ results }) => {
        if (cancelled) return;
        const addedAtById = Object.fromEntries(favoriteEntries.map((entry) => [entry.id, entry.addedAt]));
        const shows = (results ?? []).map((show) => ({ ...show, addedAt: addedAtById[show.id] }));
        setShowFavorites(shows);
        profileFavoritesSessionCache.set(user.id, { ...profileFavoritesSessionCache.get(user.id), shows });
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setShowFavoritesLoading(false); });
    return () => { cancelled = true; };
  }, [user, favoriteEntries, favoritesCtxLoading]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getCollections(user.id).then(async (rows) => {
      if (cancelled) return;
      const mapped = rows.map((c, i) => ({
        id: c.id,
        name: c.name,
        coverStyle: c.coverStyle,
        count: c.showIds.length + (c.movieIds?.length ?? 0),
        showIds: c.showIds,
        movieIds: c.movieIds ?? [],
        covers: [{ base: collectionPalette[i % collectionPalette.length].c2, glow: collectionPalette[i % collectionPalette.length].c1 }],
      }));
      setCollections(mapped);

      // Only Collector Box Set needs real per-title art (posters/backdrops)
      // — every other style stays the palette-gradient placeholder above.
      const boxsetOnes = mapped.filter((c) => c.coverStyle === "boxset" && c.count > 0);
      const hydrated = await hydrateCollectionPreviews(boxsetOnes, 5);
      if (cancelled) return;
      const coversById = new Map(hydrated.map((c) => [c.id, c.covers]));
      setCollections((prev) => prev.map((c) => coversById.has(c.id) ? { ...c, covers: coversById.get(c.id) } : c));
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [user, pageRefreshToken]);

  // "My Ratings" preview — the first 10 of getMyRatingsForUser's full,
  // most-recent-activity-first list (see lib/myRatings.js, shared with
  // the full "My Ratings" page this section's ">" links to).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyRatingsForUser(user.id)
      .then((entries) => { if (!cancelled) setMyRatings(entries.slice(0, 10)); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [user, pageRefreshToken]);

  // "Favorite Movies" preview row — see movieFavorites' own declaration
  // comment for why this is a simple refetch-on-id-set-change rather than
  // the dedicated Favorites Movies page's more careful incremental sync.
  useEffect(() => {
    if (!user) { setMovieFavorites([]); return; }
    const cached = profileFavoritesSessionCache.get(user.id);
    if (cached?.movies) setMovieFavorites(cached.movies);
    // Fetch the full favorites row. The old six-item preview cap was just
    // enough for a phone, but visibly stopped short on iPad portrait and
    // landscape even when the user had more favorite movies available.
    const ids = movieFavoriteEntries.map((e) => e.id);
    if (ids.length === 0) {
      setMovieFavorites([]);
      profileFavoritesSessionCache.set(user.id, { ...profileFavoritesSessionCache.get(user.id), movies: [] });
      return;
    }
    let cancelled = false;
    fetch(`/api/movies/batch?ids=${ids.join(",")}`)
      .then((res) => res.json())
      .then(({ results }) => {
        if (cancelled) return;
        const addedAtById = Object.fromEntries(movieFavoriteEntries.map((e) => [e.id, e.addedAt]));
        const movies = results.map((movie) => ({ ...movie, addedAt: addedAtById[movie.id] }));
        setMovieFavorites(movies);
        profileFavoritesSessionCache.set(user.id, { ...profileFavoritesSessionCache.get(user.id), movies });
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [user, movieFavoriteEntries]);

  // "Time Machine" — one card per calendar year the user watched *anything*
  // in (TV or movie), newest first. Important: this is the year the user
  // WATCHED a title, never its release/premiere year — getWatchedYears/
  // getWatchedEpisodesForYear key off episode_watches.watched_year (TV),
  // getAllUserMoviesWatched keys off user_movies.watched_year (movies), both
  // deliberately independent of release_date/first_air_date. One
  // representative title per year (whichever was watched most recently
  // within that year) supplies the card's poster art via fallbackPalette(id)
  // — the same deterministic per-id atmosphere palette every other surface
  // in the app already uses (ShelfCase/CollectionBackdrop/My Ratings' poster
  // glow), not real color-sampling from the poster.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setTimeMachineLoading(true);
    (async () => {
      const [showYears, movieRows] = await Promise.all([
        getWatchedYears(user.id).catch((err) => { console.error(err); return []; }),
        getAllUserMoviesWatched(user.id).catch((err) => { console.error(err); return []; }),
      ]);

      const movieRowsByYear = new Map();
      for (const r of movieRows) {
        // watchedYear (not a parsed watchedOn) — populated for both day
        // AND month precision (see lib/userMovies.js's
        // getAllUserMoviesWatched), so a month-only-precision movie isn't
        // silently dropped from its year here.
        const year = r.watchedYear;
        if (year == null) continue;
        if (!movieRowsByYear.has(year)) movieRowsByYear.set(year, []);
        movieRowsByYear.get(year).push(r);
      }

      const years = [...new Set([...showYears, ...movieRowsByYear.keys()])].sort((a, b) => b - a);
      if (years.length === 0) { if (!cancelled) { setTimeMachineYears([]); setTimeMachineLoading(false); } return; }

      const showRowsByYear = await Promise.all(
        years.map((year) =>
          showYears.includes(year)
            ? getWatchedEpisodesForYear(user.id, year).catch((err) => { console.error(err); return []; })
            : Promise.resolve([])
        )
      );

      const entries = years.map((year, i) => {
        const showRows = showRowsByYear[i];
        const movieRowsForYear = movieRowsByYear.get(year) ?? [];
        const showIds = new Set(showRows.map((r) => r.tmdb_show_id));
        const movieIds = new Set(movieRowsForYear.map((r) => r.movieId));

        // Representative title = whichever watch event, TV or movie,
        // happened most recently within this calendar year.
        let repType = null, repId = null, repAt = null;
        for (const r of showRows) {
          const at = r.watched_at ?? r.watched_on;
          if (at && (!repAt || at > repAt)) { repAt = at; repType = "tv"; repId = r.tmdb_show_id; }
        }
        for (const r of movieRowsForYear) {
          // A synthetic sortable string for month/year-precision rows
          // (no real watchedOn to compare) — only used to rank "most
          // recent within this year" against other entries, never stored.
          const at = r.watchedOn ?? `${r.watchedYear}-${String(r.watchedMonth ?? 1).padStart(2, "0")}-01`;
          if (!repAt || at > repAt) { repAt = at; repType = "movie"; repId = r.movieId; }
        }

        return { year, titleCount: showIds.size + movieIds.size, repType, repId };
      });

      const repShowIds = [...new Set(entries.filter((e) => e.repType === "tv").map((e) => e.repId))];
      const repMovieIds = [...new Set(entries.filter((e) => e.repType === "movie").map((e) => e.repId))];

      const [showResults, movieResults] = await Promise.all([
        repShowIds.length ? fetch(`/api/shows/batch?ids=${repShowIds.join(",")}`).then((r) => r.json()).then((d) => d.results) : [],
        repMovieIds.length ? fetch(`/api/movies/batch?ids=${repMovieIds.join(",")}`).then((r) => r.json()).then((d) => d.results) : [],
      ]);
      if (cancelled) return;

      const showById = Object.fromEntries(showResults.map((s) => [s.id, s]));
      const movieById = Object.fromEntries(movieResults.map((m) => [m.id, m]));

      // No fallbackPalette here — TimeMachineYearCard derives its own
      // atmosphere by sampling the representative poster's real dominant
      // color client-side, not a deterministic per-id table.
      setTimeMachineYears(entries.map((e) => {
        const rep = e.repType === "movie" ? movieById[e.repId] : showById[e.repId];
        return { year: e.year, titleCount: e.titleCount, posterPath: rep?.posterPath ?? null };
      }));
      setTimeMachineLoading(false);
    })().catch((err) => { console.error(err); if (!cancelled) setTimeMachineLoading(false); });
    return () => { cancelled = true; };
  }, [user, pageRefreshToken]);

  if (!loading && !user) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center text-center px-8" style={{ background: t.bg }}>
        <Icon name="user" size={30} color={t.textDim} />
        <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginTop: 14 }}>Sign in to see your profile</div>
        <div style={{ fontSize: 13, color: t.textDim, marginTop: 4 }}>Your library, favorites, and collections live here once you&apos;re signed in.</div>
        <button onClick={() => router.push("/login")} className="rounded-full active:scale-95 transition" style={{ marginTop: 20, padding: "11px 24px", background: accent }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1a1108" }}>Sign In</span>
        </button>
      </div>
    );
  }

  const displayName = profile?.displayName || user?.email || "";
  const bio = profile?.bio ?? "";

  // Same sort/order the full Favorites list pages apply — see
  // lib/favoritesOrder.js and this file's own hydration effect above.
  const resolvedShowFavorites = showFavorites.filter((show) => isFavorite(show.id)).map((show) => ({
    ...show,
    title: resolveTitle(show, readableLanguages),
  }));
  const displayedFavorites = sortFavorites(resolvedShowFavorites, showFavSort, showFavOrder);
  const displayedMovieFavorites = sortFavorites(movieFavorites.filter((movie) => isMovieFavorite(movie.id)), movieFavSort, movieFavOrder);
  const favoritesRowLoading = showFavoritesLoading;
  const movieFavoritesRowLoading = movieFavoritesCtxLoading;

  return (
    <>
      <div className="relative w-full" style={{ height: 190 }}>
        <AtmosBackdrop imageUrl={profile?.backgroundUrl} />
        {/* Activity's own entry point moved here from the separate
            frosted-glass pill it used to be (below the backdrop) — now a
            plain bell GlassCircle immediately left of Settings, same row/
            size/spacing. Still opens the exact same /profile/activity page
            (its own Activity/Notifications tab switcher — see
            components/profile/ActivityPageSwitcher.jsx — already covers
            both; this bell doesn't need its own separate notifications
            surface). */}
        <div className="absolute top-0 right-0 flex items-center gap-2 px-6" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <GlassCircle onClick={() => router.push("/profile/activity")} t={t}>
            <Icon name="bell" size={16} color="#fff" />
          </GlassCircle>
          <GlassCircle onClick={() => router.push("/profile/settings")} t={t}>
            <Icon name="settings" size={16} color="#fff" />
          </GlassCircle>
        </div>
      </div>

      {/* pointerEvents: none — nothing here is interactive (plain avatar
          image + name/handle/bio text), but its box is full-width and
          pulled up -34px with zIndex:10 to overlap the backdrop, which
          would otherwise silently swallow taps on the Edit Profile button
          above it (the exact bug already found and fixed on the Edit
          Profile screen itself).
          Avatar on top, name/@handle/bio stacked directly under it (not
          beside it) — @handle only when one's actually set, quietly
          omitted rather than showing a bare "@". */}
      <div className="px-6" style={{ marginTop: -34, position: "relative", zIndex: 10, pointerEvents: "none" }}>
        <div className="overflow-hidden" style={{ width: 76, height: 76, borderRadius: "50%", background: "linear-gradient(135deg,#e8a24c,#5a3420)", border: "3px solid #0A0A0C", flexShrink: 0 }}>
          {profile?.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a Storage URL, not a TMDB path
            <img src={profile.avatarUrl} alt="" className="w-full h-full" style={{ objectFit: "cover" }} />
          )}
        </div>
        <div className="text-left" style={{ marginTop: 10, minWidth: 0 }}>
          <div className="truncate" style={{ fontSize: 20.9, fontWeight: 700, color: "#fff" }}>{displayName}</div>
          {profile?.handle && <div className="truncate" style={{ fontSize: 13.75, color: t.textDim, marginTop: 2 }}>@{profile.handle}</div>}
          <div className="truncate" style={{ fontSize: 13.75, color: t.textDim, marginTop: 2 }}>{bio}</div>
        </div>
      </div>

      {/* This-month stats — duplicated from Highlights' own stat cards
          (same style), so it's a quick at-a-glance summary right on
          Profile without opening Highlights. Episodes dropped (redundant
          with Shows right next to it) and Movies added — Shows, Movies,
          Active Days, Rewatched, per explicit request. */}
      {/* Plain text columns now — no icon, no per-stat card/background.
          Same four stats, same real data, just a big bold number with a
          smaller gray label under it, side by side. */}
      {monthStats && (
        <div className="flex gap-2 px-6" style={{ marginTop: 22 }}>
          {[[monthStats.shows, "Shows"], [monthStats.movies, "Movies"], [monthStats.activeDays, "Active Days"], [monthStats.rewatched, "Rewatched"]].map(([n, l], i) => (
            <div key={i} className="flex-1 flex flex-col items-center text-center">
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{n}</div>
              <div style={{ fontSize: 11, color: t.textDim, marginTop: 3, textAlign: "center", lineHeight: 1.2 }}>{l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Separator between the stats row and Favorites — was just a
          shared 26/28px top margin before, with nothing visually marking
          the two sections apart. */}
      <div style={{ height: 1, background: t.cardBorder, margin: "22px 24px 0" }} />

      <div style={{ marginTop: 22 }}>
        <div className="flex items-center justify-between px-6 mb-3">
          <span style={{ fontSize: 17.25, fontWeight: 600, color: "#fff" }}>Favorite Shows</span>
          <Link href="/profile/favorites"><Icon name="chevronRight" size={18} color={t.textDim} /></Link>
        </div>
        <div className="flex gap-2.5 overflow-x-auto px-6" style={{ scrollbarWidth: "none" }}>
          {favoritesRowLoading ? (
            [0, 1, 2].map((i) => (
              <div key={i} className="flex-shrink-0 rounded-xl" style={{ width: 104, aspectRatio: "2 / 3", background: t.cardFill, border: `1px solid ${t.cardBorder}` }} />
            ))
          ) : (
            // Same heart badge as the Library grid below — every card here
            // is already a favorite by definition, so it's always filled,
            // but still shown for consistency and to let it be unfavorited
            // right from this row.
            displayedFavorites.map((s) => (
              <PosterCard key={s.id} show={s} href={`/show/${s.id}`} width={104} titlePlacement="overlay" favorite={isFavorite(s.id)} onToggleFavorite={() => toggleFavorite(s.id, "Profile:favoritesRow")} onLongPress={(show, rect) => setLongPress({ show, rect })} />
            ))
          )}
        </div>
      </div>

      <div style={{ marginTop: 26 }}>
        <div className="flex items-center justify-between px-6 mb-3">
          <span style={{ fontSize: 17.25, fontWeight: 600, color: "#fff" }}>Favorite Movies</span>
          <Link href="/profile/favorites/movies"><Icon name="chevronRight" size={18} color={t.textDim} /></Link>
        </div>
        <div className="flex gap-2.5 overflow-x-auto px-6" style={{ scrollbarWidth: "none" }}>
          {movieFavoritesRowLoading ? (
            [0, 1, 2].map((i) => (
              <div key={i} className="flex-shrink-0 rounded-xl" style={{ width: 104, aspectRatio: "2 / 3", background: t.cardFill, border: `1px solid ${t.cardBorder}` }} />
            ))
          ) : (
            displayedMovieFavorites.map((m) => (
              <PosterCard key={m.id} show={m} href={`/movie/${m.id}`} width={104} titlePlacement="overlay" favorite={isMovieFavorite(m.id)} onToggleFavorite={() => toggleMovieFavorite(m.id, "Profile:movieFavoritesRow")} />
            ))
          )}
        </div>
      </div>

      <div style={{ marginTop: 26 }}>
        <div className="flex items-center justify-between px-6 mb-3">
          <span style={{ fontSize: 17.25, fontWeight: 600, color: "#fff" }}>Collections</span>
          <Link href="/profile/collections"><Icon name="chevronRight" size={18} color={t.textDim} /></Link>
        </div>
        <div className="flex gap-2.5 overflow-x-auto px-6" style={{ scrollbarWidth: "none" }}>
          {collections.map((l) => (
            <button
              key={l.id}
              onClick={() => router.push(`/profile/collections/${l.id}`)}
              className="relative flex-shrink-0 rounded-2xl overflow-hidden active:scale-95 transition text-left"
              style={{ width: 168, height: 133 }}
            >
              {l.coverStyle === "boxset" ? (
                <CollectionBoxSet shows={l.covers} compact />
              ) : (
                <CollectionBackdrop covers={l.covers} />
              )}
              <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.25) 55%, transparent 78%)" }} />
              <div className="absolute left-0 right-0 bottom-0" style={{ padding: "11px 13px" }}>
                <div style={{ fontSize: 14.3, fontWeight: 700, color: "#fff" }}>{l.name}</div>
                <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.72)", marginTop: 2 }}>{l.count} title{l.count === 1 ? "" : "s"}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {myRatings.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <div className="flex items-center justify-between px-6 mb-3">
            <span style={{ fontSize: 17.25, fontWeight: 600, color: "#fff" }}>My Ratings</span>
            <Link href="/profile/ratings"><Icon name="chevronRight" size={18} color={t.textDim} /></Link>
          </div>
          <div className="flex gap-2.5 overflow-x-auto px-6" style={{ scrollbarWidth: "none" }}>
            {myRatings.map((r) => {
              const isMovie = r.mediaType === "movie";
              // Original-language title when the show's original_language is
              // one of the user's Readable Languages (Settings), same rule
              // resolveTitle() enforces everywhere else in the app — not the
              // English title unconditionally.
              const displayTitle = r.title ? resolveTitle(r, readableLanguages) : null;
              // Raw ids collide across media types — see the same branch in
              // app/(tabs)/profile/ratings/page.jsx for the full reasoning.
              const key = isMovie ? `movie-${r.movieId}` : `tv-${r.showId}-${r.seasonNumber}`;
              const detailPath = isMovie ? `/movie/${r.movieId}` : `/show/${r.showId}`;
              const ratingPath = isMovie ? `/movie/${r.movieId}?tab=reviews` : `/show/${r.showId}?tab=reviews&reviewSeason=${r.seasonNumber}`;
              const palette = fallbackPalette(isMovie ? r.movieId : r.showId);
              return (
                // Poster opens the show/movie itself; the rest of the card
                // opens the season's/movie's official saved rating card
                // directly (same deep link SeasonRatingScreen's/
                // MovieRatingScreen's own edit-pencil uses, minus &edit=1 —
                // a rating that already exists should land in its read-only
                // "saved" view, not force the editor). Neither one opens
                // ShareRatingCard anymore — that's only reachable from
                // inside the saved card's own Share button now, not as an
                // immediate first tap.
                <div
                  key={key}
                  onClick={() => router.push(ratingPath)}
                  className="flex-shrink-0 flex items-center text-left active:scale-95 transition rounded-2xl cursor-pointer"
                  style={{ width: 264, gap: 12, padding: 12, background: t.cardFill, border: `1px solid ${t.cardBorder}` }}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); router.push(detailPath); }}
                    className="relative rounded-xl overflow-hidden flex-shrink-0"
                    style={{ width: 84, aspectRatio: "2 / 3" }}
                  >
                    <PosterArt posterPath={r.posterPath} base={palette.base} glow={palette.glow} alt={displayTitle ?? ""} />
                    {r.isAuto && (
                      <div className="absolute flex items-center gap-1 rounded-full" style={{ left: 5, top: 5, padding: "2px 5px", background: "rgba(232,162,76,0.2)" }}>
                        <Icon name="sparkle" size={8} color={accent} />
                      </div>
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate" style={{ fontSize: 14.5, fontWeight: 700, color: "#fff" }}>{displayTitle ?? "…"}</div>
                    {/* No mood emoji here — kept deliberately off this
                        preview card per explicit request; still shown on
                        the full saved rating card (SeasonRatingScreen/
                        MovieRatingScreen's own "Your Mood" section). */}
                    <div className="flex items-center gap-1.5" style={{ marginTop: 2 }}>
                      {!isMovie && <span style={{ fontSize: 12, color: t.textDim }}>{seasonLabel(r.seasonNumber)}</span>}
                    </div>
                    {/* value is r.rating/2 — r.rating is the app's usual 0-10
                        scale, StarInput's own scale is 0-5 (maxStars
                        default), and it already knows how to paint a half-
                        filled star, so a 9.0/10 rating correctly shows as
                        4.5/5 (4 full + 1 half), not 4 full + a plain empty
                        5th star. */}
                    <div style={{ marginTop: 8 }}>
                      <StarInput value={r.rating / 2} onChange={() => {}} size={14} gap={2.5} readOnly />
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginTop: 5, lineHeight: 1 }}>{r.rating.toFixed(1)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <TimeMachineSection
        years={timeMachineYears}
        loading={timeMachineLoading}
        onYearSelect={(year) => router.push(`/profile/time-machine/${year}`)}
      />

      <PosterQuickStatusMenu
        show={longPress?.show ?? null}
        anchorRect={longPress?.rect ?? null}
        userId={user?.id}
        source="Profile:posterLongPress"
        onClose={() => setLongPress(null)}
      />
    </>
  );
}
