"use client";

import { useEffect, useRef } from "react";
import ProfileDvdCase from "@/components/library/ProfileDvdCase";

// Scroll-driven wrapper around ProfileDvdCase — Task 2 of the Profile DVD
// case redesign. Plain scroll-listener + requestAnimationFrame, not
// Framer Motion (not a dependency of this project): each card's rotation/
// glare is retargeted imperatively via its own `update(normalizedX)`
// (exposed through ProfileDvdCase's ref, see useImperativeHandle there)
// rather than React state, so a scroll frame never triggers a React
// re-render — only real DOM style writes, which is what keeps this smooth.
//
// normalizedX is computed against the actual device viewport (window
// width), not just this row's own bounding box, matching the spec's
// "far left/center/far right of SCREEN" framing — this carousel already
// spans essentially the full screen width in practice.
export default function ProfileDvdCaseCarousel({ items, onOpen }) {
  const containerRef = useRef(null);
  const cardHandles = useRef([]);
  const tickingRef = useRef(false);

  const updateAll = () => {
    if (typeof window === "undefined") return;
    const vw = window.innerWidth;
    const centerX = vw / 2;
    cardHandles.current.forEach((handle) => {
      if (!handle) return;
      const el = handle.getEl();
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cardCenterX = rect.left + rect.width / 2;
      const nx = (cardCenterX - centerX) / centerX;
      handle.update(nx);
    });
  };

  useEffect(() => {
    // Initial paint — before any scroll, cards still need a rotation
    // reflecting wherever they actually sit (e.g. the first few are
    // already left-of-center on a long row).
    const id = requestAnimationFrame(updateAll);

    const onScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(() => {
        updateAll();
        tickingRef.current = false;
      });
    };

    const container = containerRef.current;
    container?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(id);
      container?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-measure whenever the item set itself changes (async fetch resolving, etc.)
  }, [items]);

  return (
    <div
      ref={containerRef}
      className="no-scrollbar"
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-end", // flush bottom baseline — no vertical stagger
        overflowX: "auto",
        overflowY: "visible", // must stay visible or the 3D rotation gets clipped
        WebkitOverflowScrolling: "touch",
        padding: "20px 10px",
        scrollbarWidth: "none",
        perspective: 1200,
        perspectiveOrigin: "center center",
      }}
    >
      {items.map((show, i) => (
        <ProfileDvdCase
          key={show.id}
          ref={(handle) => { cardHandles.current[i] = handle; }}
          show={show}
          onOpen={(rect) => onOpen(show, rect)}
        />
      ))}
    </div>
  );
}
