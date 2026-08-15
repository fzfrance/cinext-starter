"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import GlassCircle from "@/components/ui/GlassCircle";
import PosterCard from "@/components/ui/PosterCard";
import PosterQuickStatusMenu from "@/components/ui/PosterQuickStatusMenu";
import PosterGrid from "@/components/ui/PosterGrid";
import { favoritesOnlyOptions } from "@/components/StatusMenu";
import { useAuth } from "@/lib/auth-context";
import { useFavorites } from "@/lib/favorites-context";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";
import {
  FAVORITE_SHOWS_ORDER_KEY, FAVORITE_SHOWS_SORT_KEY,
  loadFavoriteOrder, saveFavoriteOrder, loadFavoriteSort, saveFavoriteSort, sortFavorites,
} from "@/lib/favoritesOrder";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

const sortOptions = [
  { id: "firstAdded", label: "First Added" },
  { id: "lastAdded", label: "Last Added" },
  { id: "az", label: "A–Z" },
  { id: "userOrder", label: "User Order" },
];

export default function Page() {
  const router = useRouter();
  const { user } = useAuth();
  const { favoriteEntries, toggleFavorite } = useFavorites();
  const readableLanguages = useReadableLanguages();
  const [favorites, setFavorites] = useState([]);

  // Reactively syncs this screen's displayed (title/poster/genre-enriched)
  // list to the shared favorites-context — the actual source of truth —
  // instead of independently fetching user_shows itself. Drops any show
  // that's been unfavorited from anywhere (this screen or another one),
  // and fetches metadata only for ids that just became favorited and
  // aren't already displayed. This is the "invalidate/refetch" side of a
  // toggle: a favorite made on Explore/Collections/Home shows up here
  // without this screen doing anything special to notice it. Runs to a
  // fixed point in at most two passes (a removal pass, then an addition
  // pass) rather than looping — each pass either changes `favorites` and
  // lets the next run see the settled state, or finds nothing left to do.
  useEffect(() => {
    if (!user) return;
    const wantedIds = new Set(favoriteEntries.map((e) => e.id));
    const stillWanted = favorites.filter((f) => wantedIds.has(f.id));
    if (stillWanted.length !== favorites.length) { setFavorites(stillWanted); return; }

    const currentIds = new Set(favorites.map((f) => f.id));
    const addedEntries = favoriteEntries.filter((e) => !currentIds.has(e.id));
    if (addedEntries.length === 0) return;

    let cancelled = false;
    fetch(`/api/shows/batch?ids=${addedEntries.map((e) => e.id).join(",")}`)
      .then((res) => res.json())
      .then(({ results }) => {
        if (cancelled) return;
        const addedAtById = Object.fromEntries(addedEntries.map((e) => [e.id, e.addedAt]));
        setFavorites((prev) => [...prev, ...results.map((show) => ({ ...show, addedAt: addedAtById[show.id] }))]);
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [user, favoriteEntries, favorites]);

  const unheart = (id) => {
    if (!user) { router.push("/login"); return; }
    // No local setFavorites here — the sync effect above drops it once
    // toggleFavorite's optimistic update propagates through the shared
    // context, the same path any other screen's unfavorite takes.
    toggleFavorite(id, "ProfileFavorites:unheart");
  };

  const [sortMode, setSortModeState] = useState("firstAdded");
  const [order, setOrder] = useState([]);
  // Hydrate the persisted sort mode + hand-arranged order on mount — same
  // default-then-hydrate-via-effect pattern as Library's own view-mode
  // toggle (avoids touching localStorage during SSR). Both are also read
  // by Profile's own preview row (see lib/favoritesOrder.js), so a choice
  // made here shows up there too and survives a refresh either way.
  useEffect(() => {
    setSortModeState(loadFavoriteSort(FAVORITE_SHOWS_SORT_KEY));
    setOrder(loadFavoriteOrder(FAVORITE_SHOWS_ORDER_KEY));
  }, []);
  const setSortMode = (mode) => { setSortModeState(mode); saveFavoriteSort(FAVORITE_SHOWS_SORT_KEY, mode); };
  const [activeMenu, setActiveMenu] = useState(null); // 'menu' | 'sort' | null
  const toggleMenu = (key) => setActiveMenu((prev) => (prev === key ? null : prev ? null : key));
  const [reorderMode, setReorderMode] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragPos, setDragPos] = useState(null);
  const [longPress, setLongPress] = useState(null);
  const handleDrop = (targetId) => {
    if (dragId == null || dragId === targetId) return;
    setFavorites((prev) => {
      const arr = [...prev];
      const fromIdx = arr.findIndex((s) => s.id === dragId);
      const toIdx = arr.findIndex((s) => s.id === targetId);
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      // Persisted on every drop (not just on "Done") so the arrangement
      // is never lost to an accidental refresh/nav-away mid-reorder.
      setOrder(arr.map((s) => s.id));
      saveFavoriteOrder(FAVORITE_SHOWS_ORDER_KEY, arr.map((s) => s.id));
      return arr;
    });
    setDragId(null);
  };
  // Pointer-based drag (not the HTML5 draggable/dragstart/dragover/drop
  // API this used before) — the native Drag and Drop API is mouse-only,
  // no touch equivalent, so "Reorder Items" silently did nothing at all
  // on a touch device/PWA. Pointer events (down/move/up) fire uniformly
  // for mouse, touch, and pen, so this one implementation covers both.
  const itemNodesRef = useRef(new Map());
  const dragStartRef = useRef(null);
  const lastOverIdRef = useRef(null);
  const onItemPointerDown = (id, e) => {
    if (!reorderMode) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    lastOverIdRef.current = null;
    setDragId(id);
    setDragPos({ x: 0, y: 0 });
  };
  const onItemPointerMove = (e) => {
    if (dragId == null || !dragStartRef.current) return;
    setDragPos({ x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y });
    for (const [id, node] of itemNodesRef.current) {
      if (id === dragId || !node) continue;
      const r = node.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        if (lastOverIdRef.current !== id) {
          lastOverIdRef.current = id;
          handleDrop(id);
        }
        return;
      }
    }
    lastOverIdRef.current = null;
  };
  const onItemPointerEnd = (e) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragStartRef.current = null;
    lastOverIdRef.current = null;
    setDragId(null);
    setDragPos(null);
  };
  // Resolved at render time (not baked in when `favorites` is fetched) so
  // it's always current even if Readable Languages loads a beat after
  // this list does — and so the A–Z sort below sorts by what's actually
  // displayed, not always the English title.
  const resolvedFavorites = favorites.map((f) => ({ ...f, title: resolveTitle(f, readableLanguages) }));
  const displayedFavorites = reorderMode ? resolvedFavorites : sortFavorites(resolvedFavorites, sortMode, order);

  return (
    <>
      <div className="flex items-center justify-between px-6" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <GlassCircle onClick={() => router.back()} t={t}><Icon name="back" size={16} color={t.text} /></GlassCircle>
        {reorderMode ? (
          <button onClick={() => { setReorderMode(false); setSortMode("userOrder"); }} style={{ fontSize: 14.5, fontWeight: 600, color: accent, padding: "6px 4px" }}>Done</button>
        ) : (
          <div className="relative">
            <GlassCircle onClick={() => toggleMenu("menu")} t={t}><Icon name="more" size={16} color={t.text} /></GlassCircle>
            {activeMenu === "menu" && (
              <div className="absolute z-30 rounded-2xl overflow-hidden" style={{ top: "calc(100% + 8px)", right: 0, width: 170, background: "#221c17", border: `1px solid ${t.glassBorder}` }}>
                <button onClick={() => { setActiveMenu(null); setReorderMode(true); }} className="w-full flex items-center gap-2.5 active:opacity-70 transition" style={{ padding: "12px 14px" }}>
                  <Icon name="reorder" size={14} color="#fff" /><span style={{ fontSize: 13.5, fontWeight: 500, color: "#fff" }}>Reorder Items</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-6" style={{ marginTop: 16 }}>
        <div>
          <div style={{ fontSize: 32.2, fontWeight: 800, color: "#fff" }}>Favorite Shows</div>
          <div style={{ fontSize: 12.5, color: t.textDim, marginTop: 3 }}>{favorites.length} shows</div>
        </div>
        {!reorderMode && (
          <div className="relative">
            <button onClick={() => toggleMenu("sort")} className="flex items-center gap-1 rounded-full active:scale-95 transition" style={{ padding: "6px 10px", background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
              <Icon name="sort" size={11} color={t.textDim} />
              <span style={{ fontSize: 11, fontWeight: 500, color: "#fff" }}>Sort By</span>
              <Icon name="chevronDown" size={10} color={t.textDim} />
            </button>
            {activeMenu === "sort" && (
              <div className="absolute z-30 rounded-2xl overflow-hidden" style={{ top: "calc(100% + 8px)", right: 0, width: 150, background: "#221c17", border: `1px solid ${t.glassBorder}` }}>
                {sortOptions.map((s) => (
                  <button key={s.id} onClick={() => { setSortMode(s.id); setActiveMenu(null); }} className="w-full flex items-center justify-between active:opacity-70 transition" style={{ padding: "10px 13px" }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: sortMode === s.id ? accent : "#fff" }}>{s.label}</span>
                    {sortMode === s.id && <Icon name="check" size={13} color={accent} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {/* columns=3 + width="100%" — 3 fixed-width tracks regardless of how
          many favorites exist, so a lone favorite still renders at the
          normal per-column size instead of stretching to fill the whole
          width. */}
      <PosterGrid className="px-6" columns={3} style={{ marginTop: 18 }}>
        {displayedFavorites.map((s) => (
          <div
            key={s.id}
            ref={(node) => {
              if (node) itemNodesRef.current.set(s.id, node);
              else itemNodesRef.current.delete(s.id);
            }}
            className={reorderMode ? undefined : "active:scale-95 transition"}
            onPointerDown={reorderMode ? (e) => onItemPointerDown(s.id, e) : undefined}
            onPointerMove={reorderMode ? onItemPointerMove : undefined}
            onPointerUp={reorderMode ? onItemPointerEnd : undefined}
            onPointerCancel={reorderMode ? onItemPointerEnd : undefined}
            // Explicit width — this div (not PosterCard) is the actual
            // grid item here, and PosterGrid's justifyItems: "center"
            // means a grid item with no explicit width shrinks to fit its
            // content instead of stretching to the column's track width.
            // PosterCard's own width="100%" then has nothing definite to
            // resolve against, which collapses its aspect-ratio height to
            // 0 too — the exact "Image with fill and a height value of 0"
            // bug this caused. Giving this wrapper width: 100% restores a
            // definite width for PosterCard's percentage to resolve
            // against.
            style={{
              width: "100%",
              touchAction: reorderMode ? "none" : "auto",
              position: "relative",
              zIndex: dragId === s.id ? 10 : 1,
              opacity: reorderMode && dragId != null && dragId !== s.id ? 0.6 : 1,
              transform: dragId === s.id && dragPos ? `translate(${dragPos.x}px, ${dragPos.y}px) scale(1.08)` : undefined,
              transition: dragId === s.id ? "none" : "transform 0.15s, opacity 0.15s",
            }}
          >
            <PosterCard
              show={s}
              width="100%"
              shrink={false}
              titlePlacement="overlay"
              // Same guard as Collections detail: no navigation while
              // reordering, so a drag can't also open the show page.
              href={!reorderMode ? `/show/${s.id}` : undefined}
              border={reorderMode ? `1.5px dashed ${t.glassBorder}` : undefined}
              favorite={!reorderMode}
              onToggleFavorite={() => unheart(s.id)}
              // Disabled during reorder — the pointer-drag above already
              // owns the press gesture on this card then, and a
              // long-press timer racing against a drag start is exactly
              // the conflict this guard avoids.
              onLongPress={!reorderMode ? (show, rect) => setLongPress({ show, rect }) : undefined}
              badge={
                reorderMode ? (
                  <div className="flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(0,0,0,0.55)" }}>
                    <Icon name="reorder" size={13} color="#fff" />
                  </div>
                ) : null
              }
            />
          </div>
        ))}
      </PosterGrid>

      {/* tap-outside catcher for open menus */}
      {activeMenu && <div className="fixed inset-0 z-20" onClick={() => setActiveMenu(null)} />}

      {/* This is a favorites-only surface — status changes belong on the
          show's own detail page, not here — so the long-press menu is
          pared down to a single "Remove from Favorites" option
          (favoritesOnlyOptions), unified with the Movies favorites page.
          removeLabel/onRemove override the shared menu's default "Remove"
          (which normally drops the show from the library entirely) —
          here it should just unfavorite, same action and wording as the
          heart badge/unheart above, so the grid drops it via the same
          reactive sync instead of a separate removeUserShow path. */}
      <PosterQuickStatusMenu
        show={longPress?.show ?? null}
        anchorRect={longPress?.rect ?? null}
        userId={user?.id}
        source="ProfileFavorites:posterLongPress"
        onClose={() => setLongPress(null)}
        options={favoritesOnlyOptions}
        removeLabel="Remove from Favorites"
        onRemove={(showId) => unheart(showId)}
      />
    </>
  );
}
