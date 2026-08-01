"use client";

import { useRef, useState, useLayoutEffect } from "react";
import Icon from "@/components/ui/Icon";
import { DEFAULT_ACCENT } from "@/lib/theme";

const accent = DEFAULT_ACCENT;

/**
 * StarInput — the one draggable star rating input, half-star precision.
 * Shared by RatingFlow.jsx (season/show reviews, 5 stars — the default,
 * fixed `size`/`gap`) and EpisodeRatingFlow.jsx (episode ratings, 10
 * stars via `maxStars`, `autoFit` on), which previously each had their
 * own: RatingFlow's own quarter-star drag version, and EpisodeRatingFlow's
 * separate whole-star click-only StarRow. Both are now this one component
 * — same precision/interaction wherever a star rating is *input*, just at
 * whichever star count/sizing mode the caller needs (screens that only
 * ever display an already-saved rating, read-only, render it with
 * `readOnly` so a stray tap can't change it).
 *
 * Tap/drag semantics split each star's own width in half, not the row as a
 * continuous 0.5 scale — the left half of a star always completes it to
 * "N.5", the right half always completes it to "N+1" full, regardless of
 * exactly where within that half the pointer lands. This is why it's a
 * per-star `Math.floor` + half check below rather than a single
 * `Math.round(x * 2) / 2` across the whole row — the naive version splits
 * each star into uneven thirds instead of a clean half/half.
 *
 * Uses window mouse/touch listeners rather than Pointer Capture, since the
 * latter can misbehave inside sandboxed iframes (e.g. artifact previews).
 *
 * autoFit (opt-in, default off — RatingFlow.jsx's 5-star usage is
 * unaffected either way): measures the row's actual rendered container
 * width once on mount and solves for the largest star size (and a gap
 * that scales alongside it) that still fits `maxStars` stars — rather
 * than a fixed pixel size that either overflows a narrow card or looks
 * needlessly small on a wide one. This is a JS equivalent of a CSS
 * `clamp(min, Nvw, max)` rule computed against the real container instead
 * of a raw viewport-width guess, since Icon renders its star via a plain
 * numeric SVG width/height attribute (not a styled box), and CSS math
 * functions aren't reliably supported there. `rowPaddingInline` reserves
 * edge breathing room on an outer wrapper (kept OUTSIDE the ref'd row, so
 * it never skews valueFromClientX's width math below); `hitPaddingBlock`
 * adds vertical-only padding directly on the ref'd row to grow the
 * draggable strip's touch height without enlarging the visible icons
 * (vertical padding doesn't affect the horizontal position math either).
 */
export default function StarInput({
  value,
  onChange,
  size = 30,
  color = accent,
  readOnly = false,
  maxStars = 5,
  gap = 4,
  rowPaddingInline = 0,
  hitPaddingBlock = 0,
  autoFit = false,
  autoFitMin = 22,
  autoFitMax = 32,
  autoFitGapMin = 3,
  autoFitGapMax = 7,
}) {
  const rowRef = useRef(null);
  const outerRef = useRef(null);
  const [autoMetrics, setAutoMetrics] = useState(null);

  // Measured once on mount, not on every resize — this is a modal rating
  // sheet, not a layout that gets resized mid-session, so a one-time
  // measurement (via useLayoutEffect, so it lands before first paint and
  // never produces a visible size jump) is enough.
  useLayoutEffect(() => {
    if (!autoFit || !outerRef.current) return;
    const containerWidth = outerRef.current.clientWidth - rowPaddingInline * 2;
    if (containerWidth <= 0) return;
    let bestSize = autoFitMin;
    let bestGap = autoFitGapMin;
    for (let s = autoFitMax; s >= autoFitMin; s -= 0.5) {
      const frac = (s - autoFitMin) / (autoFitMax - autoFitMin || 1);
      const g = autoFitGapMin + frac * (autoFitGapMax - autoFitGapMin);
      if (maxStars * s + (maxStars - 1) * g <= containerWidth) {
        bestSize = s;
        bestGap = g;
        break;
      }
    }
    setAutoMetrics({ size: bestSize, gap: bestGap });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time measurement, deliberately not re-run on every prop identity change
  }, []);

  const effectiveSize = autoFit ? (autoMetrics?.size ?? autoFitMin) : size;
  const effectiveGap = autoFit ? (autoMetrics?.gap ?? autoFitGapMin) : gap;

  const valueFromClientX = (clientX) => {
    const el = rowRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    if (!rect.width) return value;
    const raw = Math.max(0, Math.min(maxStars, ((clientX - rect.left) / rect.width) * maxStars));
    const starIndex = Math.min(maxStars - 1, Math.floor(raw));
    const fracWithinStar = raw - starIndex;
    // The very first star gets a third zone (its own left quarter) that
    // resolves to a literal 0 — "no stars" — rather than every drag
    // position bottoming out at 0.5. Every other star keeps the plain
    // half/half split (left half -> N.5, right half -> N+1).
    if (starIndex === 0 && fracWithinStar < 0.25) return 0;
    return fracWithinStar < 0.5 ? starIndex + 0.5 : starIndex + 1;
  };

  const startDrag = (clientX) => {
    if (readOnly) return;
    onChange(valueFromClientX(clientX));
    const handleMouseMove = (e) => onChange(valueFromClientX(e.clientX));
    const handleTouchMove = (e) => { if (e.touches && e.touches[0]) onChange(valueFromClientX(e.touches[0].clientX)); };
    const stop = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", stop);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", stop);
  };

  return (
    <div ref={outerRef} style={{ padding: `0 ${rowPaddingInline}px` }}>
      <div
        ref={rowRef}
        onMouseDown={(e) => startDrag(e.clientX)}
        onTouchStart={(e) => e.touches && e.touches[0] && startDrag(e.touches[0].clientX)}
        className="flex"
        style={{ gap: effectiveGap, touchAction: "none", cursor: readOnly ? "default" : "pointer", padding: `${hitPaddingBlock}px 0` }}
      >
        {Array.from({ length: maxStars }, (_, i) => i).map((i) => {
          const fill = Math.max(0, Math.min(1, value - i));
          return (
            <div key={i} className="relative flex-shrink-0" style={{ width: effectiveSize, height: effectiveSize }}>
              <Icon name="star" size={effectiveSize} color="rgba(255,255,255,0.18)" />
              {fill > 0 && (
                <div className="absolute top-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%`, height: effectiveSize }}>
                  <Icon name="star" size={effectiveSize} color={color} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
