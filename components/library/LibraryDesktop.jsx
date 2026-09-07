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
  const [sortId, setSortId] = useState("added_desc");
  const [sortOpen, setSortOpen] = useState(false);
  const [activeAmbientPath, setActiveAmbientPath] = useState(null);
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

  const defaultAmbientPath = useMemo(() => {
    const fromRec = recItems.find((s) => s.posterPath)?.posterPath;
    if (fromRec) return fromRec;
    const fromList = sortedFiltered.find((s) => s.posterPath)?.posterPath;
    if (fromList) return fromList;
    for (const c of sortedCollections) {
      const show = localizedShows.find((s) => c.showIds.includes(s.id) && s.posterPath);
      if (show) return show.posterPath;
      const movie = localizedMovies.find((m) => (c.movieIds || []).includes(m.id) && m.posterPath);
      if (movie) return movie.posterPath;
    }
    return null;
  }, [recItems, sortedFiltered, sortedCollections, localizedShows, localizedMovies]);

  useEffect(() => {
    setActiveAmbientPath(defaultAmbientPath);
  }, [defaultAmbientPath, tab, activeFilter]);

  useEffect(() => {
    const path = activeAmbientPath || defaultAmbientPath;
    const url = path ? tmdbImage(path, "w780") : null;
    if (!url) {
      setAmbientLayers((prev) => prev.map((layer) => ({ ...layer, visible: false })));
      return undefined;
    }
    let cancelled = false;
    setAmbientLayers((prev) => {
      const already = prev.find((layer) => layer.url === url);
      if (already) return prev.map((layer) => ({ ...layer, visible: layer.url === url }));
      return [...prev.map((layer) => ({ ...layer, visible: false })), { url, visible: false }].slice(-2);
    });
    const raf = window.requestAnimationFrame(() => {
      if (cancelled) return;
      setAmbientLayers((prev) => prev.map((layer) => ({ ...layer, visible: layer.url === url })));
    });
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setAmbientLayers((prev) => prev.filter((layer) => layer.visible || layer.url === url).slice(-2));
    }, 900);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [activeAmbientPath, defaultAmbientPath]);

  useEffect(() => {
    const root = pageRef.current;
    if (!root) return undefined;
    const pickAmbient = () => {
      const nodes = root.querySelectorAll("[data-lib-ambient]");
      if (!nodes.length) return;
      const focusY = window.innerHeight * 0.42;
      let best = null;
      let bestDist = Infinity;
      nodes.forEach((node) => {
        const path = node.getAttribute("data-lib-ambient");
        if (!path) return;
        const rect = node.getBoundingClientRect();
        if (rect.bottom < 60 || rect.top > window.innerHeight - 40) return;
        const mid = (rect.top + rect.bottom) / 2;
        const dist = Math.abs(mid - focusY);
        if (dist < bestDist) {
          bestDist = dist;
          best = path;
        }
      });
      if (best) setActiveAmbientPath(best);
    };
    pickAmbient();
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        pickAmbient();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [tab, sortedFiltered, recItems, viewMode, activeFilter]);

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
            key={layer.url}
            className={`library-desktop-ambient-art${layer.visible ? " is-visible" : " is-exit"}`}
            style={{ backgroundImage: `url(${layer.url})` }}
          />
        ))}
        <div className="library-desktop-ambient-veil" />
      </div>

      <div className="library-desktop-shell is-collections">
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
                <button type="button" className="library-desktop-add-btn" onClick={onNewCollection}>
                  <Icon name="folderPlus" size={15} color="#1a1108" />
                  <span>New collection</span>
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
                  return <CollectionRow key={c.id} id={c.id} name={c.name} shared={c.shared} items={items} />;
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
