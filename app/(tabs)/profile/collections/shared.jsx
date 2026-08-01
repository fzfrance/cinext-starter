import Grain from "@/components/ui/Grain";
import { DEFAULT_ACCENT } from "@/lib/theme";

const accent = DEFAULT_ACCENT;

// Preset mood themes for the backdrop picker — colocated here since only
// the collections list + detail routes use them.
export const backdropThemes = [
  { id: "amber", c1: "#e8a24c", c2: "#3a2415" },
  { id: "rose", c1: "#d96565", c2: "#3d1414" },
  { id: "green", c1: "#8fbf8a", c2: "#28331f" },
  { id: "blue", c1: "#6fb4ee", c2: "#16283f" },
  { id: "purple", c1: "#a985e8", c2: "#241a3c" },
  { id: "teal", c1: "#7fa8c9", c2: "#182028" },
];

// Blended two-cover backdrop, a preset mood theme, or a user-uploaded
// image — distinct from PosterArt's single-cover gradient, and shared by
// both the collections list and the collection detail screen.
export function CollectionBackdrop({ covers, theme, image }) {
  if (image) {
    return (
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", backgroundImage: `url(${image})`, backgroundSize: "cover", backgroundPosition: "center" }}>
        <Grain />
      </div>
    );
  }
  const c1 = theme ? { glow: theme.c1, base: theme.c2 } : (covers[0] || { base: "#221a14", glow: accent });
  const c2 = theme ? { glow: theme.c1, base: theme.c2 } : (covers[1] || c1);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: `linear-gradient(120deg, ${c1.glow}40 0%, ${c1.base} 45%, ${c2.base} 100%)` }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 25% 30%, ${c1.glow}45, transparent 60%)` }} />
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 80% 70%, ${c2.glow}30, transparent 55%)` }} />
      <Grain />
    </div>
  );
}

export const sortOptions = [
  { id: "firstAdded", label: "First Added" },
  { id: "lastAdded", label: "Last Added" },
  { id: "az", label: "A–Z" },
];

export function sortItems(items, mode, nameKey) {
  const arr = [...items];
  if (mode === "firstAdded") return arr.sort((a, b) => a.addedAt - b.addedAt);
  if (mode === "lastAdded") return arr.sort((a, b) => b.addedAt - a.addedAt);
  if (mode === "az") return arr.sort((a, b) => a[nameKey].localeCompare(b[nameKey]));
  return arr; // userOrder — keep current array order as manually arranged
}
