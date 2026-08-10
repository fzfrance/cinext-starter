"use client";

import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import PosterCard from "@/components/ui/PosterCard";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";
import { GENRE_ICON, GENRE_COLOR } from "@/lib/library";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// Poster-view counterpart to Aisle.jsx — same genre heading + ">" link
// behavior (identical fullListHref construction, including the &type=
// movies tag for a movie genre shelf), just rendering standard front-
// facing PosterCards in one horizontal row instead of ShelfCase spines.
// width=104 + gap 10 (className="flex gap-2.5") is not a new number —
// it's the exact sizing Profile's own Favorite Shows/Movies rows already
// use for a horizontal poster row, reused here rather than invented, and
// lands right in the requested "~3-3.5 visible at once" range on a
// standard phone width. href-only navigation (no onOpen/CaseOverlay
// wiring, no long-press menu) — the DVD-case flip-open interaction is
// specific to that view's own aesthetic; Poster view matches how
// PosterCard is used everywhere else in the app (Explore/Search/Profile
// grids: tap navigates straight to the detail page). `favorite` is
// static/display-only here (no onToggleFavorite), reusing the `favorite`
// field the existing shows/movies fetch already puts on every item — no
// new data fetch or context needed just for this view.
export default function GenrePosterRow({ title, items, shared, mediaType = "tv" }) {
  const router = useRouter();
  if (!items.length) return null;
  const fullListHref = `/profile/library?genre=${encodeURIComponent(title)}${mediaType === "movie" ? "&type=movies" : ""}`;
  return (
    <div style={{ marginTop: 35 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 20px 14px" }}>
        <Icon name={GENRE_ICON[title] || "tv"} size={16} color={GENRE_COLOR[title] || t.textDim} />
        <span style={{ fontSize: 19, fontWeight: 700, color: "#fff" }}>{title}</span>
        {shared && (
          <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 999, background: t.cardFill, border: `1px solid ${t.glassBorder}` }}>
            <Icon name="globe" size={10} color={accent} />
            <span style={{ fontSize: 9.5, fontWeight: 700, color: accent, letterSpacing: 0.4 }}>SHARED</span>
          </span>
        )}
        <button onClick={() => router.push(fullListHref)} className="active:scale-90 transition" style={{ padding: 2, marginLeft: "auto" }}>
          <Icon name="chevronRight" size={16} color={t.textDim} />
        </button>
      </div>
      <div className="no-scrollbar flex gap-2.5" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", padding: "0 20px" }}>
        {items.map((s) => (
          <PosterCard
            key={s.id}
            show={s}
            href={mediaType === "movie" ? `/movie/${s.id}` : `/show/${s.id}`}
            width={104}
            titlePlacement="overlay"
            favorite={s.favorite}
          />
        ))}
      </div>
    </div>
  );
}
