"use client";

import { useState } from "react";
import Grain from "@/components/ui/Grain";
import { tmdbImage } from "@/lib/tmdb";

// INSIDE OF THE LID — a tagline (when TMDB has one) plus the show's own
// title logo below it (same asset SpineFace/CaseOverlay's own outer title
// use, falling back to plain text if there's no logo or it fails to load),
// over a simple backdrop image (TMDB's `backdropPath` — intentionally a
// different image than the front cover's `posterPath`), with a dark wash
// on top so both stay readable regardless of what's in the shot. Falls
// back to the flat procedural gradient when no backdrop exists. This is
// what makes the "book opening" moment feel like it's revealing something
// quieter and more personal than the front cover.
export default function InsideArt({ show }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const backdropSrc = tmdbImage(show.backdropPath, "w780");
  const logoSrc = !logoFailed && show.logoPath ? tmdbImage(show.logoPath, "w300") : null;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: `linear-gradient(165deg, ${show.base} 0%, #0d0c0a 100%)`, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 28px" }}>
      {backdropSrc && (
        <>
          <img src={backdropSrc} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(165deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.82) 100%)" }} />
        </>
      )}
      <Grain />
      {/* Title always shows (a show without a TMDB tagline shouldn't read
          as a blank inside cover) — the tagline + divider above it are
          the part that's conditional. */}
      <div style={{ position: "relative", textAlign: "center" }}>
        {show.tagline && (
          <>
            <div style={{ fontSize: 13.5, fontStyle: "italic", color: "rgba(255,255,255,0.9)", lineHeight: 1.55, textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>{show.tagline}</div>
            <div style={{ marginTop: 16, width: 26, height: 1, background: "rgba(255,255,255,0.3)", marginLeft: "auto", marginRight: "auto" }} />
          </>
        )}
        <div style={{ marginTop: show.tagline ? 16 : 0, display: "flex", justifyContent: "center" }}>
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- TMDB CDN path, not a next/image-managed local asset
            <img
              src={logoSrc}
              alt=""
              onError={() => setLogoFailed(true)}
              style={{ maxWidth: "100%", maxHeight: 20, objectFit: "contain", filter: "drop-shadow(0 1px 6px rgba(0,0,0,0.6))" }}
            />
          ) : (
            <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>{show.title}</div>
          )}
        </div>
      </div>
    </div>
  );
}
