// Pre-rendered as a tiled static texture rather than a live SVG filter.
// This is used on every poster/spine/disc face — a shelf full of shows
// used to mean that many *live* feTurbulence filters repainting at once
// (expensive, not GPU-accelerated, and a real cause of scroll jank), all
// sharing the same literal id="fg" (invalid duplicate SVG ids). Baking the
// noise into a small data-URI background image lets the browser rasterize
// it once and just tile/composite it like any other image — same look,
// none of the per-instance filter cost.
const NOISE_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

export default function Grain() {
  return (
    <div
      style={{
        position: "absolute", inset: 0, opacity: 0.045, mixBlendMode: "overlay",
        backgroundImage: NOISE_BG, backgroundRepeat: "repeat", backgroundSize: "100px 100px",
        pointerEvents: "none",
      }}
    />
  );
}
