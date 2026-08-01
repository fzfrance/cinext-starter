"use client";

import Grain from "@/components/ui/Grain";
import { tmdbImage } from "@/lib/tmdb";

// DISC — a third distinct look: real cover art (falling back to
// show.base/show.glow procedural gradient when a show has no art at all)
// plus a thin conic sheen for shine — no title text overlay, same as the
// Collections posters (CoverArt), since most real posters already carry the
// title as part of the art. This is the tap target for viewing the show —
// the front cover has no separate "View show" button, since tapping the
// disc is the intuitive action (see CaseOverlay's onClick, which navigates
// to the real show detail route).
export default function Disc({ show }) {
  const size = 178;
  const posterSrc = tmdbImage(show.posterPath, "w300");
  return (
    // No forced compositing layer here (a prior translateZ(0)/will-change
    // attempt was reverted) — on real iOS Safari it made the disc's
    // visibility invert relative to the lid's own rotation (visible while
    // the case was closed, invisible while open) instead of fixing the
    // "disc missing" issue it was meant to address. The disc's actual
    // show/hide is now handled explicitly in CaseOverlay via the `opacity`
    // it sets on this component's wrapping button (keyed to real `lidOpen`
    // state), not implicit 3D depth/backface-visibility math — this plain
    // rotate animation is deliberately left with no 3D transform tricks.
    <div style={{ width: size, height: size, borderRadius: "50%", position: "relative", overflow: "hidden", animation: "libraryDiscSpin 16s linear infinite", border: "1px solid rgba(255,255,255,0.16)", boxShadow: "0 10px 34px rgba(0,0,0,0.65), inset 0 0 24px rgba(0,0,0,0.5)", backfaceVisibility: "visible", WebkitBackfaceVisibility: "visible" }}>
      <style>{`@keyframes libraryDiscSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      {posterSrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- TMDB CDN path, not a next/image-managed local asset
        <img src={posterSrc} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} />
      ) : (
        <>
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(160deg, ${show.glow}66 0%, ${show.base} 55%, #08070a 100%)` }} />
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 35% 28%, ${show.glow}55, transparent 60%)` }} />
        </>
      )}
      {/* Slight dark wash so the sheen/vignette below still reads over
          bright real art. */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.18)" }} />
      <Grain />
      <div style={{ position: "absolute", inset: 0, background: "conic-gradient(from 20deg, transparent 0%, rgba(255,255,255,0.12) 14%, transparent 30%, transparent 55%, rgba(255,255,255,0.08) 70%, transparent 86%)" }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 46, height: 46, borderRadius: "50%", background: "radial-gradient(circle, #d9d9de 0%, #9a9aa2 55%, #6d6d75 100%)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.5)", zIndex: 2 }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#0c0c0e", border: "2px solid rgba(255,255,255,0.25)" }} />
      </div>
    </div>
  );
}
