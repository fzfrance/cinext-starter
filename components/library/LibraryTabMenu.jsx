"use client";

import Icon from "@/components/ui/Icon";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// Shared with page.jsx — the trigger button's own icon always matches
// whichever tab is currently active, using this same map, so Shows/Movies/
// Collections each get a consistent icon everywhere they appear.
export const TAB_ICON = { shows: "tv", movies: "ticket", collections: "layers" };

const TAB_ITEMS = [
  { id: "shows", label: "Shows", icon: TAB_ICON.shows },
  { id: "movies", label: "Movies", icon: TAB_ICON.movies },
  { id: "collections", label: "Collections", icon: TAB_ICON.collections },
];

// Shows/Movies/Collections switcher — a compact liquid-glass dropdown
// opened from the small icon-only pill next to the "Library" header,
// replacing the earlier big-text-tabs + separate Collections-pill layout.
// Active row gets a check; every row's own icon is amber (matching the
// trigger button), label text stays white/neutral.
export default function LibraryTabMenu({ tab, onSelect, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 69 }} />
      <div
        className="absolute rounded-2xl"
        style={{
          zIndex: 70, top: "calc(100% + 8px)", right: 0, width: 172, padding: 5,
          background: `linear-gradient(${accent}10, ${accent}05), rgba(20,18,16,0.42)`,
          border: `1px solid ${t.glassBorder}`,
          backdropFilter: "blur(26px)", WebkitBackdropFilter: "blur(26px)",
          boxShadow: "0 20px 44px rgba(0,0,0,0.5)",
        }}
      >
        {TAB_ITEMS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className="w-full flex items-center justify-between rounded-xl active:scale-95 transition"
              style={{ padding: "9px 10px", background: active ? "rgba(255,255,255,0.1)" : "transparent" }}
            >
              <span className="flex items-center gap-2.5">
                <Icon name={item.icon} size={15} color={accent} />
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "#fff" }}>{item.label}</span>
              </span>
              {active && <Icon name="check" size={13} color={accent} strokeWidth={2.6} />}
            </button>
          );
        })}
      </div>
    </>
  );
}
