"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

const DesktopSearchContext = createContext(null);

/**
 * Shared desktop search query/filter so the /search page and any future
 * chrome can stay in sync. Opening/closing is plain route navigation —
 * no morphing nav shell (that caused Explore clicks to jump into Search
 * via focus side-effects and collapsing layout).
 */
export function DesktopSearchProvider({ children }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const clearSearch = useCallback(() => {
    setQuery("");
    setFilter("all");
  }, []);

  const value = useMemo(() => ({
    query,
    setQuery,
    filter,
    setFilter,
    clearSearch,
  }), [query, filter, clearSearch]);

  return (
    <DesktopSearchContext.Provider value={value}>
      {children}
    </DesktopSearchContext.Provider>
  );
}

export function useDesktopSearch() {
  const ctx = useContext(DesktopSearchContext);
  if (!ctx) throw new Error("useDesktopSearch must be used within DesktopSearchProvider");
  return ctx;
}
