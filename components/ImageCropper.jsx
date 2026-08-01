"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

const FRAME_W = 280; // px — the visible crop window's own on-screen width
const OUTPUT_W = 512; // px — exported image width
const MAX_USER_ZOOM = 3;

/**
 * ImageCropper — full-screen crop/reposition/zoom step between "pick a
 * file" and "actually save it", so what gets uploaded is framed the way
 * the user wants rather than however their source photo happened to be
 * shot. Defaults to a square crop area with a circular mask (matches how
 * an avatar itself displays, and exports a square image — the circular
 * look elsewhere is just `border-radius: 50%` on display, so a square
 * export is all that caller needs). Pass `aspectRatio` (width/height,
 * e.g. 2 for a 2:1 banner) and `shape="rect"` for a wide, square-cornered
 * frame instead — used by Edit Profile's background/backdrop picker,
 * which needs the same crop/reposition/zoom step avatars already get
 * (previously applied a picked background directly with no adjustment
 * step at all).
 *
 * Math, in one paragraph: the source image renders at `baseScale`
 * (whichever axis needs to shrink/grow least to fully cover the frame,
 * i.e. "object-fit: cover" computed by hand) times `userScale` (1..
 * MAX_USER_ZOOM, from the slider/pinch/wheel), and is shifted by
 * `offset` (screen px, drag-controlled, clamped so it can never reveal
 * empty space past the frame edges). On confirm, that same transform is
 * inverted to find which rectangle of the image's *natural* pixels the
 * frame is currently showing, and canvas draws exactly that rectangle at
 * the output resolution (OUTPUT_W wide, OUTPUT_W/aspectRatio tall).
 *
 * props:
 *   file: the raw picked File (e.g. from an <input type="file">).
 *   onCancel(): discard — caller keeps whatever image it already had.
 *   onConfirm(croppedFile): a new File (image/jpeg), same interface as
 *     the original picked file, ready to pass straight into whatever
 *     upload path already handles a plain file input's File.
 *   aspectRatio: frame width/height. Default 1 (square).
 *   shape: "circle" | "rect" mask/frame corners. Default "circle".
 *   outputFilename: name for the exported File. Default "avatar.jpg".
 */
export default function ImageCropper({ file, onCancel, onConfirm, aspectRatio = 1, shape = "circle", outputFilename = "avatar.jpg" }) {
  const [imgSrc, setImgSrc] = useState(null);
  const [natural, setNatural] = useState(null); // { width, height }
  const [userScale, setUserScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const imgRef = useRef(null);
  const pointers = useRef(new Map()); // pointerId -> {x, y}
  const dragStart = useRef(null); // { x, y, offset } for single-pointer pan
  const pinchStart = useRef(null); // { dist, userScale } for two-pointer zoom

  const frameW = FRAME_W;
  const frameH = FRAME_W / aspectRatio;
  const outputW = OUTPUT_W;
  const outputH = Math.round(OUTPUT_W / aspectRatio);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const baseScale = useMemo(() => {
    if (!natural) return 1;
    return Math.max(frameW / natural.width, frameH / natural.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- frameW/frameH are derived from the aspectRatio prop, constant for this instance's whole lifetime
  }, [natural]);

  const renderScale = baseScale * userScale;
  const renderedWidth = natural ? natural.width * renderScale : 0;
  const renderedHeight = natural ? natural.height * renderScale : 0;

  const clampOffset = (next, width = renderedWidth, height = renderedHeight) => {
    const maxX = Math.max((width - frameW) / 2, 0);
    const maxY = Math.max((height - frameH) / 2, 0);
    return { x: Math.min(Math.max(next.x, -maxX), maxX), y: Math.min(Math.max(next.y, -maxY), maxY) };
  };

  // Re-clamp whenever zoom changes (e.g. the slider) — panning further
  // than the new, smaller rendered size allows would otherwise leave a
  // gap at the frame edge until the next drag.
  useEffect(() => {
    setOffset((prev) => clampOffset(prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clampOffset closes over renderedWidth/Height, which are the actual deps
  }, [renderedWidth, renderedHeight]);

  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX, y: e.clientY, offset };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), userScale };
    }
  };

  const handlePointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const next = (dist / pinchStart.current.dist) * pinchStart.current.userScale;
      setUserScale(Math.min(Math.max(next, 1), MAX_USER_ZOOM));
      return;
    }
    if (pointers.current.size === 1 && dragStart.current) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setOffset(clampOffset({ x: dragStart.current.offset.x + dx, y: dragStart.current.offset.y + dy }));
    }
  };

  const endPointer = (e) => {
    pointers.current.delete(e.pointerId);
    dragStart.current = pointers.current.size === 1 ? { x: [...pointers.current.values()][0].x, y: [...pointers.current.values()][0].y, offset } : null;
    pinchStart.current = null;
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const next = userScale - e.deltaY * 0.0015;
    setUserScale(Math.min(Math.max(next, 1), MAX_USER_ZOOM));
  };

  const confirm = () => {
    const img = imgRef.current;
    if (!img || !natural) return;
    // Invert the display transform: which rectangle of the *natural*
    // image is currently showing through the frame.
    const srcWidth = frameW / renderScale;
    const srcHeight = frameH / renderScale;
    const srcX = (renderedWidth / 2 - frameW / 2 - offset.x) / renderScale;
    const srcY = (renderedHeight / 2 - frameH / 2 - offset.y) / renderScale;

    const canvas = document.createElement("canvas");
    canvas.width = outputW;
    canvas.height = outputH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, srcX, srcY, srcWidth, srcHeight, 0, 0, outputW, outputH);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onConfirm(new File([blob], outputFilename, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: t.bg }}>
      <div className="flex items-center justify-between px-6" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <button onClick={onCancel} className="flex items-center justify-center rounded-full active:scale-95 transition" style={{ width: 36, height: 36, background: t.cardFill, border: `1px solid ${t.glassBorder}` }}>
          <Icon name="x" size={16} color="#fff" />
        </button>
        <span style={{ fontSize: 15.5, fontWeight: 700, color: "#fff" }}>Adjust Photo</span>
        <button onClick={confirm} disabled={!natural} style={{ fontSize: 14.5, fontWeight: 700, color: accent, padding: "6px 4px", opacity: natural ? 1 : 0.4 }}>Save</button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        <div
          className="relative overflow-hidden"
          style={{ width: frameW, height: frameH, borderRadius: shape === "circle" ? "50%" : 16, touchAction: "none", cursor: "grab", background: "#000" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onWheel={handleWheel}
        >
          {imgSrc && (
            // eslint-disable-next-line @next/next/no-img-element -- an in-memory object URL for canvas cropping, not a static/TMDB asset
            <img
              ref={imgRef}
              src={imgSrc}
              alt=""
              draggable={false}
              onLoad={(e) => setNatural({ width: e.target.naturalWidth, height: e.target.naturalHeight })}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: renderedWidth || undefined,
                height: renderedHeight || undefined,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                maxWidth: "none",
              }}
            />
          )}
        </div>

        <div className="flex items-center gap-3" style={{ width: frameW, marginTop: 22 }}>
          <Icon name="image" size={14} color={t.textDim} />
          <input
            type="range"
            min={1}
            max={MAX_USER_ZOOM}
            step={0.01}
            value={userScale}
            onChange={(e) => setUserScale(Number(e.target.value))}
            className="flex-1"
            style={{ accentColor: accent }}
          />
        </div>
        <div style={{ fontSize: 12, color: t.textDim, marginTop: 14 }}>Drag to reposition · Pinch or scroll to zoom</div>
      </div>
    </div>
  );
}
