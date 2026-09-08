import Image from "next/image";
import { tmdbImage } from "@/lib/tmdb";

const FALLBACK_BASE = "#1c1712";
const FALLBACK_GLOW = "#e8a24c";

/**
 * CollectionBoxSet — "Collector Box Set" collection-cover style: a premium
 * fanned poster arrangement, up to five real TMDB posters overlapping
 * naturally with the center one in front, sized in real full 2:3 poster
 * proportions (not thin spine crops). Selected per-collection via
 * `collections.cover_style === "boxset"` (see lib/collections.js) alongside
 * the existing gradient/theme/custom-image cover (./collections/shared.jsx's
 * CollectionBackdrop).
 *
 * Deliberately asymmetric, not mirrored pairs either side of center — each
 * side's posters use different rotation angles, offsets, scales, and
 * depths from their opposite-side counterpart, so it reads as a casually
 * spread stack rather than a perfectly mirrored/stacked pile. A slight
 * rotateY on the side posters (with `perspective` on the container) adds a
 * touch of 3D depth without tipping into the heavier 3D box-art look this
 * replaced. No film-grain texture here — this style is meant to read
 * clean/minimal (Apple-style), not gritty like the show-detail art
 * elsewhere in the app.
 *
 * Fills center -> innerLeft -> innerRight -> outerLeft -> outerRight as
 * shows are available:
 *   0 shows -> just the neutral background (never blank)
 *   1 show  -> center poster only
 *   2-4 shows -> center plus however many of the remaining slots fit
 *   5+ shows -> all five slots filled (only the first 5 are used; this
 *     style intentionally always reads as "a handful of posters," not a
 *     per-count layout — a collection's remaining titles are still
 *     browsable in the poster grid below, on the pages that render one)
 *
 * props:
 *   shows: [{ id, posterPath, base, glow }] — same shape /api/shows/batch
 *     already returns; base/glow are the same decorative fallback colors
 *     PosterArt uses when there's no real image.
 *   compact: true for small card contexts (Profile's mini card) — false
 *     for the full collection detail page header.
 *   width: explicit per-poster width override (% of container), for
 *     contexts that need a size other than the compact/non-compact
 *     default — e.g. the Collections list page, whose cards are wider
 *     than Profile's mini-card, so the compact default read as posters
 *     overflowing/filling the whole card rather than sitting within it.
 *     Takes priority over `compact` when given.
 */
// Fixed, deliberately asymmetric fan geometry — not derived from count,
// since this style always shows up to 5 posters in this same arrangement.
// Percentages in `translate` resolve against each poster's own (pre-scale)
// box, so e.g. an offset of 50% always reveals about half of that poster
// regardless of its scale — every slot here clears that bar, instead of
// letting inner posters mostly hide behind center. The inner pair is also
// kept visually close to each other (similar rotation/scale/offset
// magnitude) so the first three read as a calm, gradual spread; the outer
// pair carries most of the asymmetric "casually spread" character, at a
// clearly bigger step out from the inner pair, not a small increment.
const SLOTS = [
  { key: "center", z: 5, transform: "translate(-50%, -50%)", shadow: "0 14px 28px rgba(0,0,0,0.45)", brightness: 1 },
  // rotateY toned down from the original pass — at the higher values, the
  // 3D foreshortening on these made them look visibly narrower than the
  // flat (no rotateY) center poster, which by contrast made center read
  // as slightly too tall/skinny even though its own box is a true 2:3.
  { key: "innerLeft", z: 4, transform: "translate(calc(-50% - 50%), calc(-50% + 5%)) rotate(-5deg) rotateY(3deg) scale(0.93)", shadow: "0 10px 22px rgba(0,0,0,0.4)", brightness: 0.95 },
  { key: "innerRight", z: 3, transform: "translate(calc(-50% + 53%), calc(-50% + 3%)) rotate(6deg) rotateY(-3deg) scale(0.9)", shadow: "0 9px 20px rgba(0,0,0,0.38)", brightness: 0.92 },
  { key: "outerLeft", z: 2, transform: "translate(calc(-50% - 84%), calc(-50% + 9%)) rotate(-13deg) rotateY(5deg) scale(0.82)", shadow: "0 8px 18px rgba(0,0,0,0.36)", brightness: 0.84 },
  { key: "outerRight", z: 1, transform: "translate(calc(-50% + 90%), calc(-50% + 4%)) rotate(15deg) rotateY(-6deg) scale(0.76)", shadow: "0 7px 16px rgba(0,0,0,0.34)", brightness: 0.78 },
];

function FannedPoster({ show, slot, width, centerX }) {
  const src = show?.posterPath ? tmdbImage(show.posterPath, "w500") : null;
  const base = show?.base || FALLBACK_BASE;
  const glow = show?.glow || FALLBACK_GLOW;

  return (
    <div
      style={{
        position: "absolute",
        left: centerX,
        top: "50%",
        width: `${width}%`,
        aspectRatio: "2 / 3",
        borderRadius: 10,
        overflow: "hidden",
        transform: slot.transform,
        transformOrigin: "center center",
        boxShadow: slot.shadow,
        filter: `brightness(${slot.brightness})`,
        border: "1px solid rgba(255,255,255,0.1)",
        zIndex: slot.z,
      }}
    >
      {src ? (
        <Image src={src} alt="" fill sizes="200px" style={{ objectFit: "cover" }} />
      ) : (
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(160deg, ${glow}55, ${base})` }} />
      )}
      {/* soft top-left highlight — the "clean, premium" sheen instead of a
          film-grain texture */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.16) 0%, transparent 35%)" }} />
    </div>
  );
}

export default function CollectionBoxSet({ shows = [], compact = false, width, centerX = "50%" }) {
  const realShows = shows.filter(Boolean).slice(0, 5);
  // compact reverted to 37 and the background reverted to flat/neutral —
  // a further enlarge (to 43) + a tone-tinted background were tried and
  // rolled back by request, back to how this looked right after the
  // first (10%) enlarge pass. non-compact (24) is unrelated and unchanged
  // — that was a fit-to-screen fix for the detail page, not part of this
  // revert. `width`, when given, overrides this default entirely (see
  // the Collections list's own call site, which needs a smaller size
  // than either default).
  const posterWidth = width ?? (compact ? 37 : 24);

  return (
    <div
      className="absolute inset-0 overflow-hidden collector-boxset"
      style={{ background: "radial-gradient(120% 100% at 50% 20%, #23201c 0%, #100e0b 75%)", perspective: 1000 }}
    >
      {/* Desktop-only micro hover tilt, per the "avoid heavy animation"
          brief — @media(hover:hover) keeps touch devices from getting a
          stuck hover state on tap. Plain global <style>, not styled-jsx,
          matching ExploreHero's own inline-keyframes pattern; a shared
          class name is fine since every instance wants the same effect. */}
      <style>{`
        @media (hover: hover) {
          .collector-boxset { transition: transform 300ms ease; }
          button:hover > .collector-boxset { transform: rotateY(-2deg) scale(1.015); }
        }
      `}</style>

      {realShows.map((show, i) => (
        <FannedPoster key={`${show.mediaType ?? "tv"}-${show.id}`} show={show} slot={SLOTS[i]} width={posterWidth} centerX={centerX} />
      ))}

      {/* soft cast shadow the whole arrangement sits on */}
      <div style={{ position: "absolute", left: "15%", right: "15%", bottom: "6%", height: "12%", background: "radial-gradient(ellipse at center, rgba(0,0,0,0.4) 0%, transparent 75%)" }} />
    </div>
  );
}
