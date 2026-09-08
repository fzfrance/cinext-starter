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
// typography convention every other Profile section already uses, just
// with a white history icon ahead of the title and a muted subtitle
// underneath. No chevron here (removed per request) — the header is
// plain, non-interactive text; each year card itself is the tap target,
// routing straight to that year's own detail list via onYearSelect.
export default function TimeMachineSection({ years, loading, onYearSelect }) {
  if (!loading && years.length === 0) return null;

  return (
    <div className="time-machine-section">
      <div className="time-machine-section-head px-6">
        <span className="time-machine-section-icon" aria-hidden="true">
          <Icon name="history" size={16} color="#fff" />
        </span>
        <h2 className="time-machine-section-title">Time Machine</h2>
      </div>
      <div className="time-machine-section-sub px-6">
        <span>Your viewing journey through the years</span>
      </div>
      <div className="time-machine-section-row px-6">
        {loading
          ? [0, 1, 2].map((i) => (
              <div
                key={i}
                className="time-machine-year-skeleton flex-shrink-0 rounded-2xl"
                style={{ width: CARD_W, height: CARD_H, background: t.cardFill, border: `1px solid ${t.cardBorder}` }}
              />
            ))
          : years.map((y) => (
              <TimeMachineYearCard key={y.year} {...y} onSelect={() => onYearSelect?.(y.year)} />
            ))}
      </div>
    </div>
  );
}
