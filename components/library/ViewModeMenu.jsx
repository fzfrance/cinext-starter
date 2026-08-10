"use client";

import Icon from "@/components/ui/Icon";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// Shared with page.jsx — the header's own View button icon always matches
// the current mode, same map the dropdown's own rows use below.
export const VIEW_MODE_ICON = { dvd: "dvdSpines", poster: "gridToggle" };

const VIEW_MODE_ITEMS = [
  { id: "dvd", label: "DVD Case", icon: VIEW_MODE_ICON.dvd },
  { id: "poster", label: "Poster", icon: VIEW_MODE_ICON.poster },
];

// DVD Case / Poster switcher for the Library screen — same container
// styling (dark translucent blur, border, shadow, corner radius,
// typography) as LibraryTabMenu's own Shows/Movies/Collections dropdown
// for a consistent feel, but its own distinct selection treatment per
// explicit spec: the active row gets the warm accent color on both its
// icon and label plus a checkmark; the inactive row uses the plain
// secondary/dim color for both — LibraryTabMenu's rows work differently
// (always-colored icons, always-white labels) by its own separate,
// equally-explicit request, so this is deliberately not sharing that
// component's row styling, just its outer chrome.
export default function ViewModeMenu({ viewMode, onSelect, onClose }) {
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
        <div style={{ padding: "6px 10px 4px", fontSize: 11, fontWeight: 700, color: t.textDim, letterSpacing: 0.5, textTransform: "uppercase" }}>View</div>
        {VIEW_MODE_ITEMS.map((item) => {
          const active = viewMode === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className="w-full flex items-center justify-between rounded-xl active:scale-95 transition"
              style={{ padding: "9px 10px", background: active ? "rgba(255,255,255,0.1)" : "transparent" }}
            >
              <span className="flex items-center gap-2.5">
                <Icon name={item.icon} size={15} color={active ? accent : t.textDim} />
                <span style={{ fontSize: 13.5, fontWeight: 700, color: active ? accent : t.textDim }}>{item.label}</span>
              </span>
              {active && <Icon name="check" size={13} color={accent} strokeWidth={2.6} />}
            </button>
          );
        })}
      </div>
    </>
  );
}
