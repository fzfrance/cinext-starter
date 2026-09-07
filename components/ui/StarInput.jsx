"use client";

import { useRef, useState, useLayoutEffect, useEffect } from "react";
import Icon from "@/components/ui/Icon";
import { DEFAULT_ACCENT } from "@/lib/theme";

const accent = DEFAULT_ACCENT;

/**
 * StarInput — the one draggable star rating input, half-star precision.
 * Shared by SeasonRatingScreen.jsx (season/show reviews, 5 stars — the
 * default, fixed `size`/`gap`) and EpisodeRatingFlow.jsx (episode ratings,
 * 10 stars via `maxStars`, `autoFit` on), which previously each had their
 * own separate star-input implementations. Both are now this one component
 * — same precision/interaction wherever a star rating is *input*, just at
 * whichever star count/sizing mode the caller needs (screens that only
 * ever display an already-saved rating, read-only, render it with
 * `readOnly` so a stray tap can't change it).
 *
 * Hit testing is per-star (each star's own getBoundingClientRect), so flex
 * gaps don't skew the drag map the way a uniform row-width split would.
 * Left half of a star → N.5, right half → N+1; the first star's leftmost
 * quarter clears to 0 ("no stars").
 *
 * Uses window mouse/touch listeners rather than Pointer Capture, since the
 * latter can misbehave inside sandboxed iframes (e.g. artifact previews).
 *
 * autoFit (opt-in, default off — SeasonRatingScreen.jsx's 5-star usage is
 * unaffected either way): measures the row's actual rendered container
 * width (and remeasures on resize) and solves for the largest star size
 * (and a gap that scales alongside it) that still fits `maxStars` stars.
 */
export default function StarInput({
  value,
  onChange,
  onPreviewChange,
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
  const draggingRef = useRef(false);
  const [autoMetrics, setAutoMetrics] = useState(null);
  const [hoverValue, setHoverValue] = useState(null);

  const measureAutoFit = () => {
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
  };

  useLayoutEffect(() => {
    measureAutoFit();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial layout pass; ResizeObserver below handles later size changes
  }, []);

  useEffect(() => {
    if (!autoFit || !outerRef.current || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => measureAutoFit());
    observer.observe(outerRef.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- observe the outer container for the life of the input
  }, [autoFit, maxStars, autoFitMin, autoFitMax, autoFitGapMin, autoFitGapMax, rowPaddingInline]);

  const effectiveSize = autoFit ? (autoMetrics?.size ?? autoFitMin) : size;
  const effectiveGap = autoFit ? (autoMetrics?.gap ?? autoFitGapMin) : gap;

  // Map pointer X to a rating using each star's own box — immune to flex
  // gap skew that breaks "divide full row width by maxStars".
  const valueFromClientX = (clientX) => {
    const el = rowRef.current;
    if (!el || !el.children.length) return value;
    const stars = el.children;
    const first = stars[0].getBoundingClientRect();
    const last = stars[stars.length - 1].getBoundingClientRect();

    if (clientX <= first.left) return 0;
    if (clientX >= last.right) return maxStars;

    for (let i = 0; i < stars.length; i += 1) {
      const rect = stars[i].getBoundingClientRect();
      const nextLeft = i < stars.length - 1 ? stars[i + 1].getBoundingClientRect().left : rect.right;
      // Include the gap after this star as part of its hit zone so dragging
      // across gaps doesn't drop to a stale value.
      const zoneRight = i < stars.length - 1 ? (rect.right + nextLeft) / 2 : last.right;
      if (clientX <= zoneRight || i === stars.length - 1) {
        const frac = rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 1;
        if (i === 0 && frac < 0.25) return 0;
        if (clientX < rect.left) return i === 0 ? 0 : i; // in prior gap → full previous
        return frac < 0.5 ? i + 0.5 : i + 1;
      }
    }
    return maxStars;
  };

  const setPreview = (next) => {
    setHoverValue(next);
    onPreviewChange?.(next);
  };

  const startDrag = (clientX) => {
    if (readOnly) return;
    draggingRef.current = true;
    const next = valueFromClientX(clientX);
    onChange(next);
    setPreview(next);
    const handleMouseMove = (e) => {
      e.preventDefault();
      const moving = valueFromClientX(e.clientX);
      onChange(moving);
      setPreview(moving);
    };
    const handleTouchMove = (e) => {
      if (e.touches && e.touches[0]) {
        const moving = valueFromClientX(e.touches[0].clientX);
        onChange(moving);
        setPreview(moving);
      }
    };
    const stop = () => {
      draggingRef.current = false;
      setPreview(null);
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

  const displayValue = hoverValue != null && !readOnly ? hoverValue : value;

  return (
    <div ref={outerRef} style={{ padding: `0 ${rowPaddingInline}px`, width: "100%" }}>
      <div
        ref={rowRef}
        onMouseDown={(e) => {
          e.preventDefault();
          startDrag(e.clientX);
        }}
        onMouseMove={(e) => {
          if (readOnly || draggingRef.current) return;
          setPreview(valueFromClientX(e.clientX));
        }}
        onMouseLeave={() => {
          if (!draggingRef.current) setPreview(null);
        }}
        onTouchStart={(e) => e.touches && e.touches[0] && startDrag(e.touches[0].clientX)}
        className="flex"
        style={{
          gap: effectiveGap,
          touchAction: "none",
          cursor: readOnly ? "default" : "pointer",
          padding: `${hitPaddingBlock}px 0`,
          userSelect: "none",
          width: "max-content",
          maxWidth: "100%",
        }}
      >
        {Array.from({ length: maxStars }, (_, i) => i).map((i) => {
          const fill = Math.max(0, Math.min(1, displayValue - i));
          return (
            <div
              key={i}
              className="relative flex-shrink-0"
              style={{ width: effectiveSize, height: effectiveSize, pointerEvents: "none" }}
            >
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
