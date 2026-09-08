"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import PosterArt from "@/components/ui/PosterArt";
import { useAuth } from "@/lib/auth-context";
import { getWatchedEpisodesForYear } from "@/lib/episodeWatches";
import { getUserMoviesWatchedInYear } from "@/lib/userMovies";
import { fallbackPalette } from "@/lib/library";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { hrefForMedia, mediaKey } from "@/lib/media";
import { DEFAULT_ACCENT } from "@/lib/theme";

const accent = DEFAULT_ACCENT;

const VIEW_MODE_KEY = "cinext:timeMachineViewMode";
const TYPE_FILTER_KEY = "cinext:timeMachineTypeFilter";

const TYPE_FILTERS = [
  { id: "all", label: "All" },
  { id: "tv", label: "TV Shows" },
  { id: "movie", label: "Movies" },
];

async function fetchBatchResults(path, ids) {
  if (ids.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < ids.length; i += 20) chunks.push(ids.slice(i, i + 20));
  const responses = [];
  for (const chunk of chunks) {
    try {
      const response = await fetch(`${path}?ids=${chunk.join(",")}`, { cache: "no-store" });
      if (!response.ok) {
        responses.push([]);
        continue;
      }
      const payload = await response.json();
      responses.push(Array.isArray(payload?.results) ? payload.results : []);
    } catch (err) {
      console.error(`Failed to load Time Machine media batch (${path}):`, err);
      responses.push([]);
    }
  }
  return responses.flat();
}

function typeBadge(item) {
  return item.mediaType === "movie"
    ? { icon: "clapperboard", label: "Movie" }
    : { icon: "tv", label: "TV Show" };
}

function ListCard({ item, title, onNavigate }) {
  const palette = fallbackPalette(item.id);
  const badge = typeBadge(item);
  const meta = [
    item.numberOfSeasons
      ? `${item.numberOfSeasons} Season${item.numberOfSeasons === 1 ? "" : "s"}`
      : null,
    item.genre || null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button type="button" className="upcoming-all-card" onClick={() => onNavigate(hrefForMedia(item))}>
      <div className="upcoming-all-card-thumb">
        <PosterArt
          posterPath={item.posterPath}
          base={palette.base}
          glow={item.mediaType === "movie" ? accent : palette.glow}
          alt={title}
          flat
          objectFit="contain"
          tmdbSize="w342"
          sizes="72px"
        />
      </div>
      <div className="upcoming-all-card-copy">
        <div className="upcoming-all-card-title">{title}</div>
        <div className="upcoming-all-card-meta">
          <span className="time-machine-all-type">
            <Icon name={badge.icon} size={11} color={accent} />
            {badge.label}
          </span>
          {meta ? ` · ${meta}` : ""}
        </div>
      </div>
    </button>
  );
}

function GalleryCard({ item, title, onNavigate }) {
  const palette = fallbackPalette(item.id);
  return (
    <button
      type="button"
      className="time-machine-all-poster"
      onClick={() => onNavigate(hrefForMedia(item))}
    >
      <PosterArt
        posterPath={item.posterPath}
        base={palette.base}
        glow={item.mediaType === "movie" ? accent : palette.glow}
        alt={title}
      />
      <div className="time-machine-all-poster-scrim">
        <div className="time-machine-all-poster-title">{title}</div>
        {item.numberOfSeasons ? (
          <div className="time-machine-all-poster-meta">
            {item.numberOfSeasons} Season{item.numberOfSeasons === 1 ? "" : "s"}
          </div>
        ) : null}
      </div>
    </button>
  );
}

/**
 * Desktop mid-screen Time Machine year panel — Upcoming glass chrome with
 * search, type filter, and list/gallery view.
 */
export default function TimeMachineYearModal({ open, year, onClose, onNavigate }) {
  const router = useRouter();
  const { user } = useAuth();
  const readableLanguages = useReadableLanguages();
  const [items, setItems] = useState(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [viewMode, setViewMode] = useState("gallery");

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    try {
      const savedView = localStorage.getItem(VIEW_MODE_KEY);
      if (savedView === "list" || savedView === "gallery") setViewMode(savedView);
      const savedFilter = localStorage.getItem(TYPE_FILTER_KEY);
      if (savedFilter === "all" || savedFilter === "tv" || savedFilter === "movie") {
        setTypeFilter(savedFilter);
      } else {
        setTypeFilter("all");
      }
    } catch {
      setTypeFilter("all");
      setViewMode("gallery");
    }
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      onClose?.();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, year, onClose]);

  useEffect(() => {
    if (!open || !user || !year) return undefined;
    let cancelled = false;
    setItems(null);
    (async () => {
      const [showRows, movieRows] = await Promise.all([
        getWatchedEpisodesForYear(user.id, year).catch((err) => {
          console.error(err);
          return [];
        }),
        getUserMoviesWatchedInYear(user.id, year).catch((err) => {
          console.error(err);
          return [];
        }),
      ]);

      const lastShowDate = new Map();
      for (const r of showRows) {
        const at = r.watched_at ?? r.watched_on;
        if (!at) continue;
        if (!lastShowDate.has(r.tmdb_show_id) || at > lastShowDate.get(r.tmdb_show_id)) {
          lastShowDate.set(r.tmdb_show_id, at);
        }
      }
      const lastMovieDate = new Map();
      for (const r of movieRows) {
        const at =
          r.watchedOn ??
          (r.watchedYear
            ? `${r.watchedYear}-${String(r.watchedMonth ?? 1).padStart(2, "0")}-01`
            : null);
        if (!at) continue;
        if (!lastMovieDate.has(r.movieId) || at > lastMovieDate.get(r.movieId)) {
          lastMovieDate.set(r.movieId, at);
        }
      }

      const showIds = [...lastShowDate.keys()];
      const movieIds = [...lastMovieDate.keys()];
      const [showResults, movieResults] = await Promise.all([
        fetchBatchResults("/api/shows/batch", showIds),
        fetchBatchResults("/api/movies/batch", movieIds),
      ]);
      if (cancelled) return;

      const showById = new Map(showResults.map((show) => [String(show.id), show]));
      const movieById = new Map(movieResults.map((movie) => [String(movie.id), movie]));
      const merged = [
        ...showIds.map((id) => ({
          ...(showById.get(String(id)) ?? {
            id: Number(id),
            title: "Watched TV show",
            posterPath: null,
          }),
          mediaType: "tv",
          watchedAt: lastShowDate.get(id) ?? lastShowDate.get(Number(id)),
        })),
        ...movieIds.map((id) => ({
          ...(movieById.get(String(id)) ?? {
            id: Number(id),
            title: "Watched movie",
            posterPath: null,
          }),
          mediaType: "movie",
          watchedAt: lastMovieDate.get(id) ?? lastMovieDate.get(Number(id)),
        })),
      ].sort((a, b) => (b.watchedAt ?? "").localeCompare(a.watchedAt ?? ""));

      setItems(merged);
    })().catch((err) => {
      console.error(err);
      if (!cancelled) setItems([]);
    });
    return () => {
      cancelled = true;
    };
  }, [open, user, year]);

  const filtered = useMemo(() => {
    if (!items) return null;
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter !== "all" && item.mediaType !== typeFilter) return false;
      if (!q) return true;
      const title = (resolveTitle(item, readableLanguages) || item.title || "").toLowerCase();
      return title.includes(q);
    });
  }, [items, query, typeFilter, readableLanguages]);

  if (!open || typeof document === "undefined" || !year) return null;

  const emptyLabel =
    typeFilter === "tv" ? "shows" : typeFilter === "movie" ? "movies" : "titles";

  const navigate = (href) => {
    onClose?.();
    if (onNavigate) onNavigate(href);
    else router.push(href);
  };

  const setAndPersistView = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  };

  return createPortal(
    <div className="upcoming-all-scrim time-machine-all-scrim" role="presentation" onClick={onClose}>
      <div
        className="upcoming-all-card-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Time Machine ${year}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="upcoming-all-head">
          <div className="upcoming-all-head-titles">
            <h2 className="upcoming-all-title">{year}</h2>
            <span className="upcoming-all-count">
              {filtered == null
                ? "Loading…"
                : filtered.length === 1
                  ? "1 title watched"
                  : `${filtered.length} titles watched`}
            </span>
          </div>
          <button type="button" className="upcoming-all-close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="upcoming-all-search">
          <Icon name="search" size={15} color="rgba(255,255,255,0.4)" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles"
            aria-label="Search titles"
          />
        </div>

        <div className="upcoming-all-chips" role="group" aria-label="Time Machine filters">
          {TYPE_FILTERS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`upcoming-all-chip${typeFilter === chip.id ? " is-active" : ""}`}
              aria-pressed={typeFilter === chip.id}
              onClick={() => {
                setTypeFilter(chip.id);
                try {
                  localStorage.setItem(TYPE_FILTER_KEY, chip.id);
                } catch {
                  /* ignore */
                }
              }}
            >
              {chip.label}
            </button>
          ))}
          <div className="home-view-toggle time-machine-view-toggle" role="group" aria-label="View">
            <button
              type="button"
              className={viewMode === "gallery" ? "is-active" : ""}
              aria-pressed={viewMode === "gallery"}
              aria-label="Gallery view"
              onClick={() => setAndPersistView("gallery")}
            >
              <Icon
                name="gridToggle"
                size={15}
                color={viewMode === "gallery" ? "#111" : "rgba(255,255,255,0.6)"}
              />
            </button>
            <button
              type="button"
              className={viewMode === "list" ? "is-active" : ""}
              aria-pressed={viewMode === "list"}
              aria-label="List view"
              onClick={() => setAndPersistView("list")}
            >
              <Icon
                name="list"
                size={15}
                color={viewMode === "list" ? "#111" : "rgba(255,255,255,0.6)"}
              />
            </button>
          </div>
        </div>

        <div className="upcoming-all-body">
          {filtered == null ? (
            <div className="upcoming-all-empty">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="upcoming-all-empty">
              {query.trim()
                ? "No matching titles."
                : `No ${emptyLabel} watched in ${year}.`}
            </div>
          ) : viewMode === "gallery" ? (
            <div className="time-machine-all-gallery">
              {filtered.map((item) => (
                <GalleryCard
                  key={mediaKey(item)}
                  item={item}
                  title={resolveTitle(item, readableLanguages) || item.title || "Untitled"}
                  onNavigate={navigate}
                />
              ))}
            </div>
          ) : (
            <div className="upcoming-all-grid">
              {filtered.map((item) => (
                <ListCard
                  key={mediaKey(item)}
                  item={item}
                  title={resolveTitle(item, readableLanguages) || item.title || "Untitled"}
                  onNavigate={navigate}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
