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
    <button ref={btnRef} onClick={() => onOpen(btnRef.current.getBoundingClientRect())} style={{ width: SLOT_W_WIDE, height: COVER_H, position: "relative", flexShrink: 0, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
      <div style={{ position: "absolute", left: 6, top: 0, width: COVER_W, height: COVER_H, perspective: 900 }}>
        <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transformOrigin: "left center", transform: `rotateY(${REST_Y_WIDE}deg)` }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "0 4px 4px 0", overflow: "hidden", backfaceVisibility: "hidden", boxShadow: "8px 6px 24px rgba(0,0,0,0.55), inset 3px 0 6px rgba(0,0,0,0.5)" }}>
            <CoverArt show={show} showTitle />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(0,0,0,0.35), transparent 45%)" }} />
            {show.favorite && (
              <div style={{ position: "absolute", top: 8, right: 8, width: 20, height: 20, borderRadius: "50%", background: "rgba(10,10,12,0.55)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="heart" size={10} color="#e0567a" />
              </div>
            )}
          </div>
          <div style={{ position: "absolute", left: 0, top: 0, width: SPINE_W, height: "100%", transformOrigin: "left center", transform: "rotateY(-90deg)", borderRadius: "3px 0 0 3px", overflow: "hidden", backfaceVisibility: "hidden" }}>
            <SpineFace show={show} height={COVER_H} />
          </div>
          <div style={{ position: "absolute", left: 0, top: 0, width: 4, height: "100%", transformOrigin: "left center", transform: "rotateY(-45deg)", backfaceVisibility: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "linear-gradient(90deg, rgba(60,60,66,0.9) 0%, rgba(20,20,22,0.9) 100%)" }} />
          </div>
        </div>
      </div>
    </button>
  );
}
