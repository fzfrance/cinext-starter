"use client";

import { useState } from "react";
import Grain from "@/components/ui/Grain";
import { tmdbImage } from "@/lib/tmdb";

// A small vector recreation of the real DVD-Video disc mark (bold italic
// "DVD" wordmark over a flattened disc shape) — no "VIDEO" text, since this
// is just a tiny corner watermark, not a full logo reproduction.
function DvdMark({ width = 20 }) {
  return (
    <svg width={width} height={width * 0.6} viewBox="0 0 100 60">
      <text x="50" y="34" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontStyle="italic" fontSize="32" letterSpacing="-3" fill="#fff">DVD</text>
      <ellipse cx="50" cy="50" rx="45" ry="7" fill="#fff" />
      <ellipse cx="50" cy="50" rx="13" ry="2" fill="#0a0908" />
    </svg>
  );
}

// The vertical spine label + DVD watermark, matching real DVD case printing —
// used by both the shelf-rest spine (ShelfCase) and the opened case's own
// spine face (CaseOverlay) at two different heights. Shows the real show
// title logo (rotated to fit the vertical spine) when TMDB has one for this
// show; falls back to plain rotated title text otherwise (including when a
// logo URL exists but the image itself fails to actually load, via onError —
// previously a broken logoPath silently rendered nothing at all, which is
// very likely why some titles showed no label whatsoever).
//
// Text fallback prefers englishTitle / originalTitle over a localized
// display title so spines don't print Thai (etc.) for non-Thai shows.
export default function SpineFace({ show, height }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logoSrc = !logoFailed && show.logoPath ? tmdbImage(show.logoPath, "w300") : null;
  const spineTitle = show.englishTitle || show.originalTitle || show.title;
  return (
    <div
      className="dvd-spine-face"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: `linear-gradient(180deg, ${show.glow}55 0%, ${show.base} 42%, #0a0908 100%)`,
        boxShadow: "inset 2px 0 4px rgba(255,255,255,0.16), inset -3px 0 6px rgba(0,0,0,0.62)",
      }}
    >
      <Grain />
      {/* Plastic rim highlight along the outer (viewer-facing) spine edge */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(255,255,255,0.22) 0%, transparent 18%, transparent 78%, rgba(0,0,0,0.35) 100%)", pointerEvents: "none" }} />
      {/* Glossy top lip — real DVD spines catch a hard specular on the upper edge */}
      <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 10, background: "linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.12) 45%, transparent 100%)", pointerEvents: "none" }} />
      {/* top end-cap + separator line */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 7, background: "linear-gradient(180deg, rgba(52,52,58,0.98) 0%, rgba(18,18,20,0.92) 100%)" }} />
      <div style={{ position: "absolute", top: 7, left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.45)" }} />
      {/* bottom separator line + end-cap */}
      <div style={{ position: "absolute", bottom: 7, left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.4)" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 7, background: "linear-gradient(0deg, rgba(52,52,58,0.98) 0%, rgba(18,18,20,0.92) 100%)" }} />
      <div style={{ position: "absolute", top: 12, bottom: 28, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{ background: "rgba(0,0,0,0.42)", borderRadius: 3, padding: logoSrc ? "3px 2px" : "6px 2px" }}>
          {logoSrc ? (
            <div style={{ width: (height - 36) * 0.6, height: 18, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(90deg)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- TMDB CDN path, not a next/image-managed local asset */}
              <img src={logoSrc} alt="" onError={() => setLogoFailed(true)} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.9))" }} />
            </div>
          ) : (
            <div style={{ writingMode: "vertical-rl", color: "#fff", fontSize: 10.5, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxHeight: height - 36, textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>
              {spineTitle}
            </div>
          )}
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: 0.85 }}>
        <DvdMark width={20} />
      </div>
    </div>
  );
}
