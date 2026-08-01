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
export const REST_Y = 60;

// ---------- Shelf spine (rest state) ----------
// perspective lives on the geometry wrapper below, sized/positioned to match
// the card exactly — not on the outer button, which is narrower than the
// card and would put the vanishing point off-center from what's actually
// rotating, skewing the cover/spine seam.
export default function ShelfCase({ show, onOpen }) {
  const btnRef = useRef(null);
  return (
    <button ref={btnRef} onClick={() => onOpen(btnRef.current.getBoundingClientRect())} style={{ width: SLOT_W, height: COVER_H, position: "relative", flexShrink: 0, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
      <div style={{ position: "absolute", left: 6, top: 0, width: COVER_W, height: COVER_H, perspective: 900 }}>
        <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transformOrigin: "left center", transform: `rotateY(${REST_Y}deg)` }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "0 4px 4px 0", overflow: "hidden", backfaceVisibility: "hidden", boxShadow: "8px 6px 24px rgba(0,0,0,0.55), inset 3px 0 6px rgba(0,0,0,0.5)" }}>
            <CoverArt show={show} />
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
          {/* Bevel/seam face — bisects the ~90deg dihedral angle between the
              cover (local rotateY 0) and the spine (local rotateY -90deg),
              i.e. rotateY(-45deg) locally. Two independently-clipped flat
              planes meeting at a shared hinge edge leave a hairline gap at
              steep angles (a real GPU-rasterization limit, not a math bug);
              a real third filled surface at the bisecting angle closes that
              gap at any viewing angle, reading as a rounded/beveled case
              edge rather than a sharp seam. Needs real-device confirmation —
              flag to the user if a residual seam remains. */}
          <div style={{ position: "absolute", left: 0, top: 0, width: 4, height: "100%", transformOrigin: "left center", transform: "rotateY(-45deg)", backfaceVisibility: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "linear-gradient(90deg, rgba(60,60,66,0.9) 0%, rgba(20,20,22,0.9) 100%)" }} />
          </div>
        </div>
      </div>
    </button>
  );
}
