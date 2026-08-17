"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import PosterArt from "@/components/ui/PosterArt";
import StatusMenu, { statusMenuOptions, movieStatusMenuOptions } from "@/components/StatusMenu";
import ExploreClient from "@/app/(tabs)/explore/ExploreClient";
import { useFavorites } from "@/lib/favorites-context";
import { useMovieFavorites } from "@/lib/movie-favorites-context";
import { useLibraryStatus } from "@/lib/useLibraryStatus";
import { backWithTransition } from "@/lib/viewTransition";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { hrefForMedia, badgeForMedia, mediaKey } from "@/lib/media";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// Mixed movies+shows in one list — icon lookup has to check the right
// vocabulary per item (movies only ever have watchlist/completed/remove,
// see components/StatusMenu.jsx's movieStatusMenuOptions), or a movie
// sitting at "completed" would fail to resolve an icon at all against the
// show-only list (which has no "Watched"-labeled completed entry gap —
// same id, but checking the wrong list first is still the wrong call if
// a mediaType ever diverges further).
const statusIconFor = (status, mediaType) => (mediaType === "movie" ? movieStatusMenuOptions : statusMenuOptions).find((o) => o.id === status)?.icon || "plus";

// Same row layout as Explore's own (now-removed) inline search results —
// kept as its own copy here rather than a shared export, since Explore's
// version was tightly coupled to that file's local statusMap/favorite
// wiring; this is the one other call site. Mixed movies + TV shows
// (movies-as-content-type plan) — reads its own favorites context based
// on item.mediaType, same branching MediaFavoriteBadge does for the
// grid-card surfaces.
function SearchResultRow({ item, status, menuOpen, onToggleMenu, onSelectStatus }) {
  const showFavorites = useFavorites();
  const movieFavorites = useMovieFavorites();
  const { isFavorite, toggleFavorite } = item.mediaType === "movie" ? movieFavorites : showFavorites;
  const favorite = isFavorite(item.id);
  const badge = badgeForMedia(item);

  return (
    <div className="relative flex gap-3 rounded-2xl" style={{ padding: 12, background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
      <Link href={hrefForMedia(item)} className="flex flex-1 min-w-0 gap-3">
        <div className="relative flex-shrink-0 rounded-xl overflow-hidden" style={{ width: 68, height: 96 }}>
          <PosterArt posterPath={item.posterPath} base={item.base} glow={item.glow} alt={item.title} />
          {favorite && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(item.id, "Search:resultRow"); }}
              className="absolute flex items-center justify-center active:scale-90 transition"
              style={{ top: 6, right: 6, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.5)" }}
            >
              <Icon name="heart" size={13} color="#e0567a" />
            </button>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.04em" }}>{badge.label}</span>
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
          <Icon name={statusIconFor(status, item.mediaType)} size={16} color="#fff" strokeWidth={2.2} />
        </button>
        {menuOpen && <StatusMenu status={status} onSelect={onSelectStatus} align="right" includeRemove={!!status} options={item.mediaType === "movie" ? movieStatusMenuOptions : statusMenuOptions} />}
      </div>
    </div>
  );
}

// Cast/crew result row — no status menu, no rating/date/favorite (none
// of that applies to a person), just their photo, name, and a couple of
// titles they're known for so the result reads as more than a bare
// name. Tapping goes to /person/[id], same page Show/Movie Detail's own
// cast rows already link to.
function SearchPersonRow({ item }) {
  return (
    <Link href={`/person/${item.id}`} className="flex items-center gap-3 rounded-2xl" style={{ padding: 12, background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
      <div className="relative flex-shrink-0 rounded-full overflow-hidden" style={{ width: 56, height: 56, background: t.cardFill }}>
        <PosterArt posterPath={item.profilePath} alt={item.name} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.04em" }}>CAST</span>
        </div>
        <div className="text-white font-bold mt-1" style={{ fontSize: 15, lineHeight: 1.25 }}>{item.name}</div>
        {item.knownFor && (
          <div className="text-[12px] mt-1" style={{ color: t.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.knownFor}</div>
        )}
      </div>
    </Link>
  );
}

export default function SearchClient({ trendingShows, trendingMovies, heroSlides }) {
  const router = useRouter();
  const readableLanguages = useReadableLanguages();
  const { resolvedStatusMap, selectStatus } = useLibraryStatus("Search");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState(null);

  // Debounced live TMDB search — same pattern as Explore's own (waits for
  // a pause in typing, drops stale responses if the query changed
  // mid-flight). /search/multi (movies-as-content-type plan) returns
  // movies, TV shows, AND people in one call, each tagged with its own
  // media_type — cast results get their own shape here (name/profilePath/
  // knownFor, no title/date/rating, none of which a person has), rendered
  // via SearchPersonRow below instead of SearchResultRow.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === "") { setResults([]); setLoading(false); return; }
    setLoading(true);
    let cancelled = false;
    const handle = setTimeout(() => {
      fetch(`/api/search/multi?q=${encodeURIComponent(trimmed)}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          setResults((data.results ?? []).map((item) => {
            if (item.media_type === "person") {
              return {
                id: item.id,
                mediaType: "person",
                name: item.name,
                profilePath: item.profile_path,
                // A couple of titles, not the raw known_for objects — same
                // "just enough context to recognize them" role the movie/
                // show rows' date+rating line plays.
                knownFor: (item.known_for ?? []).map((k) => k.title ?? k.name).filter(Boolean).slice(0, 3).join(", "),
              };
            }
            const isMovie = item.media_type === "movie";
            return {
              id: item.id,
              mediaType: isMovie ? "movie" : "tv",
              title: isMovie ? item.title : item.name,
              originalTitle: (isMovie ? item.original_title : item.original_name) ?? null,
              originalLanguage: item.original_language ?? null,
              date: (isMovie ? item.release_date : item.first_air_date)?.slice(0, 4) || "TBA",
              rating: item.vote_average ? item.vote_average.toFixed(1) : "0.0",
              votes: item.vote_count ?? 0,
              posterPath: item.poster_path,
            };
          }));
        })
        .catch((err) => { if (!cancelled) { console.error("Search failed:", err); setResults([]); } })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [query]);

  // resolveTitle needs a title/originalTitle/originalLanguage shape a
  // person result doesn't have — left untouched (mediaType stays
  // "person", nothing to resolve) rather than resolving into undefined.
  const resolvedResults = results.map((s) => (s.mediaType === "person" ? s : { ...s, title: resolveTitle(s, readableLanguages) }));
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
          <ExploreClient trendingShows={trendingShows} trendingMovies={trendingMovies} heroSlides={heroSlides} />
        </div>
      ) : (
        <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "none", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 104px)" }}>
          <div className="px-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>Search Results</div>
          </div>
          <div className="px-6 flex flex-col gap-2.5" style={{ marginTop: 16 }}>
            {resolvedResults.map((item) =>
              item.mediaType === "person" ? (
                <SearchPersonRow key={`person-${item.id}`} item={item} />
              ) : (
                <SearchResultRow
                  key={mediaKey(item)}
                  item={item}
                  status={resolvedStatusMap[mediaKey(item)]}
                  menuOpen={menuOpenFor === mediaKey(item)}
                  onToggleMenu={() => setMenuOpenFor((v) => (v === mediaKey(item) ? null : mediaKey(item)))}
                  onSelectStatus={(statusId) => { selectStatus(item, statusId); setMenuOpenFor(null); }}
                />
              )
            )}
            {loading && results.length === 0 && (
              <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: t.textDim }}>Searching…</div>
            )}
            {!loading && results.length === 0 && (
              <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: t.textDim }}>No results found for &quot;{query}&quot;.</div>
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
