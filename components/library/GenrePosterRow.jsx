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
// movies tag for a movie genre shelf), just rendering front-facing
// PosterCards in one horizontal row instead of ShelfCase spines.
// Default width=104 matches mobile Profile favorite rows; desktop Library
// passes posterWidth=168 to match Watch Next softGlow posters, plus
// withShelf for the same aisle shelf board under the row.
export default function GenrePosterRow({
  title,
  items,
  shared,
  mediaType = "tv",
  posterWidth = 104,
  withShelf = false,
  gap = 10,
}) {
  const router = useRouter();
  if (!items.length) return null;
  const fullListHref = `/profile/library?genre=${encodeURIComponent(title)}${mediaType === "movie" ? "&type=movies" : ""}`;
  return (
    <div className="genre-poster-row" style={{ marginTop: 35 }}>
      <div className="genre-poster-row-head" style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 20px 14px" }}>
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
      <div
        className="no-scrollbar genre-poster-row-scroll"
        style={{
          overflowX: "auto",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}
      >
        <div style={{ width: "max-content", minWidth: "100%" }}>
          <div className="genre-poster-row-cases" style={{ display: "flex", gap, padding: "0 20px" }}>
            {items.map((s) => (
              <div key={s.id} data-lib-ambient={s.posterPath || undefined} style={{ flexShrink: 0 }}>
                <PosterCard
                  show={s}
                  href={mediaType === "movie" ? `/movie/${s.id}` : `/show/${s.id}`}
                  width={posterWidth}
                  titlePlacement="overlay"
                  favorite={s.favorite}
                  pressScale={false}
                  tmdbSize={posterWidth >= 140 ? "w342" : "w342"}
                  sizes={`${posterWidth}px`}
                />
              </div>
            ))}
            <div style={{ width: 20, flexShrink: 0 }} />
          </div>
          {withShelf ? <div className="library-aisle-shelf" aria-hidden="true" /> : null}
        </div>
      </div>
    </div>
  );
}
