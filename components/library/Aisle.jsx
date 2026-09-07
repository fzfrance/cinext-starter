"use client";

import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import ShelfCase from "@/components/library/ShelfCase";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";
import { GENRE_ICON, GENRE_COLOR } from "@/lib/library";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// Genre / Collection aisle — a spine-out shelf of ShelfCases, dynamically
// titled (one per genre with >=2 shows, computed in the page via
// primaryGenre — never a hardcoded genre list). The ">" opens the real
// full-gallery library view (app/(tabs)/profile/library) pre-tagged to
// this genre via a query param, which that page reads back into its own
// existing genre-filter dropdown — same page/rules as tapping that filter
// there manually, just pre-selected on arrival. mediaType ("tv" | "movie")
// also tags the link with &type=movies for a movie-genre shelf, so that
// page lands on its own Movies view (not Shows) already filtered to this
// same genre — omitted for shows, matching that page's own "shows" default.
export default function Aisle({ title, items, onOpen, shared, mediaType = "tv" }) {
  const router = useRouter();
  if (!items.length) return null;
  const fullListHref = `/profile/library?genre=${encodeURIComponent(title)}${mediaType === "movie" ? "&type=movies" : ""}`;
  return (
    <div className="library-aisle" style={{ marginTop: 35 }}>
      <div className="library-aisle-head" style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 20px 14px" }}>
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
      <div className="no-scrollbar library-aisle-scroll" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        {/* width:max-content wraps BOTH the case row and the shelf board so
            the ledge continues under every case as you scroll. */}
        <div className="library-aisle-track" style={{ width: "max-content", minWidth: "100%" }}>
          <div className="library-aisle-cases" style={{ display: "flex", padding: "0 20px" }}>
            {items.map((s) => <ShelfCase key={s.id} show={s} onOpen={(rect) => onOpen(s, rect)} />)}
            <div style={{ width: 40, flexShrink: 0 }} />
          </div>
          {/* Shelf board under the DVD cases — front lip + depth so each
              aisle reads as sitting on a real shelf. minWidth:100% on the
              track keeps the ledge spanning the visible aisle even when
              there aren't enough cases to fill it. */}
          <div className="library-aisle-shelf" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
