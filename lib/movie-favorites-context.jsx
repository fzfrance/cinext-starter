"use client";

// ---------------------------------------------------------------------------
// Movie favorite state — shared source of truth
// ---------------------------------------------------------------------------
// Sibling to lib/favorites-context.jsx, not a merge into it — see this
// codebase's own reasoning there: useFavorites().isFavorite(id) is called
// at several existing TV-only sites with a bare numeric id, and retrofitting
// that context to accept a media type would mean touching every one of
// those untouched-per-scope call sites just to add a parameter they'd
// always pass "tv" for. This is a structurally identical, independent
// provider wrapping lib/userMovies.js instead of lib/userShows.js — mixed-
// content surfaces (Explore, Search) pick which hook to call based on an
// item's own mediaType field (see lib/media.js).

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { getUserMovies, getUserMovie, setMovieFavorite as setMovieFavoriteRow } from "@/lib/userMovies";

const MovieFavoritesContext = createContext({
  isFavorite: () => false,
  toggleFavorite: () => {},
  favoriteEntries: [],
  loading: true,
});

export function MovieFavoritesProvider({ children }) {
  const { user } = useAuth();
  const [libraryById, setLibraryById] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLibraryById({}); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    getUserMovies(user.id)
      .then((byMovie) => { if (!cancelled) { setLibraryById(byMovie); setLoading(false); } })
      .catch((err) => { console.error(err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  const isFavorite = useCallback((tmdbMovieId) => libraryById[tmdbMovieId]?.favorite === true, [libraryById]);

  const toggleFavorite = useCallback((tmdbMovieId, source = "unknown") => {
    if (!user) return;
    const id = Number(tmdbMovieId);
    const knownLocally = Boolean(libraryById[id]);
    const wasFavorite = libraryById[id]?.favorite === true;
    const next = !wasFavorite;

    if (knownLocally) {
      setLibraryById((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], favorite: next } } : prev));
    }

    setMovieFavoriteRow(user.id, id, next, source)
      .then((ok) => {
        if (!ok) {
          if (knownLocally) setLibraryById((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], favorite: wasFavorite } } : prev));
          return;
        }
        if (!knownLocally) {
          getUserMovie(user.id, id)
            .then((row) => {
              if (!row) return;
              setLibraryById((prev) => ({ ...prev, [id]: { status: row.status, favorite: row.favorite, addedAt: row.addedAt, updatedAt: row.updatedAt } }));
            })
            .catch(console.error);
        }
      })
      .catch((err) => {
        console.error(err);
        if (knownLocally) setLibraryById((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], favorite: wasFavorite } } : prev));
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

  return <MovieFavoritesContext.Provider value={value}>{children}</MovieFavoritesContext.Provider>;
}

export function useMovieFavorites() {
  return useContext(MovieFavoritesContext);
}
