"use client";

import CoverArt from "@/components/library/art/CoverArt";
import { themes } from "@/lib/theme";

const t = themes.dark;

// "Recommended" hero — face-out, straight row, no 3D, no tilt. Sourced from
// Watchlist-status shows, ranked by TMDB score internally (external, not a
// reflection of personal taste) — the ranking/rating themselves are never
// shown on the posters, purely an internal sort the caller (the Library
// page) applies before handing this component whatever 3 items it gets.
export default function RecommendedRow({ items, onOpen }) {
  if (!items.length) return null;
  return (
    // Outer wrapper carries NO horizontal padding of its own — it exists
    // solely so the glow below can be an explicit full-bleed sibling of the
    // padded content, instead of a descendant nested inside it. Previously
    // the glow lived inside the (position:relative) poster-row wrapper,
    // which put it in that wrapper's own stacking context — since
    // positioned elements paint after plain in-flow siblings regardless of
    // DOM order, it ended up painting ON TOP of the "Recommended"/"From
    // your Watchlist" text above, and its left:0/right:0 resolved against
    // that inner wrapper's already-20px-inset box, not the true section
    // width. Both together produced the hard-edged patch stuck on the
    // subtitle instead of a soft wash across the whole section.
    <div style={{ position: "relative" }}>
      {/* Warm stage-lighting glow — this is the page's one deliberate hero
          moment (Recommended only; genre aisles stay flat/plain), so it's
          the one section allowed to feel lit. First child (paints behind
          everything else via normal DOM stacking order) and full-bleed
          width relative to THIS wrapper, which has no side padding of its
          own. top:0 — no upward bleed at all, so it can never cross the
          divider line above this section. Centered low (62% down) so the
          hot core sits behind/around the poster row itself rather than up
          near the title — light coming from behind and the sides of the
          posters, with only a soft, faint spill reaching the text above.
          A small downward bleed (8px) lets it wash slightly past the
          shelf ledge too. */}
      <div style={{ position: "absolute", top: 0, bottom: -8, left: 0, right: 0, background: "radial-gradient(ellipse 180% 115% at 50% 55%, rgba(232,162,76,0.82) 8%, rgba(232,162,76,0.47) 18%, rgba(232,162,76,0) 34%, transparent 80%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", padding: "18px 20px 0", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, justifyContent: "center" }}>
          <span style={{ fontSize: 25, fontWeight: 800, letterSpacing: -0.4 }}>Watch Next</span>
        </div>
        <div style={{ fontSize: 12.5, color: t.textDim, marginTop: 2 }}>From your Watchlist</div>
        <div style={{ position: "relative", marginTop: 18, paddingBottom: 22 }}>
          {/* flex:1 1 0 + maxWidth (instead of a fixed 140px) so 3 posters +
              gaps + the page's own side padding shrink to fit on narrow real
              phones and cap out at the original size on wider ones.
              aspect-ratio keeps proportions instead of a fixed height. */}
          <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 16 }}>
            {items.slice(0, 3).map((s) => (
              <button key={s.id} onClick={(e) => onOpen(s, e.currentTarget.getBoundingClientRect())} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flex: "1 1 0", maxWidth: 140, minWidth: 0 }}>
                <div style={{ position: "relative", width: "100%", aspectRatio: "140 / 202", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 18px 34px rgba(0,0,0,0.5)" }}>
                  <CoverArt show={s} big />
                </div>
              </button>
            ))}
          </div>
          {/* display-table ledge */}
          <div style={{ position: "absolute", left: 24, right: 24, bottom: 0, height: 11, borderRadius: 4, background: "linear-gradient(180deg, rgba(255,255,255,0.11), rgba(255,255,255,0.02))", boxShadow: "0 16px 30px rgba(0,0,0,0.5)" }} />
        </div>
      </div>
    </div>
  );
}
