"use client";

import { useRef } from "react";
import Icon from "@/components/ui/Icon";
import CoverArt from "@/components/library/art/CoverArt";
import SpineFace from "@/components/library/art/SpineFace";

// ---------- Case geometry — shared by ShelfCase (rest state) and
// CaseOverlay (opened state), which reuses SPINE_W/COVER_H/REST_Y for its own
// FLIP rest-transform math. Keep these in sync if either changes. ----------
export const SPINE_W = 30;
export const COVER_W = 148;
export const COVER_H = 208;
export const SLOT_W = 56;
export const REST_Y = 58;

// ---------- Shelf spine (rest state) ----------
// perspective lives on the geometry wrapper below, sized/positioned to match
// the card exactly — not on the outer button, which is narrower than the
// card and would put the vanishing point off-center from what's actually
// rotating, skewing the cover/spine seam.
export default function ShelfCase({ show, onOpen }) {
  const btnRef = useRef(null);
  return (
    <button ref={btnRef} onClick={() => onOpen(btnRef.current.getBoundingClientRect())} style={{ width: SLOT_W, height: COVER_H + 10, position: "relative", flexShrink: 0, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
      {/* Soft contact shadow on the shelf board */}
      <div aria-hidden="true" style={{ position: "absolute", left: 2, right: 8, bottom: 2, height: 10, borderRadius: "50%", background: "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, transparent 72%)", filter: "blur(2px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", left: 6, top: 0, width: COVER_W, height: COVER_H, perspective: 1100 }}>
        <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transformOrigin: "left center", transform: `rotateY(${REST_Y}deg)` }}>
          {/* Cover panel */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "0 5px 5px 0",
              overflow: "hidden",
              backfaceVisibility: "hidden",
              boxShadow: "10px 8px 28px rgba(0,0,0,0.58), inset 4px 0 8px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.18)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderLeft: "none",
            }}
          >
            <CoverArt show={show} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(0,0,0,0.42), transparent 40%)" }} />
            {/* Plastic specular streak */}
            <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(118deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 14%, transparent 32%, transparent 68%, rgba(255,255,255,0.05) 100%)", pointerEvents: "none" }} />
            {show.favorite && (
              <div style={{ position: "absolute", top: 8, right: 8, width: 20, height: 20, borderRadius: "50%", background: "rgba(10,10,12,0.55)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="heart" size={10} color="#e0567a" />
              </div>
            )}
          </div>
          {/* Spine panel */}
          <div style={{ position: "absolute", left: 0, top: 0, width: SPINE_W, height: "100%", transformOrigin: "left center", transform: "rotateY(-90deg) translateZ(0.5px)", borderRadius: "4px 0 0 4px", overflow: "hidden", backfaceVisibility: "hidden", boxShadow: "inset -2px 0 4px rgba(0,0,0,0.35)" }}>
            <SpineFace show={show} height={COVER_H} />
          </div>
          {/* Thickness / plastic edge — fills the dihedral between cover & spine */}
          <div style={{ position: "absolute", left: 0, top: 0, width: 5, height: "100%", transformOrigin: "left center", transform: "rotateY(-45deg) translateZ(0.25px)", backfaceVisibility: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "linear-gradient(90deg, rgba(210,210,218,0.55) 0%, rgba(70,70,78,0.95) 35%, rgba(18,18,22,0.98) 100%)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)" }} />
          </div>
          {/* Thin top-edge thickness so the case reads as a box, not two flats */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: COVER_W,
              height: 4,
              transformOrigin: "top left",
              transform: "rotateX(90deg)",
              background: "linear-gradient(90deg, rgba(40,40,46,0.95), rgba(120,120,128,0.55) 18%, rgba(30,30,34,0.9))",
              backfaceVisibility: "hidden",
            }}
          />
        </div>
      </div>
    </button>
  );
}
