"use client";

// ---------------------------------------------------------------------------
// Favorite state — shared source of truth
// ---------------------------------------------------------------------------
// Every screen that shows a favorite heart badge (or toggles one) reads and
// writes through this context instead of independently calling
// getUserShows/setShowFavorite — that's what used to make the same show
// show a heart on one screen but not another: each screen fetched its own
// copy of user_shows.favorite and never learned about a toggle that
// happened somewhere else. This holds the user's whole library (status +
// favorite + addedAt, same shape as getUserShows) once per signed-in user;
// toggling flips it here first (every consumer re-renders immediately) and
// then writes through, rolling back if the write fails or no-ops (see
// lib/userShows.js's setShowFavorite — favoriting requires the show
// already be a library row).
//
// addedAt is kept (not just a bare favorite boolean) because a show can
// only ever be favorited once it's already in the library — its addedAt
// was already known from this same load, so a toggle never needs a
// separate "when was this favorited" round trip.

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { getUserShows, setShowFavorite as setShowFavoriteRow } from "@/lib/userShows";

const FavoritesContext = createContext({
  isFavorite: () => false,
  toggleFavorite: () => {},
  favoriteEntries: [],
  loading: true,
});

export function FavoritesProvider({ children }) {
  const { user } = useAuth();
  const [libraryById, setLibraryById] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLibraryById({}); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    getUserShows(user.id)
      .then((byShow) => { if (!cancelled) { setLibraryById(byShow); setLoading(false); } })
      .catch((err) => { console.error(err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  const isFavorite = useCallback((tmdbShowId) => libraryById[tmdbShowId]?.favorite === true, [libraryById]);

  const toggleFavorite = useCallback((tmdbShowId, source = "unknown") => {
    if (!user) return;
    const id = Number(tmdbShowId);
    const wasFavorite = libraryById[id]?.favorite === true;
    const next = !wasFavorite;

    // Optimistic: every consumer reads from this same state, so flipping
    // it here is what makes the toggle "update immediately across all
    // pages" — there's no separate per-screen cache to invalidate.
    setLibraryById((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], favorite: next } } : prev));

    setShowFavoriteRow(user.id, id, next, source)
      .then((ok) => {
        if (!ok) setLibraryById((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], favorite: wasFavorite } } : prev));
      })
      .catch((err) => {
        console.error(err);
        setLibraryById((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], favorite: wasFavorite } } : prev));
      });
  }, [user, libraryById]);

  const favoriteEntries = useMemo(
    () => Object.entries(libraryById).filter(([, s]) => s.favorite).map(([id, s]) => ({ id: Number(id), addedAt: s.addedAt })),
    [libraryById]
  );

  const value = useMemo(
    () => ({ isFavorite, toggleFavorite, favoriteEntries, loading }),
    [isFavorite, toggleFavorite, favoriteEntries, loading]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  return useContext(FavoritesContext);
}
