"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "@/components/ui/Icon";
import GlassCircle from "@/components/ui/GlassCircle";
import RecommendedRow from "@/components/library/RecommendedRow";
import StatusFilterRow, { MOVIE_STATUS_ITEMS } from "@/components/library/StatusFilterRow";
import Aisle from "@/components/library/Aisle";
import CaseOverlay from "@/components/library/CaseOverlay";
import MovieCaseOverlay from "@/components/library/MovieCaseOverlay";
import { useAuth } from "@/lib/auth-context";
import { getUserShows } from "@/lib/userShows";
import { getUserMovies } from "@/lib/userMovies";
import { getShowWatchSummary } from "@/lib/episodeWatches";
import { resolveShowStatus } from "@/lib/statusResolver";
import { shelfGenresForShow, shelfGenresForMovie, fallbackPalette } from "@/lib/library";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// A duplicate of app/(tabs)/library/page.jsx's own DVD-case/genre-shelf
// design (RecommendedRow + StatusFilterRow + Aisle + CaseOverlay), reached
// from Profile's own "Shows"/"Movies" sections rather than the main
// Library tab — the main Library tab/menu is untouched, this is a
// separate sandbox surface for trying layout changes without risking it.
// Single mediaType per visit (?type=shows|movies).
//
// Deliberately its OWN route (/profile/shelf), NOT /profile/library —
// that route is a different, older page (a flat genre-filtered grid) that
// the main Library tab's own genre-shelf ">" chevrons already link to
// (components/library/Aisle.jsx's own router.push), and must keep
// pointing there unchanged. This page used to live at /profile/library
// too, which accidentally hijacked that other link the moment this one
// replaced it — moved out to its own route to fix that collision, per
// explicit report ("that one should navigate to a full list... This
// should not change. Only the link from Shows/Movies on the profile is
// different"). This page's OWN internal Aisle shelves still correctly
// link to /profile/library?genre=... — same shared component, same
// intended destination, unaffected by this move.
//
// No Collections tab either (Collections already has its own Profile
// entry point) — which also means, unlike the source page, this never
// needs to merge in collection-only untracked shows/movies; it only ever
// fetches the signed-in user's own tracked items for whichever type is
// active.
export default function LibraryClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const readableLanguages = useReadableLanguages();

  const [type, setType] = useState("shows");
  useEffect(() => {
    setType(searchParams.get("type") === "movies" ? "movies" : "shows");
  }, [searchParams]);

  const [shows, setShows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [movies, setMovies] = useState([]);
  const [moviesLoaded, setMoviesLoaded] = useState(false);

  const [openShow, setOpenShow] = useState(null);
  const [openOrigin, setOpenOrigin] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [movieStatusFilter, setMovieStatusFilter] = useState("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Shows fetch — only runs when this visit is actually scoped to shows,
  // same real-status resolution (resolveShowStatus) the main Library page
  // uses, so a show's status here can never disagree with Show Detail's.
  useEffect(() => {
    if (!user || type !== "shows") return;
    let cancelled = false;
    (async () => {
      const byShow = await getUserShows(user.id);
      const ids = Object.keys(byShow).map(Number);
      if (ids.length === 0) { if (!cancelled) { setShows([]); setLoaded(true); } return; }

      const resolvableIds = ids.filter((id) => {
        const st = byShow[id].status;
        return st !== "paused" && st !== "drop" && st !== "completed";
      });
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
      if (cancelled) return;
      const byId = Object.fromEntries(results.map((r) => [r.id, r]));

      const merged = ids.map((id) => {
        const detail = byId[id];
        if (!detail) return null;
        const tracked = byShow[id];
        const { base, glow } = fallbackPalette(id);
        return {
          id,
          title: resolveTitle(detail, readableLanguages),
          englishTitle: detail.title,
          year: detail.year,
          meta: detail.meta,
          posterPath: detail.posterPath,
          backdropPath: detail.backdropPath,
          genres: detail.genres ?? [],
          keywords: detail.keywords ?? [],
          logoPath: null,
          tmdbRating: detail.tmdbRating,
          tagline: detail.tagline,
          base, glow,
          status: resolveShowStatus({
            explicitStatus: tracked.status,
            watchedReleasedEpisodes: detail.watchedReleasedEpisodes ?? 0,
            releasedEpisodes: detail.releasedEpisodes ?? 0,
          }),
          favorite: tracked.favorite ?? false,
          addedAt: tracked.addedAt ?? 0,
        };
      }).filter(Boolean);

      // Preserve any logoPath the logo-fetch effect below already resolved
      // for an id still present here, instead of unconditionally wiping it
      // back to null — this effect can legitimately re-run after that one
      // already succeeded (e.g. readableLanguages settling from its
      // default to the real profile value triggers both), and when it
      // does, the logo effect's own id+language guard correctly sees
      // nothing meaningful changed and skips re-fetching — which used to
      // leave every spine's logo permanently blanked out instead of just
      // skipped-because-already-known.
      setShows((prev) => {
        const prevLogoById = Object.fromEntries(prev.filter((s) => s.logoPath != null).map((s) => [s.id, s.logoPath]));
        return merged.map((s) => (s.id in prevLogoById ? { ...s, logoPath: prevLogoById[s.id] } : s));
      });
      setLoaded(true);
    })().catch(console.error);
    return () => { cancelled = true; };
  }, [user, type, readableLanguages]);

  const logoIdsRef = useRef("");
  useEffect(() => {
    if (type !== "shows" || shows.length === 0) return;
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
  }, [type, shows, readableLanguages]);

  // Movies fetch — mirrors the shows one above, only runs when scoped to
  // movies. No episode-progress/resolveShowStatus branch (a movie's status
  // is always exactly what the user picked).
  useEffect(() => {
    if (!user || type !== "movies") return;
    let cancelled = false;
    (async () => {
      const byMovie = await getUserMovies(user.id);
      const ids = Object.keys(byMovie).map(Number);
      if (ids.length === 0) { if (!cancelled) { setMovies([]); setMoviesLoaded(true); } return; }

      const res = await fetch("/api/movies/library-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const { results } = await res.json();
      if (cancelled) return;
      const byId = Object.fromEntries(results.map((r) => [r.id, r]));

      const merged = ids.map((id) => {
        const detail = byId[id];
        if (!detail) return null;
        const tracked = byMovie[id];
        const { base, glow } = fallbackPalette(id);
        return {
          id,
          title: resolveTitle(detail, readableLanguages),
          englishTitle: detail.title,
          year: detail.year,
          meta: detail.meta,
          posterPath: detail.posterPath,
          backdropPath: detail.backdropPath,
          genres: detail.genres ?? [],
          logoPath: null,
          tmdbRating: detail.tmdbRating,
          tagline: detail.tagline,
          base, glow,
          status: tracked.status ?? null,
          favorite: tracked.favorite ?? false,
          addedAt: tracked.addedAt ?? 0,
        };
      }).filter(Boolean);

      // Preserve any logoPath the logo-fetch effect below already resolved
      // — see the shows effect's identical comment above for why (this
      // effect re-running after that one succeeded used to permanently
      // blank every spine's logo back to null instead of leaving it alone).
      setMovies((prev) => {
        const prevLogoById = Object.fromEntries(prev.filter((s) => s.logoPath != null).map((s) => [s.id, s.logoPath]));
        return merged.map((s) => (s.id in prevLogoById ? { ...s, logoPath: prevLogoById[s.id] } : s));
      });
      setMoviesLoaded(true);
    })().catch((err) => { console.error(err); if (!cancelled) setMoviesLoaded(true); });
    return () => { cancelled = true; };
  }, [user, type, readableLanguages]);

  const movieLogoIdsRef = useRef("");
  useEffect(() => {
    if (type !== "movies" || movies.length === 0) return;
    const ids = movies.map((s) => s.id);
    const key = `${ids.join(",")}|${readableLanguages.join(",")}`;
    if (movieLogoIdsRef.current === key) return;
    movieLogoIdsRef.current = key;
    let cancelled = false;
    fetch("/api/movies/logos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, readableLanguages }),
    })
      .then((res) => res.json())
      .then(({ results }) => {
        if (cancelled) return;
        const logoById = Object.fromEntries((results ?? []).map((r) => [r.id, r.logoPath]));
        setMovies((prev) => prev.map((s) => (s.id in logoById ? { ...s, logoPath: logoById[s.id] } : s)));
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [type, movies, readableLanguages]);

  const handleOpen = (show, rect) => { setOpenShow(show); setOpenOrigin(rect); };
  const handleClose = () => { setOpenShow(null); setOpenOrigin(null); };

  const handleStatusChange = (showId, status) => setShows((prev) => prev.map((s) => (s.id === showId ? { ...s, status } : s)));
  const handleFavoriteChange = (showId, favorite) => setShows((prev) => prev.map((s) => (s.id === showId ? { ...s, favorite } : s)));
  const handleRemoved = (showId) => { setShows((prev) => prev.filter((s) => s.id !== showId)); handleClose(); };

  const handleMovieStatusChange = (movieId, status) => setMovies((prev) => prev.map((s) => (s.id === movieId ? { ...s, status } : s)));
  const handleMovieFavoriteChange = (movieId, favorite) => setMovies((prev) => prev.map((s) => (s.id === movieId ? { ...s, favorite } : s)));
  const handleMovieRemoved = (movieId) => { setMovies((prev) => prev.filter((s) => s.id !== movieId)); handleClose(); };

  const trackedShows = shows.filter((s) => s.status);
  const statusFiltered = statusFilter === "all" ? trackedShows : trackedShows.filter((s) => s.status === statusFilter);
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filtered = trimmedQuery ? statusFiltered.filter((s) => s.title.toLowerCase().includes(trimmedQuery) || s.englishTitle?.toLowerCase().includes(trimmedQuery)) : statusFiltered;
  const statusCounts = {
    all: trackedShows.length,
    watching: trackedShows.filter((s) => s.status === "watching").length,
    watchlist: trackedShows.filter((s) => s.status === "watchlist").length,
    paused: trackedShows.filter((s) => s.status === "paused").length,
    drop: trackedShows.filter((s) => s.status === "drop").length,
    completed: trackedShows.filter((s) => s.status === "completed").length,
  };
  const recommended = trackedShows.filter((s) => s.status === "watchlist" && s.tmdbRating != null).sort((a, b) => b.tmdbRating - a.tmdbRating).slice(0, 3);
  const genreGroups = Object.entries(
    filtered.reduce((acc, s) => {
      const shelfGenres = shelfGenresForShow(s.genres, s.keywords);
      for (const genre of shelfGenres) (acc[genre] ||= []).push(s);
      return acc;
    }, {})
  )
    .map(([genre, items]) => [genre, [...items].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))])
    .filter(([, items]) => (statusFilter !== "all" || !!trimmedQuery) || items.length >= 2).sort((a, b) => b[1].length - a[1].length);
  const nothingToShow = filtered.length === 0;

  const trackedMovies = movies.filter((s) => s.status);
  const movieStatusFiltered = movieStatusFilter === "all" ? trackedMovies : trackedMovies.filter((s) => s.status === movieStatusFilter);
  const movieFiltered = trimmedQuery ? movieStatusFiltered.filter((s) => s.title.toLowerCase().includes(trimmedQuery) || s.englishTitle?.toLowerCase().includes(trimmedQuery)) : movieStatusFiltered;
  const movieStatusCounts = {
    all: trackedMovies.length,
    watchlist: trackedMovies.filter((s) => s.status === "watchlist").length,
    completed: trackedMovies.filter((s) => s.status === "completed").length,
  };
  const movieRecommended = trackedMovies.filter((s) => s.status === "watchlist" && s.tmdbRating != null).sort((a, b) => b.tmdbRating - a.tmdbRating).slice(0, 3);
  const movieGenreGroups = Object.entries(
    movieFiltered.reduce((acc, s) => {
      const shelfGenres = shelfGenresForMovie(s.genres);
      for (const genre of shelfGenres) (acc[genre] ||= []).push(s);
      return acc;
    }, {})
  )
    .map(([genre, items]) => [genre, [...items].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))])
    .filter(([, items]) => (movieStatusFilter !== "all" || !!trimmedQuery) || items.length >= 2).sort((a, b) => b[1].length - a[1].length);
  const movieNothingToShow = movieFiltered.length === 0;

  if (!authLoading && !user) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center text-center px-8" style={{ background: t.bg }}>
        <Icon name="collection" size={30} color={t.textDim} />
        <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginTop: 14 }}>Sign in to see your library</div>
        <button onClick={() => router.push("/login")} className="rounded-full active:scale-95 transition" style={{ marginTop: 20, padding: "11px 24px", background: "#fff" }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1a1108" }}>Sign In</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: t.bg, color: "#fff", position: "relative" }}>
      {/* Same header shape as Profile's other full-list pages (Favorites,
          My Ratings): a back button alone in its own top-left row (with
          the search toggle on the right of that same row), then the big
          title + count on its own row underneath — not sharing a row with
          the title like the main Library tab's own header does, since
          that page has no back button at all (it's a root tab). */}
      <div className="flex items-center justify-between px-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 21px)" }}>
        <GlassCircle onClick={() => router.back()} t={t}><Icon name="back" size={16} color={t.text} /></GlassCircle>
        <button
          onClick={() => setSearchOpen((v) => { if (v) setSearchQuery(""); return !v; })}
          className="active:scale-90 transition"
          style={{ width: 38, height: 38, borderRadius: "50%", background: t.cardFill, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <Icon name={searchOpen ? "x" : "search"} size={16} color="#fff" />
        </button>
      </div>

      <div className="px-6" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 32.2, fontWeight: 800, color: "#fff" }}>{type === "movies" ? "Movies" : "Shows"}</div>
      </div>

      {searchOpen && (
        <div className="px-6" style={{ marginTop: 14 }}>
          <div className="flex items-center gap-2.5 rounded-full" style={{ padding: "12px 18px", background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
            <Icon name="search" size={15} color={t.textDim} />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search your ${type}`}
              className="flex-1 bg-transparent outline-none"
              style={{ fontSize: 14, color: "#fff" }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")}><Icon name="x" size={13} color={t.textDim} /></button>
            )}
          </div>
        </div>
      )}

      <div style={{ margin: "16px 20px 0", height: 1, background: "rgba(255,255,255,0.09)" }} />

      {type === "shows" && (
        <>
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

      {type === "movies" && (
        <>
          {!trimmedQuery && <RecommendedRow items={movieRecommended} onOpen={handleOpen} />}
          <div style={{ marginTop: 18 }}>
            <StatusFilterRow statusFilter={movieStatusFilter} counts={movieStatusCounts} onSelect={setMovieStatusFilter} items={MOVIE_STATUS_ITEMS} />
          </div>
          {movieGenreGroups.map(([genre, items]) => <Aisle key={genre} title={genre} items={items} onOpen={handleOpen} />)}
          {moviesLoaded && movieNothingToShow && (
            <div style={{ padding: "70px 20px", textAlign: "center", color: t.textDim, fontSize: 13.5 }}>
              {trimmedQuery ? "No movies match your search." : trackedMovies.length === 0 ? "Nothing in your library yet." : "No titles match this filter."}
            </div>
          )}
        </>
      )}

      <div style={{ height: 30 }} />

      {openShow && (
        type === "movies" ? (
          <MovieCaseOverlay
            show={openShow}
            origin={openOrigin}
            onClose={handleClose}
            onStatusChange={handleMovieStatusChange}
            onFavoriteChange={handleMovieFavoriteChange}
            onRemoved={handleMovieRemoved}
          />
        ) : (
          <CaseOverlay
            show={openShow}
            origin={openOrigin}
            onClose={handleClose}
            onStatusChange={handleStatusChange}
            onFavoriteChange={handleFavoriteChange}
            onRemoved={handleRemoved}
          />
        )
      )}
    </div>
  );
}
