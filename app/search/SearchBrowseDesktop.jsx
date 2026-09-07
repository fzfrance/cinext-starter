"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import PosterArt from "@/components/ui/PosterArt";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { hrefForMedia, mediaKey } from "@/lib/media";

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

/** Shared with SearchClient filter popover genre catalogs. */
export const BROWSE_MOVIE_GENRES = [
  { id: "m-action", name: "Action", movieId: "28|12" },
  { id: "m-animation", name: "Animation", movieId: "16" },
  { id: "m-comedy", name: "Comedy", movieId: "35" },
  { id: "m-crime", name: "Crime", movieId: "80" },
  { id: "m-documentary", name: "Documentary", movieId: "99" },
  { id: "m-drama", name: "Drama", movieId: "18" },
  { id: "m-family", name: "Family", movieId: "10751" },
  { id: "m-fantasy", name: "Fantasy", movieId: "14" },
  { id: "m-horror", name: "Horror", movieId: "27" },
  { id: "m-mystery", name: "Mystery", movieId: "9648|53" },
  { id: "m-romance", name: "Romance", movieId: "10749" },
  { id: "m-scifi", name: "Sci-Fi", movieId: "878" },
  { id: "m-war", name: "War", movieId: "10752" },
];

export const BROWSE_TV_GENRES = [
  { id: "t-action", name: "Action", tvId: "10759" },
  { id: "t-animation", name: "Animation", tvId: "16" },
  { id: "t-comedy", name: "Comedy", tvId: "35" },
  { id: "t-crime", name: "Crime", tvId: "80" },
  { id: "t-documentary", name: "Documentary", tvId: "99" },
  { id: "t-drama", name: "Drama", tvId: "18" },
  { id: "t-family", name: "Family", tvId: "10751" },
  { id: "t-kids", name: "Kids", tvId: "10762" },
  { id: "t-mystery", name: "Mystery", tvId: "9648" },
  { id: "t-reality", name: "Reality", tvId: "10764" },
  { id: "t-scifi", name: "Sci-Fi", tvId: "10765" },
  { id: "t-war", name: "War", tvId: "10768" },
];

export const BROWSE_ALL_GENRES = [
  { id: "a-action", name: "Action", movieId: "28|12", tvId: "10759" },
  { id: "a-animation", name: "Animation", movieId: "16", tvId: "16" },
  { id: "a-comedy", name: "Comedy", movieId: "35", tvId: "35" },
  { id: "a-crime", name: "Crime", movieId: "80", tvId: "80" },
  { id: "a-documentary", name: "Documentary", movieId: "99", tvId: "99" },
  { id: "a-drama", name: "Drama", movieId: "18", tvId: "18" },
  { id: "a-family", name: "Family", movieId: "10751", tvId: "10751" },
  { id: "a-horror", name: "Horror", movieId: "27", tvId: "9648" },
  { id: "a-mystery", name: "Mystery", movieId: "9648|53", tvId: "9648" },
  { id: "a-romance", name: "Romance", movieId: "10749", tvId: "18" },
  { id: "a-scifi", name: "Sci-Fi", movieId: "878|14", tvId: "10765" },
  { id: "a-war", name: "War", movieId: "10752", tvId: "10768" },
];

export function genresForContentType(contentType) {
  if (contentType === "tv") return BROWSE_TV_GENRES;
  if (contentType === "movie") return BROWSE_MOVIE_GENRES;
  return BROWSE_ALL_GENRES;
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

function BrowsePosterCard({ item, onNavigate }) {
  return (
    <Link href={hrefForMedia(item)} onClick={onNavigate} className="search-desktop-browse-card">
      <div className="search-desktop-browse-poster">
        <PosterArt posterPath={item.posterPath} alt={item.title} tmdbSize="w342" sizes="18vw" />
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
                <BrowsePosterCard key={mediaKey(item)} item={item} onNavigate={onNavigate} />
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
