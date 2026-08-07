"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import PosterArt from "@/components/ui/PosterArt";
import StatusMenu, { statusMenuOptions } from "@/components/StatusMenu";
import ExploreClient from "@/app/(tabs)/explore/ExploreClient";
import { useFavorites } from "@/lib/favorites-context";
import { useLibraryStatus } from "@/lib/useLibraryStatus";
import { backWithTransition } from "@/lib/viewTransition";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

const statusIconFor = (status) => statusMenuOptions.find((o) => o.id === status)?.icon || "plus";

// Same row layout as Explore's own (now-removed) inline search results —
// kept as its own copy here rather than a shared export, since Explore's
// version was tightly coupled to that file's local statusMap/favorite
// wiring; this is the one other call site.
function SearchResultRow({ item, status, menuOpen, onToggleMenu, onSelectStatus, favorite, onToggleFavorite }) {
  return (
    <div className="relative flex gap-3 rounded-2xl" style={{ padding: 12, background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
      <Link href={`/show/${item.id}`} className="flex flex-1 min-w-0 gap-3">
        <div className="relative flex-shrink-0 rounded-xl overflow-hidden" style={{ width: 68, height: 96 }}>
          <PosterArt posterPath={item.posterPath} base={item.base} glow={item.glow} alt={item.title} />
          {favorite && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavorite(); }}
              className="absolute flex items-center justify-center active:scale-90 transition"
              style={{ top: 6, right: 6, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.5)" }}
            >
              <Icon name="heart" size={13} color="#e0567a" />
            </button>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-1.5">
            <Icon name="tv" size={12.5} color={accent} strokeWidth={2} />
            <span style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.04em" }}>TV SHOW</span>
          </div>
          <div className="text-white font-bold mt-1" style={{ fontSize: 15, lineHeight: 1.25 }}>{item.title}</div>
          <div className="text-[12px] mt-1" style={{ color: t.textDim }}>{item.date}</div>
          <div className="flex items-center gap-1 mt-1.5">
            <Icon name="star" size={11} color={accent} />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#fff" }}>{item.rating}</span>
            <span style={{ fontSize: 11.5, color: t.textDim }}>/10 ({item.votes})</span>
          </div>
        </div>
      </Link>
      <div className="relative flex-shrink-0 self-center">
        <button onClick={onToggleMenu} className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition" style={{ background: accent }}>
          <Icon name={statusIconFor(status)} size={16} color="#fff" strokeWidth={2.2} />
        </button>
        {menuOpen && <StatusMenu status={status} onSelect={onSelectStatus} align="right" includeRemove={!!status} />}
      </div>
    </div>
  );
}

export default function SearchClient({ trending, heroSlides }) {
  const router = useRouter();
  const readableLanguages = useReadableLanguages();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { resolvedStatusMap, selectStatus } = useLibraryStatus("Search");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState(null);

  // Debounced live TMDB search — same pattern as Explore's own (waits for
  // a pause in typing, drops stale responses if the query changed mid-flight).
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === "") { setResults([]); setLoading(false); return; }
    setLoading(true);
    let cancelled = false;
    const handle = setTimeout(() => {
      fetch(`/api/search/shows?q=${encodeURIComponent(trimmed)}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          setResults((data.results ?? []).map((show) => ({
            id: show.id,
            title: show.name,
            originalTitle: show.original_name ?? null,
            originalLanguage: show.original_language ?? null,
            date: show.first_air_date ? show.first_air_date.slice(0, 4) : "TBA",
            rating: show.vote_average ? show.vote_average.toFixed(1) : "0.0",
            votes: show.vote_count ?? 0,
            posterPath: show.poster_path,
          })));
        })
        .catch((err) => { if (!cancelled) { console.error("Search failed:", err); setResults([]); } })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [query]);

  const resolvedResults = results.map((s) => ({ ...s, title: resolveTitle(s, readableLanguages) }));
  const trimmed = query.trim();

  return (
    <div className="fixed inset-0 z-50" style={{ background: t.bg }}>
      {/* The unchanged Explore experience (hero, genre chips, Trending
          Now, For You, Browse All) stays visible/scrollable behind the
          fixed bottom search bar whenever there's no query — this is the
          same page, same layout, same data, just with the search bar
          floating over it. Typing swaps this area to live TMDB results;
          clearing the query brings Explore back. paddingBottom on the
          results view clears the fixed bar's own height + safe area (
          ExploreClient already accounts for the global nav's own height
          in its internal spacing, which doubles as clearance here too). */}
      {trimmed === "" ? (
        <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "none", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 90px)" }}>
          <ExploreClient trending={trending} heroSlides={heroSlides} />
        </div>
      ) : (
        <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "none", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 104px)" }}>
          <div className="px-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>Search Results</div>
          </div>
          <div className="px-6 flex flex-col gap-2.5" style={{ marginTop: 16 }}>
            {resolvedResults.map((item) => (
              <SearchResultRow
                key={item.id}
                item={item}
                status={resolvedStatusMap[item.id]}
                menuOpen={menuOpenFor === item.id}
                onToggleMenu={() => setMenuOpenFor((v) => (v === item.id ? null : item.id))}
                onSelectStatus={(statusId) => { selectStatus(item, statusId); setMenuOpenFor(null); }}
                favorite={isFavorite(item.id)}
                onToggleFavorite={() => toggleFavorite(item.id, "Search:resultRow")}
              />
            ))}
            {loading && results.length === 0 && (
              <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: t.textDim }}>Searching…</div>
            )}
            {!loading && results.length === 0 && (
              <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: t.textDim }}>No shows found for &quot;{query}&quot;.</div>
            )}
          </div>
        </div>
      )}

      {/* Bottom search bar — a circular liquid-glass button using the
          app's backgroundless logo mark (transparent PNG, sits directly
          on the button's own glass fill rather than a cropped square)
          closes back to wherever this screen was opened from; input
          takes the rest of the width. An X appears inside the input, but
          only once there's actually a query — clearing it (rather than
          navigating away) is what brings the Explore content back
          underneath. */}
      <div className="fixed left-0 right-0 flex items-center gap-2.5 px-4" style={{ bottom: 0, paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6px)", paddingTop: 12 }}>
        <button
          onClick={() => backWithTransition(router)}
          className="flex items-center justify-center rounded-full overflow-hidden active:scale-90 transition flex-shrink-0"
          style={{ width: 50, height: 50, background: t.cardFill, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a local static asset, not a next/image-managed remote path */}
          <img src="/cinext-logo-glass.png" alt="Cinext" className="w-full h-full" style={{ objectFit: "contain", padding: 3.75 }} />
        </button>

        <div className="flex-1 flex items-center gap-2.5 rounded-full" style={{ padding: "13px 18px", background: t.cardFill, border: `1px solid ${t.cardBorder}`, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}>
          <Icon name="search" size={16} color={t.textDim} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or actor"
            className="flex-1 bg-transparent outline-none"
            style={{ fontSize: 14.5, color: "#fff" }}
          />
          {trimmed !== "" && (
            <button onClick={() => setQuery("")} className="flex-shrink-0 active:scale-90 transition">
              <Icon name="x" size={15} color={t.textDim} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
