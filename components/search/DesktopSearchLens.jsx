"use client";

import { useEffect } from "react";
import SearchClient from "@/app/search/SearchClient";
import { useDesktopSearch } from "@/lib/desktop-search-context";

/**
 * Live frosted lens over the current desktop page. Keeps the underlying
 * route mounted so backdrop-filter can sample its light and colour.
 */
export default function DesktopSearchLens() {
  const { lensOpen } = useDesktopSearch();

  useEffect(() => {
    if (!lensOpen) return undefined;
    const shell = document.querySelector("[data-app-shell]");
    shell?.setAttribute("aria-hidden", "true");
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      shell?.removeAttribute("aria-hidden");
      document.body.style.overflow = prevOverflow;
    };
  }, [lensOpen]);

  if (!lensOpen) return null;

  return (
    <SearchClient
      asLens
      trendingShows={[]}
      trendingMovies={[]}
      heroSlides={[]}
      providerLogos={{}}
    />
  );
}
