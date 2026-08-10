"use client";

import Icon from "@/components/ui/Icon";
import { DEFAULT_ACCENT } from "@/lib/theme";

const accent = DEFAULT_ACCENT;

// Same icon vocabulary as components/StatusMenu.jsx's own option list
// (statusMenuOptions/movieStatusMenuOptions) — kept in sync by hand since
// StatusMenu's list also carries labels/danger-flags this badge has no
// use for — EXCEPT "completed", which deliberately uses the plain
// checkmark ("check") instead of StatusMenu's own boxed-checkmark
// ("select") glyph. This badge is explicitly allowed to look different
// from the real status button here — a small circular checkmark reads
// better at this size than a checkbox glyph would.
const STATUS_ICON = {
  watchlist: "bookmark",
  watching: "glasses",
  completed: "check",
  paused: "paused",
  drop: "drop",
};

// Read-only "you're already tracking this" indicator for browsing
// surfaces — Explore, Show Detail's Recommended row, a person's
// filmography — NOT Library, where status is already the grid's whole
// organizing principle and this would just be noise. Same dark-circle
// top-right slot components/ui/MediaFavoriteBadge.jsx already uses on
// these same cards; callers render this INSTEAD of that badge whenever a
// status exists (a status is more informative than a bare heart, same
// "badge overrides favorite" precedent components/ui/PosterCard.jsx's
// own `badge` prop already establishes), falling back to the heart badge
// only when there's no status to show. Purely presentational — `status`
// arrives already resolved from whatever per-surface status map the
// caller maintains, no fetch of its own.
export default function MediaStatusBadge({ status }) {
  const icon = STATUS_ICON[status];
  if (!icon) return null;
  return (
    <div
      className="absolute flex items-center justify-center"
      style={{ top: 6, right: 6, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.6)" }}
    >
      <Icon name={icon} size={12} color={accent} />
    </div>
  );
}
