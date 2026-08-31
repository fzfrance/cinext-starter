"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import GlassCircle from "@/components/ui/GlassCircle";
import PosterArt from "@/components/ui/PosterArt";
import PosterCard from "@/components/ui/PosterCard";
import PosterQuickStatusMenu from "@/components/ui/PosterQuickStatusMenu";
import MoviePosterQuickStatusMenu from "@/components/ui/MoviePosterQuickStatusMenu";
import PosterGrid from "@/components/ui/PosterGrid";
import { useAuth } from "@/lib/auth-context";
import { useFavorites } from "@/lib/favorites-context";
import { useMovieFavorites } from "@/lib/movie-favorites-context";
import { useNavVisibility } from "@/lib/nav-visibility-context";
import {
  getCollection,
  renameCollection as renameCollectionRow,
  updateCollectionDescription,
  updateCollectionCoverStyle,
  deleteCollection,
  addShowToCollection,
  removeShowFromCollection as removeShowFromCollectionRow,
  removeMovieFromCollection as removeMovieFromCollectionRow,
} from "@/lib/collections";
import { hrefForMedia, mediaKey } from "@/lib/media";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";
import { CollectionBackdrop, backdropThemes, sortOptions, sortItems } from "../shared";
import CollectionBoxSet from "@/components/CollectionBoxSet";

const t = themes.dark;
const accent = DEFAULT_ACCENT;
const itemSortOptions = [...sortOptions, { id: "userOrder", label: "User Order" }];

const initialDetail = {
  id: null,
  name: "",
  description: "",
  backdropTheme: null,
  customImage: null,
  coverStyle: null,
  covers: [],
};

export default function Page({ params }) {
  const router = useRouter();
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { isFavorite: isMovieFavorite, toggleFavorite: toggleMovieFavorite } = useMovieFavorites();
  const readableLanguages = useReadableLanguages();
  const [detail, setDetail] = useState(initialDetail);
  const [activeMenu, setActiveMenu] = useState(null); // 'detailMenu' | 'showsSort' | null
  const toggleMenu = (key) => setActiveMenu((prev) => (prev === key ? null : prev ? null : key));
  const [editingList, setEditingList] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [showsSortMode, setShowsSortMode] = useState("firstAdded");
  const [dragKey, setDragKey] = useState(null);
  const [backdropPickerOpen, setBackdropPickerOpen] = useState(false);
  const [longPress, setLongPress] = useState(null);
  const fileInputRef = useRef(null);
  const [catalog, setCatalog] = useState([]);
  const [addShowOpen, setAddShowOpen] = useState(false);
  // Hidden for this whole page's mounted lifetime, not just while the
  // add-show overlay is open — a single collection's own detail view
  // (grid + floating add/save buttons) doesn't need the global tab bar
  // either, and it was the same zIndex:100-over-zIndex:40/60 overlap
  // problem here as it was for the add-show search screen.
  const [, setNavHidden] = useNavVisibility();
  useEffect(() => {
    setNavHidden(true);
    return () => setNavHidden(false);
  }, [setNavHidden]);

  // collections + collection_shows + collection_movies, joined against
  // TMDB via the two batch routes (this page is client-only, like every
  // screen that reads auth). Merged into one mixed covers array, each
  // item tagged mediaType so downstream rendering (favorite wiring,
  // long-press menu, href, remove) can branch per item — this is the one
  // screen in the app that genuinely renders both media types mixed
  // together in an editable grid, so per-item branching here is
  // unavoidable (same reasoning already used in LibraryClient.jsx/
  // ExploreClient.jsx for their own mixed grids).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getCollection(user.id, params.id).then(async (row) => {
      // replace, not push — this collection genuinely doesn't exist
      // (deleted, or a stale/bad id), so its own history entry shouldn't
      // stick around as something "back" could ever land on again.
      if (!row) { if (!cancelled) router.replace("/profile/collections"); return; }
      if (row.showIds.length === 0 && row.movieIds.length === 0) {
        if (!cancelled) setDetail({ id: row.id, name: row.name, description: row.description ?? "", backdropTheme: null, customImage: null, coverStyle: row.coverStyle, covers: [] });
        return;
      }
      const [showResults, movieResults] = await Promise.all([
        row.showIds.length > 0 ? fetch(`/api/shows/batch?ids=${row.showIds.join(",")}`).then((r) => r.json()).then((d) => d.results) : Promise.resolve([]),
        row.movieIds.length > 0 ? fetch(`/api/movies/batch?ids=${row.movieIds.join(",")}`).then((r) => r.json()).then((d) => d.results).catch((err) => { console.error(err); return []; }) : Promise.resolve([]),
      ]);
      if (cancelled) return;
      const covers = [
        ...showResults.map((s) => ({ ...s, mediaType: "tv", addedAt: Date.now() })),
        ...movieResults.map((m) => ({ ...m, mediaType: "movie", addedAt: Date.now() })),
      ];
      setDetail({ id: row.id, name: row.name, description: row.description ?? "", backdropTheme: null, customImage: null, coverStyle: row.coverStyle, covers });
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [user, params.id, router]);

  // Local-only while editing — persisted in one shot by saveListChanges
  // when "Save Changes" is tapped, not on every keystroke.
  const renameCollection = (name) => setDetail((prev) => ({ ...prev, name }));
  const updateDescription = (description) => setDetail((prev) => ({ ...prev, description }));
  const saveListChanges = () => {
    setEditingList(false);
    if (!user || !detail.id) return;
    renameCollectionRow(detail.id, detail.name).catch(console.error);
    updateCollectionDescription(detail.id, detail.description).catch(console.error);
  };
  // backdropTheme/customImage have no column on `collections` yet — these
  // stay local/cosmetic only, same as episode ratings' mood/text on
  // episode_watches (see lib/episodeWatches.js), and won't survive reload.
  // coverStyle is different: it has a real column (cover_style), so picking
  // it — or picking any of these other options, which must also clear a
  // previously-persisted "boxset" back to null — writes through immediately.
  const updateBackdropTheme = (theme) => {
    setDetail((prev) => ({ ...prev, backdropTheme: theme, customImage: null, coverStyle: null }));
    if (user && detail.id) updateCollectionCoverStyle(detail.id, null).catch(console.error);
  };
  const updateCustomImage = (image) => {
    setDetail((prev) => ({ ...prev, customImage: image, backdropTheme: null, coverStyle: null }));
    if (user && detail.id) updateCollectionCoverStyle(detail.id, null).catch(console.error);
  };
  const updateCoverStyle = (style) => {
    setDetail((prev) => ({ ...prev, coverStyle: style, backdropTheme: null, customImage: null }));
    if (user && detail.id) updateCollectionCoverStyle(detail.id, style).catch(console.error);
  };
  // Branches on the item's own mediaType — same raw-id-collision reasoning
  // as everywhere else mixed movie/show lists exist in this app (a movie
  // id and a TV show id aren't drawn from the same space).
  const removeFromCollection = (item) => {
    setDetail((prev) => ({ ...prev, covers: prev.covers.filter((s) => mediaKey(s) !== mediaKey(item)) }));
    if (!user || !detail.id) return;
    if (item.mediaType === "movie") removeMovieFromCollectionRow(detail.id, item.id).catch(console.error);
    else removeShowFromCollectionRow(detail.id, item.id).catch(console.error);
  };
  // Awaits the delete before navigating (was fire-and-forget) — pushing
  // away immediately raced the list page's own fetch, which could land
  // before the delete actually committed and briefly show either the
  // stale list (still containing this collection) or an empty one while
  // it reloaded. replace, not push, for the same reason as the missing-
  // collection redirect above: this collection's own detail-page history
  // entry shouldn't be something the back button can still land back on
  // once it's gone — that's what made back "stop working" after a delete.
  const removeCollection = async () => {
    if (detail.id) {
      try { await deleteCollection(detail.id); } catch (err) { console.error(err); }
    }
    router.replace("/profile/collections");
  };
  // Keyed on mediaKey, not raw id — a movie id and a TV show id aren't
  // drawn from the same space, so a plain `s.id` match could reorder the
  // wrong item in a mixed collection.
  const handleDrop = (targetKey) => {
    if (dragKey == null || dragKey === targetKey) return;
    setDetail((prev) => {
      const arr = [...prev.covers];
      const fromIdx = arr.findIndex((s) => mediaKey(s) === dragKey);
      const toIdx = arr.findIndex((s) => mediaKey(s) === targetKey);
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      return { ...prev, covers: arr };
    });
    setDragKey(null);
  };
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { updateCustomImage(reader.result); setBackdropPickerOpen(false); };
    reader.readAsDataURL(file);
  };

  const [showQuery, setShowQuery] = useState("");
  // Map<id, show> — not a Set<id>. Selecting a show while searching "A",
  // then searching "B" without committing, used to silently drop "A"
  // from the actual add: catalog (the search RESULTS list) gets replaced
  // wholesale on every new query, and commitAddShows used to re-derive
  // the shows to add by filtering catalog for selected ids — so a show
  // selected under a now-replaced search was still counted in the "Add N
  // Shows" button's own count (showSelected itself did persist), but
  // vanished from the actual write since it was no longer in catalog to
  // filter from. Storing the real show object at selection time (not
  // just its id) means every selection survives however many more
  // searches happen before the user actually taps Add.
  const [showSelected, setShowSelected] = useState(new Map());
  const toggleShowSelect = (show) => setShowSelected((prev) => {
    const next = new Map(prev);
    next.has(show.id) ? next.delete(show.id) : next.set(show.id, show);
    return next;
  });
  const closeAddShow = () => { setAddShowOpen(false); setShowQuery(""); setShowSelected(new Map()); };

  // Debounced live TMDB search, same pattern as Favorites' "Add to
  // Favorites" (app/(tabs)/profile/favorites/page.jsx).
  useEffect(() => {
    const trimmed = showQuery.trim();
    if (trimmed === "") { setCatalog([]); return; }
    let cancelled = false;
    const handle = setTimeout(() => {
      fetch(`/api/search/shows?q=${encodeURIComponent(trimmed)}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          setCatalog((data.results ?? []).map((show) => ({
            id: show.id,
            // This overlay is TV-only (see /api/search/shows' own
            // comment) — set explicitly, not left for the covers grid's
            // mediaKey()/removeFromCollection to fall into the right
            // branch by accident of `undefined !== "movie"` happening to
            // take the show path anyway.
            mediaType: "tv",
            title: show.name,
            originalTitle: show.original_name ?? null,
            originalLanguage: show.original_language ?? null,
            year: show.first_air_date ? show.first_air_date.slice(0, 4) : "TBA",
            type: "TV Series",
            posterPath: show.poster_path,
          })));
        })
        .catch((err) => { if (!cancelled) { console.error("Search failed:", err); setCatalog([]); } });
    }, 350);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [showQuery]);

  const commitAddShows = () => {
    if (!user || !detail.id) { router.push("/login"); return; }
    const toAdd = [...showSelected.values()].filter((s) => !detail.covers.some((c) => c.id === s.id)).map((s) => ({ ...s, addedAt: Date.now() }));
    setDetail((prev) => ({ ...prev, covers: [...prev.covers, ...toAdd] }));
    closeAddShow();
    toAdd.forEach((s) => addShowToCollection(detail.id, s.id).catch(console.error));
  };

  return (
    <>
      <div className="relative w-full" style={{ height: 220 }}>
        {detail.coverStyle === "boxset" ? (
          <CollectionBoxSet shows={detail.covers} />
        ) : (
          <CollectionBackdrop covers={detail.covers} theme={detail.backdropTheme} image={detail.customImage} />
        )}
        <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, #0A0A0C 6%, transparent 60%)" }} />
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          {/* router.back(), not a hardcoded push to the collections list —
              this can be opened directly from Profile's own collection
              card now, not only via the list, so back must return to
              wherever the user actually came from (matching the list
              page's own back button, which already does this). */}
          <GlassCircle onClick={() => router.back()} t={t}><Icon name="back" size={16} color={t.text} /></GlassCircle>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.65)", textTransform: "lowercase" }}>collections</span>
          <div className="relative">
            <GlassCircle onClick={() => toggleMenu("detailMenu")} t={t}><Icon name="more" size={16} color={t.text} /></GlassCircle>
            {activeMenu === "detailMenu" && (
              <div className="absolute z-30 rounded-2xl overflow-hidden" style={{ top: "calc(100% + 8px)", right: 0, width: 170, background: "#221c17", border: `1px solid ${t.glassBorder}` }}>
                <button onClick={() => { setActiveMenu(null); setEditingList(true); }} className="w-full flex items-center gap-2.5 active:opacity-70 transition" style={{ padding: "11px 13px" }}>
                  <Icon name="edit" size={13} color="#fff" /><span style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>Edit the List</span>
                </button>
                <button onClick={() => { setActiveMenu(null); setReorderMode(true); }} className="w-full flex items-center gap-2.5 active:opacity-70 transition" style={{ padding: "11px 13px" }}>
                  <Icon name="reorder" size={13} color="#fff" /><span style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>Reorder Items</span>
                </button>
                <button onClick={() => { setActiveMenu(null); removeCollection(); }} className="w-full flex items-center gap-2.5 active:opacity-70 transition" style={{ padding: "11px 13px" }}>
                  <Icon name="trash" size={13} color="#e0567a" /><span style={{ fontSize: 13, fontWeight: 500, color: "#e0567a" }}>Delete</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {editingList && (
          <button onClick={() => setBackdropPickerOpen(true)} className="absolute flex items-center gap-2 rounded-full active:scale-95 transition" style={{ bottom: 14, right: 14, padding: "9px 15px", background: "rgba(0,0,0,0.55)", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(16px)" }}>
            <Icon name="image" size={14} color="#fff" /><span style={{ fontSize: 12.5, fontWeight: 600, color: "#fff" }}>Change Backdrop</span>
          </button>
        )}
      </div>

      <div className="px-6" style={{ marginTop: 18 }}>
        {editingList ? (
          <>
            <div style={{ fontSize: 13, color: t.textDim, marginBottom: 8 }}>Title</div>
            <input autoFocus value={detail.name} onChange={(e) => renameCollection(e.target.value)} className="w-full rounded-2xl outline-none" style={{ padding: "14px 16px", background: t.cardFill, border: `1px solid ${t.cardBorder}`, fontSize: 17, fontWeight: 700, color: "#fff" }} />
            <div style={{ fontSize: 13, color: t.textDim, margin: "16px 0 8px" }}>Description (optional)</div>
            <input value={detail.description || ""} onChange={(e) => updateDescription(e.target.value)} placeholder="A short description" className="w-full rounded-2xl outline-none" style={{ padding: "13px 16px", background: t.cardFill, border: `1px solid ${t.cardBorder}`, fontSize: 14, color: "#fff" }} />
          </>
        ) : (
          <>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#fff" }}>{detail.name}</div>
            {detail.description && <div style={{ fontSize: 13.5, color: t.textDim, marginTop: 6 }}>{detail.description}</div>}
          </>
        )}
      </div>

      <div className="px-6" style={{ marginTop: 22 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: t.textDim }}>{detail.covers.length} shows</span>
          {reorderMode ? (
            <button onClick={() => { setReorderMode(false); setShowsSortMode("userOrder"); }} style={{ fontSize: 13, fontWeight: 600, color: accent, padding: "4px 2px" }}>Done</button>
          ) : (
            <div className="relative">
              <button onClick={() => toggleMenu("showsSort")} className="flex items-center gap-1 rounded-full active:scale-95 transition" style={{ padding: "6px 10px", background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
                <Icon name="sort" size={11} color={t.textDim} />
                <span style={{ fontSize: 11, fontWeight: 500, color: "#fff" }}>Sort By</span>
                <Icon name="chevronDown" size={10} color={t.textDim} />
              </button>
              {activeMenu === "showsSort" && (
                <div className="absolute z-30 rounded-2xl overflow-hidden" style={{ top: "calc(100% + 8px)", right: 0, width: 150, background: "#221c17", border: `1px solid ${t.glassBorder}` }}>
                  {itemSortOptions.map((s) => (
                    <button key={s.id} onClick={() => { setShowsSortMode(s.id); setActiveMenu(null); }} className="w-full flex items-center justify-between active:opacity-70 transition" style={{ padding: "10px 13px" }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: showsSortMode === s.id ? accent : "#fff" }}>{s.label}</span>
                      {showsSortMode === s.id && <Icon name="check" size={13} color={accent} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <PosterGrid>
          {(() => {
            // Resolved at render time, same reasoning as Favorites: always
            // current regardless of load order, and the A–Z sort compares
            // what's actually displayed.
            const resolvedCovers = detail.covers.map((c) => ({ ...c, title: resolveTitle(c, readableLanguages) }));
            return reorderMode ? resolvedCovers : sortItems(resolvedCovers, showsSortMode, "title");
          })().map((s) => {
            const isMovie = s.mediaType === "movie";
            const key = mediaKey(s);
            return (
              <div
                key={key}
                className="active:scale-95 transition"
                draggable={reorderMode}
                onDragStart={() => setDragKey(key)}
                onDragOver={(e) => reorderMode && e.preventDefault()}
                onDrop={() => handleDrop(key)}
                style={{ opacity: reorderMode && dragKey === key ? 0.4 : 1 }}
              >
                <PosterCard
                  show={s}
                  width="100%"
                  shrink={false}
                  titlePlacement="overlay"
                  // Navigation is disabled while reordering/editing so a tap
                  // meant to drag or remove a poster can't also follow it to
                  // the show/movie page — only the plain browsing state
                  // links out.
                  href={!reorderMode && !editingList ? hrefForMedia(s) : undefined}
                  border={reorderMode ? `1.5px dashed ${t.glassBorder}` : undefined}
                  favorite={!reorderMode && !editingList ? (isMovie ? isMovieFavorite(s.id) : isFavorite(s.id)) : false}
                  onToggleFavorite={() => (isMovie ? toggleMovieFavorite(s.id, "CollectionDetail:favoriteBadge") : toggleFavorite(s.id, "CollectionDetail:favoriteBadge"))}
                  // Same guard as href above — disabled during reorder (a
                  // native drag already owns the press gesture) or editing
                  // (a tap there removes the item, not a status change).
                  onLongPress={!reorderMode && !editingList ? (show, rect) => setLongPress({ show: { ...show, mediaType: s.mediaType }, rect }) : undefined}
                  badge={
                    reorderMode ? (
                      <div className="flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(0,0,0,0.55)" }}>
                        <Icon name="reorder" size={13} color="#fff" />
                      </div>
                    ) : editingList ? (
                      <button onClick={() => removeFromCollection(s)} className="flex items-center justify-center active:scale-90 transition" style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.55)" }}>
                        <Icon name="x" size={12} color="#fff" />
                      </button>
                    ) : null
                  }
                />
              </div>
            );
          })}
        </PosterGrid>
        {detail.covers.length === 0 && <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: t.textDim }}>No titles in this collection yet.</div>}
      </div>

      {/* tap-outside catcher for open menus */}
      {(activeMenu === "detailMenu" || activeMenu === "showsSort") && <div className="fixed inset-0 z-20" onClick={() => setActiveMenu(null)} />}

      {/* save changes — fixed at the bottom of the screen, only while editing the list */}
      {editingList && (
        <div className="fixed z-20" style={{ bottom: 100, left: 22 }}>
          <button onClick={saveListChanges} className="active:scale-95 transition" style={{ padding: "10px 22px", borderRadius: 999, background: "rgba(20,16,12,0.9)", border: `1px solid ${accent}`, backdropFilter: "blur(20px)" }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: accent }}>Save Changes</span>
          </button>
        </div>
      )}

      {/* floating add button — always available, even before editing. Bottom cleared past the global tab bar. */}
      <button onClick={() => setAddShowOpen(true)} className="fixed rounded-full flex items-center justify-center active:scale-90 transition" style={{ bottom: 100, right: 22, width: 54, height: 54, background: accent, boxShadow: "0 10px 24px rgba(232,162,76,0.4)" }}>
        <Icon name="plus" size={22} color="#1a1108" strokeWidth={2.4} />
      </button>

      {/* backdrop theme picker */}
      {backdropPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-8" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setBackdropPickerOpen(false)}>
          <div className="w-full rounded-3xl" style={{ padding: 22, background: "#1a1512", border: `1px solid ${t.glassBorder}`, boxShadow: "0 30px 60px rgba(0,0,0,0.6)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Change Backdrop</div>
            <div style={{ fontSize: 12.5, color: t.textDim, marginBottom: 16 }}>Upload your own image, pick a mood, try Collector Box Set, or use the default blend.</div>

            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
            <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 rounded-2xl active:scale-95 transition" style={{ padding: 14, marginBottom: 14, background: t.cardFill, border: `1.5px dashed ${accent}` }}>
              <Icon name="image" size={16} color={accent} />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: accent }}>Upload Photo</span>
            </button>

            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => { updateBackdropTheme(null); setBackdropPickerOpen(false); }} className="relative rounded-2xl overflow-hidden active:scale-95 transition flex items-center justify-center" style={{ height: 64, background: t.cardFill, border: `1.5px solid ${!detail.backdropTheme && !detail.customImage && !detail.coverStyle ? accent : t.cardBorder}` }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: t.textDim }}>Auto</span>
              </button>
              {backdropThemes.map((bt) => (
                <button key={bt.id} onClick={() => { updateBackdropTheme(bt); setBackdropPickerOpen(false); }} className="relative rounded-2xl overflow-hidden active:scale-95 transition" style={{ height: 64, border: `1.5px solid ${detail.backdropTheme?.id === bt.id ? accent : "transparent"}` }}>
                  <CollectionBackdrop covers={[]} theme={bt} />
                </button>
              ))}
              {/* Collector Box Set — the only option here that's a real,
                  persisted cover style (see updateCoverStyle) rather than a
                  local-only preview; previewed with the collection's own
                  real covers so this tile is honestly WYSIWYG. */}
              <button onClick={() => { updateCoverStyle("boxset"); setBackdropPickerOpen(false); }} className="relative rounded-2xl overflow-hidden active:scale-95 transition" style={{ height: 64, border: `1.5px solid ${detail.coverStyle === "boxset" ? accent : "transparent"}` }}>
                <CollectionBoxSet shows={detail.covers} compact />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* add-show-to-collection search overlay */}
      {addShowOpen && (
        <div className="fixed inset-0 z-40" style={{ background: t.bg }}>
          <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "none", paddingBottom: showSelected.size > 0 ? 100 : 24 }}>
            <div className="flex items-center px-6" style={{ paddingTop: "env(safe-area-inset-top)", position: "relative" }}>
              <GlassCircle onClick={closeAddShow} t={t}><Icon name="back" size={16} color={t.text} /></GlassCircle>
              <div style={{ position: "absolute", left: 0, right: 0, textAlign: "center", fontSize: 19, fontWeight: 700, color: "#fff", pointerEvents: "none" }}>Add to {detail.name}</div>
            </div>
            <div className="px-6" style={{ marginTop: 20 }}>
              <div className="flex items-center gap-2.5 rounded-full" style={{ padding: "13px 18px", background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
                <Icon name="search" size={16} color={t.textDim} />
                <input value={showQuery} onChange={(e) => setShowQuery(e.target.value)} placeholder="Search for a series" className="flex-1 bg-transparent outline-none" style={{ fontSize: 14.5, color: "#fff" }} />
              </div>
            </div>
            <div className="px-6" style={{ marginTop: 22, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", color: t.textDim }}>POPULAR TITLES</div>
            <div className="px-6 flex flex-col" style={{ marginTop: 10 }}>
              {catalog.map((s, i) => {
                const already = detail.covers.some((c) => c.id === s.id);
                const isSelected = showSelected.has(s.id) || already;
                const title = resolveTitle(s, readableLanguages);
                return (
                  <div key={s.id} className="flex items-center gap-3" style={{ padding: "12px 0", borderTop: i > 0 ? `1px solid ${t.cardBorder}` : "none" }}>
                    <div className="relative flex-shrink-0 rounded-xl overflow-hidden" style={{ width: 56, height: 78 }}><PosterArt posterPath={s.posterPath} base={s.base} glow={s.glow} alt={title} /></div>
                    <div className="flex-1">
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{title}</div>
                      <div style={{ fontSize: 13, color: t.textDim, marginTop: 2 }}>{s.year}</div>
                      <div style={{ fontSize: 13, color: t.textDim, marginTop: 1 }}>{s.type}</div>
                    </div>
                    <button onClick={() => !already && toggleShowSelect(s)} disabled={already} className="flex-shrink-0 rounded-full flex items-center justify-center active:scale-90 transition" style={{ width: 34, height: 34, background: isSelected ? accent : t.cardFill, border: `1px solid ${t.cardBorder}` }}>
                      <Icon name={isSelected ? "check" : "plus"} size={16} color={isSelected ? "#1a1108" : "#fff"} />
                    </button>
                  </div>
                );
              })}
              {catalog.length === 0 && <div style={{ padding: "30px 0", textAlign: "center", fontSize: 13, color: t.textDim }}>No results.</div>}
            </div>
          </div>

          {showSelected.size > 0 && (
            <div className="absolute left-0 right-0 px-6" style={{ bottom: 24 }}>
              <button onClick={commitAddShows} className="w-full rounded-full active:scale-95 transition" style={{ padding: 15, background: accent, boxShadow: "0 10px 24px rgba(232,162,76,0.35)" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1108" }}>Add {showSelected.size} Show{showSelected.size === 1 ? "" : "s"}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* No onStatusChange refresh needed — collection membership is
          independent of status, so a status change here never changes
          what belongs in this collection's grid. Branches on the
          long-pressed item's own mediaType — a mixed collection can hold
          both, and each writes to a different table (user_shows vs
          user_movies). */}
      {longPress?.show?.mediaType === "movie" ? (
        <MoviePosterQuickStatusMenu
          show={longPress?.show ?? null}
          anchorRect={longPress?.rect ?? null}
          userId={user?.id}
          source="CollectionDetail:posterLongPress"
          onClose={() => setLongPress(null)}
        />
      ) : (
        <PosterQuickStatusMenu
          show={longPress?.show ?? null}
          anchorRect={longPress?.rect ?? null}
          userId={user?.id}
          source="CollectionDetail:posterLongPress"
          onClose={() => setLongPress(null)}
        />
      )}
    </>
  );
}
