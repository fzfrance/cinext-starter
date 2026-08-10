"use client";

import Icon from "@/components/ui/Icon";
import { themes } from "@/lib/theme";
import TimeMachineYearCard, { CARD_W, CARD_H } from "@/components/profile/TimeMachineYearCard";

const t = themes.dark;

// Profile's "Time Machine" — one card per calendar year the user watched
// *anything* in (TV or movie), newest first. See app/(tabs)/profile/
// page.jsx's own fetch-effect comment for how `years` is built (keyed off
// watched_year/watched_on, never release/premiere year). Deliberately a
// secondary, smaller-than-My-Ratings section — same header spacing/
// typography convention (px-6, 17.25/600 title) every other Profile
// section already uses, just with a white history icon ahead of the
// title and a muted subtitle underneath. No chevron here (removed per
// request) — the header is plain, non-interactive text; each year card
// itself is the tap target, routing straight to that year's own detail
// list via onYearSelect.
export default function TimeMachineSection({ years, loading, onYearSelect }) {
  if (!loading && years.length === 0) return null;

  return (
    <div style={{ marginTop: 26 }}>
      <div className="flex items-center gap-2 px-6 mb-1">
        <Icon name="history" size={16} color="#fff" />
        <span style={{ fontSize: 17.25, fontWeight: 600, color: "#fff" }}>Time Machine</span>
      </div>
      <div className="px-6" style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: t.textDim }}>Your viewing journey through the years</span>
      </div>
      <div className="flex gap-2.5 overflow-x-auto px-6" style={{ scrollbarWidth: "none" }}>
        {loading
          ? [0, 1, 2].map((i) => (
              <div key={i} className="flex-shrink-0 rounded-2xl" style={{ width: CARD_W, height: CARD_H, background: t.cardFill, border: `1px solid ${t.cardBorder}` }} />
            ))
          : years.map((y) => (
              <TimeMachineYearCard key={y.year} {...y} onSelect={() => onYearSelect?.(y.year)} />
            ))}
      </div>
    </div>
  );
}
