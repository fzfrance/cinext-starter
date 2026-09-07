"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import PosterArt from "@/components/ui/PosterArt";
import YearSlider from "@/components/YearSlider";
import StatusMenu, { statusMenuOptions, movieStatusMenuOptions } from "@/components/StatusMenu";
import ExploreClient from "@/app/(tabs)/explore/ExploreClient";
import { useFavorites } from "@/lib/favorites-context";
import { useMovieFavorites } from "@/lib/movie-favorites-context";
import { useLibraryStatus } from "@/lib/useLibraryStatus";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { hrefForMedia, badgeForMedia, mediaKey } from "@/lib/media";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";
import { useDesktopSearch } from "@/lib/desktop-search-context";
import { tmdbImage } from "@/lib/tmdb";
import { pickTopSearchResult, sortSearchRailMedia } from "@/lib/searchRank";
import SearchBrowseDesktop, { fetchDiscoverResultCount } from "@/app/search/SearchBrowseDesktop";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

const MIN_YEAR = 1990;
const MAX_YEAR = new Date().getFullYear();

const SEARCH_PLATFORMS = [
  { id: 8, name: "Netflix", mono: "N", color: "#d9382f" },
  { id: 1899, name: "Max", mono: "M", color: "#8060ff" },
  { id: 337, name: "Disney+", mono: "D+", color: "#2a7ae4" },
  { id: 350, name: "Apple TV+", mono: "TV", color: "#c8c8cf" },
  { id: 9, name: "Prime Video", mono: "P", color: "#33c7ee" },
  { id: 15, name: "Hulu", mono: "H", color: "#3ddc84" },
  { id: 531, name: "Paramount+", mono: "P+", color: "#4a7fd9" },
  { id: 386, name: "Peacock", mono: "PC", color: "#cd6fd6" },
  { id: 283, name: "Crunchyroll", mono: "CR", color: "#f47521" },
];

const SEARCH_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "ko", name: "Korean" },
  { code: "ja", name: "Japanese" },
  { code: "zh", name: "Chinese" },
  { code: "th", name: "Thai" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "hi", name: "Hindi" },
  { code: "ar", name: "Arabic" },
  { code: "ru", name: "Russian" },
  { code: "tr", name: "Turkish" },
  { code: "sv", name: "Swedish" },
  { code: "nl", name: "Dutch" },
  { code: "pl", name: "Polish" },
];

const DEFAULT_DISCOVERY_FILTERS = {
  contentType: "all", // all | movie | tv
  genreIds: [],
  yearFrom: MIN_YEAR,
  platforms: [],
  languages: [],
};

// Genre options for the Filter popover — same TMDB id spaces the browse
// sidebar uses (movie vs TV namespaces diverge).
const FILTER_MOVIE_GENRES = [
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

const FILTER_TV_GENRES = [
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

const FILTER_ALL_GENRES = [
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

function filterGenresForContentType(contentType) {
  if (contentType === "tv") return FILTER_TV_GENRES;
  if (contentType === "movie") return FILTER_MOVIE_GENRES;
  return FILTER_ALL_GENRES;
}

function parseGenreIdParts(...raw) {
  const ids = new Set();
  for (const value of raw) {
    for (const part of String(value || "").split("|")) {
      const n = Number(part);
      if (Number.isFinite(n) && n > 0) ids.add(n);
    }
  }
  return ids;
}

function selectedFilterGenres(filters) {
  const ids = filters?.genreIds ?? [];
  if (ids.length === 0) return [];
  const options = filterGenresForContentType(filters.contentType);
  return options.filter((g) => ids.includes(g.id));
}

function mergeGenreQueryParams(genres) {
  const movie = new Set();
  const tv = new Set();
  for (const g of genres) {
    for (const part of String(g.movieId || "").split("|")) {
      if (part) movie.add(part);
    }
    for (const part of String(g.tvId || "").split("|")) {
      if (part) tv.add(part);
    }
  }
  return {
    genreMovie: movie.size ? [...movie].join("|") : undefined,
    genreTv: tv.size ? [...tv].join("|") : undefined,
  };
}

function toggleGenreId(filters, genreId) {
  const current = filters.genreIds ?? [];
  const next = current.includes(genreId)
    ? current.filter((id) => id !== genreId)
    : [...current, genreId];
  return { ...filters, genreIds: next };
}

function normalizeDiscoveryFilters(raw) {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_DISCOVERY_FILTERS };
  const genreIds = Array.isArray(raw.genreIds)
    ? raw.genreIds
    : raw.genreId
      ? [raw.genreId]
      : [];
  return {
    ...DEFAULT_DISCOVERY_FILTERS,
    ...raw,
    genreIds,
  };
}

// Compact TMDB genre id → label maps for search metadata chips. Movie and
// TV share some ids but diverge on others (Action vs Action & Adventure).
const MOVIE_GENRE_NAMES = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

const TV_GENRE_NAMES = {
  10759: "Action",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  10762: "Kids",
  9648: "Mystery",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi",
  10766: "Soap",
  10767: "Talk",
  10768: "War",
  37: "Western",
};

// Route-local continuity for a trip from Search into a title/person detail
// and back. Keeping the small result list in memory avoids both a blank
// re-search flash and losing the inner scroller's exact position.
let searchSession = null;

const statusIconFor = (status, mediaType) => (mediaType === "movie" ? movieStatusMenuOptions : statusMenuOptions).find((o) => o.id === status)?.icon || "plus";

function genreLabel(item) {
  const map = item.mediaType === "movie" ? MOVIE_GENRE_NAMES : TV_GENRE_NAMES;
  for (const id of item.genreIds ?? []) {
    if (map[id]) return map[id];
  }
  return null;
}

function typeLabel(item) {
  return item.mediaType === "movie" ? "Movie" : "Series";
}

function featuredLabel(item) {
  return item.mediaType === "movie" ? "Featured movie" : "Featured series";
}

function SearchResultRow({ item, status, menuOpen, onToggleMenu, onSelectStatus, onNavigate }) {
  const showFavorites = useFavorites();
  const movieFavorites = useMovieFavorites();
  const { isFavorite, toggleFavorite } = item.mediaType === "movie" ? movieFavorites : showFavorites;
  const favorite = isFavorite(item.id);
  const badge = badgeForMedia(item);

  return (
    <div className="relative flex gap-3 rounded-2xl" style={{ padding: 12, background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
      <Link href={hrefForMedia(item)} onClick={onNavigate} className="flex flex-1 min-w-0 gap-3">
        <div className="relative flex-shrink-0 rounded-xl overflow-hidden" style={{ width: 68, height: 96 }}>
          <PosterArt posterPath={item.posterPath} base={item.base} glow={item.glow} alt={item.title} />
          {favorite && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(item.id, "Search:resultRow"); }}
              className="absolute flex items-center justify-center active:scale-90 transition"
              style={{ top: 6, right: 6, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.5)" }}
            >
              <Icon name="heart" size={13} color="#e0567a" />
            </button>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.04em" }}>{badge.label}</span>
          </div>
          <div className="text-white font-bold mt-1" style={{ fontSize: 15, lineHeight: 1.25 }}>{item.title}</div>
          <div className="text-[12px] mt-1" style={{ color: t.textDim }}>{item.date}</div>
          <div className="flex items-center gap-1 mt-1.5">
            <Icon name="star" size={11} color={accent} />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#fff" }}>{item.rating}</span>
            <span style={{ fontSize: 11.5, color: t.textDim }}>/10 ({item.votes})</span>
          </div>
        </div>
      </Link>
      <div className="relative flex-shrink-0 self-center">
        <button onClick={onToggleMenu} className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition" style={{ background: accent }}>
          <Icon name={statusIconFor(status, item.mediaType)} size={16} color="#fff" strokeWidth={2.2} />
        </button>
        {menuOpen && <StatusMenu status={status} onSelect={onSelectStatus} align="right" includeRemove={!!status} options={item.mediaType === "movie" ? movieStatusMenuOptions : statusMenuOptions} />}
      </div>
    </div>
  );
}

function SearchPersonRow({ item, onNavigate }) {
  return (
    <Link href={`/person/${item.id}`} onClick={onNavigate} className="flex items-center gap-3 rounded-2xl" style={{ padding: 12, background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
      <div className="relative flex-shrink-0 rounded-full overflow-hidden" style={{ width: 56, height: 56, background: t.cardFill }}>
        <PosterArt posterPath={item.profilePath} alt={item.name} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.04em" }}>CAST</span>
        </div>
        <div className="text-white font-bold mt-1" style={{ fontSize: 15, lineHeight: 1.25 }}>{item.name}</div>
        {item.knownFor && (
          <div className="text-[12px] mt-1" style={{ color: t.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.knownFor}</div>
        )}
      </div>
    </Link>
  );
}

function countActiveDiscoveryFilters(filters) {
  let count = 0;
  if (filters.contentType !== "all") count += 1;
  count += (filters.genreIds ?? []).length;
  if (filters.yearFrom > MIN_YEAR) count += 1;
  count += filters.platforms.length;
  count += filters.languages.length;
  return count;
}

function DiscoveryFilterFields({ filters, onChange, providerLogos, languageQuery, setLanguageQuery, layout = "popover" }) {
  const filteredLanguages = SEARCH_LANGUAGES.filter((l) =>
    l.name.toLowerCase().includes(languageQuery.trim().toLowerCase())
  );
  const selectedGenreIds = filters.genreIds ?? [];
  const wrapClass = layout === "sidebar" ? "search-desktop-filter-fields is-sidebar" : "search-desktop-filter-popover-body";

  const togglePlatform = (id) => {
    onChange({
      ...filters,
      platforms: filters.platforms.includes(id)
        ? filters.platforms.filter((p) => p !== id)
        : [...filters.platforms, id],
    });
  };

  const toggleLanguage = (code) => {
    onChange({
      ...filters,
      languages: filters.languages.includes(code)
        ? filters.languages.filter((l) => l !== code)
        : [...filters.languages, code],
    });
  };

  return (
    <div className={wrapClass}>
      <div className="search-desktop-filter-row">
        <div className="search-desktop-filter-label">Type</div>
        <div className="search-desktop-filter-pills">
          {[
            { id: "all", label: "All" },
            { id: "movie", label: "Movies" },
            { id: "tv", label: "TV Shows" },
          ].map((opt) => {
            const selected = filters.contentType === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                className={`search-desktop-filter-pill${selected ? " is-active" : ""}`}
                onClick={() => onChange({ ...filters, contentType: opt.id, genreIds: [] })}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="search-desktop-filter-row is-wrap">
        <div className="search-desktop-filter-label">Genre</div>
        <div className="search-desktop-filter-pills is-wrap">
          <button
            type="button"
            className={`search-desktop-filter-pill${selectedGenreIds.length === 0 ? " is-active" : ""}`}
            onClick={() => onChange({ ...filters, genreIds: [] })}
          >
            All
          </button>
          {filterGenresForContentType(filters.contentType).map((g) => {
            const selected = selectedGenreIds.includes(g.id);
            return (
              <button
                key={g.id}
                type="button"
                className={`search-desktop-filter-pill${selected ? " is-active" : ""}`}
                onClick={() => onChange(toggleGenreId(filters, g.id))}
              >
                {g.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="search-desktop-filter-row is-year">
        <div className="search-desktop-filter-label">Year</div>
        <div className="search-desktop-filter-year">
          <YearSlider
            min={MIN_YEAR}
            max={MAX_YEAR}
            value={filters.yearFrom}
            onChange={(year) => onChange({ ...filters, yearFrom: year })}
          />
        </div>
      </div>

      <div className="search-desktop-filter-row is-wrap">
        <div className="search-desktop-filter-label">Streaming Platforms</div>
        <div className="search-desktop-filter-pills is-wrap">
          {SEARCH_PLATFORMS.map((p) => {
            const selected = filters.platforms.includes(p.id);
            const logoPath = providerLogos?.[p.id];
            return (
              <button
                key={p.id}
                type="button"
                className={`search-desktop-filter-platform${selected ? " is-active" : ""}`}
                onClick={() => togglePlatform(p.id)}
              >
                <span
                  className="search-desktop-filter-platform-logo"
                  style={{ background: logoPath ? "#fff" : p.color }}
                >
                  {logoPath ? (
                    <Image src={tmdbImage(logoPath, "w92")} alt="" fill sizes="20px" style={{ objectFit: "cover" }} />
                  ) : (
                    <span>{p.mono}</span>
                  )}
                </span>
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="search-desktop-filter-row is-wrap">
        <div className="search-desktop-filter-label">Language</div>
        <div className="search-desktop-filter-language">
          <div className="search-desktop-filter-language-search">
            <Icon name="search" size={14} color="rgba(255,255,255,0.4)" />
            <input
              value={languageQuery}
              onChange={(e) => setLanguageQuery(e.target.value)}
              placeholder="Search language..."
              aria-label="Search language"
            />
          </div>
          <div className="search-desktop-filter-pills is-wrap">
            {filteredLanguages.map((l) => {
              const selected = filters.languages.includes(l.code);
              return (
                <button
                  key={l.code}
                  type="button"
                  className={`search-desktop-filter-pill${selected ? " is-active" : ""}`}
                  onClick={() => toggleLanguage(l.code)}
                >
                  {l.name}
                </button>
              );
            })}
            {filteredLanguages.length === 0 ? (
              <span className="search-desktop-filter-empty">No languages match “{languageQuery}”.</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function DiscoveryFilterSidebar({ filters, onChange, providerLogos }) {
  const [languageQuery, setLanguageQuery] = useState("");
  const activeCount = countActiveDiscoveryFilters(filters);

  return (
    <aside className="search-desktop-browse-sidebar search-desktop-filter-sidebar" aria-label="Search filters">
      <div className="search-desktop-filter-sidebar-head">
        <span>Filters</span>
        {activeCount > 0 ? (
          <button
            type="button"
            className="search-desktop-filter-clear"
            onClick={() => {
              onChange({ ...DEFAULT_DISCOVERY_FILTERS });
              setLanguageQuery("");
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
      <DiscoveryFilterFields
        filters={filters}
        onChange={onChange}
        providerLogos={providerLogos}
        languageQuery={languageQuery}
        setLanguageQuery={setLanguageQuery}
        layout="sidebar"
      />
    </aside>
  );
}

function DesktopSearchFilters({ filters, onChange, providerLogos, onShowResults }) {
  const [open, setOpen] = useState(false);
  const [languageQuery, setLanguageQuery] = useState("");
  const [resultCount, setResultCount] = useState(null);
  const [countLoading, setCountLoading] = useState(false);
  const rootRef = useRef(null);
  const popoverRef = useRef(null);
  const activeCount = countActiveDiscoveryFilters(filters);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    const frame = window.requestAnimationFrame(() => {
      popoverRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setCountLoading(true);
    const handle = window.setTimeout(() => {
      fetchDiscoverResultCount(filters)
        .then((count) => {
          if (!cancelled) setResultCount(count);
        })
        .catch(() => {
          if (!cancelled) setResultCount(null);
        })
        .finally(() => {
          if (!cancelled) setCountLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, filters]);

  const clearAll = () => {
    onChange({ ...DEFAULT_DISCOVERY_FILTERS });
    setLanguageQuery("");
  };

  const applyLabel = (() => {
    if (countLoading) return "Show Results";
    if (resultCount == null) return "Show Results";
    return `Show ${resultCount} Result${resultCount === 1 ? "" : "s"}`;
  })();

  return (
    <div className="search-desktop-filter" ref={rootRef}>
      <button
        type="button"
        className={`search-desktop-filter-trigger${open ? " is-open" : ""}${activeCount > 0 ? " is-active" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="filter" size={14} color="#fff" />
        <span>Filter</span>
        {activeCount > 0 ? <span className="search-desktop-filter-badge">{activeCount}</span> : null}
        <Icon name="chevronDown" size={13} color="rgba(255,255,255,0.7)" />
      </button>

      {open ? (
        <div
          ref={popoverRef}
          className="search-desktop-filter-popover"
          role="dialog"
          aria-label="Search filters"
        >
          <DiscoveryFilterFields
            filters={filters}
            onChange={onChange}
            providerLogos={providerLogos}
            languageQuery={languageQuery}
            setLanguageQuery={setLanguageQuery}
            layout="popover"
          />

          <div className="search-desktop-filter-popover-footer">
            <button
              type="button"
              className="search-desktop-filter-apply"
              onClick={() => {
                setOpen(false);
                onShowResults?.();
              }}
            >
              {applyLabel}
            </button>
            {activeCount > 0 ? (
              <button type="button" className="search-desktop-filter-clear" onClick={clearAll}>
                Clear all
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SearchDesktopAmbient({ artPath }) {
  const [layers, setLayers] = useState([]);

  useEffect(() => {
    const url = artPath ? tmdbImage(artPath, "w780") : null;
    if (!url) {
      setLayers((prev) => prev.map((layer) => ({ ...layer, visible: false })));
      return undefined;
    }

    let cancelled = false;
    setLayers((prev) => {
      const already = prev.find((layer) => layer.url === url);
      if (already) {
        return prev.map((layer) => ({ ...layer, visible: layer.url === url }));
      }
      return [
        ...prev.map((layer) => ({ ...layer, visible: false })),
        { url, visible: false },
      ].slice(-2);
    });

    // Next frame → visible so opacity actually crossfades instead of
    // mounting already-on (which looked like “no ambient” on first paint).
    const raf = window.requestAnimationFrame(() => {
      if (cancelled) return;
      setLayers((prev) => prev.map((layer) => ({ ...layer, visible: layer.url === url })));
    });

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setLayers((prev) => prev.filter((layer) => layer.visible || layer.url === url).slice(-2));
    }, 900);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [artPath]);

  if (layers.length === 0) return null;

  return (
    <div className="search-desktop-ambient" aria-hidden="true">
      {layers.map((layer) => (
        <div
          key={layer.url}
          className={`search-desktop-ambient-art${layer.visible ? " is-visible" : " is-exit"}`}
          style={{ backgroundImage: `url(${layer.url})` }}
        />
      ))}
      <div className="search-desktop-ambient-veil" />
    </div>
  );
}

function DesktopTopResult({ item, status, onSelectStatus, onNavigate }) {
  const href = hrefForMedia(item);
  const genre = genreLabel(item);
  const artPath = item.backdropPath || item.posterPath;
  const overview = (item.overview || "").trim();
  const [statusOpen, setStatusOpen] = useState(false);
  const isMovie = item.mediaType === "movie";
  const options = isMovie ? movieStatusMenuOptions : statusMenuOptions;
  const statusOpt = options.find((s) => s.id === status);
  const inLibrary = Boolean(status);
  const statusLabel = statusOpt?.label ?? "Add to List";
  const statusIcon = !inLibrary
    ? "plus"
    : status === "watchlist"
    ? "bookmarkFilled"
    : statusOpt?.icon ?? "bookmark";

  const handleStatusClick = () => {
    if (!inLibrary) {
      onSelectStatus("watchlist");
      return;
    }
    setStatusOpen((v) => !v);
  };

  return (
    <section className="search-desktop-top">
      <div className="search-desktop-section-label">Top Result</div>
      <div className="search-desktop-top-card">
        <Link href={href} onClick={onNavigate} className="search-desktop-top-art" aria-label={item.title}>
          <PosterArt posterPath={artPath} alt={item.title} tmdbSize="w780" sizes="(min-width: 900px) 45vw, 100vw" />
        </Link>
        <div className="search-desktop-top-copy">
          <div className="search-desktop-top-kicker">{featuredLabel(item)}</div>
          <Link href={href} onClick={onNavigate} className="search-desktop-top-title">{item.title}</Link>
          <div className="search-desktop-top-meta">
            <span>{item.date}</span>
            <span aria-hidden="true">•</span>
            <span>{typeLabel(item)}</span>
            {genre ? (
              <>
                <span aria-hidden="true">•</span>
                <span>{genre}</span>
              </>
            ) : null}
            {item.rating && item.rating !== "0.0" ? (
              <span className="search-desktop-top-rating">
                <Icon name="star" size={11} color="#fff" />
                {item.rating}
              </span>
            ) : null}
          </div>
          {overview ? <p className="search-desktop-top-overview">{overview}</p> : null}
          <div className="search-desktop-top-actions">
            <div className="relative">
              {statusOpen ? (
                <>
                  <div className="fixed inset-0 z-[90]" onClick={() => setStatusOpen(false)} />
                  <StatusMenu
                    status={status}
                    onSelect={(id) => { onSelectStatus(id); setStatusOpen(false); }}
                    align="left"
                    options={options}
                    style={{ zIndex: 100 }}
                  />
                </>
              ) : null}
              <button type="button" className="search-desktop-top-btn is-primary" onClick={handleStatusClick}>
                <Icon name={statusIcon} size={14} color="#111" />
                {statusLabel}
              </button>
            </div>
            <Link href={href} onClick={onNavigate} className="search-desktop-top-btn is-secondary">
              <Icon name="info" size={14} color="#fff" />
              View detail
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function DesktopPosterRail({ title, items, onNavigate }) {
  const scrollerRef = useRef(null);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollerRef.current;
    if (!el) return undefined;
    const onScroll = () => updateScrollState();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [items, updateScrollState]);

  if (!items.length) return null;

  return (
    <section className="search-desktop-rail">
      <div className="search-desktop-section-label">{title}</div>
      <div className="search-desktop-rail-frame">
        <div ref={scrollerRef} className="search-desktop-rail-track">
          {items.map((item) => (
            <Link
              key={mediaKey(item)}
              href={hrefForMedia(item)}
              onClick={onNavigate}
              className="search-desktop-poster-card"
            >
              <div className="search-desktop-poster-art">
                <PosterArt posterPath={item.posterPath} alt={item.title} sizes="180px" />
              </div>
              <div className="search-desktop-poster-title">{item.title}</div>
              <div className="search-desktop-poster-meta">
                {item.date} • {typeLabel(item)}
              </div>
            </Link>
          ))}
        </div>
        {canScrollNext ? (
          <button
            type="button"
            className="search-desktop-rail-next"
            aria-label={`Scroll ${title}`}
            onClick={() => {
              const el = scrollerRef.current;
              if (!el) return;
              el.scrollBy({ left: Math.min(el.clientWidth * 0.72, 560), behavior: "smooth" });
            }}
          >
            <Icon name="chevronRight" size={18} color="#fff" />
          </button>
        ) : null}
      </div>
    </section>
  );
}

function DesktopPeopleRail({ items, onNavigate }) {
  const scrollerRef = useRef(null);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollerRef.current;
    if (!el) return undefined;
    const onScroll = () => updateScrollState();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [items, updateScrollState]);

  if (!items.length) return null;

  return (
    <section className="search-desktop-rail">
      <div className="search-desktop-section-label">People</div>
      <div className="search-desktop-rail-frame">
        <div ref={scrollerRef} className="search-desktop-rail-track is-people">
          {items.map((item) => {
            const initial = (item.name || "?").trim().charAt(0).toUpperCase();
            return (
              <Link
                key={`person-${item.id}`}
                href={`/person/${item.id}`}
                onClick={onNavigate}
                className="search-desktop-person-card"
              >
                <div className="search-desktop-person-art">
                  {item.profilePath ? (
                    <PosterArt posterPath={item.profilePath} alt={item.name} tmdbSize="w185" sizes="120px" />
                  ) : (
                    <span className="search-desktop-person-initial">{initial}</span>
                  )}
                </div>
                <div className="search-desktop-person-name">{item.name}</div>
                <div className="search-desktop-person-meta">{item.department || "Acting"}</div>
              </Link>
            );
          })}
        </div>
        {canScrollNext ? (
          <button
            type="button"
            className="search-desktop-rail-next"
            aria-label="Scroll People"
            onClick={() => {
              const el = scrollerRef.current;
              if (!el) return;
              el.scrollBy({ left: Math.min(el.clientWidth * 0.72, 480), behavior: "smooth" });
            }}
          >
            <Icon name="chevronRight" size={18} color="#fff" />
          </button>
        ) : null}
      </div>
    </section>
  );
}

function DesktopSearchSkeleton() {
  return (
    <div className="search-desktop-skeleton" aria-hidden="true">
      <div className="search-desktop-skeleton-top" />
      <div className="search-desktop-skeleton-rail">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="search-desktop-skeleton-poster" />
        ))}
      </div>
    </div>
  );
}

function mapSearchResults(data) {
  return (data.results ?? []).map((item) => {
    if (item.media_type === "person") {
      return {
        id: item.id,
        mediaType: "person",
        name: item.name,
        profilePath: item.profile_path,
        department: item.known_for_department || "Acting",
        knownFor: (item.known_for ?? []).map((k) => k.title ?? k.name).filter(Boolean).slice(0, 3).join(", "),
      };
    }
    const isMovie = item.media_type === "movie";
    return {
      id: item.id,
      mediaType: isMovie ? "movie" : "tv",
      title: isMovie ? item.title : item.name,
      originalTitle: (isMovie ? item.original_title : item.original_name) ?? null,
      originalLanguage: item.original_language ?? null,
      date: (isMovie ? item.release_date : item.first_air_date)?.slice(0, 4) || "TBA",
      rating: item.vote_average ? item.vote_average.toFixed(1) : "0.0",
      votes: item.vote_count ?? 0,
      popularity: item.popularity ?? 0,
      posterPath: item.poster_path,
      backdropPath: item.backdrop_path,
      overview: item.overview ?? "",
      genreIds: item.genre_ids ?? [],
      searchTitles: item.searchTitles ?? [],
    };
  });
}

export default function SearchClient({ trendingShows, trendingMovies, heroSlides, providerLogos = {}, asLens = false }) {
  const router = useRouter();
  const readableLanguages = useReadableLanguages();
  const { resolvedStatusMap, selectStatus } = useLibraryStatus("Search");
  const {
    query,
    setQuery,
    filter,
    setFilter,
    clearSearch,
    closeDesktopSearch,
  } = useDesktopSearch();
  const restoredSessionRef = useRef(searchSession);
  const restoredSession = restoredSessionRef.current;
  const resultsScrollRef = useRef(null);
  const searchInputRef = useRef(null);
  const desktopResultsRef = useRef(null);
  const skipInitialSearchRef = useRef(Boolean(restoredSession?.query?.trim()));
  const didRestoreRef = useRef(false);

  const [results, setResults] = useState(restoredSession?.results ?? []);
  const [loading, setLoading] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState(null);
  const [discoveryFilters, setDiscoveryFilters] = useState(() => normalizeDiscoveryFilters(restoredSession?.discoveryFilters));
  const [browseMode, setBrowseMode] = useState(Boolean(restoredSession?.browseMode));


  // Restore prior query into the shared desktop search field once.
  useEffect(() => {
    if (didRestoreRef.current) return;
    didRestoreRef.current = true;
    if (restoredSession?.query) setQuery(restoredSession.query);
    if (restoredSession?.filter) setFilter(restoredSession.filter);
    if (restoredSession?.discoveryFilters) setDiscoveryFilters(normalizeDiscoveryFilters(restoredSession.discoveryFilters));
  }, [restoredSession, setQuery, setFilter]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === "") { setResults([]); setLoading(false); return; }
    if (skipInitialSearchRef.current) {
      skipInitialSearchRef.current = false;
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const handle = setTimeout(() => {
      fetch(`/api/search/multi?q=${encodeURIComponent(trimmed)}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          setResults(mapSearchResults(data));
        })
        .catch((err) => { if (!cancelled) { console.error("Search failed:", err); setResults([]); } })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [query]);

  useEffect(() => {
    const restored = restoredSessionRef.current;
    if (!restored) return;
    let secondFrame;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const mobileEl = resultsScrollRef.current;
        const desktopEl = desktopResultsRef.current;
        if (mobileEl) mobileEl.scrollTop = restored.scrollTop ?? 0;
        if (desktopEl) desktopEl.scrollTop = restored.scrollTop ?? 0;
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setDiscoveryFilters(DEFAULT_DISCOVERY_FILTERS);
      setBrowseMode(false);
      if (asLens) {
        closeDesktopSearch();
        return;
      }
      clearSearch();
      router.back();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, clearSearch, asLens, closeDesktopSearch]);

  const rememberSearchPosition = useCallback(() => {
    if (asLens) closeDesktopSearch();
    const scrollTop = desktopResultsRef.current?.scrollTop ?? resultsScrollRef.current?.scrollTop ?? 0;
    searchSession = {
      query,
      results,
      filter,
      discoveryFilters,
      browseMode,
      scrollTop,
    };
  }, [query, results, filter, discoveryFilters, browseMode, asLens, closeDesktopSearch]);

  const updateQuery = (value) => {
    searchSession = null;
    setQuery(value);
  };

  const matchesDiscoveryFilters = useCallback((item) => {
    if (item.mediaType === "person") {
      // People ignore year/language/genre filters; hide when type is Movies/TV only.
      return discoveryFilters.contentType === "all";
    }
    if (discoveryFilters.contentType === "movie" && item.mediaType !== "movie") return false;
    if (discoveryFilters.contentType === "tv" && item.mediaType !== "tv") return false;

    const year = Number.parseInt(item.date, 10);
    if (Number.isFinite(year) && year < discoveryFilters.yearFrom) return false;

    if (discoveryFilters.languages.length > 0) {
      if (!item.originalLanguage || !discoveryFilters.languages.includes(item.originalLanguage)) return false;
    }

    const activeGenres = selectedFilterGenres(discoveryFilters);
    if (activeGenres.length > 0) {
      const wanted = parseGenreIdParts(
        ...activeGenres.flatMap((g) => [g.movieId, g.tvId])
      );
      const ids = item.genreIds ?? [];
      if (!ids.some((id) => wanted.has(Number(id)))) return false;
    }

    return true;
  }, [discoveryFilters]);

  const resolvedResults = results
    .map((s) => (
      s.mediaType === "person"
        ? s
        : {
            ...s,
            // Keep TMDB titles for Top Result matching even after the
            // display title is localized via Readable Languages.
            searchTitles: [...new Set([...(s.searchTitles ?? []), s.title, s.originalTitle].filter(Boolean))],
            title: resolveTitle(s, readableLanguages),
          }
    ))
    .filter(matchesDiscoveryFilters);
  const trimmed = query.trim();
  const movies = sortSearchRailMedia(
    resolvedResults.filter((item) => item.mediaType === "movie"),
    trimmed
  );
  const shows = sortSearchRailMedia(
    resolvedResults.filter((item) => item.mediaType === "tv"),
    trimmed
  );
  const people = resolvedResults.filter((item) => item.mediaType === "person");
  const topResult = pickTopSearchResult(resolvedResults, trimmed);

  const showMovies = discoveryFilters.contentType === "all" || discoveryFilters.contentType === "movie";
  const showShows = discoveryFilters.contentType === "all" || discoveryFilters.contentType === "tv";
  const showPeople = discoveryFilters.contentType === "all";
  const showTop = Boolean(topResult);

  const hasVisibleResults =
    (showTop && topResult) ||
    (showMovies && movies.length > 0) ||
    (showShows && shows.length > 0) ||
    (showPeople && people.length > 0);

  return (
    <>
      <div
        data-search-page
        data-search-lens={asLens ? "true" : undefined}
        className={`fixed inset-0 z-50${asLens ? " is-lens" : ""}`}
        style={asLens ? undefined : { background: t.bg }}
      >
        {/* ---------- Mobile / tablet (unchanged) ---------- */}
        <div className="search-mobile-layout h-full">
          {trimmed === "" ? (
            <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "none", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 90px)" }}>
              <ExploreClient trendingShows={trendingShows} trendingMovies={trendingMovies} heroSlides={heroSlides} />
            </div>
          ) : (
            <div ref={resultsScrollRef} className="h-full overflow-y-auto" style={{ scrollbarWidth: "none", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 104px)" }}>
              <div className="px-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>Search Results</div>
              </div>
              <div className="px-6 flex flex-col gap-2.5" style={{ marginTop: 16 }}>
                {resolvedResults.map((item) =>
                  item.mediaType === "person" ? (
                    <SearchPersonRow key={`person-${item.id}`} item={item} onNavigate={rememberSearchPosition} />
                  ) : (
                    <SearchResultRow
                      key={mediaKey(item)}
                      item={item}
                      status={resolvedStatusMap[mediaKey(item)]}
                      menuOpen={menuOpenFor === mediaKey(item)}
                      onNavigate={rememberSearchPosition}
                      onToggleMenu={() => setMenuOpenFor((v) => (v === mediaKey(item) ? null : mediaKey(item)))}
                      onSelectStatus={(statusId) => { selectStatus(item, statusId); setMenuOpenFor(null); }}
                    />
                  )
                )}
                {loading && results.length === 0 && (
                  <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: t.textDim }}>Searching…</div>
                )}
                {!loading && results.length === 0 && (
                  <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: t.textDim }}>No results found for &quot;{query}&quot;.</div>
                )}
              </div>
            </div>
          )}

          <div className="fixed left-0 right-0 flex items-center gap-2.5 px-4" style={{ bottom: 0, paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6px)", paddingTop: 12 }}>
            <button
              onPointerDown={() => searchInputRef.current?.blur()}
              onClick={() => router.back()}
              className="flex items-center justify-center rounded-full overflow-hidden active:scale-90 transition flex-shrink-0"
              style={{ width: 50, height: 50, background: t.cardFill, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a local static asset, not a next/image-managed remote path */}
              <img src="/cinext-logo-glass.png" alt="Cinext" className="w-full h-full" style={{ objectFit: "contain", padding: 3.75 }} />
            </button>

            <div className="flex-1 flex items-center gap-2.5 rounded-full" style={{ padding: "13px 18px", background: t.cardFill, border: `1px solid ${t.cardBorder}`, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}>
              <Icon name="search" size={16} color={t.textDim} />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => updateQuery(e.target.value)}
                placeholder="Search by title or actor"
                className="flex-1 bg-transparent outline-none"
                style={{ fontSize: 14.5, color: "#fff" }}
              />
              {trimmed !== "" && (
                <button onClick={() => updateQuery("")} className="flex-shrink-0 active:scale-90 transition">
                  <Icon name="x" size={15} color={t.textDim} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ---------- Desktop (≥900px) ---------- */}
        <div className="search-desktop-layout">
          {trimmed !== "" && showTop && topResult ? (
            <SearchDesktopAmbient artPath={topResult.backdropPath || topResult.posterPath} />
          ) : null}
          <div className="search-desktop-shell">
            {trimmed === "" ? (
              browseMode ? (
                <SearchBrowseDesktop
                  filters={discoveryFilters}
                  filterSidebar={(
                    <DiscoveryFilterSidebar
                      filters={discoveryFilters}
                      onChange={setDiscoveryFilters}
                      providerLogos={providerLogos}
                    />
                  )}
                  onNavigate={rememberSearchPosition}
                />
              ) : (
                <div className="search-desktop-empty">
                  <div className="search-desktop-empty-icon">
                    <Icon name="search" size={26} color="rgba(255,255,255,0.55)" />
                  </div>
                  <h1>Find something to watch</h1>
                  <p>Find movies, shows, and people</p>
                  <DesktopSearchFilters
                    filters={discoveryFilters}
                    onChange={setDiscoveryFilters}
                    providerLogos={providerLogos}
                    onShowResults={() => setBrowseMode(true)}
                  />
                </div>
              )
            ) : (
              <div className={`search-desktop-browse is-results${countActiveDiscoveryFilters(discoveryFilters) > 0 ? "" : " is-no-sidebar"}`}>
                {countActiveDiscoveryFilters(discoveryFilters) > 0 ? (
                  <DiscoveryFilterSidebar
                    filters={discoveryFilters}
                    onChange={setDiscoveryFilters}
                    providerLogos={providerLogos}
                  />
                ) : null}
                <div ref={desktopResultsRef} className="search-desktop-browse-main search-desktop-results">
                  {loading && !hasVisibleResults ? (
                    <DesktopSearchSkeleton />
                  ) : !hasVisibleResults ? (
                    <div className="search-desktop-empty is-no-results">
                      <h1>No results for “{query}”</h1>
                      <p>Try another title, actor, or keyword.</p>
                    </div>
                  ) : (
                    <div className="search-desktop-stack">
                      {showTop && topResult ? (
                        <DesktopTopResult
                          item={topResult}
                          status={resolvedStatusMap[mediaKey(topResult)]}
                          onSelectStatus={(statusId) => selectStatus(topResult, statusId)}
                          onNavigate={rememberSearchPosition}
                        />
                      ) : null}
                      {showMovies ? (
                        <DesktopPosterRail title="Movies" items={movies} onNavigate={rememberSearchPosition} />
                      ) : null}
                      {showShows ? (
                        <DesktopPosterRail title="Shows" items={shows} onNavigate={rememberSearchPosition} />
                      ) : null}
                      {showPeople ? (
                        <DesktopPeopleRail items={people} onNavigate={rememberSearchPosition} />
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
