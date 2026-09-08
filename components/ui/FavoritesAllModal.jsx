"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import PosterCard from "@/components/ui/PosterCard";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import {
  loadFavoriteOrder,
  loadFavoriteSort,
  saveFavoriteOrder,
  saveFavoriteSort,
  sortFavorites,
} from "@/lib/favoritesOrder";

const SORT_OPTIONS = [
  { id: "firstAdded", label: "First Added" },
  { id: "lastAdded", label: "Last Added" },
  { id: "az", label: "A–Z" },
  { id: "userOrder", label: "User Order" },
];

/**
 * Desktop mid-screen “See All” for Favorite Shows / Movies —
 * search + sort beside close; User Order enables drag rearrange.
 */
export default function FavoritesAllModal({
  open,
  mediaType = "show",
  items = [],
  sortKey,
  orderKey,
  loading = false,
  isFavorite,
  onToggleFavorite,
  onClose,
  onSortChange,
  onOrderChange,
  onNavigate,
}) {
  const router = useRouter();
  const readableLanguages = useReadableLanguages();
  const searchInputRef = useRef(null);
  const dragIdRef = useRef(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState("firstAdded");
  const [order, setOrder] = useState([]);
  const [sortOpen, setSortOpen] = useState(false);
  const [dragOverId, setDragOverId] = useState(null);

  const title = mediaType === "movie" ? "Favorite Movies" : "Favorite Shows";
  const emptyLabel = mediaType === "movie" ? "No favorite movies yet." : "No favorite shows yet.";
  const reorderMode = sort === "userOrder" && !query.trim();

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    setSearchOpen(false);
    setSort(loadFavoriteSort(sortKey));
    setOrder(loadFavoriteOrder(orderKey));
    setSortOpen(false);
    setDragOverId(null);
  }, [open, sortKey, orderKey]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (searchOpen) {
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        setSearchOpen(false);
        setQuery("");
        return;
      }
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      onClose?.();
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose, searchOpen]);

  useEffect(() => {
    if (!searchOpen) return undefined;
    const id = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [searchOpen]);

  const resolved = useMemo(
    () =>
      (items || []).map((item) => ({
        ...item,
        title: resolveTitle(item, readableLanguages) || item.title || "",
      })),
    [items, readableLanguages]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = sortFavorites(resolved, sort, order);
    if (!q) return sorted;
    return sorted.filter((item) => (item.title || "").toLowerCase().includes(q));
  }, [resolved, query, sort, order]);

  const moveItem = (fromId, toId) => {
    if (fromId == null || toId == null || fromId === toId) return;
    setOrder((prev) => {
      const base = sortFavorites(resolved, "userOrder", prev).map((item) => item.id);
      const fromIdx = base.indexOf(fromId);
      const toIdx = base.indexOf(toId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...base];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      saveFavoriteOrder(orderKey, next);
      onOrderChange?.(next);
      return next;
    });
  };

  if (!open || typeof document === "undefined") return null;

  const sortLabel = SORT_OPTIONS.find((o) => o.id === sort)?.label || "First Added";

  const go = (href) => {
    onClose?.();
    if (onNavigate) onNavigate(href);
    else router.push(href);
  };

  return createPortal(
    <div className="upcoming-all-scrim favorites-all-scrim" role="presentation" onClick={onClose}>
      <div
        className="upcoming-all-card-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="upcoming-all-head favorites-all-head">
          <div className="upcoming-all-head-titles">
            <h2 className="upcoming-all-title">{title}</h2>
            <span className="upcoming-all-count">
              {filtered.length === 1 ? "1 title" : `${filtered.length} titles`}
            </span>
          </div>
          <div className="favorites-all-head-actions">
            {searchOpen ? (
              <div className="favorites-all-search-compact">
                <Icon name="search" size={16} color="rgba(255,255,255,0.5)" strokeWidth={2} />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search"
                  aria-label="Search titles"
                />
                <button
                  type="button"
                  className="favorites-all-search-clear"
                  aria-label="Close search"
                  onClick={() => {
                    setSearchOpen(false);
                    setQuery("");
                  }}
                >
                  <Icon name="x" size={13} color="rgba(255,255,255,0.7)" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="upcoming-all-chip favorites-all-search-btn"
                aria-label="Search titles"
                onClick={() => {
                  setSortOpen(false);
                  setSearchOpen(true);
                }}
              >
                <Icon name="search" size={22} color="rgba(255,255,255,0.9)" strokeWidth={2.4} />
              </button>
            )}

            <div className="upcoming-all-sort">
              <button
                type="button"
                className={`upcoming-all-chip upcoming-all-sort-btn${sortOpen ? " is-active" : ""}`}
                aria-haspopup="listbox"
                aria-expanded={sortOpen}
                onClick={() => setSortOpen((v) => !v)}
              >
                {sortLabel}
                <Icon
                  name="chevronDown"
                  size={12}
                  color={sortOpen ? "rgba(20,20,24,0.55)" : "rgba(255,255,255,0.55)"}
                />
              </button>
              {sortOpen ? (
                <>
                  <div className="upcoming-all-sort-scrim" onClick={() => setSortOpen(false)} />
                  <div className="upcoming-all-sort-menu" role="listbox">
                    {SORT_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected={sort === option.id}
                        className={`upcoming-all-sort-option${sort === option.id ? " is-active" : ""}`}
                        onClick={() => {
                          setSort(option.id);
                          saveFavoriteSort(sortKey, option.id);
                          onSortChange?.(option.id);
                          setSortOpen(false);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            <button type="button" className="upcoming-all-close" onClick={onClose} aria-label="Close">
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>

        {reorderMode ? (
          <div className="favorites-all-reorder-hint">Drag posters to rearrange</div>
        ) : null}

        <div className="upcoming-all-body">
          {loading ? (
            <div className="upcoming-all-empty">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="upcoming-all-empty">{query.trim() ? "No matching titles." : emptyLabel}</div>
          ) : (
            <div className="favorites-all-gallery">
              {filtered.map((item) => {
                const href = mediaType === "movie" ? `/movie/${item.id}` : `/show/${item.id}`;
                return (
                  <div
                    key={item.id}
                    className={`favorites-all-tile${dragOverId === item.id ? " is-drag-over" : ""}${reorderMode ? " is-reorder" : ""}`}
                    draggable={reorderMode}
                    onDragStart={(event) => {
                      if (!reorderMode) return;
                      dragIdRef.current = item.id;
                      event.dataTransfer.effectAllowed = "move";
                      try {
                        event.dataTransfer.setData("text/plain", String(item.id));
                      } catch {
                        /* ignore */
                      }
                    }}
                    onDragOver={(event) => {
                      if (!reorderMode) return;
                      event.preventDefault();
                      setDragOverId(item.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverId === item.id) setDragOverId(null);
                    }}
                    onDrop={(event) => {
                      if (!reorderMode) return;
                      event.preventDefault();
                      const fromId = dragIdRef.current ?? Number(event.dataTransfer.getData("text/plain"));
                      moveItem(fromId, item.id);
                      dragIdRef.current = null;
                      setDragOverId(null);
                    }}
                    onDragEnd={() => {
                      dragIdRef.current = null;
                      setDragOverId(null);
                    }}
                  >
                    <PosterCard
                      show={item}
                      width="100%"
                      shrink={false}
                      titlePlacement="none"
                      favorite={reorderMode ? false : isFavorite?.(item.id)}
                      onToggleFavorite={
                        reorderMode || !onToggleFavorite
                          ? undefined
                          : () => onToggleFavorite(item.id)
                      }
                      onClick={reorderMode ? undefined : () => go(href)}
                      tmdbSize="w342"
                      sizes="(min-width: 900px) 160px, 28vw"
                      pressScale={false}
                      badge={
                        reorderMode ? (
                          <div className="favorites-all-reorder-handle" aria-hidden>
                            <Icon name="reorder" size={13} color="#fff" />
                          </div>
                        ) : null
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
