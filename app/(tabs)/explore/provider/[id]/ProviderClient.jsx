"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import PosterArt from "@/components/ui/PosterArt";
import YearSlider from "@/components/YearSlider";
import MediaFavoriteBadge from "@/components/ui/MediaFavoriteBadge";
import MediaStatusBadge from "@/components/ui/MediaStatusBadge";
import MediaTypeLabel from "@/components/ui/MediaTypeLabel";
import {
  genresForContentType,
  SEARCH_FILTER_LANGUAGES,
} from "@/lib/discoverFilters";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { hrefForMedia, mediaKey } from "@/lib/media";
import { useLibraryStatus } from "@/lib/useLibraryStatus";
import { tmdbImage } from "@/lib/tmdb";

const MIN_YEAR = 1990;
const MAX_YEAR = new Date().getFullYear();
/** Prefetch this many pages on first paint / Apply so the grid fills from TMDB faster. */
const INITIAL_PAGE_BATCH = 2;

const LANGUAGES = SEARCH_FILTER_LANGUAGES;

const DEFAULT_FILTERS = {
  contentType: "all",
  genreIds: [],
  yearFrom: MIN_YEAR,
  languages: [],
};

function parseGenreParts(...raw) {
  const ids = [];
  for (const value of raw) {
    for (const part of String(value || "").split("|")) {
      if (part) ids.push(part);
    }
  }
  return [...new Set(ids)];
}

function genreQueryFromFilters(filters) {
  const options = genresForContentType(filters.contentType || "all");
  const selected = options.filter((g) => (filters.genreIds ?? []).includes(g.id));
  const movie = parseGenreParts(...selected.map((g) => g.movieId));
  const tv = parseGenreParts(...selected.map((g) => g.tvId));
  return {
    genreMovie: movie.length ? movie.join("|") : undefined,
    genreTv: tv.length ? tv.join("|") : undefined,
  };
}

function countActiveFilters(filters) {
  let count = 0;
  if (filters.contentType !== "all") count += 1;
  count += (filters.genreIds ?? []).length;
  if (filters.yearFrom > MIN_YEAR) count += 1;
  count += (filters.languages ?? []).length;
  return count;
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

function formatItemCount(n) {
  if (!Number.isFinite(n) || n < 0) return "0 titles";
  return `${n.toLocaleString()} title${n === 1 ? "" : "s"}`;
}

async function fetchProviderCatalog({ providerId, filters, page = 1 }) {
  const { genreMovie, genreTv } = genreQueryFromFilters(filters);
  const params = new URLSearchParams();
  params.set("list", "discover");
  params.set("page", String(page));
  params.set("platforms", String(providerId));
  if (genreMovie) params.set("genreMovie", genreMovie);
  if (genreTv) params.set("genreTv", genreTv);
  if (filters.contentType && filters.contentType !== "all") {
    params.set("contentType", filters.contentType);
  }
  // Only constrain year when the user moved the slider — default MIN keeps
  // older titles in the TMDB discover set.
  if (filters.yearFrom > MIN_YEAR) params.set("yearFrom", String(filters.yearFrom));
  if (filters.languages?.length) params.set("languages", filters.languages.join(","));
  const res = await fetch(`/api/shows/discover-library?${params.toString()}`);
  if (!res.ok) throw new Error(`Provider catalog failed (${res.status})`);
  return res.json();
}

function ProviderLogo({ name, logoPath }) {
  const src = logoPath ? tmdbImage(logoPath, "original") : null;
  const [shape, setShape] = useState(src ? "pending" : "missing");
  const imgRef = useRef(null);

  const classify = (img) => {
    const width = img?.naturalWidth;
    const height = img?.naturalHeight;
    if (!width || !height) {
      setShape("missing");
      return;
    }
    setShape(width / height >= 1.35 ? "wordmark" : "tile");
  };

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth) classify(imgRef.current);
  }, [src]);

  if (!src || shape === "missing") {
    return (
      <div className="provider-page-logo-fallback" aria-hidden="true">
        {(name || "?").slice(0, 1)}
      </div>
    );
  }

  return (
    <div className={`provider-page-logo is-${shape}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- TMDB CDN brand mark */}
      <img
        ref={imgRef}
        src={src}
        alt=""
        onLoad={(event) => classify(event.currentTarget)}
        onError={() => setShape("missing")}
      />
    </div>
  );
}

function ProviderFilterMenu({
  filters,
  onChange,
  open,
  onClose,
  onApply,
  resultCount,
  countLoading,
}) {
  const [languageQuery, setLanguageQuery] = useState("");
  const activeCount = countActiveFilters(filters);
  const genreOptions = genresForContentType(filters.contentType || "all");
  const filteredLanguages = LANGUAGES.filter((l) =>
    l.name.toLowerCase().includes(languageQuery.trim().toLowerCase())
  );

  const applyLabel = (() => {
    if (countLoading || resultCount == null) return "Show Results";
    return `Show ${resultCount.toLocaleString()} Result${resultCount === 1 ? "" : "s"}`;
  })();

  if (!open) return null;

  return (
    <div className="provider-page-filter-menu" role="dialog" aria-label="Filters">
      <div className="provider-page-filter-menu-head">
        <span>Filters</span>
        {activeCount > 0 ? (
          <button
            type="button"
            className="provider-page-filter-clear"
            onClick={() => {
              onChange({ ...DEFAULT_FILTERS });
              setLanguageQuery("");
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="provider-page-filter-section">
        <div className="provider-page-filter-label">Type</div>
        <div className="provider-page-filter-pills">
          {[
            { id: "all", label: "All" },
            { id: "movie", label: "Movies" },
            { id: "tv", label: "TV" },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`provider-page-filter-pill${filters.contentType === opt.id ? " is-active" : ""}`}
              onClick={() => onChange({ ...filters, contentType: opt.id, genreIds: [] })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="provider-page-filter-section">
        <div className="provider-page-filter-label">Genre</div>
        <div className="provider-page-filter-pills is-wrap">
          <button
            type="button"
            className={`provider-page-filter-pill${(filters.genreIds ?? []).length === 0 ? " is-active" : ""}`}
            onClick={() => onChange({ ...filters, genreIds: [] })}
          >
            All
          </button>
          {genreOptions.map((g) => {
            const selected = (filters.genreIds ?? []).includes(g.id);
            return (
              <button
                key={g.id}
                type="button"
                className={`provider-page-filter-pill${selected ? " is-active" : ""}`}
                onClick={() => {
                  const current = filters.genreIds ?? [];
                  const next = selected
                    ? current.filter((id) => id !== g.id)
                    : [...current, g.id];
                  onChange({ ...filters, genreIds: next });
                }}
              >
                {g.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="provider-page-filter-section">
        <div className="provider-page-filter-label">Year</div>
        <YearSlider
          min={MIN_YEAR}
          max={MAX_YEAR}
          value={filters.yearFrom}
          onChange={(year) => onChange({ ...filters, yearFrom: year })}
        />
      </div>

      <div className="provider-page-filter-section">
        <div className="provider-page-filter-label">Language</div>
        <div className="provider-page-filter-lang-search">
          <Icon name="search" size={13} color="rgba(255,255,255,0.4)" />
          <input
            value={languageQuery}
            onChange={(e) => setLanguageQuery(e.target.value)}
            placeholder="Search…"
            aria-label="Search language"
          />
        </div>
        <div className="provider-page-filter-pills is-wrap">
          {filteredLanguages.map((l) => {
            const selected = (filters.languages ?? []).includes(l.code);
            return (
              <button
                key={l.code}
                type="button"
                className={`provider-page-filter-pill${selected ? " is-active" : ""}`}
                onClick={() => {
                  const current = filters.languages ?? [];
                  const next = selected
                    ? current.filter((code) => code !== l.code)
                    : [...current, l.code];
                  onChange({ ...filters, languages: next });
                }}
              >
                {l.name}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        className="provider-page-filter-done"
        onClick={() => {
          onApply();
          onClose();
        }}
      >
        {applyLabel}
      </button>
    </div>
  );
}

/**
 * Streaming service catalog — centered brand, compact filter (no platforms),
 * poster grid with item count. Movies + TV mixed unless Type filter narrows.
 */
export default function ProviderClient({ provider }) {
  const router = useRouter();
  const readableLanguages = useReadableLanguages();
  const { resolvedStatusMap } = useLibraryStatus("ProviderPage");
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftCount, setDraftCount] = useState(null);
  const [countLoading, setCountLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [totalResults, setTotalResults] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const filterWrapRef = useRef(null);
  const scrollerRef = useRef(null);
  const requestIdRef = useRef(0);
  const activeFilterCount = countActiveFilters(appliedFilters);

  const localize = useCallback(
    (list) =>
      (list ?? []).map((item) => ({
        ...item,
        title: resolveTitle(item, readableLanguages),
      })),
    [readableLanguages]
  );

  const load = useCallback(async ({ nextPage = 1, append = false, batch = 1 } = {}) => {
    const requestId = ++requestIdRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const pagesToFetch = Array.from(
        { length: Math.max(1, batch) },
        (_, i) => nextPage + i
      );
      const responses = await Promise.all(
        pagesToFetch.map((p) =>
          fetchProviderCatalog({
            providerId: provider.id,
            filters: appliedFilters,
            page: p,
          })
        )
      );
      if (requestId !== requestIdRef.current) return;

      const first = responses[0] ?? {};
      const mapped = localize(
        responses.flatMap((data) => data.results ?? [])
      );
      const lastFetched = pagesToFetch[pagesToFetch.length - 1];
      const pagesAvailable = first.totalPages ?? 0;

      setItems((prev) => (append ? dedupeByKey([...prev, ...mapped]) : dedupeByKey(mapped)));
      setTotalResults(first.totalResults ?? mapped.length);
      setTotalPages(pagesAvailable);
      setPage(Math.min(lastFetched, pagesAvailable || lastFetched));
    } catch (err) {
      console.error(err);
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
  }, [provider.id, appliedFilters, localize]);

  useEffect(() => {
    load({ nextPage: 1, append: false, batch: INITIAL_PAGE_BATCH });
  }, [load]);

  useEffect(() => {
    if (!filterOpen) return undefined;
    let cancelled = false;
    setCountLoading(true);
    const handle = window.setTimeout(() => {
      fetchProviderCatalog({
        providerId: provider.id,
        filters: draftFilters,
        page: 1,
      })
        .then((data) => {
          if (!cancelled) setDraftCount(data.totalResults ?? 0);
        })
        .catch(() => {
          if (!cancelled) setDraftCount(null);
        })
        .finally(() => {
          if (!cancelled) setCountLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [filterOpen, draftFilters, provider.id]);

  useEffect(() => {
    if (!filterOpen) return undefined;
    const onPointer = (event) => {
      if (!filterWrapRef.current?.contains(event.target)) {
        setDraftFilters(appliedFilters);
        setFilterOpen(false);
      }
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        setDraftFilters(appliedFilters);
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [filterOpen, appliedFilters]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    const onScroll = () => {
      if (loadingMore || loading) return;
      if (page >= totalPages) return;
      if (el.scrollTop + el.clientHeight < el.scrollHeight - 360) return;
      load({ nextPage: page + 1, append: true, batch: 1 });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [load, loading, loadingMore, page, totalPages]);

  const countLabel = loading && items.length === 0 ? "…" : formatItemCount(totalResults);

  return (
    <div className="provider-page" ref={scrollerRef}>
      <div className="provider-page-chrome">
        <button type="button" className="provider-page-back" onClick={() => router.push("/explore")}>
          <Icon name="back" size={15} color="#fff" />
          <span>Back</span>
        </button>

        <div className="provider-page-filter-wrap" ref={filterWrapRef}>
          <button
            type="button"
            className={`provider-page-filter-btn${filterOpen ? " is-open" : ""}${activeFilterCount > 0 ? " is-active" : ""}`}
            aria-expanded={filterOpen}
            aria-haspopup="dialog"
            onClick={() => {
              if (filterOpen) {
                setDraftFilters(appliedFilters);
                setFilterOpen(false);
                return;
              }
              setDraftFilters(appliedFilters);
              setDraftCount(totalResults);
              setFilterOpen(true);
            }}
          >
            <Icon name="filter" size={14} color="#fff" />
            <span>Filter</span>
            {activeFilterCount > 0 ? (
              <span className="provider-page-filter-badge">{activeFilterCount}</span>
            ) : null}
          </button>
          <ProviderFilterMenu
            filters={draftFilters}
            onChange={setDraftFilters}
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            onApply={() => setAppliedFilters(draftFilters)}
            resultCount={draftCount}
            countLoading={countLoading}
          />
        </div>
      </div>

      <header className="provider-page-brand">
        <ProviderLogo name={provider.name} logoPath={provider.logoPath} />
        <h1 className="provider-page-name">{provider.name}</h1>
        <p className="provider-page-count">{countLabel}</p>
      </header>

      {loading && items.length === 0 ? (
        <div className="provider-page-grid" aria-hidden="true">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="provider-page-skeleton" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="provider-page-empty">No titles match these filters.</div>
      ) : (
        <>
          <div className="provider-page-grid">
            {items.map((item) => {
              const status = resolvedStatusMap[mediaKey(item)];
              const href = hrefForMedia(item);
              return (
                <Link
                  key={mediaKey(item)}
                  href={href}
                  className="provider-page-card"
                  onClick={(event) => {
                    // Force client navigation — nested badge buttons inside <a>
                    // can otherwise leave clicks no-opping in some browsers.
                    if (event.defaultPrevented) return;
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    router.push(href);
                  }}
                >
                  <div className="provider-page-poster">
                    <PosterArt posterPath={item.posterPath} alt={item.title} tmdbSize="w342" sizes="16vw" />
                    <MediaTypeLabel mediaType={item.mediaType} />
                    {status
                      ? <MediaStatusBadge status={status} />
                      : <MediaFavoriteBadge item={item} source="ProviderPage:badge" />}
                    <div className="provider-page-poster-meta">
                      <div className="provider-page-poster-title">{item.title}</div>
                      <div className="provider-page-poster-sub">
                        {[item.year, item.rating ? `★ ${item.rating}` : null].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          {loadingMore ? <div className="provider-page-loading-more">Loading more…</div> : null}
        </>
      )}
    </div>
  );
}
