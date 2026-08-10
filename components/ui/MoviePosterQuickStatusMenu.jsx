"use client";

import { useState, useEffect } from "react";
import StatusMenu, { movieStatusMenuOptions } from "@/components/StatusMenu";
import { setMovieStatus, removeUserMovie } from "@/lib/userMovies";

// Fork of PosterQuickStatusMenu.jsx, not a parameterized version of it —
// that file hardcodes setShowStatus/removeUserShow, and reusing it
// unmodified for a movie poster would silently write the movie's status
// into user_shows under its raw numeric id (movie and TV ids aren't
// globally unique — exactly the bug class lib/media.js's mediaKey exists
// to prevent elsewhere). Same layout/positioning logic, verbatim.
//
// setMovieStatus has no `{ explicit }` option at all (unlike
// setShowStatus) — user_movies.status_explicit is always true by
// construction, since a movie row can only ever be created by an
// explicit status pick (see lib/userMovies.js).

const MENU_W = 190;
const GAP = 8;
const EST_MENU_H = 260;

export default function MoviePosterQuickStatusMenu({ show, userId, currentStatus = null, source, anchorRect, onClose, onStatusChange, removeLabel = "Remove", onRemove, options = movieStatusMenuOptions }) {
  const [busy, setBusy] = useState(false);

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
        if (onRemove) await onRemove(show.id);
        else await removeUserMovie(userId, show.id, source);
      } else {
        await setMovieStatus(userId, show.id, id, source);
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
          options={options}
          style={{ opacity: busy ? 0.5 : 1, pointerEvents: busy ? "none" : "auto" }}
        />
      </div>
    </div>
  );
}
