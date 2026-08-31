"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "@/components/ui/Icon";
import RecommendedRow from "@/components/library/RecommendedRow";
import StatusFilterRow, { MOVIE_STATUS_ITEMS } from "@/components/library/StatusFilterRow";
import LibraryTabMenu, { TAB_LABEL } from "@/components/library/LibraryTabMenu";
import ViewModeMenu, { VIEW_MODE_ICON } from "@/components/library/ViewModeMenu";
import Aisle from "@/components/library/Aisle";
import GenrePosterRow from "@/components/library/GenrePosterRow";
import CollectionRow from "@/components/library/CollectionRow";
import CaseOverlay from "@/components/library/CaseOverlay";
import MovieCaseOverlay from "@/components/library/MovieCaseOverlay";
import { useAuth } from "@/lib/auth-context";
import { getUserShows } from "@/lib/userShows";
import { getUserMovies } from "@/lib/userMovies";
import { getShowWatchSummary } from "@/lib/episodeWatches";
import { resolveShowStatus } from "@/lib/statusResolver";
import { getCollections, createCollection as createCollectionRow } from "@/lib/collections";
import { shelfGenresForShow, shelfGenresForMovie, fallbackPalette } from "@/lib/library";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;
const librarySessionCache = new Map();
const LIBRARY_SNAPSHOT_PREFIX = "cinext:librarySnapshot:v1:";


// Library — Shows/Movies/Collections, wired to the signed-in user's real
// tracked shows (lib/userShows.js) + real collections (lib/collections.js)
// + live TMDB detail (app/api/shows/library-detail). FloatingNav is already
// rendered once by the shared (tabs) layout, so this page renders no nav of
// its own.
//
// Split into this Client Component + a thin Suspense-wrapping page.jsx (not
// a single file directly exported as the route) because the active tab now
// lives in ?tab=... (useSearchParams) rather than a bare local default —
// that hook requires a Suspense boundary on a statically-generated route,
// same reason app/(tabs)/profile/library and app/(tabs)/profile/shelf are
// already split the same way.
//
// Collections here are NOT a separate concept from /profile/collections —
// same underlying rows, same detail page. Each collection renders as its
// own heading + a flat scrollable row of front-facing posters (CollectionRow)
// drawn straight from the same pooled `shows` data used by the Shows tab —
// no separate boxset/backdrop artwork fetch needed. The heading's chevron
// navigates straight to /profile/collections/[id] — no separate
// Library-only collection detail view.
const VALID_TABS = new Set(["shows", "movies", "collections"]);
const LIBRARY_VIEW_MODE_KEY = "cinext:libraryViewMode";

export default function LibraryClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const readableLanguages = useReadableLanguages();
  // Library metadata does not change when the display-language preference
  // resolves. Keying the cache by language used to throw away the warm
  // snapshot and trigger a second full TMDB load moments after the first.
  const sessionCacheKey = user?.id ?? null;
  const initialLibrary = sessionCacheKey ? librarySessionCache.get(sessionCacheKey) : null;

  // Every show touched by this screen — tracked shows AND any show that
  // only appears inside a collection without being tracked at all. `status`/
  // `favorite` are null/false for the latter until the user actually sets
  // one (which is also how they'd get added to the library — same as
  // everywhere else in the app).
  const [shows, setShows] = useState(() => initialLibrary?.shows ?? []);
  const [collectionsRaw, setCollectionsRaw] = useState(() => initialLibrary?.collectionsRaw ?? []); // [{id, name, shared, showIds, movieIds}]
  const [collectionsLoaded, setCollectionsLoaded] = useState(() => Boolean(initialLibrary?.collectionsLoaded));
  const [loaded, setLoaded] = useState(() => Boolean(initialLibrary?.loaded));
  // Every movie touched by this screen — tracked movies AND any movie that
  // only appears inside a collection without being tracked, same rule as
  // `shows` above. Kept in its own array (not merged into `shows`) since
  // the two use entirely different overlay/data-layer components
  // downstream.
  const [movies, setMovies] = useState(() => initialLibrary?.movies ?? []);
  const [moviesLoaded, setMoviesLoaded] = useState(() => Boolean(initialLibrary?.moviesLoaded));

  const [openShow, setOpenShow] = useState(null);
  const [openOrigin, setOpenOrigin] = useState(null);
  // Which case-opening component the currently-open item needs — a movie
  // and a show render through genuinely different overlays (MovieCaseOverlay
  // vs CaseOverlay, different status/favorite data layers underneath), so
  // this has to travel alongside openShow/openOrigin rather than being
  // inferred from `tab` (which may have changed by the time the overlay
  // actually renders).
  const [openMediaType, setOpenMediaType] = useState("tv");
  // Driven by ?tab=shows|movies|collections, not a bare local default —
  // a plain useState("shows") reset back to Shows on every refresh (and
  // on returning here via the browser's own back button from a show/
  // movie/collection detail page), which is exactly the reported bug:
  // "I refresh the movie library, it shouldn't switch back to shows."
  // Lazy-initialized from the CURRENT URL at mount (covers the common
  // case: a fresh mount after refresh or back-navigation to a different
  // URL), plus the effect below keeps it in sync reactively for the case
  // where this same component instance's URL changes without remounting.
  const [tab, setTab] = useState(() => {
    const fromUrl = searchParams.get("tab");
    return VALID_TABS.has(fromUrl) ? fromUrl : "shows";
  });
  useEffect(() => {
    const fromUrl = searchParams.get("tab");
    if (VALID_TABS.has(fromUrl) && fromUrl !== tab) setTab(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally NOT depending on `tab` itself, or this would fight the selectTab handler's own optimistic setTab below
  }, [searchParams]);
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  // Switching tabs updates the URL (replace, not push — a tab switch
  // isn't its own back-button stop) alongside the local state, so this
  // page's own address always reflects what's actually showing: the
  // source of truth a refresh or a back-navigation restores from.
  const selectTab = (id) => {
    setTab(id);
    setTabMenuOpen(false);
    router.replace(`/library?tab=${id}`, { scroll: false });
  };
  const [statusFilter, setStatusFilter] = useState("all");
  // Separate from statusFilter above — switching tabs shouldn't carry a
  // Shows-tab filter pick over onto an unrelated Movies dataset.
  const [movieStatusFilter, setMovieStatusFilter] = useState("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");

  // Preserve the fully rendered tab payload across route unmounts. A revisit
  // paints this snapshot immediately while the normal effects below refresh
  // Supabase/TMDB in the background.
  useEffect(() => {
    if (!sessionCacheKey) return;
    const cached = librarySessionCache.get(sessionCacheKey);
    if (cached) {
      setShows(cached.shows ?? []);
      setCollectionsRaw(cached.collectionsRaw ?? []);
      setCollectionsLoaded(Boolean(cached.collectionsLoaded));
      setMovies(cached.movies ?? []);
      setLoaded(Boolean(cached.loaded));
      setMoviesLoaded(Boolean(cached.moviesLoaded));
      return;
    }
    // Survives a hard refresh/app relaunch. It paints immediately and is
    // always refreshed by the live Supabase/TMDB effects below.
    try {
      const raw = localStorage.getItem(`${LIBRARY_SNAPSHOT_PREFIX}${sessionCacheKey}`);
      if (!raw) return;
      const snapshot = JSON.parse(raw);
      setShows(snapshot.shows ?? []);
      setCollectionsRaw(snapshot.collectionsRaw ?? []);
      setCollectionsLoaded(Boolean(snapshot.collectionsLoaded));
      setMovies(snapshot.movies ?? []);
      setLoaded(Boolean(snapshot.loaded));
      setMoviesLoaded(Boolean(snapshot.moviesLoaded));
      librarySessionCache.set(sessionCacheKey, snapshot);
    } catch (err) {
      console.error("Failed to restore Library snapshot:", err);
    }
  }, [sessionCacheKey]);

  useEffect(() => {
    if (!sessionCacheKey || (!loaded && !moviesLoaded)) return;
    const snapshot = { shows, collectionsRaw, collectionsLoaded, loaded, movies, moviesLoaded };
    librarySessionCache.set(sessionCacheKey, snapshot);
    try {
      localStorage.setItem(`${LIBRARY_SNAPSHOT_PREFIX}${sessionCacheKey}`, JSON.stringify(snapshot));
    } catch (err) {
      console.error("Failed to save Library snapshot:", err);
    }
  }, [sessionCacheKey, shows, collectionsRaw, collectionsLoaded, loaded, movies, moviesLoaded]);

  // DVD Case / Poster display mode — deliberately independent of `tab`
  // (Shows/Movies/Collections): switching tabs must never reset this, and
  // it must survive navigating away and back, and ideally across app
  // launches. Plain localStorage (not the URL, not a Supabase-backed
  // profile field) — the same lightweight local-preference pattern
  // app/(tabs)/explore/library/LibraryClient.jsx already uses for its own
  // filter persistence, reused here rather than inventing a new mechanism.
  const [viewMode, setViewModeState] = useState("dvd");
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LIBRARY_VIEW_MODE_KEY);
      if (saved === "dvd" || saved === "poster") setViewModeState(saved);
    } catch (err) {
      console.error("Failed to restore library view mode:", err);
    }
  }, []);
  const selectViewMode = (mode) => {
    setViewModeState(mode);
    setViewMenuOpen(false);
    try { localStorage.setItem(LIBRARY_VIEW_MODE_KEY, mode); } catch (err) { console.error("Failed to save library view mode:", err); }
  };

  const libraryLoadUserRef = useRef(null);
  useEffect(() => {
    if (!user) return;
    if (libraryLoadUserRef.current === user.id) return;
    libraryLoadUserRef.current = user.id;
    let cancelled = false;
    (async () => {
      const [byShow, cols] = await Promise.all([getUserShows(user.id), getCollections(user.id)]);
      if (cancelled) return;
      const trackedIds = Object.keys(byShow).map(Number);
      const collectionIds = cols.flatMap((c) => c.showIds);
      const allIds = [...new Set([...trackedIds, ...collectionIds])];

      setCollectionsRaw(cols);
      setCollectionsLoaded(true);

      if (allIds.length === 0) {
        setShows([]);
        setLoaded(true);
        return;
      }

      // Real status (resolveShowStatus) needs live episode-progress counts
      // to know when a show that was never explicitly marked "Completed"
      // has actually had every released episode watched — otherwise a show
      // finished purely by checking off episodes stays stuck showing
      // whichever explicit status it last had (e.g. still "Watching"),
      // same bug Show Detail/Profile/Explore already avoid by resolving
      // through this function instead of reading the raw column. paused/
      // drop/completed are unconditional overrides inside resolveShowStatus
      // itself, so those don't need the (expensive, per-show season) fetch.
      const resolvableIds = trackedIds.filter((id) => {
        const st = byShow[id].status;
        return st !== "paused" && st !== "drop" && st !== "completed";
      });
      // Start the history read in parallel, but do not make posters/title
      // metadata wait for it or for the much slower season-by-season TMDB
      // progress resolution below.
      const summaryPromise = getShowWatchSummary(user.id, resolvableIds).catch((err) => {
        console.error("Failed to load Library watch summary:", err);
        return {};
      });

      const res = await fetch("/api/shows/library-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shows: allIds.map((id) => ({ id, needsProgress: false })),
        }),
      });
      const { results } = await res.json();
      if (cancelled) return;
      const byId = Object.fromEntries(results.map((r) => [r.id, r]));

      const merged = allIds.map((id) => {
        const detail = byId[id];
        if (!detail) return null;
        const tracked = byShow[id];
        const { base, glow } = fallbackPalette(id);
        return {
          id,
          // Stored language-neutral. The memoized display projection below
          // resolves this without re-running the entire network pipeline
          // when the user's language preference finishes loading.
          title: detail.title,
          // Kept separately so the inline search below still matches an
          // international show by its English name even when it's
          // currently displaying under its original-language title, OR
          // by its original-language name when it's currently displaying
          // under English (the reverse case — resolveTitle picks ONE of
          // these to show, but search needs to match either regardless
          // of which one won).
          englishTitle: detail.title,
          originalTitle: detail.originalTitle,
          originalLanguage: detail.originalLanguage,
          year: detail.year,
          meta: detail.meta,
          posterPath: detail.posterPath,
          backdropPath: detail.backdropPath,
          genres: detail.genres ?? [],
          keywords: detail.keywords ?? [],
          logoPath: null, // filled in by the separate logo-fetch effect below
          tmdbRating: detail.tmdbRating,
          tagline: detail.tagline,
          base, glow,
          status: tracked?.status ?? null,
          favorite: tracked?.favorite ?? false,
          addedAt: tracked?.addedAt ?? 0,
        };
      }).filter(Boolean);

      // Preserve any logoPath the separate logo-fetch effect below already
      // resolved for an id still present here, instead of unconditionally
      // wiping it back to null — this effect can legitimately re-run after
      // that one already succeeded (e.g. readableLanguages settling from
      // its default to the real profile value triggers both), and when it
      // does, the logo effect's own id+language guard correctly sees
      // nothing meaningful changed and skips re-fetching — which used to
      // leave every spine's logo permanently blanked out instead of just
      // skipped-because-already-known.
      setShows((prev) => {
        const prevLogoById = Object.fromEntries(prev.filter((s) => s.logoPath != null).map((s) => [s.id, s.logoPath]));
        return merged.map((s) => (s.id in prevLogoById ? { ...s, logoPath: prevLogoById[s.id] } : s));
      });
      setLoaded(true);

      // Status auto-resolution is progressive: shelves are already usable
      // while this slower history + season work finishes in the background.
      if (resolvableIds.length === 0) return;
      const summary = await summaryPromise;
      if (cancelled) return;
      const progressRes = await fetch("/api/shows/library-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shows: resolvableIds.map((id) => ({
            id,
            needsProgress: true,
            watched: summary[id]?.watchedKeys ?? [],
          })),
        }),
      });
      const { results: progressResults } = await progressRes.json();
      if (cancelled) return;
      const progressById = Object.fromEntries((progressResults ?? []).map((detail) => [detail.id, detail]));
      setShows((prev) => prev.map((show) => {
        const detail = progressById[show.id];
        const tracked = byShow[show.id];
        if (!detail || !tracked) return show;
        return {
          ...show,
          status: resolveShowStatus({
            explicitStatus: tracked.status,
            watchedReleasedEpisodes: detail.watchedReleasedEpisodes ?? 0,
            releasedEpisodes: detail.releasedEpisodes ?? 0,
            resolvedReleasedEpisodes: detail.resolvedReleasedEpisodes ?? detail.watchedReleasedEpisodes ?? 0,
          }),
        };
      }));
    })().catch((err) => {
      console.error(err);
      if (libraryLoadUserRef.current === user.id) libraryLoadUserRef.current = null;
    });
    return () => { cancelled = true; };
  }, [user]);

  // Spine/disc logos — a separate, progressive fetch (not blocking the
  // shelf's initial render): each show's best official title logo, matched
  // to the user's Readable Languages (lib/tmdb.js's pickBestLogo — a
  // K-drama gets its Korean wordmark when Korean is marked readable,
  // instead of TMDB's raw highest-voted logo, which skews English). Runs
  // once per distinct (ids, readableLanguages) pair, not on every render —
  // and re-runs once readableLanguages resolves from its default to the
  // user's real saved value, so an initial fetch made before that value
  // loaded doesn't stick.
  const logoIdsRef = useRef("");
  useEffect(() => {
    if (shows.length === 0) return;
    const ids = shows.map((s) => s.id);
    const key = `${ids.join(",")}|${readableLanguages.join(",")}`;
    if (logoIdsRef.current === key) return;
    logoIdsRef.current = key;
    let cancelled = false;
    fetch("/api/shows/logos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, readableLanguages }),
    })
      .then((res) => res.json())
      .then(({ results }) => {
        if (cancelled) return;
        const logoById = Object.fromEntries((results ?? []).map((r) => [r.id, r.logoPath]));
        setShows((prev) => prev.map((s) => (s.id in logoById ? { ...s, logoPath: logoById[s.id] } : s)));
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [shows, readableLanguages]);

  // Movies tab — mirrors the shows effect above, meaningfully simpler:
  // no episode-progress/resolveShowStatus branch at all (a movie's status
  // is always exactly what the user picked, see lib/userMovies.js), so
  // one batch fetch (/api/movies/library-detail) is the whole thing.
  // Depends on collectionsRaw (not a separate getCollections call) since
  // that same fetch already carries movieIds alongside showIds.
  const movieLoadKeyRef = useRef(null);
  useEffect(() => {
    if (!user || !collectionsLoaded) return;
    const collectionMovieIds = collectionsRaw.flatMap((c) => c.movieIds ?? []);
    const loadKey = `${user.id}|${[...new Set(collectionMovieIds)].sort((a, b) => a - b).join(",")}`;
    if (movieLoadKeyRef.current === loadKey) return;
    movieLoadKeyRef.current = loadKey;
    let cancelled = false;
    (async () => {
      const byMovie = await getUserMovies(user.id);
      const trackedIds = Object.keys(byMovie).map(Number);
      const allIds = [...new Set([...trackedIds, ...collectionMovieIds])];

      if (allIds.length === 0) {
        if (!cancelled) { setMovies([]); setMoviesLoaded(true); }
        return;
      }

      const res = await fetch("/api/movies/library-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: allIds }),
      });
      const { results } = await res.json();
      if (cancelled) return;
      const byId = Object.fromEntries(results.map((r) => [r.id, r]));

      const merged = allIds.map((id) => {
        const detail = byId[id];
        if (!detail) return null;
        const tracked = byMovie[id];
        const { base, glow } = fallbackPalette(id);
        return {
          id,
          title: detail.title,
          englishTitle: detail.title,
          originalTitle: detail.originalTitle,
          originalLanguage: detail.originalLanguage,
          year: detail.year,
          meta: detail.meta,
          posterPath: detail.posterPath,
          backdropPath: detail.backdropPath,
          genres: detail.genres ?? [],
          logoPath: null, // filled in by the separate logo-fetch effect below
          tmdbRating: detail.tmdbRating,
          tagline: detail.tagline,
          base, glow,
          status: tracked?.status ?? null,
          favorite: tracked?.favorite ?? false,
          addedAt: tracked?.addedAt ?? 0,
        };
      }).filter(Boolean);

      // Preserve any logoPath the logo-fetch effect below already resolved
      // — see the shows effect's identical comment above for why (this
      // effect re-running after that one succeeded used to permanently
      // blank every spine's logo back to null instead of leaving it alone).
      setMovies((prev) => {
        const prevLogoById = Object.fromEntries(prev.filter((s) => s.logoPath != null).map((s) => [s.id, s.logoPath]));
        return merged.map((s) => (s.id in prevLogoById ? { ...s, logoPath: prevLogoById[s.id] } : s));
      });
      setMoviesLoaded(true);
    })().catch((err) => {
      console.error(err);
      if (movieLoadKeyRef.current === loadKey) movieLoadKeyRef.current = null;
      if (!cancelled) setMoviesLoaded(true);
    });
    return () => { cancelled = true; };
  }, [user, collectionsLoaded, collectionsRaw]);

  const movieLogoIdsRef = useRef("");
  useEffect(() => {
    if (movies.length === 0) return;
    const ids = movies.map((s) => s.id);
    const key = `${ids.join(",")}|${readableLanguages.join(",")}`;
    if (movieLogoIdsRef.current === key) return;
    movieLogoIdsRef.current = key;
    let cancelled = false;
    fetch("/api/movies/logos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, readableLanguages }),
    })
      .then((res) => res.json())
      .then(({ results }) => {
        if (cancelled) return;
        const logoById = Object.fromEntries((results ?? []).map((r) => [r.id, r.logoPath]));
        setMovies((prev) => prev.map((s) => (s.id in logoById ? { ...s, logoPath: logoById[s.id] } : s)));
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [movies, readableLanguages]);

  const handleOpen = (show, rect, mediaType = "tv") => { setOpenShow(show); setOpenOrigin(rect); setOpenMediaType(mediaType); };
  const handleClose = () => { setOpenShow(null); setOpenOrigin(null); };

  // Optimistic local updates so CaseOverlay's real mutations reflect
  // immediately without a full refetch.
  const handleStatusChange = (showId, status) => setShows((prev) => prev.map((s) => (s.id === showId ? { ...s, status } : s)));
  const handleFavoriteChange = (showId, favorite) => setShows((prev) => prev.map((s) => (s.id === showId ? { ...s, favorite } : s)));
  const handleRemoved = (showId) => { setShows((prev) => prev.filter((s) => s.id !== showId)); handleClose(); };

  // Movie equivalents of the three handlers above, operating on `movies`
  // instead of `shows` — MovieCaseOverlay's own onStatusChange/
  // onFavoriteChange/onRemoved wire to these.
  const handleMovieStatusChange = (movieId, status) => setMovies((prev) => prev.map((s) => (s.id === movieId ? { ...s, status } : s)));
  const handleMovieFavoriteChange = (movieId, favorite) => setMovies((prev) => prev.map((s) => (s.id === movieId ? { ...s, favorite } : s)));
  const handleMovieRemoved = (movieId) => { setMovies((prev) => prev.filter((s) => s.id !== movieId)); handleClose(); };

  const createCollection = () => {
    if (!user) { router.push("/login"); return; }
    const name = newCollectionName.trim();
    if (!name) return;
    setNewCollectionName("");
    setNewCollectionOpen(false);
    createCollectionRow(user.id, name)
      .then((row) => {
        setCollectionsRaw((prev) => [{
          id: row.id,
          name: row.name,
          description: row.description ?? "",
          coverStyle: row.cover_style ?? "boxset",
          createdAt: row.created_at,
          shared: false,
          showIds: [],
          movieIds: [],
        }, ...prev]);
      })
      .catch(console.error);
  };

  // Language preference is a presentation concern, not a data-fetch key.
  // Project localized titles from already-loaded neutral metadata so a
  // language setting resolving never empties/refetches the Library.
  const localizedShows = useMemo(() => shows.map((show) => ({
    ...show,
    title: resolveTitle({
      title: show.englishTitle ?? show.title,
      originalTitle: show.originalTitle,
      originalLanguage: show.originalLanguage,
    }, readableLanguages),
  })), [shows, readableLanguages]);
  const localizedMovies = useMemo(() => movies.map((movie) => ({
    ...movie,
    title: resolveTitle({
      title: movie.englishTitle ?? movie.title,
      originalTitle: movie.originalTitle,
      originalLanguage: movie.originalLanguage,
    }, readableLanguages),
  })), [movies, readableLanguages]);

  // Only actually-tracked shows (a real status) count for the Shows tab/
  // aisles/Recommended row — a show can be present here purely because it's
  // in a collection, without being tracked.
  const trackedShows = localizedShows.filter((s) => s.status);
  const statusFiltered = statusFilter === "all" ? trackedShows : trackedShows.filter((s) => s.status === statusFilter);
  // The search box searches THIS same page/shelf layout in place — no
  // separate results screen. It narrows whatever the status filter above
  // already produced down to title matches only.
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filtered = trimmedQuery ? statusFiltered.filter((s) => s.title.toLowerCase().includes(trimmedQuery) || s.englishTitle?.toLowerCase().includes(trimmedQuery) || s.originalTitle?.toLowerCase().includes(trimmedQuery)) : statusFiltered;
  // Live per-status counts for the StatusFilterRow's expanded pill label
  // (e.g. "Watchlist · 22") — always over every tracked show, independent
  // of whichever filter is currently active.
  const statusCounts = {
    all: trackedShows.length,
    watching: trackedShows.filter((s) => s.status === "watching").length,
    watchlist: trackedShows.filter((s) => s.status === "watchlist").length,
    paused: trackedShows.filter((s) => s.status === "paused").length,
    drop: trackedShows.filter((s) => s.status === "drop").length,
    completed: trackedShows.filter((s) => s.status === "completed").length,
  };
  // Ranked by TMDB score, decoupled from the status filter above — this
  // ranking is internal, never shown as text (see RecommendedRow).
  const recommended = trackedShows.filter((s) => s.status === "watchlist" && s.tmdbRating != null).sort((a, b) => b.tmdbRating - a.tmdbRating).slice(0, 3);
  const genreGroups = Object.entries(
    filtered.reduce((acc, s) => {
      let shelfGenres = shelfGenresForShow(s.genres, s.keywords);
      if (shelfGenres.length === 0) {
        // Casual, fully-unfiltered browsing keeps Drama-only shows off
        // the shelf entirely (primaryGenre's own comment — a giant
        // catch-all Drama aisle was explicitly not wanted there). But
        // once the user has picked a specific status or is actively
        // searching, every matching show must actually be reachable
        // somewhere — a Drama-only show (common for e.g. Korean dramas
        // on TMDB) silently missing from its own Watchlist filter, or
        // from a search for its own title, reads as the show never got
        // added at all, not as "no aisle for it by design".
        if (statusFilter === "all" && !trimmedQuery) return acc;
        shelfGenres = ["Other"];
      }
      for (const genre of shelfGenres) (acc[genre] ||= []).push(s);
      return acc;
    }, {})
  )
  // Last added first within each shelf, regardless of status — same
  // ordering for every status (Watchlist, Watching, Paused, Drop,
  // Completed) and for the unfiltered mixed-status view alike.
  .map(([genre, items]) => [genre, [...items].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))])
  // The >=2-per-genre threshold only exists to declutter the fully-
  // unfiltered view — once the user has picked a specific status or is
  // actively searching, every matching show needs to actually show up,
  // even if it's the only one in its genre.
  .filter(([, items]) => (statusFilter !== "all" || !!trimmedQuery) || items.length >= 2).sort((a, b) => b[1].length - a[1].length);
  const nothingToShow = filtered.length === 0;

  // Movie equivalents of the block above — same rules, movie-scoped
  // (primaryGenreMovie instead of primaryGenre, movieStatusFilter instead
  // of statusFilter, otherwise identical).
  const trackedMovies = localizedMovies.filter((s) => s.status);
  const movieStatusFiltered = movieStatusFilter === "all" ? trackedMovies : trackedMovies.filter((s) => s.status === movieStatusFilter);
  const movieFiltered = trimmedQuery ? movieStatusFiltered.filter((s) => s.title.toLowerCase().includes(trimmedQuery) || s.englishTitle?.toLowerCase().includes(trimmedQuery) || s.originalTitle?.toLowerCase().includes(trimmedQuery)) : movieStatusFiltered;
  // Only watchlist/completed("Watched") — movies use the simplified
  // 2-status vocabulary (see components/StatusMenu.jsx's
  // movieStatusMenuOptions). A stray watching/paused/drop row from before
  // that simplification would just not match either pill — still counted
  // in `all`/still shelved by genre, just not reachable via either filter
  // pill specifically.
  const movieStatusCounts = {
    all: trackedMovies.length,
    watchlist: trackedMovies.filter((s) => s.status === "watchlist").length,
    completed: trackedMovies.filter((s) => s.status === "completed").length,
  };
  const movieRecommended = trackedMovies.filter((s) => s.status === "watchlist" && s.tmdbRating != null).sort((a, b) => b.tmdbRating - a.tmdbRating).slice(0, 3);
  const movieGenreGroups = Object.entries(
    movieFiltered.reduce((acc, s) => {
      let shelfGenres = shelfGenresForMovie(s.genres);
      if (shelfGenres.length === 0) {
        // Same reasoning as the shows block above — Drama-only movies
        // stay off the casual unfiltered shelf, but must still be
        // reachable once the user filters by status or searches.
        if (movieStatusFilter === "all" && !trimmedQuery) return acc;
        shelfGenres = ["Other"];
      }
      for (const genre of shelfGenres) (acc[genre] ||= []).push(s);
      return acc;
    }, {})
  )
    .map(([genre, items]) => [genre, [...items].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))])
    .filter(([, items]) => (movieStatusFilter !== "all" || !!trimmedQuery) || items.length >= 2).sort((a, b) => b[1].length - a[1].length);
  const movieNothingToShow = movieFiltered.length === 0;

  if (!authLoading && !user) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center text-center px-8" style={{ background: t.bg }}>
        <Icon name="collection" size={30} color={t.textDim} />
        <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginTop: 14 }}>Sign in to see your Library</div>
        <button onClick={() => router.push("/login")} className="rounded-full active:scale-95 transition" style={{ marginTop: 20, padding: "11px 24px", background: "#fff" }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1a1108" }}>Sign In</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: t.bg, color: "#fff", position: "relative" }}>
      {/* The static "Library" heading is gone — the title itself now names
          whichever tab is active ("Shows"/"Movies"/"Collections") and IS
          the Shows/Movies/Collections switcher's own trigger (a small ▾
          chevron right after the text opens the same LibraryTabMenu
          dropdown that used to hang off a separate icon-only pill). */}
      <div className="flex items-center justify-between px-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setTabMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 active:scale-95 transition"
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.5, color: "#fff" }}>{TAB_LABEL[tab] ?? "Library"}</span>
            <Icon name="chevronDown" size={20} color="#fff" />
          </button>
          {tabMenuOpen && (
            <LibraryTabMenu
              tab={tab}
              onSelect={selectTab}
              onClose={() => setTabMenuOpen(false)}
            />
          )}
        </div>
        <div className="flex items-center gap-2.5">
          {/* View — DVD Case / Poster switcher, immediately left of
              Search, matching its size/border/background/blur exactly.
              Own icon always reflects the current mode. */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setViewMenuOpen((v) => !v)}
              className="active:scale-90 transition"
              style={{ width: 38, height: 38, borderRadius: "50%", background: t.cardFill, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <Icon name={VIEW_MODE_ICON[viewMode]} size={16} color="#fff" />
            </button>
            {viewMenuOpen && (
              <ViewModeMenu
                viewMode={viewMode}
                onSelect={selectViewMode}
                onClose={() => setViewMenuOpen(false)}
              />
            )}
          </div>
          {/* Search — searches THIS library in place (title match against
              the same shelves below) rather than navigating to the separate
              global TMDB search — reveals an inline input instead of a new
              screen, closing it clears the query too. */}
          <button
            onClick={() => setSearchOpen((v) => { if (v) setSearchQuery(""); return !v; })}
            className="active:scale-90 transition"
            style={{ width: 38, height: 38, borderRadius: "50%", background: t.cardFill, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <Icon name={searchOpen ? "x" : "search"} size={16} color="#fff" />
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="px-6" style={{ marginTop: 14 }}>
          <div className="flex items-center gap-2.5 rounded-full" style={{ padding: "12px 18px", background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
            <Icon name="search" size={15} color={t.textDim} />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your library"
              className="flex-1 bg-transparent outline-none"
              style={{ fontSize: 14, color: "#fff" }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")}><Icon name="x" size={13} color={t.textDim} /></button>
            )}
          </div>
        </div>
      )}

      {/* Divider — closes out the header as its own titled section before
          the content begins. Inset to the page's standard 20px side
          padding (the header row's own px-6 is 24px, a Tailwind spacing
          step — this divider deliberately matches the content rows below
          it instead, e.g. RecommendedRow/Aisle/StatusFilterRow's own
          "20px" padding). */}
      <div style={{ margin: "16px 20px 0", height: 1, background: "rgba(255,255,255,0.09)" }} />

      {tab === "shows" && (
        <>
          {/* Collapses while actively searching — the search results render
              straight into the genre shelves below instead. */}
          {!trimmedQuery && <RecommendedRow items={recommended} onOpen={handleOpen} />}
          <div style={{ marginTop: 18 }}>
            <StatusFilterRow statusFilter={statusFilter} counts={statusCounts} onSelect={setStatusFilter} />
          </div>
          {genreGroups.map(([genre, items]) => (
            viewMode === "poster"
              ? <GenrePosterRow key={genre} title={genre} items={items} />
              : <Aisle key={genre} title={genre} items={items} onOpen={handleOpen} />
          ))}
          {loaded && nothingToShow && (
            <div style={{ padding: "70px 20px", textAlign: "center", color: t.textDim, fontSize: 13.5 }}>
              {trimmedQuery ? "No shows match your search." : trackedShows.length === 0 ? "Nothing in your library yet." : "No titles match this filter."}
            </div>
          )}
        </>
      )}

      {/* Movies tab — same shelf layout as Shows (Watch Next, genre
          aisles, DVD-case detail on tap), now that user_movies has real
          data to drive it. RecommendedRow/StatusFilterRow/Aisle are all
          reused verbatim (fully generic, no movie-specific fork needed —
          see components/library/art/* for why); only the case-opening
          overlay itself (MovieCaseOverlay) and the genre-priority resolver
          (primaryGenreMovie, TMDB's movie genre list differs from TV's)
          are movie-specific. */}
      {tab === "movies" && (
        <>
          {!trimmedQuery && <RecommendedRow items={movieRecommended} onOpen={(s, rect) => handleOpen(s, rect, "movie")} />}
          <div style={{ marginTop: 18 }}>
            <StatusFilterRow statusFilter={movieStatusFilter} counts={movieStatusCounts} onSelect={setMovieStatusFilter} items={MOVIE_STATUS_ITEMS} />
          </div>
          {movieGenreGroups.map(([genre, items]) => (
            viewMode === "poster"
              ? <GenrePosterRow key={genre} title={genre} items={items} mediaType="movie" />
              : <Aisle key={genre} title={genre} items={items} onOpen={(s, rect) => handleOpen(s, rect, "movie")} mediaType="movie" />
          ))}
          {moviesLoaded && movieNothingToShow && (
            <div style={{ padding: "70px 20px", textAlign: "center", color: t.textDim, fontSize: 13.5 }}>
              {trimmedQuery ? "No movies match your search." : trackedMovies.length === 0 ? "Nothing in your library yet." : "No titles match this filter."}
            </div>
          )}
        </>
      )}

      {tab === "collections" && (
        <div style={{ marginTop: 4 }}>
          {loaded && collectionsRaw.length === 0 ? (
            <div style={{ padding: "70px 0", textAlign: "center", color: t.textDim, fontSize: 13.5 }}>No collections yet.</div>
          ) : (
            collectionsRaw.map((c) => {
              const showsById = Object.fromEntries(localizedShows.map((s) => [s.id, { ...s, mediaType: "tv" }]));
              const moviesById = Object.fromEntries(localizedMovies.map((m) => [m.id, { ...m, mediaType: "movie" }]));
              const items = [
                ...c.showIds.map((id) => showsById[id]),
                ...(c.movieIds ?? []).map((id) => moviesById[id]),
              ].filter(Boolean);
              return <CollectionRow key={c.id} id={c.id} name={c.name} shared={c.shared} items={items} />;
            })
          )}
        </div>
      )}

      {tab === "collections" && (
        <button
          onClick={() => setNewCollectionOpen(true)}
          aria-label="New collection"
          className="fixed rounded-full flex items-center justify-center active:scale-90 transition"
          style={{
            bottom: "calc(88px + env(safe-area-inset-bottom))",
            right: "max(21px, env(safe-area-inset-right))",
            width: 54,
            height: 54,
            zIndex: 101,
            background: "rgba(20,16,12,0.92)",
            border: `1.5px solid ${accent}`,
            boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          <Icon name="folderPlus" size={22} color={accent} />
        </button>
      )}

      {newCollectionOpen && (
        <div className="fixed inset-0 flex items-center justify-center px-8" style={{ zIndex: 110, background: "rgba(0,0,0,0.6)" }} onClick={() => setNewCollectionOpen(false)}>
          <div className="w-full rounded-3xl" style={{ maxWidth: 420, padding: 22, background: "#1a1512", border: `1px solid ${t.glassBorder}`, boxShadow: "0 30px 60px rgba(0,0,0,0.6)" }} onClick={(event) => event.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 14 }}>New Collection</div>
            <input
              autoFocus
              value={newCollectionName}
              onChange={(event) => setNewCollectionName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") createCollection(); }}
              placeholder="Collection name"
              className="w-full rounded-2xl outline-none"
              style={{ padding: "13px 16px", background: t.cardFill, border: `1px solid ${t.cardBorder}`, fontSize: 14.5, color: "#fff" }}
            />
            <div className="flex gap-2.5" style={{ marginTop: 18 }}>
              <button onClick={() => { setNewCollectionOpen(false); setNewCollectionName(""); }} className="flex-1 rounded-full active:scale-95 transition" style={{ padding: 12, background: t.cardFill, border: `1px solid ${t.glassBorder}` }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "#fff" }}>Cancel</span>
              </button>
              <button onClick={createCollection} disabled={!newCollectionName.trim()} className="flex-1 rounded-full active:scale-95 transition" style={{ padding: 12, background: newCollectionName.trim() ? accent : t.cardFill }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: newCollectionName.trim() ? "#1a1108" : t.textDim }}>Create</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 30 }} />

      {openShow && (
        openMediaType === "movie" ? (
          <MovieCaseOverlay
            show={openShow}
            origin={openOrigin}
            onClose={handleClose}
            onStatusChange={handleMovieStatusChange}
            onFavoriteChange={handleMovieFavoriteChange}
            onRemoved={handleMovieRemoved}
          />
        ) : (
          <CaseOverlay
            show={openShow}
            origin={openOrigin}
            onClose={handleClose}
            onStatusChange={handleStatusChange}
            onFavoriteChange={handleFavoriteChange}
            onRemoved={handleRemoved}
          />
        )
      )}
    </div>
  );
}
