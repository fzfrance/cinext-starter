"use client";

import Icon from "@/components/ui/Icon";

const STATUS_ITEMS = [
  { id: "watchlist", label: "Watchlist", icon: "bookmark" },
  { id: "watching", label: "Watching", icon: "infinity" },
  { id: "paused", label: "Paused", icon: "paused" },
  { id: "drop", label: "Drop", icon: "trash" },
  { id: "completed", label: "Completed", icon: "select" },
];

// Horizontal status filter row, directly under Recommended, centered.
// Collapsed by default to a bare dim icon (no fill/border); whichever
// status is the current filter value expands into a solid white pill
// (black icon + black text). There's no "All" pill — every item shows by
// default with nothing active, and tapping a status filters to just that
// one. Tapping the ALREADY-active pill again deselects it (onSelect("all")
// — an internal-only sentinel the caller already uses for "no filter"),
// which is how you get back to seeing everything: undo the current pick,
// don't pick a separate "All" option.
export default function StatusFilterRow({ statusFilter, counts, onSelect }) {
  return (
    <div className="no-scrollbar" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
      <div className="flex items-center justify-center" style={{ gap: 16, padding: "0 20px" }}>
        {STATUS_ITEMS.map((s) => {
          const active = statusFilter === s.id;
          const count = counts?.[s.id] ?? 0;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(active ? "all" : s.id)}
              className="flex items-center flex-shrink-0 active:scale-95 transition"
              style={{
                height: 38,
                padding: "0 11px",
                borderRadius: 999,
                background: active ? "#fff" : "transparent",
                border: "1px solid transparent",
                cursor: "pointer",
                transition: "background 280ms ease",
              }}
            >
              <Icon name={s.icon} size={16} color={active ? "#111" : "rgba(255,255,255,0.45)"} />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: active ? "1fr" : "0fr",
                  transition: "grid-template-columns 280ms cubic-bezier(.4,0,.2,1)",
                }}
              >
                <span style={{ overflow: "hidden", whiteSpace: "nowrap", display: "block" }}>
                  <span style={{ marginLeft: 8, fontSize: 14, fontWeight: 700, color: "#111" }}>
                    {s.label} · {count}
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
