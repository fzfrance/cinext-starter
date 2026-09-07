"use client";

import CoverArt from "@/components/library/art/CoverArt";
import { themes } from "@/lib/theme";

const t = themes.dark;

// "Recommended" hero — face-out, straight row, no 3D, no tilt. Sourced from
// Watchlist-status shows, ranked by TMDB score internally (external, not a
// reflection of personal taste) — the ranking/rating themselves are never
// shown on the posters, purely an internal sort the caller (the Library
// page) applies before handing this component whatever 3 items it gets.
export default function RecommendedRow({ items, onOpen, softGlow = false }) {
  if (!items.length) return null;
  return (
    <div className={`recommended-row${softGlow ? " is-soft-glow" : ""}`} style={{ position: "relative" }}>
      <div
        className="recommended-row-glow"
        style={softGlow ? undefined : {
          position: "absolute",
          top: 0,
          bottom: -8,
          left: 0,
          right: 0,
          background: "radial-gradient(ellipse 180% 115% at 50% 55%, rgba(232,162,76,0.82) 8%, rgba(232,162,76,0.47) 18%, rgba(232,162,76,0) 34%, transparent 80%)",
          pointerEvents: "none",
        }}
        aria-hidden="true"
      />
      <div style={{ position: "relative", padding: softGlow ? "18px 0 0" : "18px 20px 0", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, justifyContent: "center" }}>
          <span style={{ fontSize: 25, fontWeight: 800, letterSpacing: -0.4 }}>Watch Next</span>
        </div>
        <div style={{ fontSize: 12.5, color: t.textDim, marginTop: 2 }}>From your Watchlist</div>
        <div style={{ position: "relative", marginTop: 18, paddingBottom: 22 }}>
          <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "flex-end", gap: softGlow ? 20 : 16 }}>
            {items.slice(0, 3).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={(e) => onOpen(s, e.currentTarget.getBoundingClientRect())}
                data-lib-ambient={s.posterPath || undefined}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flex: "1 1 0", maxWidth: softGlow ? 168 : 140, minWidth: 0 }}
              >
                <div style={{ position: "relative", width: "100%", aspectRatio: "140 / 202", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", boxShadow: softGlow ? "0 18px 40px rgba(0,0,0,0.42)" : "0 18px 34px rgba(0,0,0,0.5)" }}>
                  <CoverArt show={s} big />
                </div>
              </button>
            ))}
          </div>
          {/* Same shelf board as genre aisles — under Watch Next posters too */}
          <div
            className="library-aisle-shelf recommended-row-shelf"
            aria-hidden="true"
            style={softGlow ? undefined : { position: "absolute", left: 24, right: 24, bottom: 0, margin: 0, width: "auto", minWidth: 0 }}
          />
        </div>
      </div>
    </div>
  );
}
