"use client";

import { useRef, useState } from "react";

// Shared long-press gesture — same mechanics already proven in Highlights'
// own inline implementation (Watch History's episode-row quick menu),
// extracted here so every poster grid that needs "hold to change status"
// doesn't re-derive this from scratch. Pointer events (not onTouchStart),
// so mouse and touch behave identically. A move threshold cancels the
// timer if the pointer drifts (so a scroll or a drag-reorder gesture
// doesn't also fire the long-press), and `consumeClick()` lets the
// element's own onClick/Link navigation swallow the click that always
// follows a pointerup, so a fired long-press doesn't ALSO navigate.
//
// `onLongPress` is called with the pressed element's own
// getBoundingClientRect(), captured at press-down time — lets callers
// (PosterQuickStatusMenu) anchor a popover to the actual element instead
// of needing a bottom-sheet fallback for "no reliable position to anchor
// against".
const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 10;

export function useLongPress(onLongPress) {
  const timerRef = useRef(null);
  const firedRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const rectRef = useRef(null);
  const [pressed, setPressed] = useState(false);

  const cancel = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setPressed(false);
  };

  const onPointerDown = (e) => {
    firedRef.current = false;
    startRef.current = { x: e.clientX, y: e.clientY };
    rectRef.current = e.currentTarget.getBoundingClientRect();
    setPressed(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      firedRef.current = true;
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
      setPressed(false);
      onLongPress(rectRef.current);
    }, LONG_PRESS_MS);
  };
  const onPointerMove = (e) => {
    if (!timerRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) cancel();
  };
  const onContextMenu = (e) => e.preventDefault();

  // Returns true (and resets the flag) if this click is the one following
  // a fired long-press — callers should skip their own click/navigation
  // behavior when this returns true.
  const consumeClick = () => {
    if (firedRef.current) { firedRef.current = false; return true; }
    return false;
  };

  return {
    pressed,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onContextMenu,
    },
    consumeClick,
  };
}
