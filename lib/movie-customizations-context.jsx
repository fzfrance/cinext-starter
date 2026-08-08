"use client";

// ---------------------------------------------------------------------------
// Custom cover/poster/logo state — shared source of truth (movies)
// ---------------------------------------------------------------------------
// Fork of lib/show-customizations-context.jsx, one media type over — every
// screen that renders a movie's poster/backdrop, or Movie Detail's own
// art pickers, reads and writes through this context instead of
// independently querying movie_customizations.

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { getAllMovieCustomizations, setMovieCustomImage } from "@/lib/movieCustomizations";

const MovieCustomizationsContext = createContext({
  getCustomBackdrop: () => null,
  getCustomPoster: () => null,
  getCustomLogo: () => null,
  setCustomImage: () => {},
  loading: true,
});

export function MovieCustomizationsProvider({ children }) {
  const { user } = useAuth();
  const [byMovie, setByMovie] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setByMovie({}); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    getAllMovieCustomizations(user.id)
      .then((rows) => { if (!cancelled) { setByMovie(rows); setLoading(false); } })
      .catch((err) => { console.error(err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  const getCustomBackdrop = useCallback((tmdbMovieId) => byMovie[tmdbMovieId]?.custom_backdrop_url || null, [byMovie]);
  const getCustomPoster = useCallback((tmdbMovieId) => byMovie[tmdbMovieId]?.custom_poster_url || null, [byMovie]);
  const getCustomLogo = useCallback((tmdbMovieId) => byMovie[tmdbMovieId]?.custom_logo_url || null, [byMovie]);

  const FIELD_BY_TYPE = { backdrop: "custom_backdrop_url", poster: "custom_poster_url", logo: "custom_logo_url" };

  // Optimistic, same pattern as showCustomizations-context's setCustomImage
  // — rolls back if the write fails.
  const setCustomImage = useCallback((tmdbMovieId, type, url) => {
    if (!user) return;
    const field = FIELD_BY_TYPE[type];
    if (!field) return;
    const id = Number(tmdbMovieId);
    const previousUrl = byMovie[id]?.[field] ?? null;

    setByMovie((prev) => ({ ...prev, [id]: { ...prev[id], [field]: url } }));

    setMovieCustomImage(user.id, id, type, url).catch((err) => {
      console.error(err);
      window.alert("Couldn't save your pick — please try again.");
      setByMovie((prev) => ({ ...prev, [id]: { ...prev[id], [field]: previousUrl } }));
    });
  }, [user, byMovie]);

  const value = useMemo(
    () => ({ getCustomBackdrop, getCustomPoster, getCustomLogo, setCustomImage, loading }),
    [getCustomBackdrop, getCustomPoster, getCustomLogo, setCustomImage, loading]
  );

  return <MovieCustomizationsContext.Provider value={value}>{children}</MovieCustomizationsContext.Provider>;
}

export function useMovieCustomizations() {
  return useContext(MovieCustomizationsContext);
}
