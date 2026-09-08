"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/ui/Icon";
import PosterArt from "@/components/ui/PosterArt";
import StarInput from "@/components/ui/StarInput";
import { useAuth } from "@/lib/auth-context";
import { getMyRatingsForUser } from "@/lib/myRatings";
import { fallbackPalette, seasonLabel } from "@/lib/library";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { useAmbientPalette } from "@/lib/ambientPalette";
import { tmdbImage } from "@/lib/tmdb";

const SORT_OPTIONS = [
  { id: "recent", label: "Recent" },
  { id: "highest", label: "Highest" },
  { id: "lowest", label: "Lowest" },
  { id: "az", label: "A–Z" },
];

const FILTER_CHIPS = [
  { id: "all", label: "All" },
  { id: "tv", label: "TV" },
  { id: "movie", label: "Movies" },
];

function ratingKey(rating) {
  return rating.mediaType === "movie"
    ? `movie-${rating.movieId}`
    : `tv-${rating.showId}-${rating.seasonNumber}`;
}

function RatingModalCard({ rating, readableLanguages, onOpen }) {
  const isMovie = rating.mediaType === "movie";
  const displayTitle = resolveTitle(rating, readableLanguages) || rating.title || "Untitled";
  const posterUrl = rating.posterPath ? tmdbImage(rating.posterPath, "w342") : null;
  const ambient = useAmbientPalette(posterUrl);
  const palette = fallbackPalette(isMovie ? rating.movieId : rating.showId);

  return (
    <button
      type="button"
      className="profile-desktop-rating-card ratings-all-card"
      style={{
        "--rating-ambient-primary": ambient.primary,
        "--rating-ambient-secondary": ambient.secondary,
        "--rating-ambient-surface": ambient.surface,
      }}
      onClick={() => onOpen(rating)}
    >
      <div className="profile-desktop-rating-wash" aria-hidden="true">
        {posterUrl ? (
          <div
            className="profile-desktop-rating-wash-art"
            style={{ backgroundImage: `url(${posterUrl})` }}
          />
        ) : null}
        <div className="profile-desktop-rating-wash-veil" />
      </div>
      <div className="profile-desktop-rating-poster">
        <PosterArt
          posterPath={rating.posterPath}
          base={palette.base}
          glow={palette.glow}
          alt={displayTitle}
        />
      </div>
      <div className="profile-desktop-rating-copy">
        <div className="profile-desktop-rating-title">{displayTitle}</div>
        {!isMovie ? (
          <div className="profile-desktop-rating-season">{seasonLabel(rating.seasonNumber)}</div>
        ) : (
          <div className="profile-desktop-rating-season">Movie</div>
        )}
        <div className="profile-desktop-rating-stars">
          <StarInput value={rating.rating / 2} onChange={() => {}} size={13} gap={2} readOnly />
        </div>
        <div className="profile-desktop-rating-score">{Number(rating.rating).toFixed(1)}</div>
      </div>
    </button>
  );
}

/**
 * Desktop mid-screen “See All” for My Ratings — search, filter, sort.
 */
export default function RatingsAllModal({ open, onClose, onOpenRating }) {
  const { user } = useAuth();
  const readableLanguages = useReadableLanguages();
  const searchInputRef = useRef(null);
  const [items, setItems] = useState(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState("recent");
  const [filter, setFilter] = useState("all");
  const [sortOpen, setSortOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    setSearchOpen(false);
    setSort("recent");
    setFilter("all");
    setSortOpen(false);
    setItems(null);
  }, [open]);

  useEffect(() => {
    if (!open || !user) return undefined;
    let cancelled = false;
    getMyRatingsForUser(user.id)
      .then((entries) => {
        if (!cancelled) setItems(entries);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

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
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose, searchOpen]);

  useEffect(() => {
    if (!searchOpen) return undefined;
    const id = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [searchOpen]);

  const filtered = useMemo(() => {
    if (!items) return null;
    const q = query.trim().toLowerCase();
    let list = items.filter((item) => {
      if (filter === "tv" && item.mediaType === "movie") return false;
      if (filter === "movie" && item.mediaType !== "movie") return false;
      if (!q) return true;
      const title = (resolveTitle(item, readableLanguages) || item.title || "").toLowerCase();
      return title.includes(q);
    });

    list = [...list].sort((a, b) => {
      if (sort === "highest") return b.rating - a.rating;
      if (sort === "lowest") return a.rating - b.rating;
      if (sort === "az") {
        const ta = resolveTitle(a, readableLanguages) || a.title || "";
        const tb = resolveTitle(b, readableLanguages) || b.title || "";
        return ta.localeCompare(tb, undefined, { sensitivity: "base" });
      }
      const da = a.activityAt ? new Date(a.activityAt).getTime() : 0;
      const db = b.activityAt ? new Date(b.activityAt).getTime() : 0;
      return db - da;
    });
    return list;
  }, [items, query, filter, sort, readableLanguages]);

  if (!open || typeof document === "undefined") return null;

  const sortLabel = SORT_OPTIONS.find((o) => o.id === sort)?.label || "Recent";

  return createPortal(
    <div className="upcoming-all-scrim favorites-all-scrim" role="presentation" onClick={onClose}>
      <div
        className="upcoming-all-card-panel"
        role="dialog"
        aria-modal="true"
        aria-label="My Ratings"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="upcoming-all-head favorites-all-head">
          <div className="upcoming-all-head-titles">
            <h2 className="upcoming-all-title">My Ratings</h2>
            <span className="upcoming-all-count">
              {filtered == null
                ? "Loading…"
                : filtered.length === 1
                  ? "1 title"
                  : `${filtered.length} titles`}
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

        <div className="upcoming-all-chips" role="group" aria-label="Filter">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`upcoming-all-chip${filter === chip.id ? " is-active" : ""}`}
              aria-pressed={filter === chip.id}
              onClick={() => setFilter(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="upcoming-all-body">
          {filtered == null ? (
            <div className="upcoming-all-empty">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="upcoming-all-empty">
              {query.trim() ? "No matching titles." : "No ratings yet."}
            </div>
          ) : (
            <div className="ratings-all-grid">
              {filtered.map((rating) => (
                <RatingModalCard
                  key={ratingKey(rating)}
                  rating={rating}
                  readableLanguages={readableLanguages}
                  onOpen={(r) => {
                    onOpenRating?.(r);
                  }}
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
