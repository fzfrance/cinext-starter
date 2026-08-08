"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import GlassCircle from "@/components/ui/GlassCircle";
import PosterArt from "@/components/ui/PosterArt";
import StarInput from "@/components/ui/StarInput";
import { moodMetasFromField } from "@/components/SeasonBanner";
import { useAuth } from "@/lib/auth-context";
import { getMyRatingsForUser } from "@/lib/myRatings";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { fallbackPalette, seasonLabel } from "@/lib/library";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// Full "My Ratings" list — everything Profile's own preview row only
// shows the first 10 of (see lib/myRatings.js, shared assembly logic).
// Same search-bar UX as Library's own full-page list (toggle button ->
// inline input row), plain vertical list (not a poster grid) per
// explicit request, and one sort control: a 0-10 minimum-rating drag bar
// — dragging it above 0 both filters the list down to that rating or
// higher AND switches the list to rating-descending order; at 0 (the
// default/reset position) the list is plain most-recent-activity order,
// same as Profile's own preview.
export default function Page() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const readableLanguages = useReadableLanguages();
  const [ratings, setRatings] = useState(null); // null = loading
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [minRating, setMinRating] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyRatingsForUser(user.id)
      .then((entries) => { if (!cancelled) setRatings(entries); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [user]);

  if (!authLoading && !user) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center text-center px-8" style={{ background: t.bg }}>
        <Icon name="star" size={30} color={t.textDim} />
        <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginTop: 14 }}>Sign in to see your ratings</div>
        <button onClick={() => router.push("/login")} className="rounded-full active:scale-95 transition" style={{ marginTop: 20, padding: "11px 24px", background: accent }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1a1108" }}>Sign In</span>
        </button>
      </div>
    );
  }

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const resolved = (ratings ?? []).map((r) => ({ ...r, displayTitle: resolveTitle(r, readableLanguages) }));
  const filtered = resolved.filter((r) => {
    if (trimmedQuery && !r.displayTitle.toLowerCase().includes(trimmedQuery) && !r.title?.toLowerCase().includes(trimmedQuery)) return false;
    if (r.rating < minRating) return false;
    return true;
  });
  const sorted = minRating > 0 ? [...filtered].sort((a, b) => b.rating - a.rating) : filtered;

  return (
    <>
      <div className="flex items-center justify-between px-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 21px)" }}>
        <GlassCircle onClick={() => router.back()} t={t}><Icon name="back" size={16} color={t.text} /></GlassCircle>
        <div className="flex items-center gap-2">
          {/* Filter — same circular icon-button style as Search, sitting
              right next to it (was a separate "Sort By" pill on its own
              row below the title; moved up here). Its popover still
              anchors off this button. */}
          <div className="relative">
            <button onClick={() => setSortMenuOpen((v) => !v)} className="flex items-center justify-center rounded-full active:scale-90 transition" style={{ width: 38, height: 38, background: minRating > 0 ? accent : t.cardFill, border: `1px solid ${minRating > 0 ? accent : t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
              <Icon name="filter" size={16} color={minRating > 0 ? "#1a1108" : "#fff"} />
            </button>
            {sortMenuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setSortMenuOpen(false)} />
                <div className="absolute z-30 rounded-2xl" style={{ top: "calc(100% + 8px)", right: 0, width: 230, padding: "16px 16px 14px", background: "#221c17", border: `1px solid ${t.glassBorder}` }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Minimum Rating</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>{minRating.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={0.5}
                    value={minRating}
                    onChange={(e) => setMinRating(Number(e.target.value))}
                    className="w-full"
                    style={{ accentColor: accent }}
                  />
                  <div className="flex items-center justify-between" style={{ marginTop: 4 }}>
                    <span style={{ fontSize: 10.5, color: t.textDim }}>0</span>
                    <span style={{ fontSize: 10.5, color: t.textDim }}>10</span>
                  </div>
                  {minRating > 0 && (
                    <button onClick={() => setMinRating(0)} className="w-full rounded-full active:scale-95 transition" style={{ marginTop: 12, padding: "8px", background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>Reset</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          {/* Search — matches Library's own full-page toggle style. */}
          <button onClick={() => setSearchOpen((v) => !v)} className="flex items-center justify-center rounded-full active:scale-90 transition" style={{ width: 38, height: 38, background: t.cardFill, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
            <Icon name={searchOpen ? "x" : "search"} size={16} color="#fff" />
          </button>
        </div>
      </div>

      <div className="px-6" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 32.2, fontWeight: 800, color: "#fff" }}>My Ratings</div>
        <div style={{ fontSize: 12.5, color: t.textDim, marginTop: 3 }}>{ratings?.length ?? 0} rated</div>
      </div>

      {searchOpen && (
        <div className="px-6" style={{ marginTop: 16 }}>
          <div className="flex items-center gap-2.5 rounded-full" style={{ padding: "12px 18px", background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
            <Icon name="search" size={15} color={t.textDim} />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your ratings"
              className="flex-1 bg-transparent outline-none"
              style={{ fontSize: 14, color: "#fff" }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")}><Icon name="x" size={13} color={t.textDim} /></button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 px-6" style={{ marginTop: 20 }}>
        {ratings === null ? (
          <div style={{ padding: "60px 24px", textAlign: "center", fontSize: 13, color: t.textDim }}>Loading…</div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: "60px 24px", textAlign: "center", fontSize: 13, color: t.textDim }}>
            {trimmedQuery || minRating > 0 ? "No ratings match your search/filter." : "Rate a season and it'll show up here."}
          </div>
        ) : (
          sorted.map((r) => {
            const isMovie = r.mediaType === "movie";
            // Raw ids collide across media types (a movie id and a TV
            // show id aren't drawn from the same space) — key, ratings-
            // screen deep-link, and detail-page link all branch on
            // mediaType rather than assuming showId.
            const key = isMovie ? `movie-${r.movieId}` : `tv-${r.showId}-${r.seasonNumber}`;
            const detailPath = isMovie ? `/movie/${r.movieId}` : `/show/${r.showId}`;
            const ratingPath = isMovie ? `/movie/${r.movieId}?tab=reviews` : `/show/${r.showId}?tab=reviews&reviewSeason=${r.seasonNumber}`;
            const { base, glow } = fallbackPalette(isMovie ? r.movieId : r.showId);
            const moodMetas = moodMetasFromField(r.mood);
            return (
              // Same card as Profile's own "My Ratings" preview row
              // (poster + title/season/mood + star row + big number),
              // just full-width instead of a horizontal-scroll strip.
              // Whole card goes to the saved rating card — same
              // destination as the trailing ">" — EXCEPT the poster,
              // which is its own separate control (stopPropagation) that
              // goes to the show/movie's own page instead.
              <div
                key={key}
                onClick={() => router.push(ratingPath)}
                className="w-full flex items-center text-left rounded-2xl cursor-pointer active:scale-[0.98] transition"
                style={{ gap: 11.7, padding: 11.7, background: t.cardFill, border: `1px solid ${t.cardBorder}` }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); router.push(detailPath); }}
                  className="relative rounded-xl overflow-hidden flex-shrink-0 active:opacity-70 transition"
                  style={{ width: 82.8, aspectRatio: "2 / 3" }}
                >
                  <PosterArt posterPath={r.posterPath} base={base} glow={glow} alt={r.displayTitle} />
                  {r.isAuto && (
                    <div className="absolute flex items-center gap-1 rounded-full" style={{ left: 5, top: 5, padding: "1.8px 5.4px", background: "rgba(232,162,76,0.2)" }}>
                      <Icon name="sparkle" size={8.1} color={accent} />
                    </div>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate" style={{ fontSize: 14.4, fontWeight: 700, color: "#fff" }}>{r.displayTitle}</div>
                  <div className="flex items-center gap-1.5" style={{ marginTop: 2 }}>
                    {/* No season line for a movie — it has none. Mood
                        emojis alone are enough, no replacement text. */}
                    {!isMovie && <span style={{ fontSize: 11.88, color: t.textDim }}>{seasonLabel(r.seasonNumber)}</span>}
                    {moodMetas.length > 0 && <span style={{ fontSize: 11.88 }}>{moodMetas.map((m) => m.emoji).join(" ")}</span>}
                  </div>
                  <div style={{ marginTop: 7.92 }}>
                    <StarInput value={r.rating / 2} onChange={() => {}} size={13.86} gap={2.475} readOnly />
                  </div>
                  <div style={{ fontSize: 21.78, fontWeight: 800, color: "#fff", marginTop: 4.95, lineHeight: 1 }}>{r.rating.toFixed(1)}</div>
                </div>
                <div className="flex-shrink-0 flex items-center justify-center">
                  <Icon name="chevronRight" size={16} color={t.textDim} />
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ height: 30 }} />
    </>
  );
}
