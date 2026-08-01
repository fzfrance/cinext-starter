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
// there manually, just pre-selected on arrival.
export default function Aisle({ title, items, onOpen, shared }) {
  const router = useRouter();
  if (!items.length) return null;
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
        <button onClick={() => router.push(`/profile/library?genre=${encodeURIComponent(title)}`)} className="active:scale-90 transition" style={{ padding: 2, marginLeft: "auto" }}>
          <Icon name="chevronRight" size={16} color={t.textDim} />
        </button>
      </div>
      <div className="no-scrollbar" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        {/* width:max-content moved up to wrap BOTH the case row and the
            shelf board below, so both size to the actual full scrollable
            content width — previously the board was a plain sibling
            inside just the scroll container (which stays at the
            viewport's own width, unaffected by overflow-x), so its
            width:auto only ever matched the initially-visible screen,
            cutting off dead once you scrolled past it instead of
            continuing under the rest of the shelf. */}
        <div style={{ width: "max-content" }}>
          <div style={{ display: "flex", padding: "0 20px" }}>
            {items.map((s) => <ShelfCase key={s.id} show={s} onOpen={(rect) => onOpen(s, rect)} />)}
            <div style={{ width: 40, flexShrink: 0 }} />
          </div>
          {/* Shelf board — a plain <div> sitting right after the row of DVD
              cases (its very next sibling here), same treatment as
              Recommended's own ledge so every genre aisle reads as sitting
              on a real shelf too. Bumped contrast + a crisp top highlight
              line (like a real shelf's front lip catching light) so it
              reads as a distinct board rather than blending into the dark
              background under the cases' own drop shadows. */}
          <div style={{ margin: "0 20px", height: 14, borderRadius: 4, borderTop: "1px solid rgba(255,255,255,0.22)", background: "linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.03) 60%, rgba(255,255,255,0.01) 100%)", boxShadow: "0 18px 32px rgba(0,0,0,0.6)" }} />
        </div>
      </div>
    </div>
  );
}
