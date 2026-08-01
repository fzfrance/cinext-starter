"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { backWithTransition } from "@/lib/viewTransition";

// A swipe starting within this many px of the left screen edge counts as a
// candidate back-gesture — matches iOS's own edge-swipe-back convention,
// deliberately NOT "swipe right anywhere on screen", since this app has
// plenty of its own horizontally-scrollable rows (genre chips, shelves,
// cast galleries) that a screen-wide swipe-right would fight with.
const EDGE_WIDTH = 24;
const SWIPE_THRESHOLD = 70; // net rightward px to actually trigger back
const MAX_VERTICAL_DRIFT = 60; // px of vertical drift before this is treated as a scroll, not a swipe-back

// Mounted once at the root layout so "swipe from the left edge to go back"
// works everywhere in the app, not just on screens with their own explicit
// back button — installed PWAs (standalone display mode) don't get
// Safari's own native edge-swipe chrome the way a page opened in the
// browser does, so this fills that gap. Renders nothing.
export default function SwipeBackGesture() {
  const router = useRouter();
  const start = useRef(null);

  useEffect(() => {
    const onTouchStart = (e) => {
      const touch = e.touches[0];
      if (!touch || touch.clientX > EDGE_WIDTH) { start.current = null; return; }
      start.current = { x: touch.clientX, y: touch.clientY, fired: false };
    };
    const onTouchMove = (e) => {
      if (!start.current || start.current.fired) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - start.current.x;
      const dy = Math.abs(touch.clientY - start.current.y);
      if (dy > MAX_VERTICAL_DRIFT) { start.current = null; return; }
      if (dx > SWIPE_THRESHOLD) {
        start.current.fired = true;
        backWithTransition(router);
      }
    };
    const onTouchEnd = () => { start.current = null; };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [router]);

  return null;
}
