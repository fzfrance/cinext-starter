"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import GlassCircle from "@/components/ui/GlassCircle";
import PosterArt from "@/components/ui/PosterArt";
import PosterGrid from "@/components/ui/PosterGrid";
import { useAuth } from "@/lib/auth-context";
import { getWatchedEpisodesForYear } from "@/lib/episodeWatches";
import { getUserMoviesWatchedInYear } from "@/lib/userMovies";
import { fallbackPalette } from "@/lib/library";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { hrefForMedia, mediaKey } from "@/lib/media";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// A historical year can contain enough distinct titles to make one large
// batch URL slow or reject. Resolve in small independent chunks so one bad
// TMDB response cannot turn the entire year's list into an empty state.
async function fetchBatchResults(path, ids) {
  if (ids.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < ids.length; i += 20) chunks.push(ids.slice(i, i + 20));
  const responses = [];
  // Keep chunks sequential: a large historical year should not fan out into
  // dozens of simultaneous TMDB requests and get every title rate-limited.
  for (const chunk of chunks) {
    try {
      const response = await fetch(`${path}?ids=${chunk.join(",")}`, { cache: "no-store" });
      if (!response.ok) { responses.push([]); continue; }
      const payload = await response.json();
      responses.push(Array.isArray(payload?.results) ? payload.results : []);
    } catch (err) {
      console.error(`Failed to load Time Machine media batch (${path}):`, err);
      responses.push([]);
    }
  }
  return responses.flat();
}

// TV/Movie badge for this page specifically — deliberately NOT
// lib/media.js's shared badgeForMedia (that one uses "ticket" for movies,
// the icon Search's own mixed rows use). Here the movie icon is the same
// film-slate ("clapperboard") the Library tab header already uses for its
// Movies tab, per explicit request.
function typeBadge(item) {
  return item.mediaType === "movie" ? { icon: "clapperboard", label: "Movie" } : { icon: "tv", label: "TV Show" };
}

const TYPE_FILTER_ITEMS = [
  { id: "all", label: "All" },
  { id: "tv", label: "TV Shows" },
  { id: "movie", label: "Movies" },
];
const VIEW_ITEMS = [
  { id: "list", label: "List", icon: "list" },
  { id: "gallery", label: "Gallery", icon: "gridToggle" },
];

// Persisted across a refresh (and across every year, same as Library's own
// view-mode toggle — see LIBRARY_VIEW_MODE_KEY in
// app/(tabs)/library/LibraryClient.jsx) until the user picks something
// else. Not year-scoped: "2026" and "2025" share one remembered
// view/filter, matching how the header controls themselves are framed as
// one persistent preference, not a per-card setting.
const VIEW_MODE_KEY = "cinext:timeMachineViewMode";
const TYPE_FILTER_KEY = "cinext:timeMachineTypeFilter";

// Shared dropdown chrome — same container styling as
// components/library/ViewModeMenu.jsx (dark translucent blur, border,
// shadow, corner radius), just inlined here since this page is the only
// place these two specific menus (List/Gallery, TV Shows/Movies filter)
// apply.
function MenuDropdown({ heading, children }) {
  return (
    <div
      className="absolute rounded-2xl"
      style={{
        zIndex: 70, top: "calc(100% + 8px)", right: 0, width: 172, padding: 5,
        background: `linear-gradient(${accent}10, ${accent}05), rgba(20,18,16,0.42)`,
        border: `1px solid ${t.glassBorder}`,
        backdropFilter: "blur(26px)", WebkitBackdropFilter: "blur(26px)",
        boxShadow: "0 20px 44px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ padding: "6px 10px 4px", fontSize: 11, fontWeight: 700, color: t.textDim, letterSpacing: 0.5, textTransform: "uppercase" }}>{heading}</div>
      {children}
    </div>
  );
}

function MenuRow({ active, icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between rounded-xl active:scale-95 transition"
      style={{ padding: "9px 10px", background: active ? "rgba(255,255,255,0.1)" : "transparent" }}
    >
      <span className="flex items-center gap-2.5">
        {icon && <Icon name={icon} size={15} color={active ? accent : t.textDim} />}
        <span style={{ fontSize: 13.5, fontWeight: 700, color: active ? accent : t.textDim }}>{label}</span>
      </span>
      {active && <Icon name="check" size={13} color={accent} strokeWidth={2.6} />}
    </button>
  );
}

// Time Machine's per-year detail — every show and movie the user watched
// in this one calendar year, mixing both media types in one feed (same
// mixed-list pattern app/search/SearchClient.jsx already uses),
// most-recently-watched-first. List/Gallery view + a TV Shows/Movies type
// filter live in the header, top right — no free-text search, per the
// original "simple full page list" request this still is at heart.
export default function Page() {
  const params = useParams();
  const router = useRouter();
  const year = Number(params.year);
  const { user } = useAuth();
  const readableLanguages = useReadableLanguages();
  const [items, setItems] = useState(null); // null = loading
  const [typeFilter, setTypeFilterState] = useState("all");
  const [viewMode, setViewModeState] = useState("gallery");
  const [activeMenu, setActiveMenu] = useState(null); // "filter" | "view" | null
  const toggleMenu = (key) => setActiveMenu((prev) => (prev === key ? null : key));

  // Hydrate the remembered view/filter on mount — default-then-hydrate-via-
  // effect (not a lazy useState initializer) so this never touches
  // localStorage during SSR, same pattern Library's own view-mode toggle
  // uses.
  useEffect(() => {
    try {
      const savedView = localStorage.getItem(VIEW_MODE_KEY);
      if (savedView === "list" || savedView === "gallery") setViewModeState(savedView);
      const savedFilter = localStorage.getItem(TYPE_FILTER_KEY);
      if (savedFilter === "all" || savedFilter === "tv" || savedFilter === "movie") setTypeFilterState(savedFilter);
    } catch (err) {
      console.error("Failed to restore Time Machine view/filter:", err);
    }
  }, []);
  const setViewMode = (mode) => {
    setViewModeState(mode);
    try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch (err) { console.error("Failed to save Time Machine view mode:", err); }
  };
  const setTypeFilter = (mode) => {
    setTypeFilterState(mode);
    try { localStorage.setItem(TYPE_FILTER_KEY, mode); } catch (err) { console.error("Failed to save Time Machine type filter:", err); }
  };

  useEffect(() => {
    if (!user || !year) return;
    let cancelled = false;
    setItems(null);
    (async () => {
      const [showRows, movieRows] = await Promise.all([
        getWatchedEpisodesForYear(user.id, year).catch((err) => { console.error(err); return []; }),
        getUserMoviesWatchedInYear(user.id, year).catch((err) => { console.error(err); return []; }),
      ]);

      // Most recent watch event per show/movie within this year — decides
      // sort order below (doesn't need to be exact across the two date
      // formats, just a reasonable "watched most recently first" feel).
      const lastShowDate = new Map();
      for (const r of showRows) {
        const at = r.watched_at ?? r.watched_on;
        if (!at) continue;
        if (!lastShowDate.has(r.tmdb_show_id) || at > lastShowDate.get(r.tmdb_show_id)) lastShowDate.set(r.tmdb_show_id, at);
      }
      const lastMovieDate = new Map();
      for (const r of movieRows) {
        // A synthetic sortable string for month/year-precision rows (no
        // real watchedOn to compare) — a movie with only that precision
        // must still appear in this year's list, just sorted a bit more
        // approximately than an exact-date one.
        const at = r.watchedOn ?? (r.watchedYear ? `${r.watchedYear}-${String(r.watchedMonth ?? 1).padStart(2, "0")}-01` : null);
        if (!at) continue;
        if (!lastMovieDate.has(r.movieId) || at > lastMovieDate.get(r.movieId)) lastMovieDate.set(r.movieId, at);
      }

      const showIds = [...lastShowDate.keys()];
      const movieIds = [...lastMovieDate.keys()];

      const [showResults, movieResults] = await Promise.all([
        fetchBatchResults("/api/shows/batch", showIds),
        fetchBatchResults("/api/movies/batch", movieIds),
      ]);
      if (cancelled) return;

      const showById = new Map(showResults.map((show) => [String(show.id), show]));
      const movieById = new Map(movieResults.map((movie) => [String(movie.id), movie]));
      // Keep the watch record visible even when TMDB temporarily has no
      // metadata for an ID. The detail route remains usable, and the
      // placeholder makes the missing enrichment recoverable rather than
      // presenting a misleading empty year.
      const merged = [
        ...showIds.map((id) => ({
          ...(showById.get(String(id)) ?? { id: Number(id), title: "Watched TV show", posterPath: null }),
          mediaType: "tv", watchedAt: lastShowDate.get(id) ?? lastShowDate.get(Number(id)),
        })),
        ...movieIds.map((id) => ({
          ...(movieById.get(String(id)) ?? { id: Number(id), title: "Watched movie", posterPath: null }),
          mediaType: "movie", watchedAt: lastMovieDate.get(id) ?? lastMovieDate.get(Number(id)),
        })),
      ].sort((a, b) => (b.watchedAt ?? "").localeCompare(a.watchedAt ?? ""));

      setItems(merged);
    })().catch((err) => { console.error(err); if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [user, year]);

  const filteredItems = items === null ? null : typeFilter === "all" ? items : items.filter((i) => i.mediaType === typeFilter);
  const emptyLabel = typeFilter === "tv" ? "shows" : typeFilter === "movie" ? "movies" : "titles";

  return (
    <>
      <div className="flex items-center justify-between px-6" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <GlassCircle onClick={() => router.back()} t={t}><Icon name="back" size={16} color={t.text} /></GlassCircle>
        <div className="flex items-center gap-2">
          <div className="relative">
            <GlassCircle onClick={() => toggleMenu("filter")} t={t}><Icon name="filter" size={16} color="#fff" /></GlassCircle>
            {activeMenu === "filter" && (
              <MenuDropdown heading="Filter">
                {TYPE_FILTER_ITEMS.map((f) => (
                  <MenuRow key={f.id} active={typeFilter === f.id} label={f.label} onClick={() => { setTypeFilter(f.id); setActiveMenu(null); }} />
                ))}
              </MenuDropdown>
            )}
          </div>
          <div className="relative">
            <GlassCircle onClick={() => toggleMenu("view")} t={t}><Icon name={viewMode === "list" ? "list" : "gridToggle"} size={16} color="#fff" /></GlassCircle>
            {activeMenu === "view" && (
              <MenuDropdown heading="View">
                {VIEW_ITEMS.map((v) => (
                  <MenuRow key={v.id} active={viewMode === v.id} icon={v.icon} label={v.label} onClick={() => { setViewMode(v.id); setActiveMenu(null); }} />
                ))}
              </MenuDropdown>
            )}
          </div>
        </div>
      </div>
      {activeMenu && <div className="fixed inset-0" style={{ zIndex: 60 }} onClick={() => setActiveMenu(null)} />}

      <div className="px-6" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 32.2, fontWeight: 800, color: "#fff" }}>{year}</div>
        <div style={{ fontSize: 12.5, color: t.textDim, marginTop: 3 }}>
          {filteredItems ? `${filteredItems.length} title${filteredItems.length === 1 ? "" : "s"} watched` : "Loading…"}
        </div>
      </div>

      {filteredItems === null ? (
        <div className="px-6 flex flex-col gap-2.5" style={{ marginTop: 18, marginBottom: 24 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl" style={{ height: 96, background: t.cardFill, border: `1px solid ${t.cardBorder}` }} />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: t.textDim }}>No {emptyLabel} watched in {year}.</div>
      ) : viewMode === "gallery" ? (
        <PosterGrid className="px-6" columns={3} style={{ marginTop: 18, marginBottom: 24 }}>
          {filteredItems.map((item) => {
            const { base, glow } = fallbackPalette(item.id);
            const title = resolveTitle(item, readableLanguages);
            return (
              <Link
                key={mediaKey(item)}
                href={hrefForMedia(item)}
                className="relative block rounded-xl overflow-hidden active:scale-95 transition"
                style={{ width: "100%", aspectRatio: "2 / 3" }}
              >
                <PosterArt posterPath={item.posterPath} base={base} glow={glow} alt={title} />
                <div className="absolute inset-x-0 bottom-0" style={{ padding: "8px 8px 7px", background: "linear-gradient(0deg, rgba(0,0,0,0.85) 0%, transparent 70%)" }}>
                  <div className="truncate" style={{ fontSize: 11.5, fontWeight: 700, color: "#fff" }}>{title}</div>
                  {item.numberOfSeasons && (
                    <div className="truncate" style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", marginTop: 1 }}>
                      {item.numberOfSeasons} Season{item.numberOfSeasons === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </PosterGrid>
      ) : (
        <div className="px-6 flex flex-col gap-2.5" style={{ marginTop: 18, marginBottom: 24 }}>
          {filteredItems.map((item) => {
            const { base, glow } = fallbackPalette(item.id);
            const title = resolveTitle(item, readableLanguages);
            const badge = typeBadge(item);
            return (
              <Link
                key={mediaKey(item)}
                href={hrefForMedia(item)}
                className="flex gap-3 rounded-2xl active:scale-[0.98] transition"
                style={{ padding: 12, background: t.cardFill, border: `1px solid ${t.cardBorder}` }}
              >
                <div className="relative flex-shrink-0 rounded-xl overflow-hidden" style={{ width: 68, height: 96 }}>
                  <PosterArt posterPath={item.posterPath} base={base} glow={glow} alt={title} />
                </div>
                <div className="min-w-0 flex-1 flex flex-col justify-center">
                  <div className="flex items-center gap-1.5">
                    <Icon name={badge.icon} size={11} color={accent} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: 0.3 }}>{badge.label}</span>
                  </div>
                  <div className="truncate" style={{ fontSize: 14.5, fontWeight: 700, color: "#fff", marginTop: 3 }}>{title}</div>
                  {/* Season count — TV only (numberOfSeasons is null for
                      movies, /api/movies/batch never returns it) — and
                      genre, each on their own line rather than combined. */}
                  {item.numberOfSeasons && (
                    <div className="truncate" style={{ fontSize: 11.5, color: t.textDim, marginTop: 3 }}>
                      {item.numberOfSeasons} Season{item.numberOfSeasons === 1 ? "" : "s"}
                    </div>
                  )}
                  {item.genre && (
                    <div className="truncate" style={{ fontSize: 11.5, color: t.textDim, marginTop: 3 }}>{item.genre}</div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
