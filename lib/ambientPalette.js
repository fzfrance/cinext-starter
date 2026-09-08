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
const FALLBACK = { primary: "32 14% 14%", secondary: "32 10% 10%", tertiary: "28 10% 12%", surface: "20 8% 8%" };

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

// Keep more of the source midtone so a centered portrait can sit in a
// horizontal field that matches the photo's own color (person hero).
function toFieldTriple(h, s, l) {
  const safeS = clamp(s * 0.72, 6, 38);
  const safeL = clamp(l * 0.62, 14, 34);
  return `${h.toFixed(1)} ${safeS.toFixed(1)}% ${safeL.toFixed(1)}%`;
}

function extractPalette(img, mode = "ambient") {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size); // throws on a tainted canvas

  let rAll = 0, gAll = 0, bAll = 0, nAll = 0;
  let rTop = 0, gTop = 0, bTop = 0, nTop = 0;
  let rEdge = 0, gEdge = 0, bEdge = 0, nEdge = 0;
  for (let i = 0; i < data.length; i += 4) {
    const idx = i / 4;
    const x = idx % size;
    const y = Math.floor(idx / size);
    rAll += data[i]; gAll += data[i + 1]; bAll += data[i + 2]; nAll++;
    if (y < size / 2) { rTop += data[i]; gTop += data[i + 1]; bTop += data[i + 2]; nTop++; }
    // Edge ring approximates the portrait's surrounding field color.
    if (x < 4 || x >= size - 4 || y < 4 || y >= size - 4) {
      rEdge += data[i]; gEdge += data[i + 1]; bEdge += data[i + 2]; nEdge++;
    }
  }

  const toTriple = mode === "field" ? toFieldTriple : toAmbientTriple;
  const [hAll, sAll, lAll] = rgbToHsl(rAll / nAll, gAll / nAll, bAll / nAll);
  const [hTop, sTop, lTop] = rgbToHsl(rTop / nTop, gTop / nTop, bTop / nTop);
  const [hEdge, sEdge, lEdge] = nEdge
    ? rgbToHsl(rEdge / nEdge, gEdge / nEdge, bEdge / nEdge)
    : [hAll, sAll, lAll];
  const primary = toTriple(hEdge, sEdge, lEdge);
  const secondary = toTriple(hAll, sAll, lAll);
  const tertiary = toTriple(hTop, sTop, lTop);
  const [sh, ss, sl] = primary.split(" ").map(parseFloat);
  const surface = `${sh} ${(ss * 0.75).toFixed(1)}% ${Math.max(8, sl - 4).toFixed(1)}%`;
  return { primary, secondary, tertiary, surface };
}

export function useAmbientPalette(imageUrl, { mode = "ambient" } = {}) {
  const cacheKey = imageUrl ? `${mode}:${imageUrl}` : null;
  const [palette, setPalette] = useState(() => (cacheKey && cache.has(cacheKey) ? cache.get(cacheKey) : FALLBACK));

  useEffect(() => {
    if (!imageUrl) { setPalette(FALLBACK); return; }
    const key = `${mode}:${imageUrl}`;
    const cached = cache.get(key);
    if (cached) { setPalette(cached); return; }

    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      let result;
      try {
        result = extractPalette(img, mode);
      } catch {
        result = FALLBACK;
      }
      cache.set(key, result); // cached even on fallback — don't retry a known-bad url every render
      if (!cancelled) setPalette(result);
    };
    img.onerror = () => {
      if (cancelled) return;
      cache.set(key, FALLBACK);
      setPalette(FALLBACK);
    };
    img.src = imageUrl;
    return () => { cancelled = true; };
  }, [imageUrl, mode]);

  return palette;
}

const rgbCache = new Map(); // url -> [r,g,b]

function sampleAverageRgb(img) {
  const size = 24;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    // Skip near-black / near-white pixels so washed art doesn't flatten the mix
    const pr = data[i], pg = data[i + 1], pb = data[i + 2];
    const max = Math.max(pr, pg, pb);
    const min = Math.min(pr, pg, pb);
    if (max < 28 || min > 230) continue;
    r += pr; g += pg; b += pb; n++;
  }
  if (!n) return [48, 42, 38];
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

function loadAverageRgb(url) {
  if (rgbCache.has(url)) return Promise.resolve(rgbCache.get(url));
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let rgb;
      try {
        rgb = sampleAverageRgb(img);
      } catch {
        rgb = [48, 42, 38];
      }
      rgbCache.set(url, rgb);
      resolve(rgb);
    };
    img.onerror = () => {
      const fallback = [48, 42, 38];
      rgbCache.set(url, fallback);
      resolve(fallback);
    };
    img.src = url;
  });
}

/**
 * Mix average colors from several poster URLs into soft ambient RGB stops
 * for a multi-radial page wash (collection detail, etc.).
 */
export function usePosterColorWash(imageUrls = []) {
  const key = imageUrls.filter(Boolean).slice(0, 5).join("|");
  const [colors, setColors] = useState([]);

  useEffect(() => {
    const urls = key ? key.split("|") : [];
    if (!urls.length) {
      setColors([]);
      return undefined;
    }
    let cancelled = false;
    Promise.all(urls.map(loadAverageRgb)).then((rgbs) => {
      if (!cancelled) setColors(rgbs);
    });
    return () => { cancelled = true; };
  }, [key]);

  return colors;
}

const extractedRgbCache = new Map(); // url -> "r, g, b"
const EXTRACTED_FALLBACK = "35, 38, 45";

/**
 * Sample ONLY outer-edge backdrop pixels (top corners / top margin / side
 * margins) so skin/hair/clothes in the portrait center don't tint the hero.
 * Returns a CSS-ready "r, g, b" string for `rgb(var(--extracted-bg))`.
 */
export function extractBackdropRgbFromImage(img) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return EXTRACTED_FALLBACK;

  const w = (canvas.width = img.naturalWidth || img.width || 300);
  const h = (canvas.height = img.naturalHeight || img.height || 400);
  if (w < 8 || h < 8) return EXTRACTED_FALLBACK;

  ctx.drawImage(img, 0, 0, w, h);

  const sampleCoords = [
    { x: Math.floor(w * 0.05), y: Math.floor(h * 0.05) },
    { x: Math.floor(w * 0.25), y: Math.floor(h * 0.05) },
    { x: Math.floor(w * 0.5), y: Math.floor(h * 0.04) },
    { x: Math.floor(w * 0.75), y: Math.floor(h * 0.05) },
    { x: Math.floor(w * 0.95), y: Math.floor(h * 0.05) },
    { x: Math.floor(w * 0.05), y: Math.floor(h * 0.35) },
    { x: Math.floor(w * 0.95), y: Math.floor(h * 0.35) },
    { x: Math.floor(w * 0.08), y: Math.floor(h * 0.18) },
    { x: Math.floor(w * 0.92), y: Math.floor(h * 0.18) },
  ];

  let rSum = 0, gSum = 0, bSum = 0, n = 0;
  for (const pt of sampleCoords) {
    try {
      const pixel = ctx.getImageData(pt.x, pt.y, 1, 1).data;
      rSum += pixel[0];
      gSum += pixel[1];
      bSum += pixel[2];
      n++;
    } catch {
      return EXTRACTED_FALLBACK;
    }
  }
  if (!n) return EXTRACTED_FALLBACK;

  let r = Math.round(rSum / n);
  let g = Math.round(gSum / n);
  let b = Math.round(bSum / n);

  // Lift muddy near-black backdrops so the ambient glow still reads.
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luminance < 25) {
    r = Math.min(255, r + 20);
    g = Math.min(255, g + 22);
    b = Math.min(255, b + 26);
  } else if (luminance < 42) {
    r = Math.min(255, r + 10);
    g = Math.min(255, g + 11);
    b = Math.min(255, b + 14);
  }

  return `${r}, ${g}, ${b}`;
}

export function useExtractedBackdropRgb(imageUrl) {
  const [rgb, setRgb] = useState(() => (
    imageUrl && extractedRgbCache.has(imageUrl)
      ? extractedRgbCache.get(imageUrl)
      : EXTRACTED_FALLBACK
  ));

  useEffect(() => {
    if (!imageUrl) {
      setRgb(EXTRACTED_FALLBACK);
      return undefined;
    }
    const cached = extractedRgbCache.get(imageUrl);
    if (cached) {
      setRgb(cached);
      return undefined;
    }

    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = "anonymous";

    const apply = () => {
      if (cancelled) return;
      let result = EXTRACTED_FALLBACK;
      try {
        result = extractBackdropRgbFromImage(img);
      } catch {
        result = EXTRACTED_FALLBACK;
      }
      extractedRgbCache.set(imageUrl, result);
      setRgb(result);
    };

    img.onload = apply;
    img.onerror = () => {
      if (cancelled) return;
      extractedRgbCache.set(imageUrl, EXTRACTED_FALLBACK);
      setRgb(EXTRACTED_FALLBACK);
    };
    img.src = imageUrl;

    // Cached images may already be complete before onload fires.
    if (img.complete && img.naturalHeight !== 0) {
      apply();
    }

    return () => { cancelled = true; };
  }, [imageUrl]);

  return rgb;
}
