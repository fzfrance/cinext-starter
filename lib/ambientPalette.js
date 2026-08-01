"use client";

import { useEffect, useState } from "react";

// useAmbientPalette — derives a restrained, WCAG-safe ambient wash from a
// show/season's own hero image (backdrop or poster), so the space around
// the hero can bleed into the page's own background instead of cutting to
// a flat, unrelated dark color. Real per-pixel extraction (a small offscreen
// canvas sample), not a fixed per-show hash color — every show/season gets
// its own palette automatically, no manual per-show config.
//
// Exposed as three CSS custom-property-ready strings (each an "H S% L%"
// triple, no wrapping hsl()/alpha) so a consumer can do:
//   style={{ "--theme-primary": palette.primary, ... }}
// and then, in any gradient on that subtree: `hsl(var(--theme-primary) / 18%)`
// — one canonical set of variables, alpha chosen per use-site rather than
// baked into the cached value.
//
// Colors are deliberately darkened/desaturated before being handed back —
// a raw dominant color sampled from real poster/backdrop art is often far
// too saturated/bright to sit behind white text at any usable opacity, and
// this app's own established "restrained accent, not a loud wash" idiom
// (e.g. FloatingNav's tintColor) reflects the same tradeoff.
const cache = new Map(); // imageUrl -> {primary, secondary, surface}

// Neutral dark fallback — used whenever there's no image at all, the image
// fails to load, or canvas extraction throws (most commonly a CORS taint;
// TMDB's CDN sends permissive CORS headers so this is a rare/defensive
// path, not the expected one). Slightly warm rather than pure grey so it
// still sits comfortably in this app's own warm-dark palette when no real
// color is available.
const FALLBACK = { primary: "32 14% 14%", secondary: "32 10% 10%", surface: "20 8% 8%" };

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

// Darken + desaturate a raw sampled tone into something safe as a
// large-area ambient wash sitting behind white/grey text.
function toAmbientTriple(h, s, l) {
  const safeS = clamp(s * 0.55, 8, 40);
  const safeL = clamp(l * 0.38, 8, 20);
  return `${h.toFixed(1)} ${safeS.toFixed(1)}% ${safeL.toFixed(1)}%`;
}

function extractPalette(img) {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size); // throws on a tainted canvas

  let rAll = 0, gAll = 0, bAll = 0, nAll = 0;
  let rTop = 0, gTop = 0, bTop = 0, nTop = 0;
  for (let i = 0; i < data.length; i += 4) {
    const y = Math.floor(i / 4 / size);
    rAll += data[i]; gAll += data[i + 1]; bAll += data[i + 2]; nAll++;
    if (y < size / 2) { rTop += data[i]; gTop += data[i + 1]; bTop += data[i + 2]; nTop++; }
  }

  const [hAll, sAll, lAll] = rgbToHsl(rAll / nAll, gAll / nAll, bAll / nAll);
  const [hTop, sTop, lTop] = rgbToHsl(rTop / nTop, gTop / nTop, bTop / nTop);
  const primary = toAmbientTriple(hAll, sAll, lAll);
  const secondary = toAmbientTriple(hTop, sTop, lTop);
  const [sh, ss, sl] = primary.split(" ").map(parseFloat);
  const surface = `${sh} ${(ss * 0.7).toFixed(1)}% ${Math.max(6, sl - 5).toFixed(1)}%`;
  return { primary, secondary, surface };
}

export function useAmbientPalette(imageUrl) {
  const [palette, setPalette] = useState(() => (imageUrl && cache.has(imageUrl) ? cache.get(imageUrl) : FALLBACK));

  useEffect(() => {
    if (!imageUrl) { setPalette(FALLBACK); return; }
    const cached = cache.get(imageUrl);
    if (cached) { setPalette(cached); return; }

    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      let result;
      try {
        result = extractPalette(img);
      } catch {
        result = FALLBACK;
      }
      cache.set(imageUrl, result); // cached even on fallback — don't retry a known-bad url every render
      if (!cancelled) setPalette(result);
    };
    img.onerror = () => {
      if (cancelled) return;
      cache.set(imageUrl, FALLBACK);
      setPalette(FALLBACK);
    };
    img.src = imageUrl;
    return () => { cancelled = true; };
  }, [imageUrl]);

  return palette;
}
