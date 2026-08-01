// ---------------------------------------------------------------------------
// Cinext design tokens
// ---------------------------------------------------------------------------
// This is the single source of truth for the "ink" dark-premium aesthetic
// used across every screen. In the prototype, each .jsx file redeclared its
// own copy of these constants (deliberate, so each file could be previewed
// in isolation). In the real app, every screen imports from here instead —
// change a value once, it updates everywhere.

export const themes = {
  dark: {
    // Pitch black — the neutral gray-black pass before this still read as
    // too light. Same gradient shape/stops as before, just darkened all
    // the way to true #000000 (there's no darker neutral to gradiate
    // into, so every stop converges on flat black).
    bg: "linear-gradient(180deg, #000000 0%, #000000 40%, #000000 75%, #000000 100%)",
    frameBorder: "#151517",
    cardFill: "rgba(255,255,255,0.035)",
    cardBorder: "rgba(255,255,255,0.07)",
    glassBorder: "rgba(255,255,255,0.14)",
    text: "#ffffff",
    textDim: "#9B9BA3",
    inputBg: "rgba(0,0,0,0.3)",
    dialogBg: "#1a1512",
  },
  light: {
    bg: "linear-gradient(180deg, #f7f3ec 0%, #ffffff 55%)",
    frameBorder: "#e6e1d8",
    cardFill: "rgba(0,0,0,0.03)",
    cardBorder: "rgba(0,0,0,0.09)",
    glassBorder: "rgba(0,0,0,0.1)",
    text: "#171410",
    textDim: "#7a746c",
    inputBg: "rgba(0,0,0,0.04)",
    dialogBg: "#ffffff",
  },
};

// Selectable accent colors (Settings > Appearance). "amber" is the default
// used throughout the original prototype screens.
export const accentPalette = [
  { id: "amber", hex: "#E8A24C" },
  { id: "rose", hex: "#D96565" },
  { id: "green", hex: "#8FBF8A" },
  { id: "blue", hex: "#6FB4EE" },
  { id: "purple", hex: "#A985E8" },
  { id: "pink", hex: "#e0567a" },
];

export const DEFAULT_ACCENT = accentPalette[0].hex;

// Semantic colors that don't change with theme/accent.
export const danger = "#e0567a";

// Highlights' own stat-row palette (Episodes/Shows/Active Days/Rewatched)
// — sampled directly from a supplied reference image rather than reusing
// the app's vibrant amber accent, since this row needs to read as its own
// quieter, more "antique brushed gold" moment distinct from every other
// amber-accented element in the app. statIconGoldBadgeBg is the same gold
// at very low opacity (as a hex-alpha suffix, e.g. `${statIconGold}12`),
// for the soft glow behind each icon. Deliberately not shared with
// Profile's own stat row, which stays icon-less/flat per its own separate
// design.
export const statIconGold = "#CEAC8B";
export const statCardBg = "#131313";

// Status meta used across Library / Profile / Show Detail.
export const statusMeta = {
  watchlist: { label: "Watchlist", icon: "bookmark" },
  watching: { label: "Watching", icon: "glasses" },
  paused: { label: "Paused", icon: "paused" },
  drop: { label: "Drop", icon: "drop" },
  completed: { label: "Completed", icon: "check" },
};

// Cycled by index to skin a user's collections with distinct-looking
// backdrops — there's no real "cover art" for a collection as a whole
// (unlike a show poster), so this substitutes for one consistently
// wherever collections are rendered (Show Detail's "Add to a Collection"
// sheet, Profile, the Collections list/detail pages).
export const collectionPalette = [
  { c1: "#e8a24c", c2: "#3a2415" },
  { c1: "#6fb4ee", c2: "#16283f" },
  { c1: "#d96565", c2: "#3d1414" },
  { c1: "#8fbf8a", c2: "#28331f" },
  { c1: "#a985e8", c2: "#241a3c" },
  { c1: "#7fa8c9", c2: "#182028" },
];

// Picks readable text (near-black or near-white) for any accent color, so a
// dark custom color (e.g. navy) doesn't produce illegible text on itself.
export function contrastText(hex) {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.5 ? "#111111" : "#ffffff";
}

// Cycled per cast member on Show Detail and the standalone Episode Detail
// page — there's no real headshot art yet (would need person.profile_path
// wired through PosterArt), so this just gives each person a
// distinct-looking avatar instead of one flat color.
export const CAST_GRADIENTS = [
  "linear-gradient(135deg,#e8a24c,#5a3420)",
  "linear-gradient(135deg,#6fb4ee,#16283f)",
  "linear-gradient(135deg,#d96565,#3d1414)",
  "linear-gradient(135deg,#8fbf8a,#28331f)",
  "linear-gradient(135deg,#a985e8,#241a3c)",
  "linear-gradient(135deg,#7fa8c9,#182028)",
];

// Per-show accent for the floating bottom nav (Show Detail / Episode Detail
// — see components/ui/FloatingNav.jsx). Real shows have no actual extracted
// artwork color today (TMDB's API doesn't return one, and this app has no
// pixel-sampling pipeline — every show's own base/glow fields are unset and
// fall through to PosterArt's flat amber default), so a real per-show hue
// would otherwise never vary. Hashing the show's id into this fixed palette
// at least gives each show its own consistent, distinct-looking tint.
//
// Deliberately excludes red/hot-pink/orange-red — on this app's warm, dark
// "premium" background those hues stopped reading as a themed accent and
// started reading as an alert/error color instead, which is exactly wrong
// for a passive per-show mood tint. "Dusty rose" stays in as the one
// rose-family option, but desaturated well away from anything alarm-like.
export const showTintPalette = ["#2dd4bf", "#5b8def", "#a78bfa", "#e8a24c", "#8fbf8a", "#c98a8a"];

export function tintColorForShow(showId) {
  if (showId == null) return null;
  const n = Number(showId);
  if (!Number.isFinite(n)) return null;
  return showTintPalette[Math.abs(n) % showTintPalette.length];
}

export function initialsOf(name) {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

// Convenience hook-like helper for screens: resolves "system" against the
// OS preference. Use inside a client component together with useState/useEffect
// tracking `window.matchMedia("(prefers-color-scheme: dark)")`.
export function resolveTheme(themePref, systemPrefersDark) {
  const key = themePref === "system" ? (systemPrefersDark ? "dark" : "light") : themePref;
  return themes[key] ?? themes.dark;
}
