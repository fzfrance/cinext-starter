"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import RecommendedRow from "@/components/library/RecommendedRow";
import CollectionRow from "@/components/library/CollectionRow";
import GenrePosterRow from "@/components/library/GenrePosterRow";
import Aisle from "@/components/library/Aisle";
import ViewModeToggle from "@/components/library/ViewModeToggle";
import StatusFilterRow, { MOVIE_STATUS_ITEMS } from "@/components/library/StatusFilterRow";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";
import { shelfGenresForShow, shelfGenresForMovie } from "@/lib/library";
import { tmdbImage } from "@/lib/tmdb";

const t = themes.dark;
const accent = DEFAULT_ACCENT;
const SORT_OPTIONS = [
  { id: "added_desc", label: "Date added · Newest" },
  { id: "added_asc", label: "Date added · Oldest" },
  { id: "az", label: "A–Z" },
  { id: "za", label: "Z–A" },
  { id: "rating_desc", label: "Rating · High to low" },
];

const COLLECTION_SORT_OPTIONS = [
  { id: "added_desc", label: "Recently updated" },
  { id: "added_asc", label: "Oldest first" },
  { id: "az", label: "A–Z" },
  { id: "za", label: "Z–A" },
];

function sortItems(items, sortId) {
  const list = [...items];
  switch (sortId) {
    case "az":
      return list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    case "za":
      return list.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
    case "rating_desc":
      return list.sort((a, b) => (b.tmdbRating ?? -1) - (a.tmdbRating ?? -1));
    case "added_asc":
      return list.sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0));
    case "added_desc":
    default:
      return list.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
  }
}

function sortCollections(rows, sortId) {
  const list = [...rows];
  switch (sortId) {
    case "az":
      return list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    case "za":
      return list.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
    case "added_asc":
      return list.sort((a, b) => new Date(a.lastAddedAt || a.createdAt || 0) - new Date(b.lastAddedAt || b.createdAt || 0));
    case "added_desc":
    default:
      return list.sort((a, b) => new Date(b.lastAddedAt || b.createdAt || 0) - new Date(a.lastAddedAt || a.createdAt || 0));
  }
}

function groupByGenre(items, mediaType, forceAll) {
  const groups = Object.entries(
    items.reduce((acc, s) => {
      let shelfGenres = mediaType === "movie" ? shelfGenresForMovie(s.genres) : shelfGenresForShow(s.genres, s.keywords);
      if (shelfGenres.length === 0) {
        if (!forceAll) return acc;
        shelfGenres = ["Other"];
      }
      for (const genre of shelfGenres) (acc[genre] ||= []).push(s);
      return acc;
    }, {})
  )
    .map(([genre, list]) => [genre, list])
    .filter(([, list]) => forceAll || list.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);
  return groups;
}

function SortMenu({ options, value, onSelect, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    const onPointer = (e) => {
      if (!ref.current?.contains(e.target)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="library-desktop-sort-menu" role="menu">
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="menuitem"
            className={`library-desktop-sort-item${active ? " is-active" : ""}`}
            onClick={() => { onSelect(opt.id); onClose(); }}
          >
            <span>{opt.label}</span>
            {active && <Icon name="check" size={14} color={accent} strokeWidth={2.6} />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Desktop Library shell — status filter pills, ambient poster wash,
 * Watch Next, poster grid / DVD aisles, Collections.
 */
export default function LibraryDesktop({
  tab,
  statusFilter,
  onStatusFilter,
  movieStatusFilter,
  onMovieStatusFilter,
  statusCounts,
  movieStatusCounts,
  recommended,
  movieRecommended,
  filtered,
  movieFiltered,
  trackedCount,
  trackedMovieCount,
  collectionsRaw,
  localizedShows,
  localizedMovies,
  loaded,
  moviesLoaded,
  nothingToShow,
  movieNothingToShow,
  onOpen,
  onNewCollection,
  viewMode = "poster",
  onSelectViewMode,
}) {
  const router = useRouter();
  const pageRef = useRef(null);
  const ambientGenRef = useRef(0);
  const lastAmbientRef = useRef({ left: null, mid: null, right: null });
  const [sortId, setSortId] = useState("added_desc");
  const [sortOpen, setSortOpen] = useState(false);
  // Balanced wash from Watch Next only (not scroll-sampled genre posters).
  const [activeAmbient, setActiveAmbient] = useState({ left: null, mid: null, right: null });
  // Stack of fading layers so tab/filter swaps ease instead of snapping.
  const [ambientLayers, setAmbientLayers] = useState([]);

  useEffect(() => {
    setSortId("added_desc");
    setSortOpen(false);
  }, [tab]);

  const activeFilter = tab === "movies" ? movieStatusFilter : statusFilter;
  const setActiveFilter = tab === "movies" ? onMovieStatusFilter : onStatusFilter;
  const counts = tab === "movies" ? movieStatusCounts : statusCounts;
  const recItems = tab === "movies" ? movieRecommended : recommended;
  const mediaType = tab === "movies" ? "movie" : "tv";

  const title =
    tab === "movies" ? "Movies" : tab === "collections" ? "Collections" : "Shows";

  const sortedFiltered = useMemo(() => {
    const base = tab === "movies" ? movieFiltered : filtered;
    return sortItems(base, sortId);
  }, [tab, movieFiltered, filtered, sortId]);

  const genreGroups = useMemo(() => {
    if (tab === "collections") return [];
    const forceAll = activeFilter !== "all";
    return groupByGenre(sortedFiltered, mediaType, forceAll).map(([genre, items]) => [
      genre,
      sortItems(items, sortId),
    ]);
  }, [tab, sortedFiltered, mediaType, activeFilter, sortId]);

  const sortedCollections = useMemo(
    () => sortCollections(collectionsRaw, sortId),
    [collectionsRaw, sortId]
  );

  const titleCount =
    tab === "collections"
      ? collectionsRaw.length
      : tab === "movies"
        ? movieFiltered.length
        : filtered.length;

  const pathsToAmbient = (paths) => {
    const list = paths.filter(Boolean);
    if (!list.length) return { left: null, mid: null, right: null };
    if (list.length === 1) return { left: list[0], mid: list[0], right: list[0] };
    if (list.length === 2) return { left: list[0], mid: list[0], right: list[1] };
    return {
      left: list[0],
      mid: list[Math.floor((list.length - 1) / 2)],
      right: list[list.length - 1],
    };
  };

  const defaultAmbient = useMemo(() => {
    // Collections: sample posters across rows so the wash matches Shows/Movies.
    if (tab === "collections") {
      const paths = [];
      for (const c of sortedCollections) {
        for (const id of c.showIds) {
          const show = localizedShows.find((s) => s.id === id && s.posterPath);
          if (show?.posterPath) {
            paths.push(show.posterPath);
            break;
          }
        }
        if (paths.length >= 5) break;
        for (const id of c.movieIds || []) {
          const movie = localizedMovies.find((m) => m.id === id && m.posterPath);
          if (movie?.posterPath) {
            paths.push(movie.posterPath);
            break;
          }
        }
        if (paths.length >= 5) break;
      }
      return pathsToAmbient(paths);
    }

    const recPaths = recItems.map((s) => s.posterPath).filter(Boolean);
    if (recPaths.length) return pathsToAmbient(recPaths);
    const listPaths = sortedFiltered.map((s) => s.posterPath).filter(Boolean);
    if (listPaths.length) return pathsToAmbient(listPaths.slice(0, 5));
    return { left: null, mid: null, right: null };
  }, [tab, recItems, sortedFiltered, sortedCollections, localizedShows, localizedMovies]);

  useEffect(() => {
    setActiveAmbient(defaultAmbient);
    lastAmbientRef.current = defaultAmbient;
  }, [defaultAmbient, tab, activeFilter]);

  useEffect(() => {
    const sides = ["left", "mid", "right"];
    const resolved = {
      left: activeAmbient.left || defaultAmbient.left,
      mid: activeAmbient.mid || activeAmbient.left || defaultAmbient.mid,
      right: activeAmbient.right || activeAmbient.mid || activeAmbient.left || defaultAmbient.right,
    };
    const nextBySide = Object.fromEntries(
      sides.map((side) => [side, resolved[side] ? tmdbImage(resolved[side], "w780") : null])
    );
    if (!sides.some((side) => nextBySide[side])) {
      setAmbientLayers((prev) => prev.map((layer) => ({ ...layer, visible: false })));
      return undefined;
    }

    const gen = ++ambientGenRef.current;
    let cancelled = false;
    const timers = [];
    const imgs = [];

    const preload = (url) =>
      new Promise((resolve) => {
        if (!url) {
          resolve(null);
          return;
        }
        const img = new window.Image();
        imgs.push(img);
        img.onload = () => resolve(url);
        img.onerror = () => resolve(url);
        img.src = url;
      });

    (async () => {
      await Promise.all(sides.map((side) => preload(nextBySide[side])));
      if (cancelled || ambientGenRef.current !== gen) return;

      setAmbientLayers((prev) => {
        const kept = [];
        for (const side of sides) {
          const url = nextBySide[side];
          if (!url) {
            for (const layer of prev.filter((l) => l.side === side)) {
              kept.push({ ...layer, visible: false, pendingExit: false });
            }
            continue;
          }
          const sameVisible = prev.find((l) => l.side === side && l.url === url && l.visible && !l.pendingExit);
          if (sameVisible) {
            kept.push(sameVisible);
            continue;
          }
          const outgoing = prev.find((l) => l.side === side && l.visible);
          if (outgoing) kept.push({ ...outgoing, visible: true, pendingExit: true });
          kept.push({
            side,
            url,
            id: `${gen}-${side}`,
            visible: false,
            pendingExit: false,
          });
        }
        return kept;
      });

      const showRaf = window.requestAnimationFrame(() => {
        if (cancelled || ambientGenRef.current !== gen) return;
        setAmbientLayers((prev) =>
          prev.map((layer) =>
            String(layer.id || "") === `${gen}-${layer.side}`
              ? { ...layer, visible: true }
              : layer
          )
        );
      });
      timers.push(showRaf);

      const exitTimer = window.setTimeout(() => {
        if (cancelled || ambientGenRef.current !== gen) return;
        setAmbientLayers((prev) =>
          prev.map((layer) =>
            layer.pendingExit ? { ...layer, visible: false, pendingExit: false } : layer
          )
        );
      }, 400);
      timers.push(exitTimer);

      const pruneTimer = window.setTimeout(() => {
        if (cancelled || ambientGenRef.current !== gen) return;
        setAmbientLayers((prev) =>
          prev.filter((layer) => layer.visible || String(layer.id || "").startsWith(`${gen}-`))
        );
      }, 1600);
      timers.push(pruneTimer);
    })();

    return () => {
      cancelled = true;
      for (const img of imgs) {
        img.onload = null;
        img.onerror = null;
      }
      for (const id of timers) {
        window.cancelAnimationFrame(id);
        window.clearTimeout(id);
      }
    };
  }, [activeAmbient, defaultAmbient]);

  // Ambient is locked to Watch Next / default sample only — no scroll
  // sampling over hundreds of genre posters (that was the jank source).
  const empty =
    tab === "collections"
      ? loaded && collectionsRaw.length === 0
      : tab === "movies"
        ? moviesLoaded && movieNothingToShow
        : loaded && nothingToShow;

  const sortOptions = tab === "collections" ? COLLECTION_SORT_OPTIONS : SORT_OPTIONS;

  return (
    <div className="library-desktop" ref={pageRef}>
      <div className="library-desktop-ambient" aria-hidden="true">
        {ambientLayers.map((layer) => (
          <div
            key={layer.id || `${layer.side}-${layer.url}`}
            className={`library-desktop-ambient-art is-${layer.side}${layer.visible ? " is-visible" : " is-exit"}`}
            style={{ backgroundImage: `url(${layer.url})` }}
          />
        ))}
        <div className="library-desktop-ambient-veil" />
      </div>

      <div className="library-desktop-shell">
        <main className="library-desktop-main">
          <header className="library-desktop-head">
            <div className="library-desktop-head-copy">
              <h1 className="library-desktop-title">{title}</h1>
              <div className="library-desktop-count-under">
                {titleCount} {titleCount === 1 ? "title" : "titles"}
              </div>
            </div>
            <div className="library-desktop-head-actions">
              <div className="library-desktop-sort-wrap">
                <button
                  type="button"
                  className="library-desktop-sort-btn"
                  onClick={() => setSortOpen((v) => !v)}
                  aria-expanded={sortOpen}
                >
                  <Icon name="list" size={14} color="#fff" />
                  <span>Sort</span>
                  <Icon name="chevronDown" size={13} color="rgba(255,255,255,0.65)" />
                </button>
                {sortOpen && (
                  <SortMenu
                    options={sortOptions}
                    value={sortId}
                    onSelect={setSortId}
                    onClose={() => setSortOpen(false)}
                  />
                )}
              </div>
              {tab !== "collections" && (
                <ViewModeToggle viewMode={viewMode} onSelect={onSelectViewMode} />
              )}
              {tab === "collections" && (
                <button type="button" className="library-desktop-add-btn" onClick={onNewCollection} aria-label="New collection">
                  <Icon name="plus" size={14} color="#0a0a0a" />
                  <span>New</span>
                </button>
              )}
            </div>
          </header>

          {tab !== "collections" && recItems.length > 0 && (
            <div className="library-desktop-recommended">
              <RecommendedRow
                softGlow
                items={recItems}
                onOpen={(s, rect) => onOpen(s, rect, mediaType === "movie" ? "movie" : "tv")}
              />
            </div>
          )}

          {tab !== "collections" && (
            <div className="library-desktop-status-row">
              <StatusFilterRow
                statusFilter={activeFilter}
                counts={counts}
                onSelect={setActiveFilter}
                items={tab === "movies" ? MOVIE_STATUS_ITEMS : undefined}
                showAllPill
              />
            </div>
          )}
          {tab === "collections" ? (
            <div className="library-desktop-collections">
              {!loaded ? (
                <div className="library-desktop-empty">Loading your collections…</div>
              ) : empty ? (
                <div className="library-desktop-empty">No collections yet. Create one to start grouping titles.</div>
              ) : (
                sortedCollections.map((c) => {
                  const showsById = Object.fromEntries(localizedShows.map((s) => [s.id, { ...s, mediaType: "tv" }]));
                  const moviesById = Object.fromEntries(localizedMovies.map((m) => [m.id, { ...m, mediaType: "movie" }]));
                  const items = [
                    ...c.showIds.map((id) => showsById[id]),
                    ...(c.movieIds ?? []).map((id) => moviesById[id]),
                  ].filter(Boolean);
                  if (!items.length) {
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="library-desktop-empty-collection"
                        onClick={() => router.push(`/profile/collections/${c.id}`)}
                      >
                        <Icon name="layers" size={18} color={accent} />
                        <span>{c.name}</span>
                        <Icon name="chevronRight" size={16} color={t.textDim} />
                      </button>
                    );
                  }
                  return (
                    <CollectionRow
                      key={c.id}
                      id={c.id}
                      name={c.name}
                      shared={c.shared}
                      items={items}
                      posterWidth={168}
                      withShelf
                    />
                  );
                })
              )}
            </div>
          ) : !(tab === "movies" ? moviesLoaded : loaded) ? (
            <div className="library-desktop-empty">Loading your library…</div>
          ) : empty ? (
            <div className="library-desktop-empty">
              {tab === "shows" && trackedCount === 0
                ? "Nothing in your library yet."
                : tab === "movies" && trackedMovieCount === 0
                  ? "Nothing in your library yet."
                  : "No titles match this filter."}
            </div>
          ) : viewMode === "dvd" ? (
            <div className="library-desktop-dvd">
              {genreGroups.map(([genre, items]) => (
                <Aisle
                  key={genre}
                  title={genre}
                  items={items}
                  mediaType={mediaType}
                  onOpen={(s, rect) => onOpen(s, rect, mediaType === "movie" ? "movie" : "tv")}
                />
              ))}
            </div>
          ) : (
            <div className="library-desktop-poster-shelves">
              {genreGroups.map(([genre, items]) => (
                <GenrePosterRow
                  key={genre}
                  title={genre}
                  items={items}
                  mediaType={mediaType}
                  posterWidth={168}
                  withShelf
                  gap={16}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
