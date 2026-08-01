"use client";

import Image from "next/image";
import { tmdbImage } from "@/lib/tmdb";

// Netflix-style tiled poster wall behind the login/signup form — a real
// CSS grid of poster tiles (structured rows/columns, not scattered
// individually-positioned floats), each nudged with a slight rotation/
// scale/opacity/z-index so it reads as a loosely-overlapping wall of
// posters rather than one flat, perfectly-aligned grid.
//
// Rotation/opacity/z-index are derived from each tile's index via
// seededRandom (below), not Math.random() — Math.random() would produce
// a different value on the server's initial render vs. the client's
// hydration render, which React flags as a hydration mismatch (the same
// class of bug fixed earlier on this page's own background layer).
// seededRandom(i) always returns the same value for the same i, so the
// server and client agree.
function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// grid-cols-3 on narrow phones, grid-cols-4 from `sm` up — both the
// column count AND each tile's own size come from CSS grid/aspect-ratio,
// not fixed px, so this scales correctly at any viewport width instead of
// overflowing or leaving dead space on a real phone.
const GRID_CLASSES = "grid grid-cols-3 sm:grid-cols-4";
const TILE_COUNT = 16; // divides evenly into both a 4-col and (close to) a 3-col layout

export default function AuthPosterBackground({ posterPaths = [] }) {
  return (
    <div className="fixed inset-0" style={{ zIndex: -1, background: "#0A0A0C", overflow: "hidden" }}>
      {/* gap kept small (not 0) so tiles still read as distinct posters at
          the seams, but each tile's scale(1.18) — bigger than a purely
          gap-filling scale would need — deliberately pushes its rotated
          corners past its own cell and into its neighbors', which is what
          actually produces the "posters overlap slightly at the edges"
          depth effect; the z-index spread (1-4) then decides which tile
          wins at each overlap. */}
      <div className={`absolute inset-0 ${GRID_CLASSES}`} style={{ gap: 3, padding: 3 }}>
        {Array.from({ length: TILE_COUNT }, (_, i) => {
          const path = posterPaths[i];
          if (!path) return null;
          const rotate = -8 + seededRandom(i * 7 + 1) * 16; // -8deg..+8deg
          const opacity = 0.3 + seededRandom(i * 13 + 2) * 0.4; // 0.3..0.7
          const z = 1 + Math.floor(seededRandom(i * 5 + 3) * 4); // 1..4
          return (
            <div
              key={i}
              className="relative rounded-lg overflow-hidden"
              style={{
                aspectRatio: "2 / 3",
                transform: `rotate(${rotate.toFixed(2)}deg) scale(1.18)`,
                opacity,
                zIndex: z,
              }}
            >
              <Image src={tmdbImage(path, "w500")} alt="" fill sizes="(max-width: 640px) 33vw, 25vw" draggable={false} style={{ objectFit: "cover" }} />
            </div>
          );
        })}
      </div>
      {/* Dark radial gradient on top — ~15% darker at every inner stop
          than the previous pass (0.88->0.97, 0.55->0.65; the innermost
          stop was already fully opaque #0A0A0C and can't go darker) so
          the form area reads crisper, while the outer edge stays
          transparent — the poster wall is still meant to show there,
          only the center (where the form sits) needed more contrast. */}
      <div
        className="absolute inset-0"
        style={{
          zIndex: 10,
          background: "radial-gradient(circle at 50% 50%, #0A0A0C 18%, rgba(10,10,12,0.97) 48%, rgba(10,10,12,0.65) 72%, transparent 100%)",
        }}
      />
    </div>
  );
}
