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
export default function SpineFace({ show, height }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logoSrc = !logoFailed && show.logoPath ? tmdbImage(show.logoPath, "w300") : null;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: `linear-gradient(180deg, ${show.glow}4d 0%, ${show.base} 45%, #0a0908 100%)`, boxShadow: "inset 2px 0 3px rgba(255,255,255,0.12), inset -2px 0 4px rgba(0,0,0,0.55)" }}>
      <Grain />
      {/* top end-cap + separator line, matching real DVD spine printing */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 6, background: "linear-gradient(180deg, rgba(40,40,44,0.95) 0%, rgba(18,18,20,0.9) 100%)" }} />
      <div style={{ position: "absolute", top: 6, left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.4)" }} />
      {/* bottom separator line + end-cap */}
      <div style={{ position: "absolute", bottom: 6, left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.4)" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 6, background: "linear-gradient(0deg, rgba(40,40,44,0.95) 0%, rgba(18,18,20,0.9) 100%)" }} />
      {/* Logo box: length (this box's width, pre-rotation) is almost always
          the binding constraint for wide wordmark logos under
          object-fit:contain, trimmed margins to maximize it (height-36,
          up from height-56). Cross-axis bumped to 30. A dedicated dark
          backing plate sits directly behind the logo/text — without it, a
          correctly-sized logo can still be nearly invisible against
          similarly-dark or busy poster art underneath, which is likely why
          some titles read as "missing" even when actually rendering. */}
      <div style={{ position: "absolute", top: 10, bottom: 26, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{ background: "rgba(0,0,0,0.48)", borderRadius: 4, padding: logoSrc ? "3px 2px" : "6px 2px" }}>
          {logoSrc ? (
            <div style={{ width: (height - 36) * 0.6, height: 18, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(90deg)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- TMDB CDN path, not a next/image-managed local asset */}
              <img src={logoSrc} alt="" onError={() => setLogoFailed(true)} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.9))" }} />
            </div>
          ) : (
            <div style={{ writingMode: "vertical-rl", color: "#fff", fontSize: 10.5, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxHeight: height - 36, textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>
              {show.title}
            </div>
          )}
        </div>
      </div>
      {/* DVD watermark sits just above the bottom separator line, inside the main body */}
      <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: 0.85 }}>
        <DvdMark width={20} />
      </div>
    </div>
  );
}
