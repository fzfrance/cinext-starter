"use client";

import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";
import Icon from "@/components/ui/Icon";
import CoverArt from "@/components/library/art/CoverArt";
import SpineFace from "@/components/library/art/SpineFace";
import { tmdbImage } from "@/lib/tmdb";

// Profile-only fork of components/library/ShelfCase.jsx (scoped to
// Profile's two carousels only, per explicit choice — the main Library
// tab's own shelves are untouched).
//
// Third attempt at this component, this time built directly against the
// real ShelfCase.jsx rather than approximated from a written spec — both
// previous versions changed the actual hinge anatomy on top of a wrong
// rotation range, which is what produced flat-looking cards and a
// backface-culling bug. This version keeps ShelfCase's exact proven
// technique (cover as the primary local-rotateY(0) plane, spine hinged
// at its LEFT edge via local rotateY(-90) — reusing its own CoverArt/
// SpineFace art components verbatim, not hand-rolled approximations of
// them) and changes only ONE thing: REST_Y becomes a per-scroll-position
// DYNAMIC value instead of ShelfCase's fixed 60deg constant.
//
// Rotation range, per explicit direction: more spine-dominant than the
// original's resting 60deg baseline ("front facing less visible... spine
// turned more towards us"), sweeping monotonically as the row scrolls
// left→right toward hiding MORE of the cover, not less — direction was
// reversed per explicit correction (a prior pass had this backwards: the
// cover became more visible scrolling rightward, when it should recede
// further from view). The whole range is also tightened much closer to
// 90deg than before — the spine is the main visibility at every point in
// the sweep, with the cover only ever a thin sliver, per "make the poster
// less front facing... spine is the main visibility." SPINE_W itself is
// unchanged (not widened) — this is a rotation-only adjustment.
export const SPINE_W = 30;
export const COVER_W = 148;
export const COVER_H = 208;
// Tightened per explicit "gap between the cases is too big" feedback —
// was 56 (ShelfCase's own value), pulled in so cases sit closer together.
export const SLOT_W = 46;

// Corrected again per explicit follow-up: the previous curve (power 0.28)
// squeezed the whole "open" state into a tiny sliver right at the exact
// left edge — everywhere else was already ~85deg+ (hidden), so the reveal
// read as arriving "too late," well after a card had already started
// moving. Flipped to power > 1 instead: this opens up as soon as a card
// starts tracking away from the hidden/right side, continuously, "like
// turning a page in a book," still closing all the way to fully-inside
// (88deg, unchanged) by the right edge. LEFT_EXTREME_DEG has since been
// nudged further inside twice more, ~10% each time, per follow-up asks
// for less cover at the start (58 -> 64 -> 70).
const LEFT_EXTREME_DEG = 70; // left edge — turned inside further per two follow-up 10% nudges (was 58, then 64)
const RIGHT_EXTREME_DEG = 88; // right edge — almost fully inside, unchanged
function rotationForNormalizedX(nx) {
  const clamped = Math.max(-1, Math.min(1, nx));
  const t = (clamped + 1) / 2; // 0 at the left edge .. 1 at the right edge
  const eased = Math.pow(t, 1.6); // opens early/continuously, only fully closes near the right edge
  return LEFT_EXTREME_DEG + eased * (RIGHT_EXTREME_DEG - LEFT_EXTREME_DEG);
}
// Glare sweep — an additive touch on top of SpineFace's own real plastic-
// case art (end caps + DVD watermark + title, all already built into
// SpineFace), angle retargeted per scroll position for a subtle moving
// highlight across the spine.
function glareAngleForNormalizedX(nx) {
  return 100 + Math.max(-1, Math.min(1, nx)) * 40;
}

// Targeted fix for logos that are themselves too dark to read against the
// spine (e.g. 20th Century Women's real TMDB logo art is near-black
// text) — NOT a general contrast treatment applied to every card (that
// approach, a uniform glow behind every logo, was explicitly reverted).
// This only ever changes a specific title if ITS OWN logo image samples
// as too dark; every other card's logo renders exactly as before.
// Samples through Next's own same-origin image proxy, not the raw TMDB
// CDN URL directly — the same fix already established for the (now
// removed) poster-color sampling: a plain <img> elsewhere on the page
// requesting the identical raw URL poisons a later direct fetch of it.
function sampleLogoLuminance(rawUrl) {
  const proxiedUrl = `/_next/image?url=${encodeURIComponent(rawUrl)}&w=128&q=75`;
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      try {
        const sw = 48;
        const sh = Math.max(1, Math.round(sw * (img.naturalHeight / img.naturalWidth || 1)));
        const canvas = document.createElement("canvas");
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, sw, sh);
        const { data } = ctx.getImageData(0, 0, sw, sh);
        // Logos are transparent PNGs — most of the image is empty alpha,
        // not part of the actual glyph. Averaging every pixel (including
        // transparent ones, which read as black) would always skew dark
        // regardless of the real text color, so only opaque-ish pixels
        // (the glyph itself) count toward the average.
        let lumSum = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 40) continue;
          lumSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          n++;
        }
        resolve(n > 0 ? lumSum / n : null);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = proxiedUrl;
  });
}
// Below this, the real logo art is close enough to black that it has no
// real edge against the spine's own dark gradient — conservative on
// purpose, so this only ever catches genuinely near-black logos, not
// merely darker-toned ones that still read fine.
const LOGO_TOO_DARK_LUMINANCE = 45;

const ProfileDvdCase = forwardRef(function ProfileDvdCase({ show, onOpen }, ref) {
  const btnRef = useRef(null);
  const groupRef = useRef(null);
  const glareRef = useRef(null);
  const [logoTooDark, setLogoTooDark] = useState(false);

  useEffect(() => {
    if (!show.logoPath) { setLogoTooDark(false); return; }
    let cancelled = false;
    sampleLogoLuminance(tmdbImage(show.logoPath, "w300"))
      .then((lum) => { if (!cancelled) setLogoTooDark(lum != null && lum < LOGO_TOO_DARK_LUMINANCE); })
      .catch(() => { if (!cancelled) setLogoTooDark(false); });
    return () => { cancelled = true; };
  }, [show.logoPath]);

  // Only ever drops `logoPath` (forcing SpineFace's own existing white-
  // text fallback) for a card whose real logo art was sampled too dark —
  // everything else about `show` (and every other card's own logo) is
  // untouched.
  const spineShow = logoTooDark ? { ...show, logoPath: null } : show;

  // Imperative update path — called by ProfileDvdCaseCarousel's scroll
  // handler, never by React re-render, so retargeting every visible
  // card's rotation/glare on scroll never thrashes React.
  useImperativeHandle(ref, () => ({
    update(normalizedX) {
      if (groupRef.current) {
        groupRef.current.style.transform = `rotateY(${rotationForNormalizedX(normalizedX)}deg)`;
      }
      if (glareRef.current) {
        glareRef.current.style.background = `linear-gradient(${glareAngleForNormalizedX(normalizedX)}deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 55%)`;
      }
    },
    getEl() {
      return btnRef.current;
    },
  }));

  return (
    <button
      ref={btnRef}
      onClick={() => onOpen(btnRef.current.getBoundingClientRect())}
      style={{ width: SLOT_W, height: COVER_H, position: "relative", flexShrink: 0, background: "none", border: "none", padding: 0, cursor: "pointer" }}
    >
      {/* perspective on this geometry wrapper (matching the card's own
          size/position, not the outer button) — same reasoning
          ShelfCase's own comment gives: keeps the vanishing point
          centered on what's actually rotating. */}
      <div style={{ position: "absolute", left: 6, top: 0, width: COVER_W, height: COVER_H, perspective: 900 }}>
        <div
          ref={groupRef}
          style={{
            position: "absolute", inset: 0, transformStyle: "preserve-3d", transformOrigin: "left center",
            transform: `rotateY(${LEFT_EXTREME_DEG}deg)`, willChange: "transform",
            // The bleeding cover/spine below intentionally extend past
            // this card's own SLOT_W hit area into neighboring cards'
            // space for the stacked-shelf look (same technique
            // ShelfCase/Aisle already use elsewhere) — pointer-events
            // disabled here so a tap always resolves to whichever card's
            // own button box was actually under the finger, not
            // whichever card's bleeding art happens to paint on top.
            pointerEvents: "none",
          }}
        >
          <div style={{ position: "absolute", inset: 0, borderRadius: "0 4px 4px 0", overflow: "hidden", backfaceVisibility: "hidden", boxShadow: "8px 6px 24px rgba(0,0,0,0.55), inset 3px 0 6px rgba(0,0,0,0.5)" }}>
            <CoverArt show={show} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(0,0,0,0.35), transparent 45%)" }} />
            {show.favorite && (
              <div style={{ position: "absolute", top: 8, right: 8, width: 20, height: 20, borderRadius: "50%", background: "rgba(10,10,12,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="heart" size={10} color="#e0567a" />
              </div>
            )}
          </div>
          <div style={{ position: "absolute", left: 0, top: 0, width: SPINE_W, height: "100%", transformOrigin: "left center", transform: "rotateY(-90deg)", borderRadius: "3px 0 0 3px", overflow: "hidden", backfaceVisibility: "hidden" }}>
            <SpineFace show={spineShow} height={COVER_H} />
            <div ref={glareRef} style={{ position: "absolute", inset: 0, background: "linear-gradient(100deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 55%)" }} />
          </div>
          {/* Bevel/seam — same fix ShelfCase's own comment explains
              (closes the hairline gap at steep angles between two
              independently-clipped planes). */}
          <div style={{ position: "absolute", left: 0, top: 0, width: 4, height: "100%", transformOrigin: "left center", transform: "rotateY(-45deg)", backfaceVisibility: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "linear-gradient(90deg, rgba(60,60,66,0.9) 0%, rgba(20,20,22,0.9) 100%)" }} />
          </div>
        </div>
      </div>
    </button>
  );
});

export default ProfileDvdCase;
