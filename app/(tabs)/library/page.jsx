"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import RecommendedRow from "@/components/library/RecommendedRow";
import StatusFilterRow from "@/components/library/StatusFilterRow";
import LibraryTabMenu, { TAB_ICON } from "@/components/library/LibraryTabMenu";
import Aisle from "@/components/library/Aisle";
import CollectionRow from "@/components/library/CollectionRow";
import CaseOverlay from "@/components/library/CaseOverlay";
import { useAuth } from "@/lib/auth-context";
import { getUserShows } from "@/lib/userShows";
import { getShowWatchSummary } from "@/lib/episodeWatches";
import { resolveShowStatus } from "@/lib/statusResolver";
import { getCollections } from "@/lib/collections";
import { primaryGenre, fallbackPalette } from "@/lib/library";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;


// Library — Shows/Movies/Collections, wired to the signed-in user's real
// tracked shows (lib/userShows.js) + real collections (lib/collections.js)
// + live TMDB detail (app/api/shows/library-detail). FloatingNav is already
// rendered once by the shared (tabs) layout, so this page renders no nav of
// its own.
//
// Collections here are NOT a separate concept from /profile/collections —
// same underlying rows, same detail page. Each collection renders as its
// own heading + a flat scrollable row of front-facing posters (CollectionRow)
// drawn straight from the same pooled `shows` data used by the Shows tab —
// no separate boxset/backdrop artwork fetch needed. The heading's chevron
// navigates straight to /profile/collections/[id] — no separate
// Library-only collection detail view.
export default function Page() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const readableLanguages = useReadableLanguages();

  // Every show touched by this screen — tracked shows AND any show that
  // only appears inside a collection without being tracked at all. `status`/
  // `favorite` are null/false for the latter until the user actually sets
  // one (which is also how they'd get added to the library — same as
  // everywhere else in the app).
  const [shows, setShows] = useState([]);
  const [collectionsRaw, setCollectionsRaw] = useState([]); // [{id, name, shared, showIds}]
  const [loaded, setLoaded] = useState(false);

  const [openShow, setOpenShow] = useState(null);
  const [openOrigin, setOpenOrigin] = useState(null);
  const [tab, setTab] = useState("shows");
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [byShow, cols] = await Promise.all([getUserShows(user.id), getCollections(user.id)]);
      const trackedIds = Object.keys(byShow).map(Number);
      const collectionIds = cols.flatMap((c) => c.showIds);
      const allIds = [...new Set([...trackedIds, ...collectionIds])];

      setCollectionsRaw(cols);

      if (allIds.length === 0) {
        if (!cancelled) { setShows([]); setLoaded(true); }
        return;
      }

      // Real status (resolveShowStatus) needs live episode-progress counts
      // to know when a show that was never explicitly marked "Completed"
      // has actually had every released episode watched — otherwise a show
      // finished purely by checking off episodes stays stuck showing
      // whichever explicit status it last had (e.g. still "Watching"),
      // same bug Show Detail/Profile/Explore already avoid by resolving
      // through this function instead of reading the raw column. paused/
      // drop/completed are unconditional overrides inside resolveShowStatus
      // itself, so those don't need the (expensive, per-show season) fetch.
      const resolvableIds = trackedIds.filter((id) => {
        const st = byShow[id].status;
        return st !== "paused" && st !== "drop" && st !== "completed";
      });
      const summary = await getShowWatchSummary(user.id, resolvableIds);

      const res = await fetch("/api/shows/library-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shows: allIds.map((id) => ({
            id,
            needsProgress: resolvableIds.includes(id),
            watched: summary[id]?.watchedKeys ?? [],
          })),
        }),
      });
      const { results } = await res.json();
      if (cancelled) return;
      const byId = Object.fromEntries(results.map((r) => [r.id, r]));

      const merged = allIds.map((id) => {
        const detail = byId[id];
        if (!detail) return null;
        const tracked = byShow[id];
        const { base, glow } = fallbackPalette(id);
        const resolvedStatus = tracked
          ? resolveShowStatus({
              explicitStatus: tracked.status,
              watchedReleasedEpisodes: detail.watchedReleasedEpisodes ?? 0,
              releasedEpisodes: detail.releasedEpisodes ?? 0,
            })
          : null;
        return {
          id,
          title: resolveTitle(detail, readableLanguages),
          // Kept separately so the inline search below still matches an
          // international show by its English name even when it's
          // currently displaying under its original-language title.
          englishTitle: detail.title,
          year: detail.year,
          meta: detail.meta,
          posterPath: detail.posterPath,
          backdropPath: detail.backdropPath,
          genres: detail.genres ?? [],
          logoPath: null, // filled in by the separate logo-fetch effect below
          tmdbRating: detail.tmdbRating,
          tagline: detail.tagline,
          base, glow,
          status: resolvedStatus,
          favorite: tracked?.favorite ?? false,
          addedAt: tracked?.addedAt ?? 0,
        };
      }).filter(Boolean);

      setShows(merged);
      setLoaded(true);
    })().catch(console.error);
    return () => { cancelled = true; };
  }, [user, readableLanguages]);

  // Spine/disc logos — a separate, progressive fetch (not blocking the
  // shelf's initial render): each show's best official title logo, matched
  // to the user's Readable Languages (lib/tmdb.js's pickBestLogo — a
  // K-drama gets its Korean wordmark when Korean is marked readable,
  // instead of TMDB's raw highest-voted logo, which skews English). Runs
  // once per distinct (ids, readableLanguages) pair, not on every render —
  // and re-runs once readableLanguages resolves from its default to the
  // user's real saved value, so an initial fetch made before that value
  // loaded doesn't stick.
  const logoIdsRef = useRef("");
  useEffect(() => {
    if (shows.length === 0) return;
    const ids = shows.map((s) => s.id);
    const key = `${ids.join(",")}|${readableLanguages.join(",")}`;
    if (logoIdsRef.current === key) return;
    logoIdsRef.current = key;
    let cancelled = false;
    fetch("/api/shows/logos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, readableLanguages }),
    })
      .then((res) => res.json())
      .then(({ results }) => {
        if (cancelled) return;
        const logoById = Object.fromEntries((results ?? []).map((r) => [r.id, r.logoPath]));
        setShows((prev) => prev.map((s) => (s.id in logoById ? { ...s, logoPath: logoById[s.id] } : s)));
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [shows, readableLanguages]);

  const handleOpen = (show, rect) => { setOpenShow(show); setOpenOrigin(rect); };
  const handleClose = () => { setOpenShow(null); setOpenOrigin(null); };

  // Optimistic local updates so CaseOverlay's real mutations reflect
  // immediately without a full refetch.
  const handleStatusChange = (showId, status) => setShows((prev) => prev.map((s) => (s.id === showId ? { ...s, status } : s)));
  const handleFavoriteChange = (showId, favorite) => setShows((prev) => prev.map((s) => (s.id === showId ? { ...s, favorite } : s)));
  const handleRemoved = (showId) => { setShows((prev) => prev.filter((s) => s.id !== showId)); handleClose(); };

  // Only actually-tracked shows (a real status) count for the Shows tab/
  // aisles/Recommended row — a show can be present here purely because it's
  // in a collection, without being tracked.
  const trackedShows = shows.filter((s) => s.status);
  const statusFiltered = statusFilter === "all" ? trackedShows : trackedShows.filter((s) => s.status === statusFilter);
  // The search box searches THIS same page/shelf layout in place — no
  // separate results screen. It narrows whatever the status filter above
  // already produced down to title matches only.
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filtered = trimmedQuery ? statusFiltered.filter((s) => s.title.toLowerCase().includes(trimmedQuery) || s.englishTitle?.toLowerCase().includes(trimmedQuery)) : statusFiltered;
  // Live per-status counts for the StatusFilterRow's expanded pill label
  // (e.g. "Watchlist · 22") — always over every tracked show, independent
  // of whichever filter is currently active.
  const statusCounts = {
    all: trackedShows.length,
    watching: trackedShows.filter((s) => s.status === "watching").length,
    watchlist: trackedShows.filter((s) => s.status === "watchlist").length,
    paused: trackedShows.filter((s) => s.status === "paused").length,
    drop: trackedShows.filter((s) => s.status === "drop").length,
    completed: trackedShows.filter((s) => s.status === "completed").length,
  };
  // Ranked by TMDB score, decoupled from the status filter above — this
  // ranking is internal, never shown as text (see RecommendedRow).
  const recommended = trackedShows.filter((s) => s.status === "watchlist" && s.tmdbRating != null).sort((a, b) => b.tmdbRating - a.tmdbRating).slice(0, 3);
  const genreGroups = Object.entries(
    filtered.reduce((acc, s) => {
      const g = primaryGenre(s.genres);
      if (!g) return acc; // Drama-only (or no genre-list match) — no aisle for this show
      (acc[g] ||= []).push(s);
      return acc;
    }, {})
  )
  // Last added first within each shelf, regardless of status — same
  // ordering for every status (Watchlist, Watching, Paused, Drop,
  // Completed) and for the unfiltered mixed-status view alike.
  .map(([genre, items]) => [genre, [...items].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))])
  // The >=2-per-genre threshold only exists to declutter the fully-
  // unfiltered view — once the user has picked a specific status or is
  // actively searching, every matching show needs to actually show up,
  // even if it's the only one in its genre.
  .filter(([, items]) => (statusFilter !== "all" || !!trimmedQuery) || items.length >= 2).sort((a, b) => b[1].length - a[1].length);
  const nothingToShow = filtered.length === 0;

  if (!authLoading && !user) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center text-center px-8" style={{ background: t.bg }}>
        <Icon name="collection" size={30} color={t.textDim} />
        <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginTop: 14 }}>Sign in to see your Library</div>
        <button onClick={() => router.push("/login")} className="rounded-full active:scale-95 transition" style={{ marginTop: 20, padding: "11px 24px", background: "#fff" }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1a1108" }}>Sign In</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: t.bg, color: "#fff", position: "relative" }}>
      {/* "Library" is back as a plain static heading. The Shows/Movies/
          Collections switcher is now a liquid-glass dropdown (LibraryTabMenu)
          opened from the small icon-only pill in the top-right corner —
          no more big text tabs or a separate Collections pill taking up
          their own rows. */}
      <div className="flex items-center justify-between px-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.5 }}>Library</div>
        <div className="flex items-center gap-2.5">
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setTabMenuOpen((v) => !v)}
              className="active:scale-90 transition"
              style={{ width: 38, height: 38, borderRadius: "50%", background: t.cardFill, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <Icon name={TAB_ICON[tab] ?? "tv"} size={16} color={accent} />
            </button>
            {tabMenuOpen && (
              <LibraryTabMenu
                tab={tab}
                onSelect={(id) => { setTab(id); setTabMenuOpen(false); }}
                onClose={() => setTabMenuOpen(false)}
              />
            )}
          </div>
          {/* Search — sits right after (to the right of) the tab-switcher
              icon, not before it. Searches THIS library in place (title
              match against the same shelves below) rather than navigating
              to the separate global TMDB search — reveals an inline input
              instead of a new screen, closing it clears the query too. */}
          <button
            onClick={() => setSearchOpen((v) => { if (v) setSearchQuery(""); return !v; })}
            className="active:scale-90 transition"
            style={{ width: 38, height: 38, borderRadius: "50%", background: t.cardFill, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <Icon name={searchOpen ? "x" : "search"} size={16} color="#fff" />
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="px-6" style={{ marginTop: 14 }}>
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

      {/* Divider — closes out the header as its own titled section before
          the content begins. Inset to the page's standard 20px side
          padding (the header row's own px-6 is 24px, a Tailwind spacing
          step — this divider deliberately matches the content rows below
          it instead, e.g. RecommendedRow/Aisle/StatusFilterRow's own
          "20px" padding). */}
      <div style={{ margin: "16px 20px 0", height: 1, background: "rgba(255,255,255,0.09)" }} />

      {tab === "shows" && (
        <>
          {/* Collapses while actively searching — the search results render
              straight into the genre shelves below instead. */}
          {!trimmedQuery && <RecommendedRow items={recommended} onOpen={handleOpen} />}
          <div style={{ marginTop: 18 }}>
            <StatusFilterRow statusFilter={statusFilter} counts={statusCounts} onSelect={setStatusFilter} />
          </div>
          {genreGroups.map(([genre, items]) => <Aisle key={genre} title={genre} items={items} onOpen={handleOpen} />)}
          {loaded && nothingToShow && (
            <div style={{ padding: "70px 20px", textAlign: "center", color: t.textDim, fontSize: 13.5 }}>
              {trimmedQuery ? "No shows match your search." : trackedShows.length === 0 ? "Nothing in your library yet." : "No titles match this filter."}
            </div>
          )}
        </>
      )}

      {tab === "movies" && (
        <div style={{ margin: "56px 20px 0", height: 220, borderRadius: 20, border: "1px dashed rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Movies</div>
            <div style={{ fontSize: 12.5, color: t.textDim }}>Coming soon.</div>
          </div>
        </div>
      )}

      {tab === "collections" && (
        <div style={{ marginTop: 4 }}>
          {loaded && collectionsRaw.length === 0 ? (
            <div style={{ padding: "70px 0", textAlign: "center", color: t.textDim, fontSize: 13.5 }}>No collections yet.</div>
          ) : (
            collectionsRaw.map((c) => {
              const byId = Object.fromEntries(shows.map((s) => [s.id, s]));
              const items = c.showIds.map((id) => byId[id]).filter(Boolean);
              return <CollectionRow key={c.id} id={c.id} name={c.name} shared={c.shared} items={items} onOpen={handleOpen} />;
            })
          )}
        </div>
      )}

      <div style={{ height: 30 }} />

      {openShow && (
        <CaseOverlay
          show={openShow}
          origin={openOrigin}
          onClose={handleClose}
          onStatusChange={handleStatusChange}
          onFavoriteChange={handleFavoriteChange}
          onRemoved={handleRemoved}
        />
      )}
    </div>
  );
}
