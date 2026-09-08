"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import PosterArt from "@/components/ui/PosterArt";
import MediaFavoriteBadge from "@/components/ui/MediaFavoriteBadge";
import MediaStatusBadge from "@/components/ui/MediaStatusBadge";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { hrefForMedia, mediaKey } from "@/lib/media";
import { useLibraryStatus } from "@/lib/useLibraryStatus";
import {
  BROWSE_ALL_GENRES,
  BROWSE_MOVIE_GENRES,
  BROWSE_TV_GENRES,
  genresForContentType,
} from "@/lib/discoverFilters";

export {
  BROWSE_ALL_GENRES,
  BROWSE_MOVIE_GENRES,
  BROWSE_TV_GENRES,
  genresForContentType,
};

const MAX_YEAR = new Date().getFullYear();

function formatMatchCount(n) {
  if (!Number.isFinite(n) || n < 0) return "0 titles matched";
  return `${n.toLocaleString()} title${n === 1 ? "" : "s"} matched`;
}

function headingFor(contentType, genreNames) {
  if (genreNames.length === 1) return genreNames[0];
  if (genreNames.length > 1) return `${genreNames.length} genres`;
  if (contentType === "tv") return "All Shows";
  if (contentType === "movie") return "All Movies";
  return "All Movies & Shows";
}

function dedupeByKey(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = mediaKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function parseGenreParts(...raw) {
  const ids = [];
  for (const value of raw) {
    for (const part of String(value || "").split("|")) {
      if (part) ids.push(part);
    }
  }
  return [...new Set(ids)];
}

function genresFromFilters(filters) {
  const ids = filters?.genreIds ?? [];
  if (ids.length === 0) return [];
  return genresForContentType(filters.contentType || "all").filter((g) => ids.includes(g.id));
}

function genreQueryFromFilters(filters) {
  const selected = genresFromFilters(filters);
  const movie = parseGenreParts(...selected.map((g) => g.movieId));
  const tv = parseGenreParts(...selected.map((g) => g.tvId));
  return {
    genreMovie: movie.length ? movie.join("|") : undefined,
    genreTv: tv.length ? tv.join("|") : undefined,
  };
}

async function fetchBrowse({ list, genreMovie, genreTv, filters, page = 1 }) {
  const params = new URLSearchParams();
  params.set("list", list || "discover");
  params.set("page", String(page));
  if (genreMovie) params.set("genreMovie", String(genreMovie));
  if (genreTv) params.set("genreTv", String(genreTv));
  if (filters.contentType && filters.contentType !== "all") params.set("contentType", filters.contentType);
  if (filters.yearFrom) params.set("yearFrom", String(filters.yearFrom));
  params.set("yearTo", String(MAX_YEAR));
  if (filters.platforms?.length) params.set("platforms", filters.platforms.join(","));
  if (filters.languages?.length) params.set("languages", filters.languages.join(","));
  const res = await fetch(`/api/shows/discover-library?${params.toString()}`);
  return res.json();
}

function BrowsePosterCard({ item, onNavigate, status }) {
  return (
    <Link href={hrefForMedia(item)} onClick={onNavigate} className="search-desktop-browse-card">
      <div className="search-desktop-browse-poster">
        <PosterArt posterPath={item.posterPath} alt={item.title} tmdbSize="w342" sizes="18vw" />
        {status
          ? <MediaStatusBadge status={status} />
          : <MediaFavoriteBadge item={item} source="SearchBrowse:badge" />}
        <div className="search-desktop-browse-poster-meta">
          <div className="search-desktop-browse-poster-title">{item.title}</div>
          <div className="search-desktop-browse-poster-sub">
            {[item.year, item.rating ? `★ ${item.rating}` : null].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function SearchBrowseDesktop({ filters, filterSidebar, onNavigate }) {
  const readableLanguages = useReadableLanguages();
  const { resolvedStatusMap } = useLibraryStatus("SearchBrowse");
  const [items, setItems] = useState([]);
  const [totalResults, setTotalResults] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const scrollerRef = useRef(null);
  const requestIdRef = useRef(0);

  const contentType = filters.contentType || "all";
  const selectedGenres = useMemo(() => genresFromFilters(filters), [filters]);
  const { genreMovie, genreTv } = useMemo(() => genreQueryFromFilters(filters), [filters]);
  const title = headingFor(contentType, selectedGenres.map((g) => g.name));

  const load = useCallback(async ({ nextPage = 1, append = false } = {}) => {
    const requestId = ++requestIdRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const data = await fetchBrowse({
        list: "discover",
        genreMovie,
        genreTv,
        filters,
        page: nextPage,
      });
      if (requestId !== requestIdRef.current) return;
      const mapped = (data.results ?? []).map((item) => ({
        ...item,
        title: resolveTitle(item, readableLanguages),
      }));
      setItems((prev) => (append ? dedupeByKey([...prev, ...mapped]) : mapped));
      setTotalResults(data.totalResults ?? mapped.length);
      setTotalPages(data.totalPages ?? 0);
      setPage(nextPage);
    } catch (err) {
      console.error("Browse fetch failed:", err);
      if (requestId !== requestIdRef.current) return;
      if (!append) {
        setItems([]);
        setTotalResults(0);
        setTotalPages(0);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [genreMovie, genreTv, filters, readableLanguages]);

  useEffect(() => {
    load({ nextPage: 1, append: false });
  }, [load]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    const onScroll = () => {
      if (loadingMore || loading) return;
      if (page >= totalPages) return;
      if (el.scrollTop + el.clientHeight < el.scrollHeight - 320) return;
      load({ nextPage: page + 1, append: true });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [load, loading, loadingMore, page, totalPages]);

  const matchLabel = loading && items.length === 0
    ? "…"
    : formatMatchCount(totalResults);

  const showEmpty = !loading && items.length === 0;

  return (
    <div className="search-desktop-browse">
      {filterSidebar}
      <div ref={scrollerRef} className="search-desktop-browse-main">
        <div className="search-desktop-browse-header">
          <div>
            <h1>{title}</h1>
            <p>{matchLabel}</p>
          </div>
        </div>

        {loading && items.length === 0 ? (
          <div className="search-desktop-browse-grid" aria-hidden="true">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="search-desktop-browse-skeleton" />
            ))}
          </div>
        ) : showEmpty ? (
          <div className="search-desktop-browse-empty">no matches</div>
        ) : (
          <>
            <div className="search-desktop-browse-grid">
              {items.map((item) => (
                <BrowsePosterCard
                  key={mediaKey(item)}
                  item={item}
                  onNavigate={onNavigate}
                  status={resolvedStatusMap[mediaKey(item)]}
                />
              ))}
            </div>
            {loadingMore ? (
              <div className="search-desktop-browse-loading-more">Loading more…</div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export async function fetchDiscoverResultCount(filters) {
  const { genreMovie, genreTv } = genreQueryFromFilters(filters);
  const data = await fetchBrowse({
    list: "discover",
    filters,
    genreMovie,
    genreTv,
    page: 1,
  });
  return data.totalResults ?? 0;
}
