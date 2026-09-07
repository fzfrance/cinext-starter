"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/ui/Icon";

export const statusMenuOptions = [
  { id: "watchlist", label: "Watchlist", icon: "bookmark" },
  { id: "watching", label: "Watching", icon: "glasses" },
  { id: "completed", label: "Completed", icon: "select" },
  { id: "paused", label: "Paused", icon: "paused" },
  { id: "drop", label: "Drop", icon: "drop" },
  { id: "remove", label: "Remove", icon: "trash", danger: true },
];

// Movies use a deliberately simplified vocabulary — Watchlist / Watched /
// Remove only, per explicit request (no Watching/Paused/Drop for movies,
// unlike shows). "Watched" reuses the existing "completed" id/DB value —
// user_movies already stamps watched_on on transition to 'completed' (see
// lib/userMovies.js) — this is a label-only change, not a new status
// value, so no migration or write-path change is needed.
export const movieStatusMenuOptions = [
  { id: "watchlist", label: "Watchlist", icon: "bookmark" },
  { id: "completed", label: "Watched", icon: "select" },
  { id: "remove", label: "Remove", icon: "trash", danger: true },
];

// The full Favorites list pages (app/(tabs)/profile/favorites,
// .../favorites/movies) are unfavorite-only surfaces — status changes
// belong on the show/movie's own detail page or a real library grid, not
// here, per explicit request to unify both pages down to a single
// option. `label` is unused in practice (StatusMenu's own render always
// overrides the "remove" row's label with the caller's `removeLabel`
// prop instead — kept here for readability/parity with the other option
// lists).
export const favoritesOnlyOptions = [
  { id: "remove", label: "Remove from Favorites", icon: "trash", danger: true },
];

const MENU_W = 190;
const GAP = 8;
const VIEW_PAD = 12;

// Shared status-setting popover (Watchlist / Watching / Completed / Paused /
// Drop / Remove) — used by Show Detail, Explore/search, library overlays,
// and poster long-press menus. Portaled + position:fixed so parent
// overflow (hero / action row / cards) can never clip the last option
// ("Remove"). Flips above the trigger when there isn't enough room below.
//
// Neutral white icons for every non-danger option (no amber/accent).
// "Remove" stays pink/danger-colored.
export default function StatusMenu({
  status,
  onSelect,
  align = "center",
  direction = "auto",
  includeRemove = true,
  removeLabel = "Remove",
  options: optionsProp = statusMenuOptions,
  style,
  // When the menu is already mounted inside a fixed/portal anchor
  // (PosterQuickStatusMenu), skip the second portal and keep relative CSS.
  anchored = false,
}) {
  const options = includeRemove ? optionsProp : optionsProp.filter((o) => o.id !== "remove");
  const markerRef = useRef(null);
  const [coords, setCoords] = useState(null);

  useLayoutEffect(() => {
    if (anchored) return undefined;

    const place = () => {
      const marker = markerRef.current;
      const wrap = marker?.parentElement;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      // Hidden layout (e.g. mobile hero while desktop is shown) still mounts
      // this menu — skip portaling when the trigger isn't on-screen, or a
      // second menu ends up at 0,0 on top of the real one.
      if (rect.width < 1 && rect.height < 1) {
        setCoords(null);
        return;
      }
      const estH = Math.min(options.length * 44 + 20, 420);
      const spaceBelow = window.innerHeight - rect.bottom - VIEW_PAD;
      const spaceAbove = rect.top - VIEW_PAD;

      let dir = direction;
      if (dir === "auto") {
        dir = spaceBelow >= estH || spaceBelow >= spaceAbove ? "down" : "up";
      }

      const maxHeight = Math.max(
        160,
        Math.min(420, dir === "down" ? spaceBelow - GAP : spaceAbove - GAP)
      );

      let left;
      if (align === "right") left = rect.right - MENU_W;
      else if (align === "left") left = rect.left;
      else left = rect.left + rect.width / 2 - MENU_W / 2;
      left = Math.max(VIEW_PAD, Math.min(left, window.innerWidth - MENU_W - VIEW_PAD));

      const top = dir === "up"
        ? Math.max(VIEW_PAD, rect.top - GAP - Math.min(estH, maxHeight))
        : rect.bottom + GAP;

      setCoords({ top, left, maxHeight, dir });
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchored, align, direction, options.length]);

  const menu = (
    <div
      className="rounded-2xl"
      role="menu"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      style={{
        width: MENU_W,
        padding: "8px 6px",
        maxHeight: anchored ? (style?.maxHeight ?? "min(420px, 70dvh)") : (coords?.maxHeight ?? 320),
        overflowY: "auto",
        overscrollBehavior: "contain",
        background: "rgba(48, 50, 54, 0.96)",
        border: "1px solid rgba(255,255,255,0.12)",
        backdropFilter: "blur(28px) saturate(140%)",
        WebkitBackdropFilter: "blur(28px) saturate(140%)",
        boxShadow: "0 20px 44px rgba(0,0,0,0.55)",
        scrollbarWidth: "thin",
        ...(anchored
          ? {
              position: "absolute",
              zIndex: 100,
              ...(direction === "up" ? { bottom: "calc(100% + 8px)" } : { top: "calc(100% + 8px)" }),
              ...(align === "right" ? { right: 0 } : align === "left" ? { left: 0 } : { left: "50%", transform: "translateX(-50%)" }),
              ...style,
            }
          : {
              position: "fixed",
              zIndex: 200,
              top: coords?.top ?? 0,
              left: coords?.left ?? 0,
              visibility: coords ? "visible" : "hidden",
              ...style,
            }),
      }}
    >
      {options.map((opt) => {
        const active = status === opt.id;
        // Overridable per-caller — e.g. Favorites' long-press menu passes
        // "Remove from Favorite" here, since plain "Remove" reads as
        // ambiguous (unfavorite vs. drop the show from the library
        // entirely) in a screen that's specifically about favorites.
        const label = opt.id === "remove" ? removeLabel : opt.label;
        const iconColor = opt.danger ? "#e0567a" : "#fff";
        return (
          <button
            key={opt.id}
            type="button"
            role="menuitem"
            onClick={() => onSelect(opt.id)}
            className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition"
            style={{ padding: "11px 12px", background: active ? "rgba(255,255,255,0.14)" : "transparent", flexShrink: 0 }}
          >
            <Icon name={opt.id === "watchlist" && active ? "bookmarkFilled" : opt.icon} size={16} color={iconColor} />
            {/* textAlign left — without it, a label long enough to wrap
                (e.g. "Remove from Favorites") inherits the <button>
                element's own default center text-align and visibly
                centers each wrapped line instead of flowing left from the
                icon like every single-line label already does. */}
            <span style={{ flex: 1, fontSize: 13.5, color: opt.danger ? "#e0567a" : "#fff", fontWeight: 500, textAlign: "left" }}>{label}</span>
            {active && !opt.danger && <Icon name="check" size={13} color="#fff" strokeWidth={2.4} />}
          </button>
        );
      })}
    </div>
  );

  if (anchored) return menu;

  return (
    <>
      {/* Zero-size marker kept in the trigger wrapper so we can measure it. */}
      <span ref={markerRef} aria-hidden="true" style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }} />
      {coords && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </>
  );
}
