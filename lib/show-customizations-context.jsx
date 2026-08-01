"use client";

// ---------------------------------------------------------------------------
// Custom cover/poster/logo state — shared source of truth
// ---------------------------------------------------------------------------
// Mirrors lib/favorites-context.jsx exactly: every screen that renders a
// show's poster/backdrop, or the Show Detail art pickers themselves,
// reads and writes through this context instead of independently
// querying show_customizations, so a pick made from Show Detail shows up
// immediately everywhere else that show's art appears (Watchlist, In
// Progress, Profile Library, Collections, Favorites, Explore, Search).

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { getAllShowCustomizations, setShowCustomImage } from "@/lib/showCustomizations";

const ShowCustomizationsContext = createContext({
  getCustomBackdrop: () => null,
  getCustomPoster: () => null,
  getCustomLogo: () => null,
  setCustomImage: () => {},
  loading: true,
});

export function ShowCustomizationsProvider({ children }) {
  const { user } = useAuth();
  const [byShow, setByShow] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setByShow({}); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    getAllShowCustomizations(user.id)
      .then((rows) => { if (!cancelled) { setByShow(rows); setLoading(false); } })
      .catch((err) => { console.error(err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  const getCustomBackdrop = useCallback((tmdbShowId) => byShow[tmdbShowId]?.custom_backdrop_url || null, [byShow]);
  const getCustomPoster = useCallback((tmdbShowId) => byShow[tmdbShowId]?.custom_poster_url || null, [byShow]);
  const getCustomLogo = useCallback((tmdbShowId) => byShow[tmdbShowId]?.custom_logo_url || null, [byShow]);

  const FIELD_BY_TYPE = { backdrop: "custom_backdrop_url", poster: "custom_poster_url", logo: "custom_logo_url" };

  // Optimistic, same pattern as favorites-context's toggleFavorite — every
  // consumer reads from this same state, so setting it here is what makes
  // the picker's "tap to select and save immediately" behavior show up
  // everywhere else without a separate refetch. Rolls back if the write
  // fails.
  const setCustomImage = useCallback((tmdbShowId, type, url) => {
    if (!user) return;
    const field = FIELD_BY_TYPE[type];
    if (!field) return;
    const id = Number(tmdbShowId);
    const previousUrl = byShow[id]?.[field] ?? null;

    setByShow((prev) => ({ ...prev, [id]: { ...prev[id], [field]: url } }));

    setShowCustomImage(user.id, id, type, url).catch((err) => {
      // Previously silent — logged only to the console while the
      // optimistic update quietly reverted, so a failed save (e.g. the
      // show_customizations table not existing yet in a given Supabase
      // project) looked indistinguishable from "nothing happened" rather
      // than a real, reportable failure.
      console.error(err);
      window.alert("Couldn't save your pick — please try again.");
      setByShow((prev) => ({ ...prev, [id]: { ...prev[id], [field]: previousUrl } }));
    });
  }, [user, byShow]);

  const value = useMemo(
    () => ({ getCustomBackdrop, getCustomPoster, getCustomLogo, setCustomImage, loading }),
    [getCustomBackdrop, getCustomPoster, getCustomLogo, setCustomImage, loading]
  );

  return <ShowCustomizationsContext.Provider value={value}>{children}</ShowCustomizationsContext.Provider>;
}

export function useShowCustomizations() {
  return useContext(ShowCustomizationsContext);
}
