"use client";

import { useRef } from "react";
import Icon from "@/components/ui/Icon";
import CoverArt from "@/components/library/art/CoverArt";
import SpineFace from "@/components/library/art/SpineFace";
import { SPINE_W, COVER_W, COVER_H } from "@/components/library/ShelfCase";

// ---------------------------------------------------------------------------
// TEST COMPONENT — do not wire into the real genre aisles until the user
// has confirmed the geometry looks right on a real device. A full
// duplicate of ShelfCase.jsx, not a variant of it — the original is
// untouched; this exists purely so the two can be compared side by side
// (real aisles vs. one "Test Shelf" row) before committing to a change.
// ---------------------------------------------------------------------------
//
// Two geometry changes from the original:
//   - REST_Y: 60deg -> 38deg (shallower rest angle, less of the cover
//     rotated away from the viewer, so cases read as less "tucked" behind
//     each other)
//   - SLOT_W: 56px -> 92px (wider per-case footprint, so neighboring
//     cases overlap less and more of each cover is actually visible)
// Cover/spine art itself (SPINE_W/COVER_W/COVER_H) is unchanged — imported
// straight from ShelfCase.jsx rather than redefined, since those aren't
// part of what's being tested here. CoverArt's title overlay is opted
// into (showTitle) — at this shallower angle enough of the front cover is
// visible for a title to read as intentional case art rather than a
// redundant second label.
const REST_Y_WIDE = 38;
const SLOT_W_WIDE = 92;

export default function ShelfCaseWide({ show, onOpen }) {
  const btnRef = useRef(null);
  return (
    <button ref={btnRef} onClick={() => onOpen(btnRef.current.getBoundingClientRect())} style={{ width: SLOT_W_WIDE, height: COVER_H + 10, position: "relative", flexShrink: 0, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
      <div aria-hidden="true" style={{ position: "absolute", left: 2, right: 8, bottom: 2, height: 10, borderRadius: "50%", background: "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, transparent 72%)", filter: "blur(2px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", left: 6, top: 0, width: COVER_W, height: COVER_H, perspective: 1100 }}>
        <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transformOrigin: "left center", transform: `rotateY(${REST_Y_WIDE}deg)` }}>
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
            <CoverArt show={show} showTitle />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(0,0,0,0.42), transparent 40%)" }} />
            <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(118deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 14%, transparent 32%, transparent 68%, rgba(255,255,255,0.05) 100%)", pointerEvents: "none" }} />
            {show.favorite && (
              <div style={{ position: "absolute", top: 8, right: 8, width: 20, height: 20, borderRadius: "50%", background: "rgba(10,10,12,0.55)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="heart" size={10} color="#e0567a" />
              </div>
            )}
          </div>
          <div style={{ position: "absolute", left: 0, top: 0, width: SPINE_W, height: "100%", transformOrigin: "left center", transform: "rotateY(-90deg) translateZ(0.5px)", borderRadius: "4px 0 0 4px", overflow: "hidden", backfaceVisibility: "hidden", boxShadow: "inset -2px 0 4px rgba(0,0,0,0.35)" }}>
            <SpineFace show={show} height={COVER_H} />
          </div>
          <div style={{ position: "absolute", left: 0, top: 0, width: 5, height: "100%", transformOrigin: "left center", transform: "rotateY(-45deg) translateZ(0.25px)", backfaceVisibility: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "linear-gradient(90deg, rgba(210,210,218,0.55) 0%, rgba(70,70,78,0.95) 35%, rgba(18,18,22,0.98) 100%)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)" }} />
          </div>
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
