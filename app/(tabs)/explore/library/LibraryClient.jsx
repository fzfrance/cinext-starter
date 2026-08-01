"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import GlassCircle from "@/components/ui/GlassCircle";
import PosterCard from "@/components/ui/PosterCard";
import PosterGrid from "@/components/ui/PosterGrid";
import YearSlider from "@/components/YearSlider";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { themes } from "@/lib/theme";
import { tmdbImage } from "@/lib/tmdb";

const t = themes.dark;

const STORAGE_KEY = "cinext:libraryFilters";
const MIN_YEAR = 1990;
const MAX_YEAR = new Date().getFullYear();
// Single-direction year filter now — yearFrom is the one draggable value
// ("since {year}"), yearTo always stays the current year (no upper
// bound), so the API's existing yearFrom/yearTo shape didn't need to change.
const DEFAULT_FILTERS = { yearFrom: MIN_YEAR, yearTo: MAX_YEAR, platforms: [], languages: [] };

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

async function fetchLibrary({ genre, yearFrom, yearTo, platforms, languages, page = 1 }) {
  const params = new URLSearchParams();
  if (genre) params.set("genre", genre);
  if (yearFrom) params.set("yearFrom", yearFrom);
  if (yearTo) params.set("yearTo", yearTo);
  if (platforms.length) params.set("platforms", platforms.join(","));
  if (languages.length) params.set("languages", languages.join(","));
  params.set("page", page);
  const res = await fetch(`/api/shows/discover-library?${params.toString()}`);
  return res.json();
}

// Defensive against duplicate TMDB ids across pages (the multi-language
// fan-out in particular can't overlap by definition, but a rapid
// genre/filter switch racing with an in-flight load-more, or TMDB itself
// shifting page boundaries between requests, both could otherwise show the
// same show twice).
function dedupeById(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
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
  return n;
}

export default function LibraryClient({ providerLogos = {} }) {
  const router = useRouter();
  const readableLanguages = useReadableLanguages();

  const [activeGenre, setActiveGenre] = useState(null);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [hydrated, setHydrated] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState(DEFAULT_FILTERS);
  const [draftCount, setDraftCount] = useState(null);

  const [shows, setShows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Bumped every time the genre/filters reset-fetch below starts — loadMore
  // captures the generation it was called under and discards its response
  // if the user switched genre/filters again before that page came back,
  // so a stale page for the *previous* query can't get appended onto the
  // new one's freshly-cleared list.
  const generationRef = useRef(0);

  // Restores last visit's filters once, before the first real fetch below
  // — `hydrated` gates that fetch so it runs exactly once with the
  // correct (possibly restored) filters, not once with defaults and then
  // again right after.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setAppliedFilters({ ...DEFAULT_FILTERS, ...JSON.parse(raw) });
    } catch (err) {
      console.error("Failed to restore library filters:", err);
    }
    setHydrated(true);
  }, []);

  // Genre or filters changed — reset to page 1 and clear the previous
  // list rather than appending, so switching genres (or applying filters)
  // never mixes results from two different queries together. Bumping
  // generationRef invalidates any load-more request already in flight for
  // the query being switched away from (see loadMore below).
  useEffect(() => {
    if (!hydrated) return;
    generationRef.current += 1;
    const generation = generationRef.current;
    let cancelled = false;
    setLoading(true);
    setShows([]);
    setPage(1);
    fetchLibrary({ genre: activeGenre, ...appliedFilters, page: 1 })
      .then((data) => {
        if (cancelled || generation !== generationRef.current) return;
        setShows(dedupeById(data.results ?? []));
        setTotalCount(data.totalResults ?? 0);
        setTotalPages(data.totalPages ?? 0);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load library:", err);
        if (!cancelled && generation === generationRef.current) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [hydrated, activeGenre, appliedFilters]);

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
    fetchLibrary({ genre: activeGenre, ...appliedFilters, page: nextPage })
      .then((data) => {
        if (generation !== generationRef.current) return;
        setShows((prev) => dedupeById([...prev, ...(data.results ?? [])]));
        setPage(nextPage);
        setLoadingMore(false);
      })
      .catch((err) => {
        console.error("Failed to load more library results:", err);
        if (generation === generationRef.current) setLoadingMore(false);
      });
  }, [loading, loadingMore, hasMore, page, activeGenre, appliedFilters]);

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
    let cancelled = false;
    const handle = setTimeout(() => {
      fetchLibrary({ genre: activeGenre, ...draftFilters })
        .then((data) => { if (!cancelled) setDraftCount(data.totalResults ?? 0); })
        .catch(() => { if (!cancelled) setDraftCount(null); });
    }, 400);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [dropdownOpen, activeGenre, draftFilters]);

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
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(draftFilters)); } catch (err) { console.error("Failed to save library filters:", err); }
    setDropdownOpen(false);
  };

  const filterCount = activeFilterCount(appliedFilters);

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
              onClose={dismissDropdown}
              onApply={applyFilters}
            />
          )}
        </div>
      </div>

      {/* Genre chips — the primary browsing method, always visible, not
          tucked into the filter dropdown. */}
      <div className="flex gap-2 overflow-x-auto px-6" style={{ marginTop: 18, scrollbarWidth: "none" }}>
        {GENRES.map((g) => {
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

      <div className="px-6" style={{ marginTop: 18, marginBottom: 10, fontSize: 13, color: t.textDim }}>
        {loading ? "Loading…" : `${totalCount} show${totalCount === 1 ? "" : "s"}`}
      </div>

      <div className="px-6" style={{ paddingBottom: 32 }}>
        <PosterGrid>
          {shows.map((s) => (
            <PosterCard
              key={s.id}
              show={{ ...s, title: resolveTitle(s, readableLanguages) }}
              href={`/show/${s.id}`}
              width="100%"
              titlePlacement="below"
              subtitle={[s.rating ? `★ ${s.rating}` : null, s.year].filter(Boolean).join(" · ")}
            />
          ))}
        </PosterGrid>
        {!loading && shows.length === 0 && (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: t.textDim }}>No shows match these filters.</div>
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
function FilterDropdown({ draftFilters, setDraftFilters, draftCount, providerLogos, onClose, onApply }) {
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
