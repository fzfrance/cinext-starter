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
const GLASS_CARD = { background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.07)" };
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

// Verbatim copy of components/WatchDateSheet.jsx's own WheelColumn — see
// that file for the full "why a fresh array literal per render breaks
// re-centering" reasoning behind OPTIONS/MONTHS_WITH_NONE living at
// module scope. Duplicated rather than shared: this component is already
// a full fork of WatchDateSheet (movies vs. shows), not a parameterized
// wrapper around it, matching the app's own movie/show fork convention.
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

/**
 * MovieWatchDateSheet — full precision parity with
 * components/WatchDateSheet.jsx (see that file's own header comment for
 * the complete behavioral spec: four options, "No date" checkbox
 * collapsing the calendar to a month/year wheel, quick-jump month/year
 * picker off the calendar header). Same visual chrome, same picker-body
 * logic, adapted from "episode" to "movie" vocabulary — a real fork, not
 * a parameterized wrapper, matching this app's established movie/show
 * fork convention. Release date AND Release month both derive from the
 * same single `movieReleaseDate` prop (a movie has one release date, no
 * separate "release month" data point — its month is just that date's
 * own month, exactly how the show sheet derives Release month from
 * episodeAirDate).
 *
 * props:
 *   current: { watchDatePrecision, watchedOn, watchedYear, watchedMonth,
 *     watchDateSource } — same shape WatchDateSheet's own `current` uses.
 *   movieReleaseDate: "YYYY-MM-DD" | null
 *   onClose: () => void
 *   onSave: (next: { precision, watchedOn, watchedYear, watchedMonth, source }) => void
 */
export default function MovieWatchDateSheet({ current, movieReleaseDate, onClose, onSave }) {
  const bkNow = bangkokNow();
  const releaseParts = useMemo(() => parseISODate(movieReleaseDate), [movieReleaseDate]);
  const hasReleaseDate = !!releaseParts;

  const initialOptionId = selectedWatchDateOptionId(current);
  const [optionId, setOptionId] = useState(initialOptionId);

  const initialDay = current?.watchDatePrecision === "day" && current.watchedOn ? parseISODate(current.watchedOn) : bkNow;
  const [draftDay, setDraftDay] = useState(initialDay);
  const [calendarViewYear, setCalendarViewYear] = useState(initialDay.year);
  const [calendarViewMonth, setCalendarViewMonth] = useState(initialDay.month);

  const initialMonthYearMonth =
    current?.watchDatePrecision === "month" && current.watchDateSource !== "release_month" ? current.watchedMonth :
    current?.watchDatePrecision === "year" ? null :
    bkNow.month;
  const initialMonthYearYear = (current?.watchDatePrecision === "month" || current?.watchDatePrecision === "year") && current.watchDateSource !== "release_month" ? current.watchedYear : bkNow.year;
  const [draftMonth, setDraftMonth] = useState(initialMonthYearMonth);
  const [draftMonthYearYear, setDraftMonthYearYear] = useState(initialMonthYearYear);

  const initialNoDateChecked = (current?.watchDatePrecision === "month" && current.watchDateSource !== "release_month") || current?.watchDatePrecision === "year";
  const [noDateChecked, setNoDateChecked] = useState(initialNoDateChecked);
  const [quickJumpOpen, setQuickJumpOpen] = useState(false);

  const YEARS = useMemo(() => {
    const out = [];
    for (let y = bkNow.year; y >= MIN_YEAR; y--) out.push(y);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bkNow is stable for the lifetime of one sheet session
  }, []);

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

  const pendingResult = useMemo(() => {
    if (optionId === "day") {
      if (noDateChecked) {
        if (draftMonth == null) return { precision: "year", watchedOn: null, watchedYear: draftMonthYearYear, watchedMonth: null, source: "manual" };
        return { precision: "month", watchedOn: null, watchedYear: draftMonthYearYear, watchedMonth: draftMonth, source: "manual" };
      }
      const d = draftDay;
      return { precision: "day", watchedOn: `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`, watchedYear: d.year, watchedMonth: d.month, source: "manual" };
    }
    if (optionId === "release_date" && hasReleaseDate) {
      return { precision: "day", watchedOn: movieReleaseDate, watchedYear: releaseParts.year, watchedMonth: releaseParts.month, source: "release_date" };
    }
    if (optionId === "release_month" && hasReleaseDate) {
      return { precision: "month", watchedOn: null, watchedYear: releaseParts.year, watchedMonth: releaseParts.month, source: "release_month" };
    }
    return { precision: "unknown", watchedOn: null, watchedYear: null, watchedMonth: null, source: null };
  }, [optionId, noDateChecked, draftDay, draftMonth, draftMonthYearYear, hasReleaseDate, movieReleaseDate, releaseParts]);

  const hasChanges =
    pendingResult.precision !== (current?.watchDatePrecision ?? "day") ||
    pendingResult.watchedOn !== (current?.watchedOn ?? null) ||
    pendingResult.watchedYear !== (current?.watchedYear ?? null) ||
    pendingResult.watchedMonth !== (current?.watchedMonth ?? null) ||
    pendingResult.source !== (current?.watchDateSource ?? null);

  const selectOption = (id) => {
    if ((id === "release_date" || id === "release_month") && !hasReleaseDate) return;
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

        <button
          onClick={() => hasChanges && onSave(pendingResult)}
          disabled={!hasChanges}
          className="absolute flex items-center justify-center active:scale-95 transition"
          style={{
            top: -18,
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

        <div className="flex justify-center flex-shrink-0" style={{ paddingTop: 8 }}>
          <div style={{ width: 34, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.22)" }} />
        </div>

        <div className="flex items-center justify-center flex-shrink-0" style={{ height: 52, padding: "0 14px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>Watch Date</span>
        </div>

        <div className="overflow-y-auto" style={{ padding: "14px 14px 20px", scrollbarWidth: "none" }}>
          <div className="rounded-2xl overflow-hidden" style={{ background: t.cardFill, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
            {OPTIONS.map((opt, i) => {
              const selected = optionId === opt.id;
              const isReleaseOpt = opt.id === "release_date" || opt.id === "release_month";
              const disabled = isReleaseOpt && !hasReleaseDate;
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
                    {disabled && <div style={{ fontSize: 10.5, color: SECONDARY_TEXT }}>No release date available</div>}
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

          <div key={optionId} style={{ marginTop: 12, animation: "watchDateFade 200ms ease" }}>
            {optionId === "day" && (
              <div className="rounded-2xl" style={{ padding: 12, ...GLASS_CARD }}>
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

            {optionId === "release_date" && hasReleaseDate && (
              <div className="rounded-2xl text-center" style={{ padding: 14, ...GLASS_CARD }}>
                <div style={{ fontSize: 11, color: SECONDARY_TEXT }}>Will be recorded as</div>
                <div style={{ fontSize: 15.5, fontWeight: 600, color: "#fff", marginTop: 3 }}>{MONTH_NAMES[releaseParts.month - 1]} {releaseParts.day}, {releaseParts.year}</div>
              </div>
            )}
            {optionId === "release_month" && hasReleaseDate && (
              <div className="rounded-2xl text-center" style={{ padding: 14, ...GLASS_CARD }}>
                <div style={{ fontSize: 11, color: SECONDARY_TEXT }}>Will be recorded as</div>
                <div style={{ fontSize: 15.5, fontWeight: 600, color: "#fff", marginTop: 3 }}>{MONTH_NAMES[releaseParts.month - 1]} {releaseParts.year}</div>
              </div>
            )}
            {optionId === "unknown" && (
              <div className="rounded-2xl text-center" style={{ padding: 14, ...GLASS_CARD }}>
                <div style={{ fontSize: 12, color: SECONDARY_TEXT, lineHeight: 1.45 }}>This movie stays marked watched — it just won&apos;t appear anywhere in Watch History or count toward dated Highlights.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
