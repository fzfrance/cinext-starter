"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import StatusMenu, { statusMenuOptions } from "@/components/StatusMenu";
import CoverArt from "@/components/library/art/CoverArt";
import InsideArt from "@/components/library/art/InsideArt";
import SpineFace from "@/components/library/art/SpineFace";
import Disc from "@/components/library/art/Disc";
import { SPINE_W, REST_Y } from "@/components/library/ShelfCase";
import { useAuth } from "@/lib/auth-context";
import { setShowStatus, setShowFavorite, removeUserShow } from "@/lib/userShows";
import { tmdbImage } from "@/lib/tmdb";
import { themes } from "@/lib/theme";
import { useNavVisibility } from "@/lib/nav-visibility-context";

const t = themes.dark;
const TRUE_RED = "#ef4444"; // matches Settings' Delete Account red, distinct from the app's shared pink/rose danger token
const BIG_W = 226;
const BIG_H = 322;

/**
 * CaseOverlay — the opened-case full-screen view. Real hinged-book
 * mechanics, not a generic centered fade:
 *   1. enter/facing: the case flies from its exact tapped shelf position
 *      (a FLIP transform computed from `origin`, the tapped rect) to
 *      centered on screen — still closed.
 *   2. open: front cover swings open on a left hinge (rotateY), revealing a
 *      plain "inside cover" (flat background + tagline — deliberately NOT
 *      the same busy art as the front) and a spinning disc.
 *   3. closingLid: tap-to-close shuts the lid FIRST while the case stays
 *      centered.
 *   4. closingFly: only once the lid is fully shut does the whole case fly
 *      back and settle into its exact origin slot. Doing both at once reads
 *      as the case falling apart mid-air — these must stay sequential.
 * Status/favorite/remove all write straight to Supabase (lib/userShows.js) —
 * `onStatusChange`/`onFavoriteChange`/`onRemoved` let the parent page update
 * its own list optimistically without a full refetch. Removing a show is a
 * real hard delete that cascades through episode_watches/season_reviews
 * (all watch history + ratings for it, not just the status flag), so it's
 * gated behind a confirm dialog matching Settings' Delete Account pattern
 * (app/(tabs)/profile/settings/page.jsx) rather than a lighter one-tap
 * or double-tap-arm pattern.
 */
export default function CaseOverlay({ show, origin, onClose, onStatusChange, onFavoriteChange, onRemoved }) {
  const router = useRouter();
  const { user } = useAuth();
  const [phase, setPhase] = useState("enter");
  const [statusValue, setStatusValue] = useState(show.status);
  const [favorited, setFavorited] = useState(!!show.favorite);
  const [menuOpen, setMenuOpen] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const [logoFailed, setLogoFailed] = useState(false);
  const timers = useRef([]);
  const logoSrc = !logoFailed && show.logoPath ? tmdbImage(show.logoPath, "w300") : null;

  // FloatingNav (rendered by the shared (tabs) layout) sits at zIndex:100,
  // above this overlay's own zIndex:60 — without this, the bottom nav stays
  // fully bright and tappable through the whole open/close animation
  // instead of being covered by the dimmed backdrop like the rest of the
  // screen, breaking the "properly dimmed modal" effect. Hidden for this
  // component's entire mounted lifetime (open + both closing phases),
  // restored on unmount — same pattern Highlights' bulk-select bar already
  // uses for the same reason (see lib/nav-visibility-context.jsx).
  const [, setNavHidden] = useNavVisibility();
  useEffect(() => {
    setNavHidden(true);
    return () => setNavHidden(false);
  }, [setNavHidden]);

  useEffect(() => {
    timers.current.push(setTimeout(() => setPhase("facing"), 60));
    timers.current.push(setTimeout(() => setPhase("open"), 1100));
    return () => timers.current.forEach(clearTimeout);
  }, []);

  // Close happens in two beats, not one: the lid shuts first while the case
  // stays centered (closingLid), then — only once it's fully shut — the
  // whole closed case flies back and settles into its shelf slot
  // (closingFly). Doing both at once read as the case snapping apart
  // mid-air; sequencing them is what makes it read as "close, then put away."
  const LID_CLOSE_MS = 1400;
  const FLY_BACK_MS = 1050;
  const close = () => {
    if (removeConfirmOpen) return;
    setPhase("closingLid");
    timers.current.push(setTimeout(() => setPhase("closingFly"), LID_CLOSE_MS + 20));
    timers.current.push(setTimeout(onClose, LID_CLOSE_MS + 20 + FLY_BACK_MS));
  };

  const open = phase === "open";
  const lidOpen = phase === "open";
  // the case block stays centered/upright through closingLid (lid is still
  // visibly shutting) and only starts flying back once closingFly begins.
  const caseCentered = phase === "facing" || phase === "open" || phase === "closingLid";
  const isClosingFly = phase === "closingFly";
  const dimmed = phase !== "closingFly"; // backdrop stays tinted until the case is on its way home
  const currentStatus = statusMenuOptions.find((o) => o.id === statusValue) ?? statusMenuOptions[0];

  const selectStatus = async (id) => {
    setMenuOpen(false);
    if (id === "remove") {
      setRemoveError("");
      setRemoveConfirmOpen(true);
      return;
    }
    const prev = statusValue;
    setStatusValue(id); // optimistic
    try {
      await setShowStatus(user.id, show.id, id, "Library:caseOverlay", { explicit: true });
      onStatusChange?.(show.id, id);
    } catch (err) {
      console.error("Failed to update status:", err);
      setStatusValue(prev); // roll back
    }
  };

  const toggleFavorite = async () => {
    const next = !favorited;
    setFavorited(next); // optimistic
    try {
      const ok = await setShowFavorite(user.id, show.id, next, "Library:caseOverlay");
      if (ok) onFavoriteChange?.(show.id, next);
      else setFavorited(!next); // no existing library row — roll back
    } catch (err) {
      console.error("Failed to update favorite:", err);
      setFavorited(!next);
    }
  };

  const confirmRemove = async () => {
    setRemoving(true);
    setRemoveError("");
    try {
      await removeUserShow(user.id, show.id, "Library:caseOverlay");
      setRemoveConfirmOpen(false);
      onRemoved?.(show.id);
    } catch (err) {
      console.error("Failed to remove show:", err);
      setRemoveError("Couldn't remove this show. Try again.");
    } finally {
      setRemoving(false);
    }
  };

  // FLIP: the case's resting position (before opening / after closing) should
  // match exactly where it was tapped on the shelf, not a generic centered
  // shrink. baseCenterX/Y is where the case sits on screen once it's floated
  // to center (translateX(-BIG_W/2) puts it at true viewport center during
  // the enter/facing/closingLid phases — see the outer container transform below).
  const vw = typeof window !== "undefined" ? window.innerWidth : 390;
  const vh = typeof window !== "undefined" ? window.innerHeight : 844;
  const baseCenterX = vw / 2;
  const baseCenterY = vh / 2;
  const originCenterX = origin ? origin.left + origin.width / 2 : baseCenterX;
  const originCenterY = origin ? origin.top + origin.height / 2 : baseCenterY;
  const restDx = originCenterX - baseCenterX;
  const restDy = originCenterY - baseCenterY;
  const restScale = origin ? Math.max(0.14, Math.min(0.55, origin.height / BIG_H)) : 0.3;
  const restTransform = `translate(${restDx}px, ${restDy}px) scale(${restScale}) rotateY(${REST_Y}deg)`;

  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: dimmed ? "rgba(4,4,6,0.65)" : "rgba(4,4,6,0)", transition: "background 1s ease" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: BIG_W * 2, height: BIG_H, position: "relative", display: "flex", justifyContent: "center", transform: `scale(${open ? 0.72 : 0.86}) translateX(${open ? 0 : -BIG_W / 2}px)`, transition: "transform 1.05s cubic-bezier(.6,.05,.2,1)" }}>
        <div style={{ position: "absolute", left: BIG_W, top: 0, width: BIG_W, height: BIG_H, perspective: 1500 }}>
          <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transformOrigin: "left center", transform: caseCentered ? "translate(0px,0px) scale(1) rotateY(0deg)" : restTransform, transition: isClosingFly ? `transform ${FLY_BACK_MS}ms cubic-bezier(.22,1,.36,1)` : "transform 1s cubic-bezier(.5,.05,.2,1)" }}>
            {/* The REAL "disc missing" bug: once open, this tray face and
                the lid's own inside-cover face (below) both end up nearly
                facing the viewer at the same z-depth (both effectively
                translateZ(0) in that state) — two siblings in the SAME
                preserve-3d space tied on depth. CSS 3D compositing doesn't
                reliably z-buffer across sibling subtrees like this; ties
                commonly resolve by paint/DOM order instead, and the
                inside-cover (which comes later in the DOM, see below) can
                win and fully occlude the disc. translateZ(6px) here (and a
                matching translateZ(-6px) on the lid's own open transform
                below) breaks that tie explicitly, so the disc unambiguously
                renders in front regardless of which compositing path a
                given browser/WebView takes.

                This must be GATED on lidOpen, not unconditional — an
                earlier pass applied it unconditionally, which meant the
                tray's own opaque background (this whole div) sat in front
                of the CLOSED cover too (lid only at translateZ(3px) while
                closed, less than this div's flat 6px), painting a plain
                grey rectangle over the front cover for the entire ~1.4s
                swing before it visually finished opening — exactly the
                "grey screen, disc visible before opening" bug. Both the
                push here and the opacity below are also delayed 1000ms
                (not applied the instant `lidOpen` flips true) so they only
                kick in once the lid's own 1400ms swing (LID_CLOSE_MS) is
                mostly out of the way, instead of racing ahead of it. */}
            <div style={{ position: "absolute", inset: 0, borderRadius: "0 6px 6px 0", background: "linear-gradient(180deg, #17171a 0%, #101013 100%)", border: "1px solid rgba(255,255,255,0.09)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 26px 60px rgba(0,0,0,0.6), inset 3px 0 6px rgba(0,0,0,0.5)", transform: lidOpen ? "translateZ(6px)" : "translateZ(0px)", transition: lidOpen ? "transform 1ms linear 1000ms" : "transform 1ms linear", backfaceVisibility: "visible", WebkitBackfaceVisibility: "visible" }}>
              {/* Disc is the "view show" tap target — no separate button
                  needed. Visibility is explicit here (opacity keyed to
                  real `lidOpen` state), not left to the 3D scene's own
                  depth/backface-visibility math — on real iOS Safari that
                  implicit approach was inconsistent (reported showing the
                  disc through the closed cover and hiding it once actually
                  open, the reverse of intended), so this makes the show/
                  hide deterministic regardless of how the browser
                  composites the surrounding preserve-3d hinge animation.
                  Fades in delayed + slower on open (900ms delay, matching
                  the tray's own push above) so it only appears once the
                  lid has actually swung mostly clear; hides fast with no
                  delay on close, so it doesn't linger visible while the
                  lid swings back toward the viewer. */}
              <button onClick={(e) => { e.stopPropagation(); router.push(`/show/${show.id}`); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", borderRadius: "50%", opacity: lidOpen ? 1 : 0, transition: lidOpen ? "opacity 400ms ease 900ms" : "opacity 200ms ease", backfaceVisibility: "visible", WebkitBackfaceVisibility: "visible" }}>
                <Disc show={show} />
              </button>
              <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, textAlign: "center", color: t.textDim, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase" }}>{show.meta}</div>
            </div>
            <div style={{ position: "absolute", left: 0, top: 0, width: SPINE_W + 6, height: "100%", transformOrigin: "left center", transform: "rotateY(-90deg)", overflow: "hidden", backfaceVisibility: "hidden" }}>
              <SpineFace show={show} height={BIG_H} />
            </div>
            {/* Bevel/seam face — same fix as ShelfCase's rest state, sized up
                proportionally for this larger case. See ShelfCase.jsx for
                the full geometry reasoning. */}
            <div style={{ position: "absolute", left: 0, top: 0, width: 6, height: "100%", transformOrigin: "left center", transform: "rotateY(-45deg)", backfaceVisibility: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "linear-gradient(90deg, rgba(60,60,66,0.9) 0%, rgba(20,20,22,0.9) 100%)" }} />
            </div>
            <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transformOrigin: "left center", transform: lidOpen ? "rotateY(-178deg) translateZ(-6px)" : "rotateY(0deg) translateZ(3px)", transition: `transform ${LID_CLOSE_MS}ms cubic-bezier(.68,0,.22,1)` }}>
              <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", borderRadius: "0 6px 6px 0", overflow: "hidden", boxShadow: "0 26px 60px rgba(0,0,0,0.6)" }}>
                <CoverArt show={show} big />
              </div>
              <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)", borderRadius: "6px 0 0 6px", overflow: "hidden" }}>
                <InsideArt show={show} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 4, textAlign: "center", position: "relative", opacity: open ? 1 : 0, transform: open ? "translateY(0)" : "translateY(10px)", transition: "opacity .6s ease .6s, transform .6s ease .6s" }}>
        {logoSrc ? (
          <img
            src={logoSrc}
            alt=""
            onError={() => setLogoFailed(true)}
            // maxHeight was 46 — fine for wide wordmarks (still governed by
            // maxWidth first, so unaffected), but a squarish/stacked logo
            // (common for CJK titles, e.g. a 2-line Korean lockup) is
            // height-constrained instead, and at 46 it rendered as a tiny
            // ~60px sliver that reads as "off-center"/adrift rather than
            // as a deliberately-sized title. A taller cap gives those room
            // to render at a legible, visually-intentional size.
            style={{ maxWidth: 190, maxHeight: 68, objectFit: "contain", filter: "drop-shadow(0 2px 10px rgba(0,0,0,0.7))" }}
          />
        ) : (
          <div style={{ color: "#fff", fontSize: 17, fontWeight: 700, textShadow: "0 2px 10px rgba(0,0,0,0.7)" }}>{show.title}</div>
        )}
        <div style={{ color: "rgba(255,255,255,0.78)", fontSize: 12.5, marginTop: 3, textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>{show.year} · {show.meta}</div>

        <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <div style={{ position: "relative" }}>
            <button onClick={() => setMenuOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 999, background: "#fff", border: "none", cursor: "pointer" }}>
              <Icon name={currentStatus.icon} size={16} color="#111" />
              <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{currentStatus.label}</span>
            </button>
            {menuOpen && <StatusMenu status={statusValue} onSelect={selectStatus} align="center" direction="up" />}
          </div>
          <button onClick={toggleFavorite} style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(14px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <Icon name={favorited ? "heart" : "heartOutline"} size={18} color={favorited ? "#e0567a" : "#cfcfd6"} />
          </button>
        </div>
      </div>

      <button onClick={close} style={{ position: "absolute", top: 22, right: 20, width: 38, height: 38, borderRadius: "50%", background: t.cardFill, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <Icon name="x" size={17} />
      </button>

      {removeConfirmOpen && (
        <div onClick={(e) => e.stopPropagation()} className="fixed inset-0 z-10 flex items-center justify-center px-8" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full rounded-3xl flex flex-col items-center text-center" style={{ maxWidth: 300, padding: 22, background: t.dialogBg, border: `1px solid ${t.glassBorder}`, boxShadow: "0 30px 60px rgba(0,0,0,0.6)" }}>
            <div className="flex items-center justify-center gap-2" style={{ marginBottom: 10 }}>
              <Icon name="warning" size={17} color={TRUE_RED} />
              <span style={{ fontSize: 16, fontWeight: 700, color: t.text }}>Remove {show.title}?</span>
            </div>
            <div style={{ fontSize: 13, color: t.textDim, lineHeight: 1.5 }}>This also deletes your watch history and any ratings for this show. This can&apos;t be undone.</div>
            {removeError && <div style={{ fontSize: 12.5, color: TRUE_RED, marginTop: 10 }}>{removeError}</div>}
            <div className="flex gap-2.5 justify-center" style={{ marginTop: 20 }}>
              <button onClick={() => setRemoveConfirmOpen(false)} disabled={removing} className="rounded-full active:scale-95 transition" style={{ padding: "8px 18px", background: t.inputBg, border: `1px solid ${t.glassBorder}`, opacity: removing ? 0.5 : 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>Cancel</span>
              </button>
              <button
                onClick={confirmRemove}
                disabled={removing}
                className="rounded-full active:scale-95 transition"
                style={{ padding: "8px 18px", background: t.cardFill, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", opacity: removing ? 0.6 : 1 }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: TRUE_RED }}>{removing ? "Removing…" : "Remove"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
