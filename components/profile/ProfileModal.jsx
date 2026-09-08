"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import ProfileDesktop from "@/components/profile/ProfileDesktop";
import { useAuth } from "@/lib/auth-context";
import { useFavorites } from "@/lib/favorites-context";
import { useMovieFavorites } from "@/lib/movie-favorites-context";
import { getUserMoviesWatchedInYear, getAllUserMoviesWatched } from "@/lib/userMovies";
import { getWatchedEpisodesForYear, getWatchedYears } from "@/lib/episodeWatches";
import { getMyRatingsForUser } from "@/lib/myRatings";
import { getCollections } from "@/lib/collections";
import { hydrateCollectionPreviews } from "@/lib/collectionPreviews";
import { getProfile } from "@/lib/profile";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { collectionPalette } from "@/lib/theme";
import { computeRewatchCount } from "@/lib/highlights";
import { bangkokNow as getBangkokNow } from "@/lib/bangkokDate";
import {
  FAVORITE_SHOWS_ORDER_KEY, FAVORITE_SHOWS_SORT_KEY, FAVORITE_MOVIES_ORDER_KEY, FAVORITE_MOVIES_SORT_KEY,
  loadFavoriteOrder, loadFavoriteSort, sortFavorites,
} from "@/lib/favoritesOrder";

const PREVIEW_SHOW_LIMIT = 10;

/**
 * Desktop mid-screen floating Profile card. Opens over the current page
 * with a blurred scrim; content scrolls inside the card.
 */
export default function ProfileModal({
  open,
  onClose,
  expanded = false,
  onExpandedChange,
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { isFavorite, toggleFavorite, favoriteEntries, loading: favoritesCtxLoading } = useFavorites();
  const {
    isFavorite: isMovieFavorite,
    toggleFavorite: toggleMovieFavorite,
    favoriteEntries: movieFavoriteEntries,
    loading: movieFavoritesCtxLoading,
  } = useMovieFavorites();
  const readableLanguages = useReadableLanguages();

  const [profile, setProfile] = useState(null);
  const [monthStats, setMonthStats] = useState(null);
  const [collections, setCollections] = useState([]);
  const [showFavorites, setShowFavorites] = useState([]);
  const [showFavoritesLoading, setShowFavoritesLoading] = useState(true);
  const [movieFavorites, setMovieFavorites] = useState([]);
  const [myRatings, setMyRatings] = useState([]);
  const [timeMachineYears, setTimeMachineYears] = useState([]);
  const [timeMachineLoading, setTimeMachineLoading] = useState(true);
  const [showFavSort, setShowFavSort] = useState("firstAdded");
  const [showFavOrder, setShowFavOrder] = useState([]);
  const [movieFavSort, setMovieFavSort] = useState("firstAdded");
  const [movieFavOrder, setMovieFavOrder] = useState([]);

  const pathnameRef = useRef(pathname);
  const openedAtRef = useRef(0);

  useEffect(() => {
    if (open) openedAtRef.current = Date.now();
  }, [open]);

  // Close when navigating into a linked section — ignore the brief
  // /profile → /home hop used to park a page behind the card.
  useEffect(() => {
    if (open && pathnameRef.current !== pathname && Date.now() - openedAtRef.current > 500) {
      onClose?.();
    }
    pathnameRef.current = pathname;
  }, [pathname, open, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (expanded) {
        onExpandedChange?.(false);
        return;
      }
      onClose?.();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, expanded, onExpandedChange]);

  useEffect(() => {
    if (!open) return;
    setShowFavSort(loadFavoriteSort(FAVORITE_SHOWS_SORT_KEY));
    setShowFavOrder(loadFavoriteOrder(FAVORITE_SHOWS_ORDER_KEY));
    setMovieFavSort(loadFavoriteSort(FAVORITE_MOVIES_SORT_KEY));
    setMovieFavOrder(loadFavoriteOrder(FAVORITE_MOVIES_ORDER_KEY));
  }, [open]);

  useEffect(() => {
    if (!open || !user) return undefined;
    let cancelled = false;
    getProfile(user.id)
      .then((p) => { if (!cancelled) setProfile(p); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [open, user]);

  useEffect(() => {
    if (!open || !user) return undefined;
    let cancelled = false;
    const now = getBangkokNow();
    Promise.all([
      getWatchedEpisodesForYear(user.id, now.year),
      getUserMoviesWatchedInYear(user.id, now.year).catch((err) => { console.error(err); return []; }),
    ]).then(([rows, movieRows]) => {
      if (cancelled) return;
      const monthRows = rows.filter((r) =>
        (r.watch_date_precision === "day" || r.watch_date_precision === "month") &&
        r.watched_year === now.year && r.watched_month === now.month
      );
      const monthMovies = movieRows.filter((r) => r.watchedYear === now.year && r.watchedMonth === now.month);
      setMonthStats({
        shows: new Set(monthRows.map((r) => r.tmdb_show_id)).size,
        movies: monthMovies.length,
        activeDays: new Set(monthRows.filter((r) => r.watch_date_precision === "day").map((r) => r.watched_on)).size,
        rewatched: computeRewatchCount(monthRows),
      });
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [open, user]);

  useEffect(() => {
    if (!open || !user) return undefined;
    if (favoritesCtxLoading) { setShowFavoritesLoading(true); return undefined; }
    const ids = favoriteEntries.slice(0, PREVIEW_SHOW_LIMIT).map((entry) => entry.id);
    if (ids.length === 0) {
      setShowFavorites([]);
      setShowFavoritesLoading(false);
      return undefined;
    }
    let cancelled = false;
    setShowFavoritesLoading(true);
    fetch(`/api/shows/batch?ids=${ids.join(",")}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`Favorite shows failed (${res.status})`);
        return res.json();
      })
      .then(({ results }) => {
        if (cancelled || !Array.isArray(results)) return;
        const addedAtById = Object.fromEntries(
          favoriteEntries.slice(0, PREVIEW_SHOW_LIMIT).map((entry) => [entry.id, entry.addedAt])
        );
        setShowFavorites(results.map((show) => ({ ...show, addedAt: addedAtById[show.id] })));
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setShowFavoritesLoading(false); });
    return () => { cancelled = true; };
  }, [open, user, favoriteEntries, favoritesCtxLoading]);

  useEffect(() => {
    if (!open || !user) return undefined;
    const ids = movieFavoriteEntries.map((e) => e.id);
    if (ids.length === 0) {
      setMovieFavorites([]);
      return undefined;
    }
    let cancelled = false;
    fetch(`/api/movies/batch?ids=${ids.join(",")}`)
      .then((res) => res.json())
      .then(({ results }) => {
        if (cancelled) return;
        const addedAtById = Object.fromEntries(movieFavoriteEntries.map((e) => [e.id, e.addedAt]));
        setMovieFavorites(results.map((movie) => ({ ...movie, addedAt: addedAtById[movie.id] })));
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [open, user, movieFavoriteEntries]);

  useEffect(() => {
    if (!open || !user) return undefined;
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
      const boxsetOnes = mapped.filter((c) => c.coverStyle === "boxset" && c.count > 0);
      const hydrated = await hydrateCollectionPreviews(boxsetOnes, 5);
      if (cancelled) return;
      const coversById = new Map(hydrated.map((c) => [c.id, c.covers]));
      setCollections((prev) => prev.map((c) => (coversById.has(c.id) ? { ...c, covers: coversById.get(c.id) } : c)));
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [open, user]);

  useEffect(() => {
    if (!open || !user) return undefined;
    let cancelled = false;
    getMyRatingsForUser(user.id)
      .then((entries) => { if (!cancelled) setMyRatings(entries.slice(0, 8)); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [open, user]);

  useEffect(() => {
    if (!open || !user) return undefined;
    let cancelled = false;
    setTimeMachineLoading(true);
    (async () => {
      const [showYears, movieRows] = await Promise.all([
        getWatchedYears(user.id).catch((err) => { console.error(err); return []; }),
        getAllUserMoviesWatched(user.id).catch((err) => { console.error(err); return []; }),
      ]);
      const movieRowsByYear = new Map();
      for (const r of movieRows) {
        const year = r.watchedYear;
        if (year == null) continue;
        if (!movieRowsByYear.has(year)) movieRowsByYear.set(year, []);
        movieRowsByYear.get(year).push(r);
      }
      const years = [...new Set([...showYears, ...movieRowsByYear.keys()])].sort((a, b) => b - a);
      if (years.length === 0) {
        if (!cancelled) { setTimeMachineYears([]); setTimeMachineLoading(false); }
        return;
      }
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
        let repType = null; let repId = null; let repAt = null;
        for (const r of showRows) {
          const at = r.watched_at ?? r.watched_on;
          if (at && (!repAt || at > repAt)) { repAt = at; repType = "tv"; repId = r.tmdb_show_id; }
        }
        for (const r of movieRowsForYear) {
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
      setTimeMachineYears(entries.map((e) => {
        const rep = e.repType === "movie" ? movieById[e.repId] : showById[e.repId];
        return { year: e.year, titleCount: e.titleCount, posterPath: rep?.posterPath ?? null };
      }));
      setTimeMachineLoading(false);
    })().catch((err) => { console.error(err); if (!cancelled) setTimeMachineLoading(false); });
    return () => { cancelled = true; };
  }, [open, user]);

  if (!open || typeof document === "undefined") return null;

  const displayName = profile?.displayName || user?.email || "";
  const bio = profile?.bio ?? "";
  const resolvedShowFavorites = showFavorites.filter((show) => isFavorite(show.id)).map((show) => ({
    ...show,
    title: resolveTitle(show, readableLanguages),
  }));
  const displayedFavorites = sortFavorites(resolvedShowFavorites, showFavSort, showFavOrder);
  const displayedMovieFavorites = sortFavorites(
    movieFavorites
      .filter((movie) => isMovieFavorite(movie.id))
      .map((movie) => ({
        ...movie,
        title: resolveTitle(movie, readableLanguages),
      })),
    movieFavSort,
    movieFavOrder
  );

  return createPortal(
    <div
      className={`profile-modal-scrim${expanded ? " is-expanded" : ""}`}
      role="presentation"
      onClick={() => {
        if (expanded) onExpandedChange?.(false);
        else onClose?.();
      }}
    >
      <div
        className={`profile-modal-card${expanded ? " is-expanded" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Profile"
        onClick={(event) => event.stopPropagation()}
      >
        <ProfileDesktop
          profile={profile}
          user={user}
          displayName={displayName}
          bio={bio}
          monthStats={monthStats}
          collections={collections}
          displayedFavorites={displayedFavorites}
          displayedMovieFavorites={displayedMovieFavorites}
          favoritesRowLoading={showFavoritesLoading}
          movieFavoritesRowLoading={movieFavoritesCtxLoading}
          myRatings={myRatings}
          timeMachineYears={timeMachineYears}
          timeMachineLoading={timeMachineLoading}
          isFavorite={isFavorite}
          isMovieFavorite={isMovieFavorite}
          toggleFavorite={toggleFavorite}
          toggleMovieFavorite={toggleMovieFavorite}
          readableLanguages={readableLanguages}
          onClose={onClose}
          expanded={expanded}
          onToggleExpand={() => onExpandedChange?.(!expanded)}
          onShowFavSortChange={setShowFavSort}
          onMovieFavSortChange={setMovieFavSort}
          onShowFavOrderChange={setShowFavOrder}
          onMovieFavOrderChange={setMovieFavOrder}
        />
      </div>
    </div>,
    document.body
  );
}
