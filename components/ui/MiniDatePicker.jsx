"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Icon from "@/components/ui/Icon";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";
import { bangkokNow } from "@/lib/bangkokDate";
import { MONTH_NAMES, parseISODate } from "@/lib/watchDate";

const t = themes.dark;
const accent = DEFAULT_ACCENT;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SECONDARY_TEXT = "#9A9A9A";
// Same earliest-year boundary components/WatchDateSheet.jsx's own year
// wheel uses.
const MIN_YEAR = 1970;
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// Verbatim copy of components/WatchDateSheet.jsx's own WheelColumn — same
// "why a fresh array literal per render breaks re-centering" reasoning
// applies (MONTHS/YEARS live at module/memo scope, not recreated inline).
// Duplicated rather than imported: this picker is a much smaller,
// standalone component, not worth threading a shared export through for
// one reused piece.
const ITEM_HEIGHT = 34;
const VISIBLE_ROWS = 5;
function WheelColumn({ options, value, onChange, renderLabel, width = 120 }) {
  const containerRef = useRef(null);
  const settleTimer = useRef(null);
  const padding = Math.floor(VISIBLE_ROWS / 2) * ITEM_HEIGHT;

  useEffect(() => {
    const idx = options.findIndex((o) => o === value);
    if (idx < 0 || !containerRef.current) return;
    containerRef.current.scrollTop = idx * ITEM_HEIGHT;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-center on mount/options-identity change, not every value change (the user's own scroll already IS the value change)
  }, [options]);

  const commitFromScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(options.length - 1, idx));
    if (options[clamped] !== value) onChange(options[clamped]);
  };

  const handleScroll = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(commitFromScroll, 120);
  };

  const jumpTo = (idx) => {
    containerRef.current?.scrollTo({ top: idx * ITEM_HEIGHT, behavior: "smooth" });
  };

  return (
    <div className="relative" style={{ width, height: ITEM_HEIGHT * VISIBLE_ROWS }}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto"
        style={{
          scrollSnapType: "y mandatory",
          scrollbarWidth: "none",
          maskImage: "linear-gradient(180deg, transparent 0%, #000 28%, #000 72%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(180deg, transparent 0%, #000 28%, #000 72%, transparent 100%)",
        }}
      >
        <div style={{ height: padding }} />
        {options.map((opt, i) => {
          const selected = opt === value;
          return (
            <div
              key={String(opt)}
              onClick={() => jumpTo(i)}
              className="flex items-center justify-center"
              style={{ height: ITEM_HEIGHT, scrollSnapAlign: "center", cursor: "pointer" }}
            >
              <span style={{ fontSize: selected ? 15.5 : 14, fontWeight: selected ? 500 : 400, color: selected ? "#fff" : "rgba(255,255,255,0.38)", transition: "color 150ms ease, font-size 150ms ease" }}>
                {renderLabel(opt)}
              </span>
            </div>
          );
        })}
        <div style={{ height: padding }} />
      </div>
      <div className="absolute left-0 right-0 pointer-events-none rounded-lg" style={{ top: padding, height: ITEM_HEIGHT, background: "rgba(255,255,255,0.05)" }} />
    </div>
  );
}

// Minimal standalone calendar for picking ONE exact date — distinct from
// components/WatchDateSheet.jsx's own much larger "Watch Date" bottom
// sheet (day/month/year precision + Release date/Release month/Don't
// remember options): a review always has a real exact date, no ambiguity
// to model, so there's no "No date" checkbox / precision options here —
// just the calendar grid, plus the SAME month/year quick-jump wheel
// WatchDateSheet's own calendar uses (tap the month/year label to swap
// the grid for two scrollable wheels, the fast path to a date years
// back instead of stepping one month at a time via the arrows).
export default function MiniDatePicker({ value, onChange, onClose }) {
  const bkNow = bangkokNow();
  const initial = parseISODate(value) ?? bkNow;
  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month);
  const [quickJumpOpen, setQuickJumpOpen] = useState(false);

  const firstWeekday = new Date(viewYear, viewMonth - 1, 1).getDay();
  const totalCells = Math.ceil((firstWeekday + daysInMonth(viewYear, viewMonth)) / 7) * 7;
  const trailingCount = totalCells - firstWeekday - daysInMonth(viewYear, viewMonth);
  const prevMonthDays = daysInMonth(viewMonth === 1 ? viewYear - 1 : viewYear, viewMonth === 1 ? 12 : viewMonth - 1);
  const leadingDays = Array.from({ length: firstWeekday }, (_, i) => prevMonthDays - firstWeekday + i + 1);
  const trailingDays = Array.from({ length: trailingCount }, (_, i) => i + 1);
  const isFutureMonth = viewYear > bkNow.year || (viewYear === bkNow.year && viewMonth > bkNow.month);
  const goToPrevMonth = () => { if (viewMonth === 1) { setViewMonth(12); setViewYear((y) => y - 1); } else setViewMonth((m) => m - 1); };
  const goToNextMonth = () => { if (isFutureMonth) return; if (viewMonth === 12) { setViewMonth(1); setViewYear((y) => y + 1); } else setViewMonth((m) => m + 1); };
  const isDayDisabled = (day) => viewYear === bkNow.year && viewMonth === bkNow.month && day > bkNow.day;

  const YEARS = useMemo(() => {
    const out = [];
    for (let y = bkNow.year; y >= MIN_YEAR; y--) out.push(y);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bkNow is stable for the lifetime of one picker session
  }, []);

  // Wheel-picked month/year — can't land on a future month, same rule the
  // prev/next arrows already enforce one step at a time.
  const setWheelMonth = (m) => {
    if (viewYear === bkNow.year && m > bkNow.month) return;
    setViewMonth(m);
  };
  const setWheelYear = (y) => {
    setViewYear(y);
    if (y === bkNow.year && viewMonth > bkNow.month) setViewMonth(bkNow.month);
  };

  const selectDay = (day) => {
    const iso = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange(iso);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute z-50 rounded-2xl"
        style={{
          top: "calc(100% + 8px)", left: 0, width: 264, padding: 12,
          background: "rgba(28,22,16,0.97)", border: `1px solid ${t.glassBorder}`,
          backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 20px 44px rgba(0,0,0,0.55)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <button onClick={goToPrevMonth} disabled={quickJumpOpen} className="flex items-center justify-center rounded-full active:scale-95 transition" style={{ width: 26, height: 26, opacity: quickJumpOpen ? 0.3 : 1 }}>
            <Icon name="back" size={12} color="#fff" />
          </button>
          <button
            type="button"
            onClick={() => setQuickJumpOpen((v) => !v)}
            className="flex items-center justify-center active:opacity-70 transition"
            style={{ gap: 3 }}
          >
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "#fff" }}>{MONTH_NAMES[viewMonth - 1]} {viewYear}</span>
            <span style={{ display: "inline-flex", transform: quickJumpOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 150ms ease" }}>
              <Icon name="chevronRight" size={9} color="rgba(255,255,255,0.4)" />
            </span>
          </button>
          <button onClick={goToNextMonth} disabled={isFutureMonth || quickJumpOpen} className="flex items-center justify-center rounded-full active:scale-95 transition" style={{ width: 26, height: 26, opacity: (isFutureMonth || quickJumpOpen) ? 0.3 : 1 }}>
            <Icon name="chevronRight" size={12} color="#fff" />
          </button>
        </div>

        {quickJumpOpen ? (
          <div className="flex items-center justify-center gap-2" style={{ padding: "10px 0 2px" }}>
            <WheelColumn options={MONTHS} value={viewMonth} onChange={setWheelMonth} renderLabel={(m) => MONTH_NAMES[m - 1]} width={140} />
            <WheelColumn options={YEARS} value={viewYear} onChange={setWheelYear} renderLabel={(y) => String(y)} width={84} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7" style={{ marginTop: 8 }}>
              {WEEKDAY_LABELS.map((d, i) => (
                <div key={i} className="flex items-center justify-center" style={{ height: 18 }}>
                  <span style={{ fontSize: 9, fontWeight: 500, color: SECONDARY_TEXT, textTransform: "uppercase" }}>{d}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {leadingDays.map((n, i) => (
                <div key={`lead-${i}`} className="flex items-center justify-center" style={{ height: 30 }}>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.2)" }}>{n}</span>
                </div>
              ))}
              {Array.from({ length: daysInMonth(viewYear, viewMonth) }, (_, i) => i + 1).map((day) => {
                const isSelected = initial.year === viewYear && initial.month === viewMonth && initial.day === day;
                const isToday = bkNow.year === viewYear && bkNow.month === viewMonth && bkNow.day === day;
                const disabled = isDayDisabled(day);
                return (
                  <button
                    key={day}
                    disabled={disabled}
                    onClick={() => selectDay(day)}
                    className="relative flex items-center justify-center active:scale-95 transition"
                    style={{ height: 30 }}
                  >
                    <div className="absolute rounded-full" style={{ width: 26, height: 26, left: "50%", top: "50%", transform: "translate(-50%, -50%)", background: isSelected ? accent : "transparent", border: isToday && !isSelected ? "1px solid rgba(255,255,255,0.3)" : "none" }} />
                    <span style={{ position: "relative", fontSize: 13, fontWeight: isSelected ? 600 : 400, color: disabled ? "rgba(255,255,255,0.2)" : isSelected ? "#1a1108" : "#fff" }}>{day}</span>
                  </button>
                );
              })}
              {trailingDays.map((n, i) => (
                <div key={`trail-${i}`} className="flex items-center justify-center" style={{ height: 30 }}>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.2)" }}>{n}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
