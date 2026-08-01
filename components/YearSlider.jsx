"use client";

import { useRef } from "react";
import { themes } from "@/lib/theme";

const t = themes.dark;

// Single-handle year slider — one direction, drag to a specific year
// (used as a "since {year}" threshold), unlike YearRangeSlider's two
// independent handles. Same hand-built pointer-capture approach as that
// component (see its own comment for why, over two overlapping native
// range inputs).
export default function YearSlider({ min, max, value, onChange }) {
  const trackRef = useRef(null);
  const dragging = useRef(false);

  const pct = ((value - min) / (max - min)) * 100;

  const yearFromClientX = (clientX) => {
    const rect = trackRef.current.getBoundingClientRect();
    const p = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    return Math.round(min + p * (max - min));
  };

  return (
    <div>
      <div ref={trackRef} className="relative" style={{ height: 4, borderRadius: 2, background: t.cardBorder, margin: "0 10px" }}>
        <div className="absolute" style={{ left: 0, width: `${pct}%`, top: 0, bottom: 0, background: "#fff", borderRadius: 2 }} />
        <div
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); dragging.current = true; }}
          onPointerMove={(e) => { if (dragging.current) onChange(yearFromClientX(e.clientX)); }}
          onPointerUp={() => { dragging.current = false; }}
          onPointerCancel={() => { dragging.current = false; }}
          className="absolute rounded-full active:scale-110 transition"
          style={{ left: `${pct}%`, top: "50%", width: 18, height: 18, background: "#fff", border: "2px solid #111", transform: "translate(-50%, -50%)", touchAction: "none" }}
        />
      </div>
      <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
        <span style={{ fontSize: 11, color: t.textDim }}>{min}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Since {value}</span>
        <span style={{ fontSize: 11, color: t.textDim }}>{max}</span>
      </div>
    </div>
  );
}
