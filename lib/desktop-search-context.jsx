"use client";

import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const DesktopSearchContext = createContext(null);

function isDesktopViewport() {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 900px)").matches;
}

function LensRouteSync() {
  const pathname = usePathname();
  const { lensOpen, closeDesktopSearch } = useDesktopSearch();
  const prevPath = useRef(pathname);

  useEffect(() => {
    if (prevPath.current === pathname) return;
    prevPath.current = pathname;
    if (lensOpen) closeDesktopSearch();
  }, [pathname, lensOpen, closeDesktopSearch]);

  return null;
}

/**
 * Shared desktop search query + a live "lens" overlay. On desktop, Search
 * opens over the current page (page stays mounted) so a light frosted blur
 * can pick up that page's colour. Mobile still uses the /search route.
 */
export function DesktopSearchProvider({ children }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [lensOpen, setLensOpen] = useState(false);

  const clearSearch = useCallback(() => {
    setQuery("");
    setFilter("all");
  }, []);

  const openDesktopSearch = useCallback(() => {
    if (!isDesktopViewport()) return false;
    setLensOpen(true);
    return true;
  }, []);

  const closeDesktopSearch = useCallback(() => {
    setLensOpen(false);
    clearSearch();
  }, [clearSearch]);

  const value = useMemo(() => ({
    query,
    setQuery,
    filter,
    setFilter,
    clearSearch,
    lensOpen,
    openDesktopSearch,
    closeDesktopSearch,
  }), [query, filter, clearSearch, lensOpen, openDesktopSearch, closeDesktopSearch]);

  return (
    <DesktopSearchContext.Provider value={value}>
      <Suspense fallback={null}>
        <LensRouteSync />
      </Suspense>
      {children}
    </DesktopSearchContext.Provider>
  );
}

export function useDesktopSearch() {
  const ctx = useContext(DesktopSearchContext);
  if (!ctx) throw new Error("useDesktopSearch must be used within DesktopSearchProvider");
  return ctx;
}
