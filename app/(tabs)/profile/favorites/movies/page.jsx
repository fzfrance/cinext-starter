"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import GlassCircle from "@/components/ui/GlassCircle";
import PosterCard from "@/components/ui/PosterCard";
import MoviePosterQuickStatusMenu from "@/components/ui/MoviePosterQuickStatusMenu";
import PosterGrid from "@/components/ui/PosterGrid";
import { useAuth } from "@/lib/auth-context";
import { useMovieFavorites } from "@/lib/movie-favorites-context";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

// Fork of app/(tabs)/profile/favorites/page.jsx, not a parameterized
// version of it — same reasoning as every other movie/show fork this
// pass (MovieRatingScreen, MoviePosterQuickStatusMenu): useMovieFavorites()
// instead of useFavorites(), /api/movies/batch instead of /api/shows/batch,
// /movie/${id} instead of /show/${id}, MoviePosterQuickStatusMenu instead
// of the show-only PosterQuickStatusMenu. Sort/reorder logic (sortItems)
// is media-agnostic and copied verbatim.

const t = themes.dark;
const accent = DEFAULT_ACCENT;

const sortOptions = [
  { id: "firstAdded", label: "First Added" },
  { id: "lastAdded", label: "Last Added" },
  { id: "az", label: "A–Z" },
  { id: "userOrder", label: "User Order" },
];

function sortItems(items, mode, nameKey) {
  const arr = [...items];
  if (mode === "firstAdded") return arr.sort((a, b) => a.addedAt - b.addedAt);
  if (mode === "lastAdded") return arr.sort((a, b) => b.addedAt - a.addedAt);
  if (mode === "az") return arr.sort((a, b) => a[nameKey].localeCompare(b[nameKey]));
  return arr; // userOrder — keep current array order as manually arranged
}

export default function Page() {
  const router = useRouter();
  const { user } = useAuth();
  const { favoriteEntries, toggleFavorite } = useMovieFavorites();
  const readableLanguages = useReadableLanguages();
  const [favorites, setFavorites] = useState([]);

  // Reactively syncs this screen's displayed (title/poster/genre-enriched)
  // list to the shared movie-favorites context — the actual source of
  // truth — instead of independently fetching user_movies itself. Same
  // two-pass sync as the show Favorites page (see that file's own
  // comment for the full reasoning).
  useEffect(() => {
    if (!user) return;
    const wantedIds = new Set(favoriteEntries.map((e) => e.id));
    const stillWanted = favorites.filter((f) => wantedIds.has(f.id));
    if (stillWanted.length !== favorites.length) { setFavorites(stillWanted); return; }

    const currentIds = new Set(favorites.map((f) => f.id));
    const addedEntries = favoriteEntries.filter((e) => !currentIds.has(e.id));
    if (addedEntries.length === 0) return;

    let cancelled = false;
    fetch(`/api/movies/batch?ids=${addedEntries.map((e) => e.id).join(",")}`)
      .then((res) => res.json())
      .then(({ results }) => {
        if (cancelled) return;
        const addedAtById = Object.fromEntries(addedEntries.map((e) => [e.id, e.addedAt]));
        setFavorites((prev) => [...prev, ...results.map((movie) => ({ ...movie, addedAt: addedAtById[movie.id] }))]);
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [user, favoriteEntries, favorites]);

  const unheart = (id) => {
    if (!user) { router.push("/login"); return; }
    // No local setFavorites here — the sync effect above drops it once
    // toggleFavorite's optimistic update propagates through the shared
    // context, the same path any other screen's unfavorite takes.
    toggleFavorite(id, "ProfileFavoritesMovies:unheart");
  };

  const [sortMode, setSortMode] = useState("firstAdded");
  const [activeMenu, setActiveMenu] = useState(null); // 'menu' | 'sort' | null
  const toggleMenu = (key) => setActiveMenu((prev) => (prev === key ? null : prev ? null : key));
  const [reorderMode, setReorderMode] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [longPress, setLongPress] = useState(null);
  const handleDrop = (targetId) => {
    if (dragId == null || dragId === targetId) return;
    setFavorites((prev) => {
      const arr = [...prev];
      const fromIdx = arr.findIndex((s) => s.id === dragId);
      const toIdx = arr.findIndex((s) => s.id === targetId);
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      return arr;
    });
    setDragId(null);
  };
  // Resolved at render time (not baked in when `favorites` is fetched) so
  // it's always current even if Readable Languages loads a beat after
  // this list does — and so the A–Z sort below sorts by what's actually
  // displayed, not always the English title.
  const resolvedFavorites = favorites.map((f) => ({ ...f, title: resolveTitle(f, readableLanguages) }));
  const displayedFavorites = reorderMode ? resolvedFavorites : sortItems(resolvedFavorites, sortMode, "title");

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
          <div style={{ fontSize: 32.2, fontWeight: 800, color: "#fff" }}>Favorite Movies</div>
          <div style={{ fontSize: 12.5, color: t.textDim, marginTop: 3 }}>{favorites.length} movies</div>
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
            className="active:scale-95 transition"
            draggable={reorderMode}
            onDragStart={() => setDragId(s.id)}
            onDragOver={(e) => reorderMode && e.preventDefault()}
            onDrop={() => handleDrop(s.id)}
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
            style={{ width: "100%", opacity: reorderMode && dragId === s.id ? 0.4 : 1 }}
          >
            <PosterCard
              show={s}
              width="100%"
              shrink={false}
              titlePlacement="overlay"
              // Same guard as Collections detail: no navigation while
              // reordering, so a drag can't also open the movie page.
              href={!reorderMode ? `/movie/${s.id}` : undefined}
              border={reorderMode ? `1.5px dashed ${t.glassBorder}` : undefined}
              favorite={!reorderMode}
              onToggleFavorite={() => unheart(s.id)}
              // Disabled during reorder — a native HTML5 drag already
              // owns the press gesture on this card then (see draggable
              // above), and a long-press timer racing against a drag
              // start is exactly the conflict this guard avoids.
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

      {/* No onStatusChange refresh needed — this grid is purely "movies
          you've favorited," independent of status, so a status change
          here never changes what belongs in this list. removeLabel/onRemove
          override the shared menu's default "Remove" (which normally drops
          the movie from the library entirely) — here it should just
          unfavorite, same action and wording as the heart badge/unheart
          above, so the grid drops it via the same reactive sync instead of
          a separate removeUserMovie path. */}
      <MoviePosterQuickStatusMenu
        show={longPress?.show ?? null}
        anchorRect={longPress?.rect ?? null}
        userId={user?.id}
        source="ProfileFavoritesMovies:posterLongPress"
        onClose={() => setLongPress(null)}
        removeLabel="Remove from Favorite"
        onRemove={(movieId) => unheart(movieId)}
      />
    </>
  );
}
