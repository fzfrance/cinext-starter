"use client";

import { useState, useEffect } from "react";
import StatusMenu from "@/components/StatusMenu";
import { setShowStatus, removeUserShow } from "@/lib/userShows";

// Long-press quick-actions for a poster outside Show Detail — the same
// compact liquid-glass StatusMenu dropdown Show Detail's own status
// control uses, anchored off the long-pressed poster's own rect
// (`anchorRect`, passed through from PosterCard's useLongPress, which
// captures it at press time) instead of the old bottom sheet. Flips to
// the left/above side of the poster whenever the default right/below
// placement would run off the edge of the viewport. `currentStatus` is
// optional — callers that don't already know a show's exact status (most
// poster grids only know why a show is IN that grid, not necessarily its
// literal status column) can omit it; StatusMenu just renders with no
// option pre-highlighted.
const MENU_W = 190;
const GAP = 8;
const EST_MENU_H = 260;

export default function PosterQuickStatusMenu({ show, userId, currentStatus = null, source, anchorRect, onClose, onStatusChange, removeLabel = "Remove", onRemove }) {
  const [busy, setBusy] = useState(false);

  // The menu is anchored with `position: fixed` viewport coordinates
  // captured once at long-press time (anchorRect), not CSS relative to an
  // in-flow ancestor the way StatusMenu's other usages are — there's no
  // single stable positioned wrapper shared across the 5+ different grids
  // this opens from. Fixed coordinates don't track scroll, so without
  // this the menu would visually detach from its poster the moment the
  // page scrolled. Locking the page in place while it's open (until the
  // user taps away to close it) is the fix, not live-repositioning on
  // every scroll event.
  const isOpen = Boolean(show);
  useEffect(() => {
    if (!isOpen) return;
    const { style } = document.body;
    const scrollY = window.scrollY;
    const prev = { position: style.position, top: style.top, left: style.left, right: style.right, width: style.width };
    style.position = "fixed";
    style.top = `-${scrollY}px`;
    style.left = "0";
    style.right = "0";
    style.width = "100%";
    return () => {
      style.position = prev.position;
      style.top = prev.top;
      style.left = prev.left;
      style.right = prev.right;
      style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  if (!show) return null;

  const handleSelect = async (id) => {
    if (busy) return;
    setBusy(true);
    try {
      if (id === "remove") {
        // Favorites passes its own onRemove (toggleFavorite) — unfavorite,
        // not the full "drop this show from the library" removeUserShow
        // every other caller means by "remove".
        if (onRemove) await onRemove(show.id);
        else await removeUserShow(userId, show.id, source);
      } else {
        await setShowStatus(userId, show.id, id, source, { explicit: true });
      }
      onStatusChange?.(show.id, id);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  let anchorStyle = { position: "fixed", top: 0, left: 0 };
  let align = "left";
  let direction = "down";
  if (anchorRect && typeof window !== "undefined") {
    const fitsRight = anchorRect.left + MENU_W + GAP <= window.innerWidth;
    align = fitsRight ? "left" : "right";
    const left = fitsRight ? anchorRect.left : anchorRect.right;
    const fitsBelow = window.innerHeight - anchorRect.bottom >= EST_MENU_H + GAP;
    direction = fitsBelow ? "down" : "up";
    const top = fitsBelow ? anchorRect.bottom : anchorRect.top;
    anchorStyle = { position: "fixed", top, left };
  }

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div style={anchorStyle} onClick={(e) => e.stopPropagation()}>
        <StatusMenu
          status={currentStatus}
          onSelect={handleSelect}
          align={align}
          direction={direction}
          removeLabel={removeLabel}
          style={{ opacity: busy ? 0.5 : 1, pointerEvents: busy ? "none" : "auto" }}
        />
      </div>
    </div>
  );
}
