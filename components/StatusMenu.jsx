"use client";

import Icon from "@/components/ui/Icon";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

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

// Shared status-setting popover (Watchlist / Watching / Completed / Paused /
// Drop / Remove) — used by both Show Detail's "Add to Library" control and
// Explore search results' "+" button. Self-positions via plain CSS
// (`top: 100%` relative to whatever positioned wrapper the caller renders
// it inside — no backdrop, no anchor-rect math), closing only when an
// option is picked or the trigger is toggled again, same as the original
// Show Detail dropdown this was extracted from.
//
// White/glass styling on the row itself (active row = plain white tint, not
// accent) and on the label text — only each option's own icon uses the
// accent color now, per explicit request. Accent color selection is
// currently disabled (Settings > Appearance is "Coming Soon"), so this is
// effectively always amber in practice today. "Remove" always stays
// pink/danger-colored regardless of active state.
export default function StatusMenu({ status, onSelect, align = "center", direction = "down", includeRemove = true, removeLabel = "Remove", options: optionsProp = statusMenuOptions, style }) {
  const options = includeRemove ? optionsProp : optionsProp.filter((o) => o.id !== "remove");
  const alignStyle = align === "right" ? { right: 0 } : align === "left" ? { left: 0 } : { left: "50%", transform: "translateX(-50%)" };
  // "up" is for triggers anchored low on screen with little room below them
  // (e.g. CaseOverlay's status pill, which floats roughly mid-to-lower
  // screen inside a `position:fixed` overlay that has no page scroll to
  // fall back on) — opening downward there pushed the last option(s)
  // (Drop/Remove) past the bottom edge with nothing to scroll to reach
  // them. maxHeight + overflowY stays on regardless of direction as a
  // backstop for any trigger position tight enough to still not fit.
  const directionStyle = direction === "up" ? { bottom: "calc(100% + 8px)" } : { top: "calc(100% + 8px)" };

  return (
    <div
      className="absolute z-30 rounded-2xl"
      style={{
        width: 190, padding: "6px", maxHeight: "40dvh", overflowY: "auto",
        background: "rgba(38,38,42,0.93)", border: "1px solid rgba(255,255,255,0.12)",
        backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        boxShadow: "0 20px 44px rgba(0,0,0,0.55)",
        ...directionStyle, ...alignStyle, ...style,
      }}
    >
      {options.map((opt) => {
        const active = status === opt.id;
        // Overridable per-caller — e.g. Favorites' long-press menu passes
        // "Remove from Favorite" here, since plain "Remove" reads as
        // ambiguous (unfavorite vs. drop the show from the library
        // entirely) in a screen that's specifically about favorites.
        const label = opt.id === "remove" ? removeLabel : opt.label;
        return (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition"
            style={{ padding: "10px 12px", background: active ? "rgba(255,255,255,0.14)" : "transparent" }}
          >
            <Icon name={opt.id === "watchlist" && active ? "bookmarkFilled" : opt.icon} size={16} color={opt.danger ? "#e0567a" : accent} />
            <span style={{ fontSize: 13.5, color: opt.danger ? "#e0567a" : "#fff", fontWeight: 500 }}>{label}</span>
            {active && !opt.danger && <Icon name="check" size={13} color="#fff" strokeWidth={2.4} />}
          </button>
        );
      })}
    </div>
  );
}
