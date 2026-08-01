"use client";

import Grain from "@/components/ui/Grain";
import { tmdbImage } from "@/lib/tmdb";

// FRONT COVER — the detailed key art. Real TMDB poster art when the show has
// one; a deterministic procedural gradient (show.base/show.glow, attached
// once per show at the data layer — see lib/library.js's fallbackPalette
// and app/(tabs)/library/page.jsx) when it doesn't, so an artless show still
// gets a stable, intentional-looking background instead of a blank panel.
// No title/logo text overlay by default — most real posters already carry
// the show's title as part of the art itself, so a second overlaid label
// just doubled up. This is what you see on the shelf (as a sliver, in
// ShelfCase) and on the outside of the lid (full-size, in CaseOverlay).
// showTitle is opt-in (default false, so every existing caller is
// unaffected) — components/library/ShelfCaseWide.jsx's test geometry
// exposes enough of the front cover that a title overlay reads as
// intentional case-art rather than redundant, unlike the original's much
// steeper rest angle.
export default function CoverArt({ show, big = false, showTitle = false }) {
  const posterSrc = tmdbImage(show.posterPath, big ? "w500" : "w300");

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: posterSrc ? "#08070a" : `linear-gradient(160deg, ${show.glow}59 0%, ${show.base} 52%, #08070a 100%)` }}>
      {posterSrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- TMDB CDN path, not a next/image-managed local asset
        <img src={posterSrc} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} />
      ) : (
        <>
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 30% 16%, ${show.glow}55, transparent 62%)` }} />
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 85% 90%, ${show.glow}22, transparent 55%)` }} />
        </>
      )}
      <Grain />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(105deg, rgba(255,255,255,0.10) 0%, transparent 22%, transparent 70%, rgba(255,255,255,0.05) 100%)" }} />
      {showTitle && (
        <>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "45%", background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.65) 100%)" }} />
          <div style={{ position: "absolute", left: 12, right: 12, bottom: 30, color: "#fff", fontSize: big ? 26 : 19, fontWeight: 800, lineHeight: 1.1, textShadow: "0 2px 6px rgba(0,0,0,0.7)" }}>
            {show.title}
          </div>
          <div style={{ position: "absolute", left: 12, bottom: 10, padding: "2px 6px", borderRadius: 3, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.25)" }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", letterSpacing: "0.03em" }}>DVD</span>
          </div>
        </>
      )}
    </div>
  );
}
