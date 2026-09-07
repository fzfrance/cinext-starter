"use client";

import Icon from "@/components/ui/Icon";
import { VIEW_MODE_ICON } from "@/components/library/ViewModeMenu";

/**
 * Desktop-only Poster / DVD Case pill (same chrome as Home In Progress).
 * Mobile Library must use ViewModeMenu dropdown — never mount this under
 * `.library-mobile-chrome` / max-width 899px.
 */
export default function ViewModeToggle({ viewMode, onSelect, className = "" }) {
  return (
    <div className={`home-view-toggle${className ? ` ${className}` : ""}`} role="group" aria-label="Library view">
      <button
        type="button"
        className={viewMode === "poster" ? "is-active" : ""}
        aria-pressed={viewMode === "poster"}
        aria-label="Poster view"
        onClick={() => onSelect?.("poster")}
      >
        <Icon name={VIEW_MODE_ICON.poster} size={15} color={viewMode === "poster" ? "#111" : "rgba(255,255,255,0.6)"} />
      </button>
      <button
        type="button"
        className={viewMode === "dvd" ? "is-active" : ""}
        aria-pressed={viewMode === "dvd"}
        aria-label="DVD Case view"
        onClick={() => onSelect?.("dvd")}
      >
        <Icon name={VIEW_MODE_ICON.dvd} size={15} color={viewMode === "dvd" ? "#111" : "rgba(255,255,255,0.6)"} />
      </button>
    </div>
  );
}
