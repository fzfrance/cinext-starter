"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "@/components/ui/Icon";
import GlassCircle from "@/components/ui/GlassCircle";
import PosterCard from "@/components/ui/PosterCard";
import PosterQuickStatusMenu from "@/components/ui/PosterQuickStatusMenu";
import MoviePosterQuickStatusMenu from "@/components/ui/MoviePosterQuickStatusMenu";
import PosterGrid from "@/components/ui/PosterGrid";
import { MOVIE_STATUS_ITEMS } from "@/components/library/StatusFilterRow";
import { useAuth } from "@/lib/auth-context";
import { useFavorites } from "@/lib/favorites-context";
import { useMovieFavorites } from "@/lib/movie-favorites-context";
import { getUserShows } from "@/lib/userShows";
import { getUserMovies } from "@/lib/userMovies";
import { getShowWatchSummary } from "@/lib/episodeWatches";
import { resolveShowStatus } from "@/lib/statusResolver";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { themes, statusMeta, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// Same array shape as MOVIE_STATUS_ITEMS (components/library/StatusFilterRow.jsx)
// — statusMeta itself (lib/theme.js) is a plain id-keyed object, not an
// array, so this page's own status-pill row (which needs to iterate
// either vocabulary the same way once a mediaType toggle exists) converts
// it once here rather than branching the render between two different
// iteration shapes.
const SHOW_STATUS_ITEMS = Object.entries(statusMeta).map(([id, meta]) => ({ id, ...meta }));

// Same options/shape as Profile's own Favorites sort menu, minus "User
// Order" — that option only makes sense for a manually-reorderable list
// (Favorites has a real drag-reorder mode with a stored order), and this
// page has no such concept, just a computed/filtered view of the whole
// library. "Last Watched" is new here — lastWatchedAt already comes free
// on every show from getShowWatchSummary (fetched below for status
// resolution anyway), just not previously attached to the display object.
// Movies have no lastWatchedAt of their own (no per-watch history, just a
// status) — they all sink to the bottom together under that sort, same as
// a never-watched show would.
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
  const { isFavorite: isMovieFavorite, toggleFavorite: toggleMovieFavorite } = useMovieFavorites();
  const readableLanguages = useReadableLanguages();
  const [type, setType] = useState("shows");
  const [libraryFilter, setLibraryFilter] = useState("all");
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [movieLibrary, setMovieLibrary] = useState([]);
  const [movieLoading, setMovieLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [genreMenuOpen, setGenreMenuOpen] = useState(false);
  const [genreFilter, setGenreFilter] = useState(null);
  const [sortMode, setSortMode] = useState("firstAdded");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [longPress, setLongPress] = useState(null);
  const [libraryRefreshToken, setLibraryRefreshToken] = useState(0);

  // Arriving from a Library genre aisle's ">" (e.g. Sci-Fi & Fantasy) tags
  // this page with ?genre=...&type=movies — read reactively (not just on
  // first mount) so navigating here again with a DIFFERENT genre/type
  // re-applies correctly even if this page's component instance is
  // reused across the same-route navigation, and so arriving with no
  // params at all (e.g. from Profile's own Library entry point) explicitly
  // clears any previously-set filter instead of leaving it stuck.
  useEffect(() => {
    setGenreFilter(searchParams.get("genre") || null);
    setType(searchParams.get("type") === "movies" ? "movies" : "shows");
  }, [searchParams]);

  // Updates the URL alongside local state whenever type/genre change via
  // this page's own filter dropdown (not just on arrival) — so a refresh
  // or a back-navigation restores the same filtered view instead of
  // resetting to Shows/All Genres, same reasoning the main Library tab's
  // own ?tab= now follows.
  const applyFilterUrl = (nextType, nextGenre) => {
    const params = new URLSearchParams();
    if (nextType === "movies") params.set("type", "movies");
    if (nextGenre) params.set("genre", nextGenre);
    const qs = params.toString();
    router.replace(qs ? `/profile/library?${qs}` : "/profile/library", { scroll: false });
  };
  const selectType = (nextType) => {
    setType(nextType);
    setGenreFilter(null);
    setLibraryFilter("all"); // show/movie status vocabularies differ — a stale pick from one would silently zero-out the other
    setGenreMenuOpen(false);
    applyFilterUrl(nextType, null);
  };
  const selectGenre = (g) => {
    const next = genreFilter === g ? null : g;
    setGenreFilter(next);
    setGenreMenuOpen(false);
    applyFilterUrl(type, next);
  };

  // Same fetch/resolve as Profile's own Library section — library-detail
  // (not the lighter /api/shows/batch) because the *displayed* status must
  // be resolved from real released/watched episode counts
  // (lib/statusResolver.js), so this full-page list can never disagree
  // with the same show's status on Show Detail or Profile itself.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const byShow = await getUserShows(user.id);
      const ids = Object.keys(byShow).map(Number);
      if (ids.length === 0) { if (!cancelled) { setLibrary([]); setLoading(false); } return; }

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
        return {
          id: result.id,
          title: resolveTitle(result, readableLanguages),
          englishTitle: result.title,
          posterPath: result.posterPath,
          genre: result.genre,
          ...byShow[id],
          status: resolvedStatus,
          lastWatchedAt: summary[id]?.lastWatchedAt ?? null,
          // Same field Home's In Progress row reads (progressPct from
          // /api/shows/library-detail) — undefined for paused/drop shows
          // (excluded from needsProgress above, same as Home), which
          // PosterCard's own `progress != null` check already treats as
          // "no bar" rather than a bogus 0%.
          progress: result.progressPct,
        };
      }).filter(Boolean));
      setLoading(false);
    })().catch((err) => { console.error(err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, readableLanguages, libraryRefreshToken]);

  // Movies — mirrors the shows fetch above, meaningfully simpler: no
  // episode-progress/resolveShowStatus branch at all (a movie's status is
  // always exactly what the user picked, see lib/userMovies.js), so one
  // batch fetch (/api/movies/library-detail) is the whole thing. No
  // lastWatchedAt/progress of its own — left null/undefined, same as a
  // never-watched show would leave them.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setMovieLoading(true);
    (async () => {
      const byMovie = await getUserMovies(user.id);
      const ids = Object.keys(byMovie).map(Number);
      if (ids.length === 0) { if (!cancelled) { setMovieLibrary([]); setMovieLoading(false); } return; }

      const res = await fetch("/api/movies/library-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const { results } = await res.json();
      const byId = Object.fromEntries(results.map((r) => [r.id, r]));

      if (cancelled) return;
      setMovieLibrary(ids.map((id) => {
        const result = byId[id];
        if (!result) return null;
        return {
          id: result.id,
          title: resolveTitle(result, readableLanguages),
          englishTitle: result.title,
          posterPath: result.posterPath,
          genre: result.genre,
          ...byMovie[id],
          lastWatchedAt: null,
          progress: undefined,
        };
      }).filter(Boolean));
      setMovieLoading(false);
    })().catch((err) => { console.error(err); if (!cancelled) setMovieLoading(false); });
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

  const isMovies = type === "movies";
  const activeLibrary = isMovies ? movieLibrary : library;
  const activeLoading = isMovies ? movieLoading : loading;
  const statusItems = isMovies ? MOVIE_STATUS_ITEMS : SHOW_STATUS_ITEMS;

  // Genres actually present in THIS type's library, not a fixed master
  // list — sorted alphabetically so the menu order doesn't shuffle as
  // data loads. Recomputed per type, so switching Shows/Movies never
  // leaves a genre selected that the other type doesn't even have.
  const genres = [...new Set(activeLibrary.map((s) => s.genre).filter(Boolean))].sort();
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filteredLibrary = activeLibrary.filter((s) => {
    if (libraryFilter !== "all" && s.status !== libraryFilter) return false;
    if (genreFilter && s.genre !== genreFilter) return false;
    if (trimmedQuery && !s.title.toLowerCase().includes(trimmedQuery) && !s.englishTitle?.toLowerCase().includes(trimmedQuery)) return false;
    return true;
  });
  const counts = statusItems.reduce((acc, item) => ({ ...acc, [item.id]: activeLibrary.filter((s) => s.status === item.id).length }), {});
  const sortedLibrary = sortItems(filteredLibrary, sortMode, "title");
  const pillOn = (active) => ({ background: active ? "#fff" : "rgba(0,0,0,0.3)", color: active ? "#111" : "#fff" });

  return (
    <>
      <div className="flex items-center justify-between px-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 21px)" }}>
        <GlassCircle onClick={() => router.back()} t={t}><Icon name="back" size={16} color={t.text} /></GlassCircle>
        <div className="flex items-center gap-2">
          {/* Filter — liquid-glass transparent dropdown. A Shows/Movies
              toggle sits at the top now, above the genre list, so this one
              button covers both "which media type" and "which genre"
              instead of needing a separate control for type. */}
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
                <div className="absolute z-30 rounded-2xl overflow-hidden" style={{ top: "calc(100% + 8px)", right: 0, width: 190, maxHeight: 340, overflowY: "auto", padding: 6, background: `linear-gradient(${accent}10, ${accent}05), rgba(20,18,16,0.42)`, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(26px)", WebkitBackdropFilter: "blur(26px)", boxShadow: "0 20px 44px rgba(0,0,0,0.55)", scrollbarWidth: "none" }}>
                  <div className="flex items-center rounded-xl" style={{ padding: 3, marginBottom: 6, background: "rgba(255,255,255,0.06)" }}>
                    {[["shows", "Shows"], ["movies", "Movies"]].map(([id, label]) => {
                      const active = type === id;
                      return (
                        <button
                          key={id}
                          onClick={() => selectType(id)}
                          className="flex-1 flex items-center justify-center rounded-lg active:scale-95 transition"
                          style={{ padding: "7px 0", background: active ? "#fff" : "transparent" }}
                        >
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: active ? "#111" : "#fff" }}>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "2px 4px 6px" }} />
                  <button onClick={() => selectGenre(null)} className="w-full flex items-center justify-between rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: !genreFilter ? accent : "#fff" }}>All Genres</span>
                    {!genreFilter && <Icon name="check" size={13} color={accent} />}
                  </button>
                  {genres.map((g) => (
                    <button key={g} onClick={() => selectGenre(g)} className="w-full flex items-center justify-between rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
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
          {/* Static "Library" now, not a per-type "Shows"/"Movies" title —
              the filter dropdown's own Shows/Movies toggle is what
              indicates which type is active, per explicit request. */}
          <div style={{ fontSize: 32.2, fontWeight: 800, color: "#fff" }}>Library</div>
          <div style={{ fontSize: 12.5, color: t.textDim, marginTop: 3 }}>{activeLibrary.length} {isMovies ? "movies" : "shows"}</div>
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
          <Icon name="gridToggle" size={12} color={libraryFilter === "all" ? "#111" : t.textDim} />All · {activeLibrary.length}
        </button>
        {statusItems.map((meta) => {
          const active = libraryFilter === meta.id;
          return (
            <button key={meta.id} onClick={() => setLibraryFilter(meta.id)} className="flex-shrink-0 flex items-center gap-1.5 rounded-full active:scale-95 transition" style={{ padding: "7px 14px", fontSize: 12.5, fontWeight: 500, ...pillOn(active), border: `1px solid ${active ? "transparent" : t.cardBorder}` }}>
              <Icon name={meta.icon} size={12} color={active ? "#111" : t.textDim} />{meta.label} · {counts[meta.id]}
            </button>
          );
        })}
      </div>

      {activeLoading ? (
        <div style={{ padding: "40px 24px", textAlign: "center", fontSize: 13, color: t.textDim }}>Loading…</div>
      ) : (
        <>
          <PosterGrid className="px-6 mt-4" columns={3}>
            {sortedLibrary.map((s) => (
              <PosterCard
                key={s.id}
                show={s}
                href={isMovies ? `/movie/${s.id}` : `/show/${s.id}`}
                width="100%"
                titlePlacement="overlay"
                favorite={isMovies ? isMovieFavorite(s.id) : isFavorite(s.id)}
                onToggleFavorite={() => (isMovies ? toggleMovieFavorite(s.id, "ProfileLibrary:grid") : toggleFavorite(s.id, "ProfileLibrary:grid"))}
                onLongPress={(show, rect) => setLongPress({ show, rect })}
                progress={s.progress}
              />
            ))}
          </PosterGrid>

          {filteredLibrary.length === 0 && (
            <div style={{ padding: "40px 24px", textAlign: "center", fontSize: 13, color: t.textDim }}>
              {trimmedQuery || genreFilter
                ? `No ${isMovies ? "movies" : "shows"} match your search/filter.`
                : libraryFilter === "all" ? "Nothing in your library yet." : "Nothing here yet."}
            </div>
          )}
        </>
      )}

      <div style={{ height: 30 }} />

      {isMovies ? (
        <MoviePosterQuickStatusMenu
          show={longPress?.show ?? null}
          anchorRect={longPress?.rect ?? null}
          userId={user?.id}
          source="ProfileLibrary:posterLongPress"
          onClose={() => setLongPress(null)}
          onStatusChange={() => setLibraryRefreshToken((n) => n + 1)}
        />
      ) : (
        <PosterQuickStatusMenu
          show={longPress?.show ?? null}
          anchorRect={longPress?.rect ?? null}
          userId={user?.id}
          source="ProfileLibrary:posterLongPress"
          onClose={() => setLongPress(null)}
          onStatusChange={() => setLibraryRefreshToken((n) => n + 1)}
        />
      )}
    </>
  );
}
