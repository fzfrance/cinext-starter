"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import GlassCircle from "@/components/ui/GlassCircle";
import PosterArt from "@/components/ui/PosterArt";
import MediaFavoriteBadge from "@/components/ui/MediaFavoriteBadge";
import MediaStatusBadge from "@/components/ui/MediaStatusBadge";
import YearSlider from "@/components/YearSlider";
import { useAuth } from "@/lib/auth-context";
import { useShowCustomizations } from "@/lib/show-customizations-context";
import { getUserShows } from "@/lib/userShows";
import { getUserMovies } from "@/lib/userMovies";
import { getShowWatchSummary } from "@/lib/episodeWatches";
import { resolveShowStatus } from "@/lib/statusResolver";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { hrefForMedia, mediaKey } from "@/lib/media";
import { themes } from "@/lib/theme";
import { tmdbImage } from "@/lib/tmdb";

const t = themes.dark;

const STORAGE_KEY = "cinext:libraryFilters";
// Kept in memory for the lifetime of the current app session so returning
// from a title detail can put Browse All back exactly as it was, including
// pages loaded by infinite scroll. Persisting the (potentially large) result
// list in localStorage/sessionStorage would be wasteful; the compact query
// state is persisted separately below for reloads and future visits.
let browseAllSession = null;
const MIN_YEAR = 1990;
const MAX_YEAR = new Date().getFullYear();
// Single-direction year filter now — yearFrom is the one draggable value
// ("since {year}"), yearTo always stays the current year (no upper
// bound), so the API's existing yearFrom/yearTo shape didn't need to change.
const DEFAULT_FILTERS = { yearFrom: MIN_YEAR, yearTo: MAX_YEAR, platforms: [], languages: [], watchState: "all" };

// Curated genre chip set. genreIds is passed straight through as
// `with_genres` (comma = AND, pipe = OR) to /discover/tv, so a value like
// "80|9648" filters for Crime OR Mystery in one request.
//
// TMDB's real TV genre taxonomy is narrower than this requested chip
// list — it has no distinct Thriller, Horror, or Romance genre for TV
// (those exist for movies, but /discover/tv only accepts TV genre ids),
// and Action/Adventure and Sci-Fi/Fantasy are each a single combined TV
// genre, not two separate ones. Rather than silently returning nothing
// for the genres TMDB doesn't have, each maps to the closest real TV
// genre id(s) instead:
//   Action, Adventure       -> 10759 (TMDB's single "Action & Adventure")
//   Sci-Fi, Fantasy         -> 10765 (TMDB's single "Sci-Fi & Fantasy")
//   Thriller                -> 80|9648 (Crime OR Mystery — the closest real overlap)
//   Horror                  -> 9648 (Mystery — closest single real genre)
//   Romance                 -> 18 (Drama — TMDB TV shows with romance are almost always tagged Drama)
const GENRES = [
  { name: "All", genreIds: null },
  { name: "Drama", genreIds: "18" },
  { name: "Action", genreIds: "10759" },
  { name: "Comedy", genreIds: "35" },
  { name: "Thriller", genreIds: "80|9648" },
  { name: "Crime", genreIds: "80" },
  { name: "Mystery", genreIds: "9648" },
  { name: "Sci-Fi", genreIds: "10765" },
  { name: "Fantasy", genreIds: "10765" },
  { name: "Adventure", genreIds: "10759" },
  { name: "Romance", genreIds: "18" },
  { name: "Horror", genreIds: "9648" },
  { name: "Animation", genreIds: "16" },
  { name: "Documentary", genreIds: "99" },
  { name: "Family", genreIds: "10751" },
];

// Movie genre chip set — real, distinct TMDB movie genre ids throughout,
// unlike GENRES above: movies have Horror/Thriller/Romance/War/Sci-Fi/
// Fantasy/Action/Adventure as their own real ids (TMDB's movie taxonomy
// is the wider of the two), so none of GENRES' fallback-mapping comment
// applies here.
const MOVIE_GENRES = [
  { name: "All", genreIds: null },
  { name: "Drama", genreIds: "18" },
  { name: "Action", genreIds: "28" },
  { name: "Comedy", genreIds: "35" },
  { name: "Thriller", genreIds: "53" },
  { name: "Crime", genreIds: "80" },
  { name: "Mystery", genreIds: "9648" },
  { name: "Sci-Fi", genreIds: "878" },
  { name: "Fantasy", genreIds: "14" },
  { name: "Adventure", genreIds: "12" },
  { name: "Romance", genreIds: "10749" },
  { name: "Horror", genreIds: "27" },
  { name: "War", genreIds: "10752" },
  { name: "Animation", genreIds: "16" },
  { name: "Documentary", genreIds: "99" },
  { name: "Family", genreIds: "10751" },
];

// Real TMDB watch-provider ids (same source as the retired
// browse/platform page). mono/color are only a fallback for whichever
// provider a given region's watch-providers response doesn't include —
// the real logo (providerLogos, fetched server-side in page.jsx) is
// preferred whenever available.
const PLATFORMS = [
  { id: 8, name: "Netflix", mono: "N", color: "#d9382f" },
  { id: 1899, name: "Max", mono: "M", color: "#8060ff" },
  { id: 337, name: "Disney+", mono: "D+", color: "#2a7ae4" },
  { id: 350, name: "Apple TV+", mono: "TV", color: "#c8c8cf" },
  { id: 9, name: "Prime Video", mono: "P", color: "#33c7ee" },
  { id: 15, name: "Hulu", mono: "H", color: "#3ddc84" },
  { id: 531, name: "Paramount+", mono: "P+", color: "#4a7fd9" },
  { id: 386, name: "Peacock", mono: "PC", color: "#cd6fd6" },
  { id: 283, name: "Crunchyroll", mono: "CR", color: "#f47521" },
];

// A flat, un-split language list (unlike the retired browse/language
// page's English UK/USA + Mandarin China/Taiwan split) — matches what
// this page's own spec asked for: a plain, searchable "Languages" list.
const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "ko", name: "Korean" },
  { code: "ja", name: "Japanese" },
  { code: "zh", name: "Chinese" },
  { code: "th", name: "Thai" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "hi", name: "Hindi" },
  { code: "ar", name: "Arabic" },
  { code: "ru", name: "Russian" },
  { code: "tr", name: "Turkish" },
  { code: "sv", name: "Swedish" },
  { code: "nl", name: "Dutch" },
  { code: "pl", name: "Polish" },
];

async function fetchLibrary({ genre, yearFrom, yearTo, platforms, languages, contentType, page = 1 }) {
  const params = new URLSearchParams();
  if (genre) params.set("genre", genre);
  if (yearFrom) params.set("yearFrom", yearFrom);
  if (yearTo) params.set("yearTo", yearTo);
  if (platforms.length) params.set("platforms", platforms.join(","));
  if (languages.length) params.set("languages", languages.join(","));
  if (contentType) params.set("contentType", contentType);
  params.set("page", page);
  const res = await fetch(`/api/shows/discover-library?${params.toString()}`);
  return res.json();
}

// Defensive against duplicate items across pages (the multi-language/
// mixed-media-type fan-out in particular can't overlap by definition, but
// a rapid genre/filter switch racing with an in-flight load-more, or TMDB
// itself shifting page boundaries between requests, both could otherwise
// show the same item twice). Keyed on the composite mediaType-id string
// (lib/media.js's mediaKey) — a bare numeric id isn't unique once movies
// and TV shows are pooled together, since the two id spaces can collide.
function dedupeByKey(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = mediaKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

// How many filter *categories* (not individual selections) are actually
// constraining the grid right now — backs the small badge count on the
// filter icon. Year only counts once it's actually been narrowed from
// the full default range, not just because the slider exists.
function activeFilterCount(f) {
  let n = 0;
  if (f.yearFrom !== MIN_YEAR) n++;
  if (f.platforms.length > 0) n++;
  if (f.languages.length > 0) n++;
  if (f.watchState !== "all") n++;
  return n;
}

function BrowsePosterCard({ item, status }) {
  const { getCustomPoster } = useShowCustomizations();
  return (
    <Link href={hrefForMedia(item)} className="block active:scale-95 transition cursor-pointer">
      <div className="relative rounded-xl overflow-hidden" style={{ aspectRatio: "2 / 3", boxShadow: "0 6px 16px rgba(0,0,0,0.45)" }}>
        <PosterArt posterPath={item.posterPath} overrideSrc={item.mediaType === "movie" ? undefined : getCustomPoster(item.id)} alt={item.title} tmdbSize="w342" sizes="30vw" />
        {status ? <MediaStatusBadge status={status} /> : <MediaFavoriteBadge item={item} source="ExploreBrowseAll:favoriteBadge" />}
      </div>
      <div className="mt-1.5 text-[11.5px] font-semibold text-white" style={{ lineHeight: 1.2, minHeight: "2.4em", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.title}</div>
      <div className="text-[10px] mt-0.5" style={{ color: t.textDim }}>{[item.rating ? `★ ${item.rating}` : null, item.year].filter(Boolean).join(" · ")}</div>
    </Link>
  );
}

export default function LibraryClient({ providerLogos = {} }) {
  const router = useRouter();
  const { user } = useAuth();
  const readableLanguages = useReadableLanguages();
  const restoredSessionRef = useRef(browseAllSession);
  const restoredSession = restoredSessionRef.current;
  const skipInitialFetchRef = useRef(Boolean(restoredSession));

  const [activeGenre, setActiveGenre] = useState(restoredSession?.activeGenre ?? null);
  // "movie" | "tv" | null ("All" — mixed by default, per the movies-as-
  // content-type plan). Lifted outside appliedFilters/draftFilters
  // (unlike Year/Platforms/Language) — the always-visible genre chip row
  // needs this immediately to swap which genre-id list it's showing,
  // independent of the dropdown's own draft/apply gate, and the in-
  // dropdown toggle below writes to it directly for the same reason
  // (takes effect immediately, like the genre chips do, not gated behind
  // "Show Results").
  const [contentType, setContentType] = useState(restoredSession?.contentType ?? null);
  const changeContentType = (next) => {
    setContentType(next);
    // A TV genre id is meaningless as a movie with_genres value and vice
    // versa (see MOVIE_GENRES' own comment on where the two id spaces
    // diverge) — resetting is required for correctness, not just UX
    // polish.
    setActiveGenre(null);
  };
  const [appliedFilters, setAppliedFilters] = useState(restoredSession?.appliedFilters ?? DEFAULT_FILTERS);
  const [hydrated, setHydrated] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState(DEFAULT_FILTERS);
  const [draftCount, setDraftCount] = useState(null);

  const [shows, setShows] = useState(restoredSession?.shows ?? []);
  const [totalCount, setTotalCount] = useState(restoredSession?.totalCount ?? 0);
  const [totalPages, setTotalPages] = useState(restoredSession?.totalPages ?? 0);
  const [page, setPage] = useState(restoredSession?.page ?? 1);
  const [loading, setLoading] = useState(!restoredSession);
  const [loadingMore, setLoadingMore] = useState(false);
  const [resolvedStatusMap, setResolvedStatusMap] = useState({});
  const [statusLoaded, setStatusLoaded] = useState(false);
  // Bumped every time the genre/filters reset-fetch below starts — loadMore
  // captures the generation it was called under and discards its response
  // if the user switched genre/filters again before that page came back,
  // so a stale page for the *previous* query can't get appended onto the
  // new one's freshly-cleared list.
  const generationRef = useRef(0);

  useEffect(() => {
    if (!user) { setResolvedStatusMap({}); setStatusLoaded(true); return; }
    let cancelled = false;
    setStatusLoaded(false);
    (async () => {
      const [byShow, byMovie] = await Promise.all([
        getUserShows(user.id),
        getUserMovies(user.id).catch((err) => { console.error(err); return {}; }),
      ]);
      if (cancelled) return;
      const map = {};
      for (const [id, entry] of Object.entries(byShow)) map[`tv-${id}`] = entry.status;
      for (const [id, entry] of Object.entries(byMovie)) map[`movie-${id}`] = entry.status;
      setResolvedStatusMap(map);
      setStatusLoaded(true);

      const ids = Object.keys(byShow).map(Number);
      const resolvableIds = ids.filter((id) => byShow[id].status !== "paused" && byShow[id].status !== "drop");
      if (resolvableIds.length === 0) return;
      const summary = await getShowWatchSummary(user.id, resolvableIds);
      const res = await fetch("/api/shows/library-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shows: resolvableIds.map((id) => ({ id, needsProgress: true, watched: summary[id]?.watchedKeys ?? [] })) }),
      });
      const { results } = await res.json();
      if (cancelled) return;
      const byId = Object.fromEntries(results.map((result) => [result.id, result]));
      setResolvedStatusMap((prev) => {
        const next = { ...prev };
        for (const id of resolvableIds) {
          const result = byId[id];
          if (!result) continue;
          next[`tv-${id}`] = resolveShowStatus({
            explicitStatus: byShow[id].status,
            watchedReleasedEpisodes: result.watchedReleasedEpisodes ?? 0,
            releasedEpisodes: result.releasedEpisodes ?? 0,
          });
        }
        return next;
      });
    })().catch((err) => { console.error(err); if (!cancelled) setStatusLoaded(true); });
    return () => { cancelled = true; };
  }, [user]);

  // Restores last visit's complete query once, before the first real fetch below
  // — `hydrated` gates that fetch so it runs exactly once with the
  // correct selection, not once with defaults and then again right after.
  // The old storage shape contained the filters directly, so accepting
  // both shapes preserves existing users' saved preferences.
  useEffect(() => {
    if (restoredSessionRef.current) {
      setHydrated(true);
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const savedFilters = saved.appliedFilters ?? saved;
        setAppliedFilters({ ...DEFAULT_FILTERS, ...savedFilters });
        if (saved.contentType === "movie" || saved.contentType === "tv") {
          setContentType(saved.contentType);
        }
        if (typeof saved.activeGenre === "string") setActiveGenre(saved.activeGenre);
      }
    } catch (err) {
      console.error("Failed to restore library filters:", err);
    }
    setHydrated(true);
  }, []);

  // Persist the compact selection so a reload still keeps Type, Language,
  // Genre, and the other filters. The loaded result pages themselves stay
  // in the in-memory session snapshot used for detail-page back navigation.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        activeGenre,
        contentType,
        appliedFilters,
      }));
    } catch (err) {
      console.error("Failed to save library filters:", err);
    }
  }, [hydrated, activeGenre, contentType, appliedFilters]);

  // Genre or filters changed — reset to page 1 and clear the previous
  // list rather than appending, so switching genres (or applying filters)
  // never mixes results from two different queries together. Bumping
  // generationRef invalidates any load-more request already in flight for
  // the query being switched away from (see loadMore below).
  useEffect(() => {
    if (!hydrated) return;
    // A detail-page return already has the exact loaded result set. Keep it
    // intact instead of replacing it with page one, which would also make
    // the saved scroll position impossible to restore.
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      return;
    }
    generationRef.current += 1;
    const generation = generationRef.current;
    let cancelled = false;
    setLoading(true);
    setShows([]);
    setPage(1);
    fetchLibrary({ genre: activeGenre, ...appliedFilters, contentType, page: 1 })
      .then((data) => {
        if (cancelled || generation !== generationRef.current) return;
        setShows(dedupeByKey(data.results ?? []));
        setTotalCount(data.totalResults ?? 0);
        setTotalPages(data.totalPages ?? 0);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load library:", err);
        if (!cancelled && generation === generationRef.current) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [hydrated, activeGenre, appliedFilters, contentType]);

  // Restore only after the cached grid has mounted. Two animation frames
  // allow its layout to be measured before applying the saved document
  // offset, avoiding the visible jump to the top on iOS/iPadOS Safari.
  useEffect(() => {
    const restored = restoredSessionRef.current;
    if (!hydrated || !restored) return;
    let secondFrame;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => window.scrollTo(0, restored.scrollY ?? 0));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
    };
  }, [hydrated]);

  // Infinite scroll — appends the next page for the *current* genre/
  // filters only. Guarded by generationRef so a page that was still in
  // flight when the user switched genre/filters can't land afterward and
  // get appended onto the new (unrelated) list.
  const hasMore = page < totalPages;
  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    const generation = generationRef.current;
    const nextPage = page + 1;
    setLoadingMore(true);
    fetchLibrary({ genre: activeGenre, ...appliedFilters, contentType, page: nextPage })
      .then((data) => {
        if (generation !== generationRef.current) return;
        setShows((prev) => dedupeByKey([...prev, ...(data.results ?? [])]));
        setPage(nextPage);
        setLoadingMore(false);
      })
      .catch((err) => {
        console.error("Failed to load more library results:", err);
        if (generation === generationRef.current) setLoadingMore(false);
      });
  }, [loading, loadingMore, hasMore, page, activeGenre, appliedFilters, contentType]);

  // Sentinel div at the bottom of the grid — IntersectionObserver fires
  // loadMore once it scrolls into view, the standard infinite-scroll
  // trigger pattern (no scroll-position math needed).
  const sentinelRef = useRef(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMore();
    }, { rootMargin: "600px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  // Live result count while the dropdown is open — debounced so dragging
  // the year slider doesn't fire a request per pixel. Genre stays part of
  // the count even though it's outside the dropdown, since it's still an
  // active constraint on the grid underneath.
  useEffect(() => {
    if (!dropdownOpen) return;
    if (draftFilters.watchState !== "all") { setDraftCount(null); return; }
    let cancelled = false;
    const handle = setTimeout(() => {
      fetchLibrary({ genre: activeGenre, ...draftFilters, contentType })
        .then((data) => { if (!cancelled) setDraftCount(data.totalResults ?? 0); })
        .catch(() => { if (!cancelled) setDraftCount(null); });
    }, 400);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [dropdownOpen, activeGenre, draftFilters, contentType]);

  const openDropdown = () => {
    setDraftFilters(appliedFilters);
    setDraftCount(totalCount);
    setDropdownOpen(true);
  };
  // Dismissing without pressing "Show Results" — draft is simply
  // discarded, appliedFilters (and therefore the grid) never changes.
  const dismissDropdown = () => setDropdownOpen(false);
  const applyFilters = () => {
    setAppliedFilters(draftFilters);
    setDropdownOpen(false);
  };

  // Runs during the capture phase before a poster link changes routes.
  // Keeping the rendered pages as well as the query is what lets Back
  // return to an item beyond the first infinite-scroll page.
  const rememberBrowsePosition = useCallback(() => {
    browseAllSession = {
      activeGenre,
      contentType,
      appliedFilters,
      shows,
      totalCount,
      totalPages,
      page,
      scrollY: window.scrollY,
    };
  }, [activeGenre, contentType, appliedFilters, shows, totalCount, totalPages, page]);

  const filterCount = activeFilterCount(appliedFilters);
  const visibleShows = appliedFilters.watchState !== "all" && !statusLoaded ? [] : shows.filter((item) => {
    if (appliedFilters.watchState === "all") return true;
    const completed = resolvedStatusMap[mediaKey(item)] === "completed";
    return appliedFilters.watchState === "watched" ? completed : !completed;
  });

  return (
    <>
      <div className="flex items-center justify-between px-6" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <GlassCircle onClick={() => router.back()} t={t}><Icon name="back" size={16} color={t.text} /></GlassCircle>
        <span style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>Browse All</span>
        <div className="relative">
          <GlassCircle onClick={openDropdown} t={t}><Icon name="filter" size={16} color={t.text} /></GlassCircle>
          {filterCount > 0 && (
            <div className="absolute flex items-center justify-center rounded-full" style={{ top: -4, right: -4, minWidth: 16, height: 16, padding: "0 3px", background: "#fff" }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#111" }}>{filterCount}</span>
            </div>
          )}
          {dropdownOpen && (
            <FilterDropdown
              draftFilters={draftFilters}
              setDraftFilters={setDraftFilters}
              draftCount={draftCount}
              providerLogos={providerLogos}
              contentType={contentType}
              onChangeContentType={changeContentType}
              onClose={dismissDropdown}
              onApply={applyFilters}
            />
          )}
        </div>
      </div>

      {/* Genre chips — the primary browsing method, always visible, not
          tucked into the filter dropdown. Only shown once content type is
          narrowed to Movie or TV Show: movie and TV genre id spaces
          diverge for several genres (Horror/Thriller/Romance/War/Sci-Fi/
          Fantasy/Action/Adventure — see MOVIE_GENRES' own comment), so
          there's no single genre id list that's correct for both at once
          in the default mixed ("All") view. */}
      {contentType != null && (
        <div className="flex gap-2 overflow-x-auto px-6" style={{ marginTop: 18, scrollbarWidth: "none" }}>
          {(contentType === "movie" ? MOVIE_GENRES : GENRES).map((g) => {
            const isActive = activeGenre === g.genreIds;
            return (
              <button
                key={g.name}
                onClick={() => setActiveGenre(g.genreIds)}
                className="flex-shrink-0 rounded-full active:scale-95 transition"
                style={{ padding: "8px 16px", background: isActive ? "#fff" : t.cardFill, border: `1px solid ${isActive ? "transparent" : t.cardBorder}` }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: isActive ? "#111" : "#fff" }}>{g.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="px-6" style={{ marginTop: 18, marginBottom: 10, fontSize: 13, color: t.textDim }}>
        {loading || (appliedFilters.watchState !== "all" && !statusLoaded)
          ? "Loading…"
          : appliedFilters.watchState === "all"
          ? `${totalCount} title${totalCount === 1 ? "" : "s"}`
          : `${visibleShows.length} matching loaded title${visibleShows.length === 1 ? "" : "s"}`}
      </div>

      <div className="px-6" style={{ paddingBottom: 32 }} onClickCapture={rememberBrowsePosition}>
        <div className="grid grid-cols-3 gap-x-3 gap-y-5">
          {visibleShows.map((s) => (
            <BrowsePosterCard key={mediaKey(s)} item={{ ...s, title: resolveTitle(s, readableLanguages) }} status={resolvedStatusMap[mediaKey(s)] ?? null} />
          ))}
        </div>
        {!loading && statusLoaded && visibleShows.length === 0 && (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: t.textDim }}>Nothing matches these filters.</div>
        )}
        {/* Sentinel for infinite scroll — invisible, just a trigger point
            for the IntersectionObserver above; the actual loading feedback
            is the text below it. Only rendered once there's an initial
            page to have "more" relative to. */}
        {!loading && hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
        {loadingMore && (
          <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: t.textDim }}>Loading more…</div>
        )}
      </div>
    </>
  );
}

// Small anchored liquid-glass dropdown (matches the frosted-blur treatment
// used elsewhere, e.g. Edit Profile's source-picker menus), not a
// full-screen bottom sheet — floats just below the filter button.
function FilterDropdown({ draftFilters, setDraftFilters, draftCount, providerLogos, contentType, onChangeContentType, onClose, onApply }) {
  const [languageQuery, setLanguageQuery] = useState("");
  const filteredLanguages = LANGUAGES.filter((l) => l.name.toLowerCase().includes(languageQuery.trim().toLowerCase()));

  const togglePlatform = (id) => setDraftFilters((prev) => ({
    ...prev,
    platforms: prev.platforms.includes(id) ? prev.platforms.filter((p) => p !== id) : [...prev.platforms, id],
  }));
  const toggleLanguage = (code) => setDraftFilters((prev) => ({
    ...prev,
    languages: prev.languages.includes(code) ? prev.languages.filter((l) => l !== code) : [...prev.languages, code],
  }));

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute z-50 rounded-2xl overflow-hidden"
        style={{ top: "calc(100% + 8px)", right: 0, width: 300, background: "rgba(22,18,14,0.97)", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", boxShadow: "0 20px 50px rgba(0,0,0,0.6)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-y-auto" style={{ maxHeight: "60vh", padding: "18px 18px 4px" }}>
          {/* Content type — single-select, 3-way (All / Movie / TV Show),
              same pill-toggle visual pattern as Platforms/Language below.
              Deliberately writes straight to the lifted contentType state
              (via onChangeContentType) instead of through
              draftFilters/setDraftFilters — takes effect immediately, like
              the always-visible genre chips do, rather than waiting on
              "Show Results" the way Year/Platforms/Language do. */}
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#fff", marginBottom: 10 }}>Type</div>
          <div className="flex gap-2" style={{ marginBottom: 22 }}>
            {[{ id: null, label: "All" }, { id: "movie", label: "Movies" }, { id: "tv", label: "TV Shows" }].map((opt) => {
              const selected = contentType === opt.id;
              return (
                <button
                  key={opt.label}
                  onClick={() => onChangeContentType(opt.id)}
                  className="rounded-full active:scale-95 transition"
                  style={{ padding: "7px 14px", background: selected ? "#fff" : "rgba(255,255,255,0.05)", border: `1px solid ${selected ? "#fff" : t.cardBorder}` }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: selected ? "#111" : "#fff" }}>{opt.label}</span>
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#fff", marginBottom: 10 }}>Watch Status</div>
          <div className="flex gap-2" style={{ marginBottom: 22 }}>
            {[{ id: "all", label: "All" }, { id: "watched", label: "Watched" }, { id: "notWatched", label: "Not Watched" }].map((opt) => {
              const selected = draftFilters.watchState === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setDraftFilters((prev) => ({ ...prev, watchState: opt.id }))}
                  className="rounded-full active:scale-95 transition"
                  style={{ padding: "7px 12px", background: selected ? "#fff" : "rgba(255,255,255,0.05)", border: `1px solid ${selected ? "#fff" : t.cardBorder}` }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: selected ? "#111" : "#fff", whiteSpace: "nowrap" }}>{opt.label}</span>
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#fff", marginBottom: 14 }}>Year</div>
          <YearSlider
            min={MIN_YEAR}
            max={MAX_YEAR}
            value={draftFilters.yearFrom}
            onChange={(year) => setDraftFilters((prev) => ({ ...prev, yearFrom: year }))}
          />

          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#fff", margin: "22px 0 10px" }}>Streaming Platforms</div>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const selected = draftFilters.platforms.includes(p.id);
              const logoPath = providerLogos[p.id];
              return (
                <button
                  key={p.id}
                  onClick={() => togglePlatform(p.id)}
                  className="flex items-center gap-1.5 rounded-full active:scale-95 transition"
                  style={{ padding: "6px 10px 6px 6px", background: selected ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.05)", border: `1px solid ${selected ? "#fff" : t.cardBorder}` }}
                >
                  <div className="relative flex items-center justify-center rounded-full flex-shrink-0 overflow-hidden" style={{ width: 20, height: 20, background: logoPath ? "#fff" : p.color }}>
                    {logoPath ? (
                      <Image src={tmdbImage(logoPath, "w92")} alt="" fill sizes="20px" style={{ objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: 8, fontWeight: 800, color: "#fff" }}>{p.mono}</span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{p.name}</span>
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#fff", margin: "22px 0 10px" }}>Language</div>
          <div className="flex items-center gap-2 rounded-full" style={{ padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: `1px solid ${t.cardBorder}`, marginBottom: 10 }}>
            <Icon name="search" size={13} color={t.textDim} />
            <input
              value={languageQuery}
              onChange={(e) => setLanguageQuery(e.target.value)}
              placeholder="Search language..."
              className="flex-1 bg-transparent outline-none"
              style={{ fontSize: 12.5, color: "#fff" }}
            />
          </div>
          <div className="flex flex-wrap gap-2" style={{ paddingBottom: 14 }}>
            {filteredLanguages.map((l) => {
              const selected = draftFilters.languages.includes(l.code);
              return (
                <button
                  key={l.code}
                  onClick={() => toggleLanguage(l.code)}
                  className="rounded-full active:scale-95 transition"
                  style={{ padding: "7px 12px", background: selected ? "#fff" : "rgba(255,255,255,0.05)", border: `1px solid ${selected ? "#fff" : t.cardBorder}` }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: selected ? "#111" : "#fff" }}>{l.name}</span>
                </button>
              );
            })}
            {filteredLanguages.length === 0 && (
              <span style={{ fontSize: 12, color: t.textDim }}>No languages match &quot;{languageQuery}&quot;.</span>
            )}
          </div>
        </div>

        <div className="flex-shrink-0" style={{ padding: "10px 18px 18px" }}>
          <button onClick={onApply} className="w-full rounded-full active:scale-95 transition" style={{ padding: 13, background: "#fff" }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "#111" }}>
              {draftCount == null ? "Show Results" : `Show ${draftCount} Result${draftCount === 1 ? "" : "s"}`}
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
