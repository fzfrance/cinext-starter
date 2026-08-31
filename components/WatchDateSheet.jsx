"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Icon from "@/components/ui/Icon";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";
import { bangkokNow } from "@/lib/bangkokDate";
import { MONTH_NAMES, parseISODate, selectedWatchDateOptionId } from "@/lib/watchDate";

const t = themes.dark;
const accent = DEFAULT_ACCENT;
const SECONDARY_TEXT = "#9A9A9A";
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MIN_YEAR = 1970;
// Liquid-glass surface for the precision-specific picker body (calendar/
// wheel/release-date summary) — translucent + blurred rather than a flat
// opaque fill. The option list above uses the app's shared t.cardFill/
// t.glassBorder tokens instead (same ones GlassCircle uses), kept as a
// separate constant here since the picker bodies weren't part of that
// restyle. Amber is reserved for the Save button, the selected option's
// checkmark, and the selected calendar date only.
const GLASS_CARD = { background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.07)" };
// Module scope, not recreated per render — WheelColumn's own re-centering
// effect keys off this array's IDENTITY (`useEffect(..., [options])`), so
// a fresh array literal on every render (this used to be declared inside
// the component body) retriggered that effect on every unrelated
// WatchDateSheet re-render, not just when the month wheel's own value
// changed. In practice that meant scrolling the YEAR wheel (which changes
// other state and forces a re-render) could snap the MONTH wheel back to
// its last-committed value mid-scroll, silently discarding whichever
// month the user had just picked — the actual cause of a saved date
// landing on the wrong month (or "today") despite scrolling to the
// intended one right before saving.
const MONTHS_WITH_NONE = [null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

const OPTIONS = [
  { id: "day", label: "Exact date" },
  { id: "release_date", label: "Release date" },
  { id: "release_month", label: "Release month" },
  { id: "unknown", label: "Don't remember" },
];

// One scroll-snap "wheel" column — a lightweight, standard-web-tech
// approximation of a native iOS UIPickerView (no dedicated wheel-physics
// library in this codebase to reach for): a fixed-height list with
// scroll-snap-align centering, a debounced settle-detection on scroll
// (there's no cross-browser guarantee `scrollend` fires yet), a top/
// bottom fade mask, and tap-any-row-to-jump. Real momentum/rubber-band
// scrolling comes from the browser itself on a plain overflow-y:auto
// container — nothing extra needed for that part.
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
              {/* Light-medium weight even when selected — this is a
                  value picker, not a heading; weight difference alone
                  (500 vs 400) plus color/size is enough to read as
                  "selected" without going bold/thick. */}
              <span style={{ fontSize: selected ? 15.5 : 14, fontWeight: selected ? 500 : 400, color: selected ? "#fff" : "rgba(255,255,255,0.38)", transition: "color 150ms ease, font-size 150ms ease" }}>
                {renderLabel(opt)}
              </span>
            </div>
          );
        })}
        <div style={{ height: padding }} />
      </div>
      {/* center selection band — a static visual reference, matches the
          "dark translucent wheels" glass-container spec without needing
          per-row background changes */}
      <div className="absolute left-0 right-0 pointer-events-none rounded-lg" style={{ top: padding, height: ITEM_HEIGHT, background: "rgba(255,255,255,0.05)" }} />
    </div>
  );
}

/**
 * WatchDateSheet — the episode rating flow's editable Watch Date bottom
 * sheet. Four precision options (exact date / release date / release
 * month / don't remember) shown as a plain iOS-Settings-style grouped
 * list (no bordered option cards, no per-row amber outline — the
 * checkmark alone marks the selection). There's no standalone "Month or
 * Year" row anymore: "Exact date" covers day, month, AND year precision
 * now, via its own "No date" checkbox — unchecked shows the full
 * calendar (tapping the month/year label opens a quick month/year wheel
 * jump instead of stepping one month at a time with the arrows, handy
 * for a date from years back); checked collapses the calendar down to
 * just a month/year wheel picker (a month of "None" is what stores
 * precision: "year"). Never invents a fake date for the coarser
 * precisions (no January 1 for "year only", no 1st of the month for
 * "month only" — see lib/episodeWatches.js's setWatchDate). Purely a
 * controlled picker: it reports the chosen precision/fields back via
 * onSave and does no persistence itself — the caller (EpisodeRatingFlow)
 * owns calling setWatchDate and updating its own state so the label/
 * Highlights can update instantly without a dismiss/reload flash.
 *
 * Sheet height is a fixed 75% of the viewport (never full-screen) — the
 * episode artwork stays visible behind it through the dimmed scrim, the
 * same "Photos/Music/TV app sheet" feel as the rest of this app's other
 * bottom sheets, just scoped a little shorter since this one has less to
 * show than, say, a full status/filter menu.
 *
 * props:
 *   current: { watchDatePrecision, watchedOn, watchedYear, watchedMonth,
 *     watchDateSource } — the watch event's present state, used to seed
 *     every picker so reopening this sheet always starts from what's
 *     actually stored, never a blank slate.
 *   episodeAirDate: "YYYY-MM-DD" | null — backs Release date/Release
 *     month; both options render disabled with a clear reason when this
 *     is null (TMDB has no air date for the episode).
 *   onClose: () => void
 *   onSave: (next: { precision, watchedOn, watchedYear, watchedMonth, source }) => void
 */
export default function WatchDateSheet({ current, episodeAirDate, onClose, onSave }) {
  const bkNow = bangkokNow();
  const airParts = useMemo(() => parseISODate(episodeAirDate), [episodeAirDate]);
  const hasAirDate = !!airParts;

  const initialOptionId = selectedWatchDateOptionId(current);
  const [optionId, setOptionId] = useState(initialOptionId);

  // Draft state for each picker body — seeded from `current` where it
  // applies, otherwise a sensible starting point (today, for a precision
  // that had no prior real date to seed from).
  const initialDay = current?.watchDatePrecision === "day" && current.watchedOn ? parseISODate(current.watchedOn) : bkNow;
  const [draftDay, setDraftDay] = useState(initialDay);
  const [calendarViewYear, setCalendarViewYear] = useState(initialDay.year);
  const [calendarViewMonth, setCalendarViewMonth] = useState(initialDay.month);

  // The month/year wheel picker "Exact date" collapses down to when its
  // "No date" checkbox is on — seeds to None (-> precision "year") when
  // the stored precision is actually "year" (that's the only way a
  // year-precision row reopens here), the real month otherwise.
  const initialMonthYearMonth =
    current?.watchDatePrecision === "month" && current.watchDateSource !== "release_month" ? current.watchedMonth :
    current?.watchDatePrecision === "year" ? null :
    bkNow.month;
  const initialMonthYearYear = (current?.watchDatePrecision === "month" || current?.watchDatePrecision === "year") && current.watchDateSource !== "release_month" ? current.watchedYear : bkNow.year;
  const [draftMonth, setDraftMonth] = useState(initialMonthYearMonth); // null means "None"
  const [draftMonthYearYear, setDraftMonthYearYear] = useState(initialMonthYearYear);

  // "No date" checkbox — checked whenever the stored value is actually
  // month/year precision (not release_month-sourced, which has its own
  // separate option). Toggling it swaps which of draftDay vs.
  // draftMonth/draftMonthYearYear pendingResult reads from.
  const initialNoDateChecked = (current?.watchDatePrecision === "month" && current.watchDateSource !== "release_month") || current?.watchDatePrecision === "year";
  const [noDateChecked, setNoDateChecked] = useState(initialNoDateChecked);
  // Whether the calendar's month/year label has been tapped open into a
  // quick-jump wheel picker — lets the user scroll straight to a year
  // from long ago instead of stepping one month at a time via the
  // prev/next arrows.
  const [quickJumpOpen, setQuickJumpOpen] = useState(false);

  const YEARS = useMemo(() => {
    const out = [];
    for (let y = bkNow.year; y >= MIN_YEAR; y--) out.push(y);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bkNow is stable for the lifetime of one sheet session
  }, []);

  // Checking "No date" zooms OUT from whatever exact date was selected
  // to just its month/year (not a reset to today) — unchecking zooms
  // back IN, landing the calendar on that month/year without touching
  // which day was picked. Matches how the rest of this sheet never
  // throws away a draft just because the user is looking at a different
  // picker body for a moment.
  const toggleNoDate = () => {
    setQuickJumpOpen(false);
    setNoDateChecked((prev) => {
      const next = !prev;
      if (next) {
        setDraftMonth(draftDay.month);
        setDraftMonthYearYear(draftDay.year);
      } else if (draftMonth != null) {
        setCalendarViewMonth(draftMonth);
        setCalendarViewYear(draftMonthYearYear);
      }
      return next;
    });
  };

  // Calendar grid for the exact-date picker — same leading/trailing-day
  // fill + weekday alignment Highlights' own Watch History calendar uses,
  // so this reads as the same component family rather than a different
  // calendar widget, just at a much smaller scale (fixed-height rows,
  // not aspect-ratio-driven, so the whole card lands around 300-340px
  // regardless of screen width instead of ballooning to fill it).
  const firstWeekday = new Date(calendarViewYear, calendarViewMonth - 1, 1).getDay();
  const totalCells = Math.ceil((firstWeekday + daysInMonth(calendarViewYear, calendarViewMonth)) / 7) * 7;
  const trailingCount = totalCells - firstWeekday - daysInMonth(calendarViewYear, calendarViewMonth);
  const prevMonthDays = daysInMonth(calendarViewMonth === 1 ? calendarViewYear - 1 : calendarViewYear, calendarViewMonth === 1 ? 12 : calendarViewMonth - 1);
  const leadingDays = Array.from({ length: firstWeekday }, (_, i) => prevMonthDays - firstWeekday + i + 1);
  const trailingDays = Array.from({ length: trailingCount }, (_, i) => i + 1);
  const isFutureMonth = calendarViewYear > bkNow.year || (calendarViewYear === bkNow.year && calendarViewMonth > bkNow.month);
  const goToPrevMonth = () => {
    if (calendarViewMonth === 1) { setCalendarViewMonth(12); setCalendarViewYear((y) => y - 1); } else setCalendarViewMonth((m) => m - 1);
  };
  const goToNextMonth = () => {
    if (isFutureMonth) return;
    if (calendarViewMonth === 12) { setCalendarViewMonth(1); setCalendarViewYear((y) => y + 1); } else setCalendarViewMonth((m) => m + 1);
  };
  const isDayDisabled = (day) => calendarViewYear === bkNow.year && calendarViewMonth === bkNow.month && day > bkNow.day;

  // Quick-jump wheel setters (used only while quickJumpOpen). Month also
  // carries a "None" choice (before January, same MONTHS_WITH_NONE list
  // the "No date" checkbox's own wheel uses) — reachable straight from
  // the calendar's quick-jump instead of only via that checkbox. Picking
  // "None" isn't a navigation step like every other month value here; it
  // switches this session straight into year-only mode (same as checking
  // "No date" with the month wheel left on None), seeded with whichever
  // year is currently being viewed. Any real month keeps the existing
  // "can't land on a future month" rule goToNextMonth already enforces
  // for the arrow-based nav, just applied to arbitrary wheel picks
  // instead of one step at a time.
  const setQuickJumpMonth = (m) => {
    if (m == null) {
      setDraftMonth(null);
      setDraftMonthYearYear(calendarViewYear);
      setNoDateChecked(true);
      setQuickJumpOpen(false);
      return;
    }
    if (calendarViewYear === bkNow.year && m > bkNow.month) return;
    setCalendarViewMonth(m);
  };
  const setQuickJumpYear = (y) => {
    setCalendarViewYear(y);
    if (y === bkNow.year && calendarViewMonth > bkNow.month) setCalendarViewMonth(bkNow.month);
  };

  // What would actually be saved right now, given the current draft —
  // computed once here so both the Save button's enabled state and the
  // actual save handler read the exact same derivation. "Exact date"
  // reads from draftDay normally, or from draftMonth/draftMonthYearYear
  // instead once "No date" is checked (a month of None there is what
  // produces precision: "year").
  const pendingResult = useMemo(() => {
    if (optionId === "day") {
      if (noDateChecked) {
        if (draftMonth == null) return { precision: "year", watchedOn: null, watchedYear: draftMonthYearYear, watchedMonth: null, source: "manual" };
        return { precision: "month", watchedOn: null, watchedYear: draftMonthYearYear, watchedMonth: draftMonth, source: "manual" };
      }
      const d = draftDay;
      return { precision: "day", watchedOn: `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`, watchedYear: d.year, watchedMonth: d.month, source: "manual" };
    }
    if (optionId === "release_date" && hasAirDate) {
      return { precision: "day", watchedOn: episodeAirDate, watchedYear: airParts.year, watchedMonth: airParts.month, source: "release_date" };
    }
    if (optionId === "release_month" && hasAirDate) {
      return { precision: "month", watchedOn: null, watchedYear: airParts.year, watchedMonth: airParts.month, source: "release_month" };
    }
    return { precision: "unknown", watchedOn: null, watchedYear: null, watchedMonth: null, source: null };
  }, [optionId, noDateChecked, draftDay, draftMonth, draftMonthYearYear, hasAirDate, episodeAirDate, airParts]);

  const hasChanges =
    pendingResult.precision !== (current?.watchDatePrecision ?? "day") ||
    pendingResult.watchedOn !== (current?.watchedOn ?? null) ||
    pendingResult.watchedYear !== (current?.watchedYear ?? null) ||
    pendingResult.watchedMonth !== (current?.watchedMonth ?? null) ||
    pendingResult.source !== (current?.watchDateSource ?? null);

  const selectOption = (id) => {
    if ((id === "release_date" || id === "release_month") && !hasAirDate) return;
    setOptionId(id);
  };

  return (
    <>
      <div className="fixed inset-0 z-[70]" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose} />
      <div
        className="fixed left-0 right-0 z-[71] flex flex-col"
        style={{
          bottom: 0,
          height: "75vh",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          background: "rgba(20,20,20,0.9)",
          backdropFilter: "blur(30px)",
          WebkitBackdropFilter: "blur(30px)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderBottom: "none",
          boxShadow: "0 -16px 50px rgba(0,0,0,0.45)",
          animation: "watchDateSheetUp 320ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <style>{`
          @keyframes watchDateSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
          @keyframes watchDateFade { from { opacity: 0; } to { opacity: 1; } }
        `}</style>

        {/* floating circular Save button — replaces the old Cancel/Save
            text-button row entirely. Positioned to slightly overlap the
            sheet's own rounded top edge (negative top offset), same
            treatment as the reference. There's no swipe-down-to-dismiss
            gesture wired to this sheet (only a decorative grabber bar with
            no touch handlers), so the existing backdrop tap-to-close
            remains the sheet's one non-text way to cancel — unaffected by
            removing the visible Cancel button. */}
        <button
          onClick={() => hasChanges && onSave(pendingResult)}
          disabled={!hasChanges}
          className="absolute flex items-center justify-center active:scale-95 transition"
          style={{
            top: 18,
            right: 16,
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: hasChanges ? accent : t.cardFill,
            border: `1px solid ${hasChanges ? accent : t.glassBorder}`,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: hasChanges ? "0 4px 14px rgba(232,162,76,0.35)" : "none",
            zIndex: 2,
          }}
        >
          <Icon name="check" size={18} color={hasChanges ? "#1a1108" : "rgba(255,255,255,0.4)"} strokeWidth={2.6} />
        </button>

        {/* grabber */}
        <div className="flex justify-center flex-shrink-0" style={{ paddingTop: 8 }}>
          <div style={{ width: 34, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.22)" }} />
        </div>

        {/* header — just the title now; Save lives in the floating
            circular button above */}
        <div className="flex items-center justify-center flex-shrink-0" style={{ height: 52, padding: "0 14px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>Watch Date</span>
        </div>

        <div className="overflow-y-auto" style={{ padding: "14px 14px 20px", scrollbarWidth: "none" }}>
          {/* option list — one grouped card, hairline separators between
              rows (not a border around each), no per-row outline; the
              selection is communicated purely by the trailing checkmark,
              same as iOS Settings. */}
          <div className="rounded-2xl overflow-hidden" style={{ background: t.cardFill, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
            {OPTIONS.map((opt, i) => {
              const selected = optionId === opt.id;
              const isReleaseOpt = opt.id === "release_date" || opt.id === "release_month";
              const disabled = isReleaseOpt && !hasAirDate;
              return (
                <button
                  key={opt.id}
                  onClick={() => selectOption(opt.id)}
                  disabled={disabled}
                  className="w-full flex items-center justify-between active:bg-white/[0.04] transition"
                  style={{
                    height: 54,
                    padding: "0 14px",
                    borderTop: i > 0 ? "1px solid rgba(255,255,255,0.07)" : "none",
                    opacity: disabled ? 0.4 : 1,
                  }}
                >
                  <div className="text-left">
                    <span style={{ fontSize: 15, fontWeight: 400, color: "#fff" }}>{opt.label}</span>
                    {disabled && <div style={{ fontSize: 10.5, color: SECONDARY_TEXT }}>No air date available</div>}
                  </div>
                  {selected && (
                    <span key={optionId} style={{ animation: "watchDateFade 150ms ease" }}>
                      <Icon name="check" size={16} color={accent} strokeWidth={2.4} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* precision-specific picker body — replaces the option-list
              area's leftover space entirely rather than sitting below an
              empty gap, since only one of these ever renders at a time. */}
          <div key={optionId} style={{ marginTop: 12, animation: "watchDateFade 200ms ease" }}>
            {optionId === "day" && (
              <div className="rounded-2xl" style={{ padding: 12, ...GLASS_CARD }}>
                {/* "No date" checkbox shares the same row as the month/
                    year header (rather than its own row above it) — same
                    line, no extra vertical space spent, so the calendar
                    below sits higher instead of getting pushed down. The
                    exact-date and month/year-only precisions share this
                    one option instead of a separate "Month or Year" row;
                    checking it collapses the calendar down to just the
                    month/year wheels below (a month of "None" there is
                    what stores precision: "year"). */}
                <div className="flex items-center" style={{ height: 26, gap: 6 }}>
                  <button
                    type="button"
                    onClick={toggleNoDate}
                    className="flex items-center gap-1.5 active:opacity-70 transition flex-shrink-0"
                  >
                    <div
                      className="flex items-center justify-center rounded-md flex-shrink-0"
                      style={{
                        width: 17,
                        height: 17,
                        border: `1.5px solid ${noDateChecked ? accent : "rgba(255,255,255,0.35)"}`,
                        background: noDateChecked ? accent : "transparent",
                        transition: "background 120ms ease, border-color 120ms ease",
                      }}
                    >
                      {noDateChecked && <Icon name="check" size={10} color="#1a1108" strokeWidth={3} />}
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: 500, color: "#fff", whiteSpace: "nowrap" }}>No date</span>
                  </button>

                  {!noDateChecked && (
                    <>
                      {/* Tapping the label opens a quick month/year wheel
                          jump — the fast path to a date from years back,
                          instead of stepping one month at a time. */}
                      <button
                        type="button"
                        onClick={() => setQuickJumpOpen((v) => !v)}
                        className="flex-1 min-w-0 flex items-center justify-center active:opacity-70 transition"
                        style={{ gap: 3 }}
                      >
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: "#fff" }}>{MONTH_NAMES[calendarViewMonth - 1]} {calendarViewYear}</span>
                        <span style={{ display: "inline-flex", transform: quickJumpOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 150ms ease" }}>
                          <Icon name="chevronRight" size={9} color="rgba(255,255,255,0.4)" />
                        </span>
                      </button>
                      <div className="flex items-center justify-end flex-shrink-0" style={{ gap: 4 }}>
                        <button onClick={goToPrevMonth} disabled={quickJumpOpen} className="flex items-center justify-center rounded-full transition hover:bg-white/10 active:scale-95" style={{ width: 24, height: 24, opacity: quickJumpOpen ? 0.3 : 1 }}>
                          <Icon name="back" size={11} color="#fff" />
                        </button>
                        <button onClick={goToNextMonth} disabled={isFutureMonth || quickJumpOpen} className="flex items-center justify-center rounded-full transition hover:bg-white/10 active:scale-95" style={{ width: 24, height: 24, opacity: (isFutureMonth || quickJumpOpen) ? 0.3 : 1 }}>
                          <Icon name="chevronRight" size={11} color="#fff" />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {noDateChecked ? (
                  <div className="flex items-center justify-center gap-2" style={{ padding: "8px 0 2px" }}>
                    <WheelColumn
                      options={MONTHS_WITH_NONE}
                      value={draftMonth}
                      onChange={setDraftMonth}
                      renderLabel={(m) => (m == null ? "None" : MONTH_NAMES[m - 1])}
                      width={140}
                    />
                    <WheelColumn options={YEARS} value={draftMonthYearYear} onChange={setDraftMonthYearYear} renderLabel={(y) => String(y)} width={84} />
                  </div>
                ) : quickJumpOpen ? (
                  <div className="flex items-center justify-center gap-2" style={{ padding: "8px 0 2px" }}>
                    <WheelColumn
                      options={MONTHS_WITH_NONE}
                      value={calendarViewMonth}
                      onChange={setQuickJumpMonth}
                      renderLabel={(m) => (m == null ? "None" : MONTH_NAMES[m - 1])}
                      width={140}
                    />
                    <WheelColumn options={YEARS} value={calendarViewYear} onChange={setQuickJumpYear} renderLabel={(y) => String(y)} width={84} />
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
                        <div key={`lead-${i}`} className="flex items-center justify-center" style={{ height: 36 }}>
                          <span style={{ fontSize: 15, color: "rgba(255,255,255,0.2)" }}>{n}</span>
                        </div>
                      ))}
                      {Array.from({ length: daysInMonth(calendarViewYear, calendarViewMonth) }, (_, i) => i + 1).map((day) => {
                        const isSelected = draftDay.year === calendarViewYear && draftDay.month === calendarViewMonth && draftDay.day === day;
                        const isToday = bkNow.year === calendarViewYear && bkNow.month === calendarViewMonth && bkNow.day === day;
                        const disabled = isDayDisabled(day);
                        return (
                          <button
                            key={day}
                            disabled={disabled}
                            onClick={() => setDraftDay({ year: calendarViewYear, month: calendarViewMonth, day })}
                            className="relative flex items-center justify-center active:scale-95 transition"
                            style={{ height: 36 }}
                          >
                            <div className="absolute rounded-full" style={{ width: 30, height: 30, left: "50%", top: "50%", transform: "translate(-50%, -50%)", background: isSelected ? accent : "transparent", border: isToday && !isSelected ? "1px solid rgba(255,255,255,0.3)" : "none" }} />
                            <span style={{ position: "relative", fontSize: 15, fontWeight: isSelected ? 600 : 400, color: disabled ? "rgba(255,255,255,0.2)" : isSelected ? "#1a1108" : "#fff" }}>{day}</span>
                          </button>
                        );
                      })}
                      {trailingDays.map((n, i) => (
                        <div key={`trail-${i}`} className="flex items-center justify-center" style={{ height: 36 }}>
                          <span style={{ fontSize: 15, color: "rgba(255,255,255,0.2)" }}>{n}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {optionId === "release_date" && hasAirDate && (
              <div className="rounded-2xl text-center" style={{ padding: 14, ...GLASS_CARD }}>
                <div style={{ fontSize: 11, color: SECONDARY_TEXT }}>Will be recorded as</div>
                <div style={{ fontSize: 15.5, fontWeight: 600, color: "#fff", marginTop: 3 }}>{MONTH_NAMES[airParts.month - 1]} {airParts.day}, {airParts.year}</div>
              </div>
            )}
            {optionId === "release_month" && hasAirDate && (
              <div className="rounded-2xl text-center" style={{ padding: 14, ...GLASS_CARD }}>
                <div style={{ fontSize: 11, color: SECONDARY_TEXT }}>Will be recorded as</div>
                <div style={{ fontSize: 15.5, fontWeight: 600, color: "#fff", marginTop: 3 }}>{MONTH_NAMES[airParts.month - 1]} {airParts.year}</div>
              </div>
            )}
            {optionId === "unknown" && (
              <div className="rounded-2xl text-center" style={{ padding: 14, ...GLASS_CARD }}>
                <div style={{ fontSize: 12, color: SECONDARY_TEXT, lineHeight: 1.45 }}>This episode stays marked watched — it just won&apos;t appear anywhere in Watch History or count toward dated Highlights.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
