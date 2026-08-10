"use client";

import { useState, useEffect } from "react";
import Grain from "@/components/ui/Grain";
import { tmdbImage } from "@/lib/tmdb";

export const CARD_W = 168;
export const CARD_H = 113; // ~1.49:1, landscape per spec (1.45-1.55:1)

const NEUTRAL_RGB = [26, 24, 22];

// Averages the whole poster down to one RGB (not just an edge strip like
// components/MovieRatingScreen.jsx's own extractEdgeColor — that one's
// built to blend into a bottom gradient, this wants the poster's overall
// main color). A distinct TMDB size ("w92") from the one actually
// rendered in the card ("w342" below) is deliberate — sampling the exact
// same URL a plain <img> already rendered elsewhere hits a real
// cache/CORS collision (found and fixed once already this session, see
// ProfileDvdCase.jsx's sampleLogoLuminance), a different size is a
// different URL so no collision to worry about here.
function extractDominantColor(url) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const w = 24, h = 24;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
        resolve([Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = url;
  });
}

function toHex(rgb) {
  return "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

// base = the extracted color pulled way down toward near-black (the wash
// behind/around the art), glow = the same color pushed toward white (the
// radial highlight + border tint) — same {base, glow} shape
// lib/library.js's fallbackPalette already produces, just derived from the
// real poster instead of a deterministic per-id table, so every gradient
// string this card already had (`${glow}45`, `${base} 55%`, etc.) keeps
// working unchanged.
function paletteFromRGB(rgb) {
  return {
    base: toHex(rgb.map((c) => c * 0.24 + NEUTRAL_RGB[0] * 0.03 + 9)),
    glow: toHex(rgb.map((c) => c * 0.82 + 255 * 0.18)),
  };
}

// One calendar year of watch activity. Layered "adaptive color
// atmosphere": the representative poster's own dominant color (extracted
// client-side, see extractDominantColor above) washes across the whole
// card -> radial glow -> Grain -> poster art on the right ~58%, left edge
// fading into the wash -> dark left scrim for text legibility -> year +
// count text. Deliberately no stat/bar-chart icon (the reference image
// shows one; explicitly dropped per request), and no special
// current-year border treatment (also explicitly dropped) — every card's
// border is just a subtle tint of its own extracted color.
export default function TimeMachineYearCard({ year, titleCount, posterPath, onSelect }) {
  const [rgb, setRgb] = useState(null);

  useEffect(() => {
    if (!posterPath) { setRgb(null); return; }
    let cancelled = false;
    extractDominantColor(tmdbImage(posterPath, "w92"))
      .then((c) => { if (!cancelled) setRgb(c); })
      .catch(() => { if (!cancelled) setRgb(null); });
    return () => { cancelled = true; };
  }, [posterPath]);

  const { base, glow } = paletteFromRGB(rgb ?? NEUTRAL_RGB);

  return (
    <button
      onClick={onSelect}
      className="relative flex-shrink-0 overflow-hidden text-left active:scale-95 transition"
      style={{ width: CARD_W, height: CARD_H, borderRadius: 20, border: `1px solid ${base}55` }}
    >
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(115deg, ${glow}38 0%, ${base} 55%, ${base} 100%)` }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 12% 35%, ${glow}45, transparent 62%)` }} />
        <Grain />
      </div>

      {posterPath && (
        <div
          className="absolute inset-y-0 right-0 overflow-hidden"
          style={{
            width: "58%",
            WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 38%)",
            maskImage: "linear-gradient(to right, transparent 0%, black 38%)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative atmosphere art, mirrors CoverArt/ShelfCase's own plain <img> use */}
          <img src={tmdbImage(posterPath, "w342")} alt="" className="w-full h-full" style={{ objectFit: "cover" }} />
        </div>
      )}

      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.4) 42%, transparent 72%)" }} />

      <div className="absolute left-0 bottom-0" style={{ padding: "12px 14px" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{year}</div>
        <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.72)", marginTop: 4 }}>
          {titleCount} title{titleCount === 1 ? "" : "s"}
        </div>
      </div>
    </button>
  );
}
