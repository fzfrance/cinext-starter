"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/ui/Icon";
import PosterArt from "@/components/ui/PosterArt";
import PosterCard from "@/components/ui/PosterCard";
import CollectionBoxSet from "@/components/CollectionBoxSet";
import { sortItems } from "@/app/(tabs)/profile/collections/shared";
import { hrefForMedia, mediaKey } from "@/lib/media";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { tmdbImage } from "@/lib/tmdb";
import { usePosterColorWash } from "@/lib/ambientPalette";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

const SORT_OPTIONS = [
  { id: "firstAdded", label: "First Added" },
  { id: "lastAdded", label: "Last Added" },
  { id: "az", label: "A–Z" },
  { id: "userOrder", label: "User Order" },
];

const WASH_ANCHORS = [
  { x: "18%", y: "22%" },
  { x: "78%", y: "18%" },
  { x: "52%", y: "58%" },
  { x: "28%", y: "72%" },
  { x: "88%", y: "68%" },
];

/**
 * Desktop collection detail — mockup layout: poster-fan hero, left identity
 * copy, Sort/Add actions, poster grid. Ambient wash is sampled from the
 * collection’s own posters (not a fixed ref palette).
 */
export default function CollectionDesktop({
  detail,
  editingList,
  reorderMode,
  showsSortMode,
  backdropPickerOpen,
  addShowOpen,
  catalog,
  showQuery,
  showSelected,
  dragKey,
  fileInputRef,
  isFavorite,
  isMovieFavorite,
  onStartEdit,
  onStartReorder,
  onDeleteCollection,
  onRename,
  onUpdateDescription,
  onSaveListChanges,
  onSetShowsSortMode,
  onDoneReorder,
  onDrop,
  onDragStart,
  onRemoveFromCollection,
  onToggleFavorite,
  onToggleMovieFavorite,
  onLongPress,
  onOpenAdd,
  onCloseAdd,
  onSetShowQuery,
  onToggleShowSelect,
  onCommitAdd,
  onOpenBackdropPicker,
  onCloseBackdropPicker,
  onUpdateCoverStyle,
  onImageUpload,
}) {
  const readableLanguages = useReadableLanguages();
  const [sortOpen, setSortOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const itemCount = detail.covers?.length ?? 0;
  const countLabel = `${itemCount} title${itemCount === 1 ? "" : "s"}`;
  const inReorder = reorderMode || showsSortMode === "userOrder";

  const posterWashUrls = useMemo(
    () =>
      (detail.covers || [])
        .map((c) => c.posterPath)
        .filter(Boolean)
        .slice(0, 5)
        .map((path) => tmdbImage(path, "w185")),
    [detail.covers]
  );
  const washColors = usePosterColorWash(posterWashUrls);

  const displayed = useMemo(() => {
    const resolved = (detail.covers || []).map((c) => ({
      ...c,
      title: resolveTitle(c, readableLanguages),
    }));
    if (reorderMode || showsSortMode === "userOrder") return resolved;
    return sortItems(resolved, showsSortMode, "title");
  }, [detail.covers, readableLanguages, reorderMode, showsSortMode]);

  useEffect(() => {
    if (!sortOpen && !moreOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setSortOpen(false);
      setMoreOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sortOpen, moreOpen]);

  return (
    <div className="collection-desktop">
      <div className="collection-desktop-ambient" aria-hidden>
        {washColors.map((rgb, i) => {
          const anchor = WASH_ANCHORS[i] || WASH_ANCHORS[0];
          const [r, g, b] = rgb;
          return (
            <div
              key={`${r}-${g}-${b}-${i}`}
              className="collection-desktop-ambient-blob"
              style={{
                background: `radial-gradient(ellipse 55% 50% at ${anchor.x} ${anchor.y}, rgba(${r},${g},${b},0.48), transparent 70%)`,
              }}
            />
          );
        })}
        <div className="collection-desktop-ambient-veil" />
      </div>

      <div className="collection-desktop-shell">
        <section className="collection-desktop-hero">
          <div className="collection-desktop-hero-copy">
            <div className="collection-desktop-eyebrow">Collection</div>
            {editingList ? (
              <div className="collection-desktop-edit-fields">
                <label className="collection-desktop-field">
                  <span>Title</span>
                  <input
                    autoFocus
                    value={detail.name}
                    onChange={(e) => onRename(e.target.value)}
                  />
                </label>
                <label className="collection-desktop-field">
                  <span>Description (optional)</span>
                  <textarea
                    value={detail.description || ""}
                    onChange={(e) => onUpdateDescription(e.target.value)}
                    placeholder="A short description"
                    rows={3}
                  />
                </label>
                <div className="collection-desktop-edit-actions">
                  <button
                    type="button"
                    className="collection-desktop-sort-btn"
                    onClick={onOpenBackdropPicker}
                  >
                    <Icon name="image" size={14} color="#fff" />
                    Backdrop
                  </button>
                  <button
                    type="button"
                    className="collection-desktop-add-btn"
                    onClick={onSaveListChanges}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="collection-desktop-title">{detail.name || "Collection"}</h1>
                {detail.description ? (
                  <p className="collection-desktop-desc">{detail.description}</p>
                ) : null}
                <div className="collection-desktop-count">{countLabel}</div>
              </>
            )}
          </div>

          <div className="collection-desktop-hero-art">
            <CollectionBoxSet shows={detail.covers} bare width={32} />
          </div>

          <div className="collection-desktop-hero-tools">
            <div className="collection-desktop-more-wrap">
              <button
                type="button"
                className="collection-desktop-more-btn"
                aria-label="More"
                aria-expanded={moreOpen}
                onClick={() => {
                  setSortOpen(false);
                  setMoreOpen((v) => !v);
                }}
              >
                <Icon name="more" size={16} color="#fff" />
              </button>
              {moreOpen ? (
                <>
                  <div className="collection-desktop-menu-scrim" onClick={() => setMoreOpen(false)} />
                  <div className="collection-desktop-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreOpen(false);
                        onStartEdit();
                      }}
                    >
                      Edit list
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreOpen(false);
                        onStartReorder();
                      }}
                    >
                      User order
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="is-danger"
                      onClick={() => {
                        setMoreOpen(false);
                        onDeleteCollection();
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </>
              ) : null}
            </div>

            {!editingList ? (
              <div className="collection-desktop-hero-actions">
                {inReorder && reorderMode ? (
                  <button
                    type="button"
                    className="collection-desktop-done-btn"
                    onClick={() => {
                      onDoneReorder();
                      onSetShowsSortMode("userOrder");
                    }}
                  >
                    Done
                  </button>
                ) : (
                  <div className="collection-desktop-sort-wrap">
                    <button
                      type="button"
                      className="collection-desktop-sort-btn"
                      aria-expanded={sortOpen}
                      onClick={() => {
                        setMoreOpen(false);
                        setSortOpen((v) => !v);
                      }}
                    >
                      <Icon name="sort" size={13} color="rgba(255,255,255,0.75)" />
                      <span>Sort By</span>
                      <Icon name="chevronDown" size={12} color="rgba(255,255,255,0.55)" />
                    </button>
                    {sortOpen ? (
                      <>
                        <div className="collection-desktop-menu-scrim" onClick={() => setSortOpen(false)} />
                        <div className="collection-desktop-menu is-sort" role="listbox">
                          {SORT_OPTIONS.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              role="option"
                              aria-selected={showsSortMode === opt.id}
                              onClick={() => {
                                onSetShowsSortMode(opt.id);
                                if (opt.id === "userOrder") onStartReorder?.();
                                else onDoneReorder?.();
                                setSortOpen(false);
                              }}
                            >
                              <span style={{ color: showsSortMode === opt.id ? accent : "#fff" }}>
                                {opt.label}
                              </span>
                              {showsSortMode === opt.id ? (
                                <Icon name="check" size={13} color={accent} />
                              ) : null}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
                <button
                  type="button"
                  className="collection-desktop-add-btn"
                  onClick={onOpenAdd}
                >
                  <Icon name="plus" size={15} color="#0a0a0a" strokeWidth={2.4} />
                  Add
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <div className={`collection-desktop-grid${inReorder ? " is-reorder" : ""}`}>
          {displayed.map((s) => {
            const isMovie = s.mediaType === "movie";
            const key = mediaKey(s);
            return (
              <div
                key={key}
                className={`collection-desktop-tile${dragKey === key ? " is-dragging" : ""}`}
                draggable={inReorder}
                onDragStart={() => onDragStart?.(key)}
                onDragOver={(e) => inReorder && e.preventDefault()}
                onDrop={() => onDrop?.(key)}
              >
                <PosterCard
                  show={s}
                  width="100%"
                  shrink={false}
                  titlePlacement="below"
                  href={!inReorder && !editingList ? hrefForMedia(s) : undefined}
                  border={inReorder ? `1.5px dashed ${t.glassBorder}` : undefined}
                  favorite={
                    !inReorder && !editingList
                      ? isMovie
                        ? isMovieFavorite(s.id)
                        : isFavorite(s.id)
                      : false
                  }
                  onToggleFavorite={() =>
                    isMovie
                      ? onToggleMovieFavorite?.(s.id)
                      : onToggleFavorite?.(s.id)
                  }
                  onLongPress={
                    !inReorder && !editingList
                      ? (show, rect) =>
                          onLongPress?.({
                            show: { ...show, mediaType: s.mediaType },
                            rect,
                          })
                      : undefined
                  }
                  pressScale={false}
                  tmdbSize="w342"
                  sizes="(min-width: 900px) 160px, 28vw"
                  badge={
                    inReorder ? (
                      <div className="collection-desktop-reorder-handle" aria-hidden>
                        <Icon name="reorder" size={13} color="#fff" />
                      </div>
                    ) : editingList ? (
                      <button
                        type="button"
                        className="collection-desktop-remove"
                        aria-label="Remove from collection"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onRemoveFromCollection(s);
                        }}
                      >
                        <Icon name="x" size={12} color="#141418" />
                      </button>
                    ) : null
                  }
                />
              </div>
            );
          })}
        </div>

        {itemCount === 0 ? (
          <div className="collection-desktop-empty">
            No titles in this collection yet. Use Add to start building it.
          </div>
        ) : null}
      </div>

      {backdropPickerOpen ? (
        <div
          className="collection-desktop-overlay-scrim"
          onClick={onCloseBackdropPicker}
          role="presentation"
        >
          <div
            className="collection-desktop-backdrop-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Change backdrop"
          >
            <div className="collection-desktop-backdrop-head">
              <h2>Change Backdrop</h2>
              <button
                type="button"
                className="collection-desktop-icon-btn is-compact"
                onClick={onCloseBackdropPicker}
                aria-label="Close"
              >
                <Icon name="x" size={14} color="#fff" />
              </button>
            </div>
            <p>Use the poster fan, or upload your own image.</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onImageUpload}
              hidden
            />
            <div className="collection-desktop-backdrop-options">
              <button
                type="button"
                className={`collection-desktop-backdrop-auto${!detail.customImage ? " is-active" : ""}`}
                onClick={() => {
                  onUpdateCoverStyle("boxset");
                  onCloseBackdropPicker();
                }}
              >
                <div className="collection-desktop-backdrop-auto-preview">
                  <CollectionBoxSet shows={detail.covers} compact width={42} />
                </div>
                <span className="collection-desktop-backdrop-auto-label">Auto</span>
              </button>
              <button
                type="button"
                className={`collection-desktop-backdrop-upload-card${detail.customImage ? " is-active" : ""}`}
                onClick={() => fileInputRef?.current?.click()}
              >
                {detail.customImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local data URL / uploaded image
                  <img src={detail.customImage} alt="" className="collection-desktop-backdrop-upload-preview" />
                ) : (
                  <span className="collection-desktop-backdrop-upload-empty">
                    <Icon name="image" size={20} color={accent} />
                    Upload photo
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addShowOpen ? (
        <div className="collection-desktop-add-panel" role="dialog" aria-label={`Add to ${detail.name}`}>
          <div className="collection-desktop-add-head">
            <button type="button" className="collection-desktop-icon-btn" onClick={onCloseAdd} aria-label="Close">
              <Icon name="x" size={16} color="#fff" />
            </button>
            <h2>Add to {detail.name}</h2>
            <span className="collection-desktop-add-spacer" />
          </div>
          <div className="collection-desktop-add-search">
            <Icon name="search" size={16} color="rgba(255,255,255,0.45)" />
            <input
              value={showQuery}
              onChange={(e) => onSetShowQuery(e.target.value)}
              placeholder="Search for a series"
              autoFocus
            />
          </div>
          <div className="collection-desktop-add-label">
            {showQuery.trim() ? "Results" : "Popular titles"}
          </div>
          <div className="collection-desktop-add-list">
            {catalog.map((s) => {
              const already = detail.covers.some((c) => c.id === s.id);
              const isSelected = showSelected.has(s.id) || already;
              const title = resolveTitle(s, readableLanguages) || s.title;
              return (
                <div key={s.id} className="collection-desktop-add-row">
                  <div className="collection-desktop-add-poster">
                    <PosterArt
                      posterPath={s.posterPath}
                      base={s.base}
                      glow={s.glow}
                      alt={title}
                    />
                  </div>
                  <div className="collection-desktop-add-meta">
                    <div className="collection-desktop-add-title">{title}</div>
                    <div className="collection-desktop-add-sub">
                      {s.year} · {s.type}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`collection-desktop-add-toggle${isSelected ? " is-on" : ""}`}
                    disabled={already}
                    onClick={() => !already && onToggleShowSelect(s)}
                    aria-label={isSelected ? "Selected" : "Add"}
                  >
                    <Icon
                      name={isSelected ? "check" : "plus"}
                      size={16}
                      color={isSelected ? "#0a0a0a" : "rgba(255,255,255,0.85)"}
                      strokeWidth={isSelected ? 2.4 : 2}
                    />
                  </button>
                </div>
              );
            })}
            {catalog.length === 0 ? (
              <p className="collection-desktop-empty-hint">
                {showQuery.trim() ? "No results." : "Loading popular titles…"}
              </p>
            ) : null}
          </div>
          {showSelected.size > 0 ? (
            <div className="collection-desktop-add-footer">
              <button type="button" className="collection-desktop-add-commit" onClick={onCommitAdd}>
                Add {showSelected.size} Show{showSelected.size === 1 ? "" : "s"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
