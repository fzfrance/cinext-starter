"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "@/components/ui/Icon";
import GlassCircle from "@/components/ui/GlassCircle";
import PosterCard from "@/components/ui/PosterCard";
import PosterQuickStatusMenu from "@/components/ui/PosterQuickStatusMenu";
import PosterGrid from "@/components/ui/PosterGrid";
import { useAuth } from "@/lib/auth-context";
import { useFavorites } from "@/lib/favorites-context";
import { getUserShows } from "@/lib/userShows";
import { getShowWatchSummary } from "@/lib/episodeWatches";
import { resolveShowStatus } from "@/lib/statusResolver";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { themes, statusMeta, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// Same options/shape as Profile's own Favorites sort menu, minus "User
// Order" — that option only makes sense for a manually-reorderable list
// (Favorites has a real drag-reorder mode with a stored order), and this
// page has no such concept, just a computed/filtered view of the whole
// library. "Last Watched" is new here — lastWatchedAt already comes free
// on every show from getShowWatchSummary (fetched below for status
// resolution anyway), just not previously attached to the display object.
const sortOptions = [
  { id: "firstAdded", label: "First Added" },
  { id: "lastAdded", label: "Last Added" },
  { id: "az", label: "A–Z" },
  { id: "lastWatched", label: "Last Watched" },
];

function sortItems(items, mode, nameKey) {
  const arr = [...items];
  if (mode === "firstAdded") return arr.sort((a, b) => a.addedAt - b.addedAt);
  if (mode === "lastAdded") return arr.sort((a, b) => b.addedAt - a.addedAt);
  if (mode === "az") return arr.sort((a, b) => a[nameKey].localeCompare(b[nameKey]));
  // lastWatched — most recently watched first; never-watched shows (null)
  // sink to the bottom rather than sorting arbitrarily among themselves.
  if (mode === "lastWatched") return arr.sort((a, b) => (b.lastWatchedAt ?? -Infinity) - (a.lastWatchedAt ?? -Infinity));
  return arr;
}

export default function LibraryClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const readableLanguages = useReadableLanguages();
  const [libraryFilter, setLibraryFilter] = useState("all");
  const [library, setLibrary] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [genreMenuOpen, setGenreMenuOpen] = useState(false);
  const [genreFilter, setGenreFilter] = useState(null);
  const [sortMode, setSortMode] = useState("firstAdded");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [longPress, setLongPress] = useState(null);
  const [libraryRefreshToken, setLibraryRefreshToken] = useState(0);

  // Arriving from a Library genre aisle's ">" (e.g. Sci-Fi & Fantasy) tags
  // this page with ?genre=... — read reactively (not just on first mount)
  // so navigating here again with a DIFFERENT genre re-applies correctly
  // even if this page's component instance is reused across the
  // same-route navigation, and so arriving with no genre param at all
  // (e.g. from Profile's own Library entry point) explicitly clears any
  // previously-set filter instead of leaving it stuck.
  useEffect(() => {
    setGenreFilter(searchParams.get("genre") || null);
  }, [searchParams]);

  // Same fetch/resolve as Profile's own Library section — library-detail
  // (not the lighter /api/shows/batch) because the *displayed* status must
  // be resolved from real released/watched episode counts
  // (lib/statusResolver.js), so this full-page list can never disagree
  // with the same show's status on Show Detail or Profile itself.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const byShow = await getUserShows(user.id);
      const ids = Object.keys(byShow).map(Number);
      if (ids.length === 0) { if (!cancelled) setLibrary([]); return; }

      const resolvableIds = ids.filter((id) => byShow[id].status !== "paused" && byShow[id].status !== "drop");
      const summary = await getShowWatchSummary(user.id, resolvableIds);

      const res = await fetch("/api/shows/library-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shows: ids.map((id) => ({
            id,
            needsProgress: resolvableIds.includes(id),
            watched: summary[id]?.watchedKeys ?? [],
          })),
        }),
      });
      const { results } = await res.json();
      const byId = Object.fromEntries(results.map((r) => [r.id, r]));

      if (cancelled) return;
      setLibrary(ids.map((id) => {
        const result = byId[id];
        if (!result) return null;
        const resolvedStatus = resolveShowStatus({
          explicitStatus: byShow[id].status,
          watchedReleasedEpisodes: result.watchedReleasedEpisodes ?? 0,
          releasedEpisodes: result.releasedEpisodes ?? 0,
        });
        // title is the resolved (possibly original-language) display
        // title — englishTitle is kept separately so searching still
        // matches an international show by its English name (e.g. "Notes
        // From the Last Row") even when it's currently *displaying* under
        // its original-language title, same as Explore's own search does.
        return { id: result.id, title: resolveTitle(result, readableLanguages), englishTitle: result.title, posterPath: result.posterPath, genre: result.genre, ...byShow[id], status: resolvedStatus, lastWatchedAt: summary[id]?.lastWatchedAt ?? null };
      }).filter(Boolean));
    })().catch(console.error);
    return () => { cancelled = true; };
  }, [user, readableLanguages, libraryRefreshToken]);

  if (!user) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center text-center px-8" style={{ background: t.bg }}>
        <Icon name="user" size={30} color={t.textDim} />
        <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginTop: 14 }}>Sign in to see your library</div>
        <button onClick={() => router.push("/login")} className="rounded-full active:scale-95 transition" style={{ marginTop: 20, padding: "11px 24px", background: "#fff" }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1a1108" }}>Sign In</span>
        </button>
      </div>
    );
  }

  // Genres actually present in this library, not a fixed master list —
  // sorted alphabetically so the menu order doesn't shuffle as data loads.
  const genres = [...new Set(library.map((s) => s.genre).filter(Boolean))].sort();
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filteredLibrary = library.filter((s) => {
    if (libraryFilter !== "all" && s.status !== libraryFilter) return false;
    if (genreFilter && s.genre !== genreFilter) return false;
    if (trimmedQuery && !s.title.toLowerCase().includes(trimmedQuery) && !s.englishTitle?.toLowerCase().includes(trimmedQuery)) return false;
    return true;
  });
  const counts = Object.keys(statusMeta).reduce((acc, k) => ({ ...acc, [k]: library.filter((s) => s.status === k).length }), {});
  const sortedLibrary = sortItems(filteredLibrary, sortMode, "title");
  const pillOn = (active) => ({ background: active ? "#fff" : "rgba(0,0,0,0.3)", color: active ? "#111" : "#fff" });

  return (
    <>
      <div className="flex items-center justify-between px-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 21px)" }}>
        <GlassCircle onClick={() => router.back()} t={t}><Icon name="back" size={16} color={t.text} /></GlassCircle>
        <div className="flex items-center gap-2">
          {/* Genre filter — liquid-glass transparent dropdown, matching the
              other recently-built dropdown triggers (e.g. Library's own
              LibraryTabMenu) instead of the old warm opaque
              rgba(28,22,16,0.95) panel. */}
          <div className="relative">
            <button
              onClick={() => setGenreMenuOpen((v) => !v)}
              className="flex items-center justify-center rounded-full active:scale-90 transition"
              style={{ width: 38, height: 38, background: t.cardFill, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
            >
              <Icon name="filter" size={16} color={genreFilter ? accent : t.text} />
            </button>
            {genreMenuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setGenreMenuOpen(false)} />
                <div className="absolute z-30 rounded-2xl overflow-hidden" style={{ top: "calc(100% + 8px)", right: 0, width: 190, maxHeight: 280, overflowY: "auto", padding: 6, background: `linear-gradient(${accent}10, ${accent}05), rgba(20,18,16,0.42)`, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(26px)", WebkitBackdropFilter: "blur(26px)", boxShadow: "0 20px 44px rgba(0,0,0,0.55)", scrollbarWidth: "none" }}>
                  <button onClick={() => { setGenreFilter(null); setGenreMenuOpen(false); }} className="w-full flex items-center justify-between rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: !genreFilter ? accent : "#fff" }}>All Genres</span>
                    {!genreFilter && <Icon name="check" size={13} color={accent} />}
                  </button>
                  {genres.map((g) => (
                    <button key={g} onClick={() => { setGenreFilter(genreFilter === g ? null : g); setGenreMenuOpen(false); }} className="w-full flex items-center justify-between rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: genreFilter === g ? accent : "#fff" }}>{g}</span>
                      {genreFilter === g && <Icon name="check" size={13} color={accent} />}
                    </button>
                  ))}
                  {genres.length === 0 && <div style={{ padding: "10px", fontSize: 12, color: t.textDim, textAlign: "center" }}>No genres yet.</div>}
                </div>
              </>
            )}
          </div>
          {/* Search — matches Library's own inline search button style now
              (transparent glass, white icon) instead of a solid white
              circle with a black icon. */}
          <button onClick={() => setSearchOpen((v) => !v)} className="flex items-center justify-center rounded-full active:scale-90 transition" style={{ width: 38, height: 38, background: t.cardFill, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
            <Icon name={searchOpen ? "x" : "search"} size={16} color="#fff" />
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between px-6" style={{ marginTop: 16 }}>
        <div>
          <div style={{ fontSize: 32.2, fontWeight: 800, color: "#fff" }}>Shows</div>
          <div style={{ fontSize: 12.5, color: t.textDim, marginTop: 3 }}>{library.length} shows</div>
        </div>
        <div className="relative">
          <button onClick={() => setSortMenuOpen((v) => !v)} className="flex items-center gap-1 rounded-full active:scale-95 transition" style={{ padding: "6px 10px", background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
            <Icon name="sort" size={11} color={t.textDim} />
            <span style={{ fontSize: 11, fontWeight: 500, color: "#fff" }}>Sort By</span>
            <Icon name="chevronDown" size={10} color={t.textDim} />
          </button>
          {sortMenuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setSortMenuOpen(false)} />
              <div className="absolute z-30 rounded-2xl overflow-hidden" style={{ top: "calc(100% + 8px)", right: 0, width: 150, background: "#221c17", border: `1px solid ${t.glassBorder}` }}>
                {sortOptions.map((s) => (
                  <button key={s.id} onClick={() => { setSortMode(s.id); setSortMenuOpen(false); }} className="w-full flex items-center justify-between active:opacity-70 transition" style={{ padding: "10px 13px" }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: sortMode === s.id ? accent : "#fff" }}>{s.label}</span>
                    {sortMode === s.id && <Icon name="check" size={13} color={accent} />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {searchOpen && (
        <div className="px-6" style={{ marginTop: 16 }}>
          <div className="flex items-center gap-2.5 rounded-full" style={{ padding: "12px 18px", background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
            <Icon name="search" size={15} color={t.textDim} />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your library"
              className="flex-1 bg-transparent outline-none"
              style={{ fontSize: 14, color: "#fff" }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")}><Icon name="x" size={13} color={t.textDim} /></button>
            )}
          </div>
        </div>
      )}

      <div className="px-6 flex gap-2 overflow-x-auto" style={{ marginTop: 18, scrollbarWidth: "none" }}>
        <button onClick={() => setLibraryFilter("all")} className="flex-shrink-0 flex items-center gap-1.5 rounded-full active:scale-95 transition" style={{ padding: "7px 14px", fontSize: 12.5, fontWeight: 500, ...pillOn(libraryFilter === "all"), border: `1px solid ${libraryFilter === "all" ? "transparent" : t.cardBorder}` }}>
          <Icon name="gridToggle" size={12} color={libraryFilter === "all" ? "#111" : t.textDim} />All · {library.length}
        </button>
        {Object.entries(statusMeta).map(([key, meta]) => {
          const active = libraryFilter === key;
          return (
            <button key={key} onClick={() => setLibraryFilter(key)} className="flex-shrink-0 flex items-center gap-1.5 rounded-full active:scale-95 transition" style={{ padding: "7px 14px", fontSize: 12.5, fontWeight: 500, ...pillOn(active), border: `1px solid ${active ? "transparent" : t.cardBorder}` }}>
              <Icon name={meta.icon} size={12} color={active ? "#111" : t.textDim} />{meta.label} · {counts[key]}
            </button>
          );
        })}
      </div>

      <PosterGrid className="px-6 mt-4" columns={3}>
        {sortedLibrary.map((s) => (
          <PosterCard key={s.id} show={s} href={`/show/${s.id}`} width="100%" titlePlacement="overlay" favorite={isFavorite(s.id)} onToggleFavorite={() => toggleFavorite(s.id, "ProfileLibrary:grid")} onLongPress={(show, rect) => setLongPress({ show, rect })} />
        ))}
      </PosterGrid>

      {filteredLibrary.length === 0 && (
        <div style={{ padding: "40px 24px", textAlign: "center", fontSize: 13, color: t.textDim }}>
          {trimmedQuery || genreFilter
            ? "No shows match your search/filter."
            : libraryFilter === "all" ? "Nothing in your library yet." : "Nothing here yet."}
        </div>
      )}

      <div style={{ height: 30 }} />

      <PosterQuickStatusMenu
        show={longPress?.show ?? null}
        anchorRect={longPress?.rect ?? null}
        userId={user?.id}
        source="ProfileLibrary:posterLongPress"
        onClose={() => setLongPress(null)}
        onStatusChange={() => setLibraryRefreshToken((n) => n + 1)}
      />
    </>
  );
}
