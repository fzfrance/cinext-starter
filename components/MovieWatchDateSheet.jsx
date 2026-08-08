"use client";

import { useState, useMemo } from "react";
import Icon from "@/components/ui/Icon";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";
import { bangkokNow } from "@/lib/bangkokDate";
import { MONTH_NAMES, parseISODate } from "@/lib/watchDate";

const t = themes.dark;
const accent = DEFAULT_ACCENT;
const SECONDARY_TEXT = "#9A9A9A";
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MIN_YEAR = 1970;
const GLASS_CARD = { background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.07)" };

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

const OPTIONS = [
  { id: "day", label: "Exact date" },
  { id: "release_date", label: "Release date" },
  { id: "unknown", label: "Don't remember" },
];

// Trimmed fork of components/WatchDateSheet.jsx, not a parameterized
// version of it — same visual chrome (bottom sheet, grabber, floating
// circular Save button, calendar grid) copied verbatim, but the option
// set and picker body are meaningfully simpler: user_movies.watched_on is
// a single plain `date` column (see lib/userMovies.js), not the four
// precision columns episode_watches has (watch_date_precision/
// watched_year/watched_month/watch_date_source) — a movie's watch date is
// always either a real exact date or nothing at all, so there's no
// month-only/year-only "No date" checkbox+wheel mode to support the way
// the show sheet has. "Release month" is dropped for the same reason —
// nothing to store it as.
//
// props:
//   current: { watchedOn: "YYYY-MM-DD" | null }
//   movieReleaseDate: "YYYY-MM-DD" | null — backs the Release date option
//   onClose: () => void
//   onSave: (next: { watchedOn: "YYYY-MM-DD" | null }) => void
export default function MovieWatchDateSheet({ current, movieReleaseDate, onClose, onSave }) {
  const bkNow = bangkokNow();
  const releaseParts = useMemo(() => parseISODate(movieReleaseDate), [movieReleaseDate]);
  const hasReleaseDate = !!releaseParts;

  const initialDay = current?.watchedOn ? parseISODate(current.watchedOn) : bkNow;
  const [optionId, setOptionId] = useState(current?.watchedOn ? "day" : "unknown");
  const [draftDay, setDraftDay] = useState(initialDay);
  const [calendarViewYear, setCalendarViewYear] = useState(initialDay.year);
  const [calendarViewMonth, setCalendarViewMonth] = useState(initialDay.month);

  const YEARS = useMemo(() => {
    const out = [];
    for (let y = bkNow.year; y >= MIN_YEAR; y--) out.push(y);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bkNow is stable for the lifetime of one sheet session
  }, []);

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

  // `source` travels alongside watchedOn so a bulk caller (Highlights'
  // confirmBulkMovieDateChange) can tell "release_date" apart from a
  // manually-picked exact date that just happens to equal it — a bulk
  // "Release date" pick has to re-derive each selected movie's OWN
  // release date, not stamp every movie with whichever one seeded this
  // sheet, the same reasoning WatchDateSheet's own source field exists
  // for on the TV side.
  const pendingResult = useMemo(() => {
    if (optionId === "day") {
      const d = draftDay;
      return { watchedOn: `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`, source: "manual" };
    }
    if (optionId === "release_date" && hasReleaseDate) {
      return { watchedOn: movieReleaseDate, source: "release_date" };
    }
    return { watchedOn: null, source: "unknown" };
  }, [optionId, draftDay, hasReleaseDate, movieReleaseDate]);

  const hasChanges = pendingResult.watchedOn !== (current?.watchedOn ?? null);

  const selectOption = (id) => {
    if (id === "release_date" && !hasReleaseDate) return;
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
              const disabled = opt.id === "release_date" && !hasReleaseDate;
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
                  <div className="flex-1 min-w-0 flex items-center justify-center" style={{ gap: 3 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: "#fff" }}>{MONTH_NAMES[calendarViewMonth - 1]} {calendarViewYear}</span>
                  </div>
                  <div className="flex items-center justify-end flex-shrink-0" style={{ gap: 4 }}>
                    <button onClick={goToPrevMonth} className="flex items-center justify-center rounded-full transition hover:bg-white/10 active:scale-95" style={{ width: 24, height: 24 }}>
                      <Icon name="back" size={11} color="#fff" />
                    </button>
                    <button onClick={goToNextMonth} disabled={isFutureMonth} className="flex items-center justify-center rounded-full transition hover:bg-white/10 active:scale-95" style={{ width: 24, height: 24, opacity: isFutureMonth ? 0.3 : 1 }}>
                      <Icon name="chevronRight" size={11} color="#fff" />
                    </button>
                  </div>
                </div>

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
              </div>
            )}

            {optionId === "release_date" && hasReleaseDate && (
              <div className="rounded-2xl text-center" style={{ padding: 14, ...GLASS_CARD }}>
                <div style={{ fontSize: 11, color: SECONDARY_TEXT }}>Will be recorded as</div>
                <div style={{ fontSize: 15.5, fontWeight: 600, color: "#fff", marginTop: 3 }}>{MONTH_NAMES[releaseParts.month - 1]} {releaseParts.day}, {releaseParts.year}</div>
              </div>
            )}
            {optionId === "unknown" && (
              <div className="rounded-2xl text-center" style={{ padding: 14, ...GLASS_CARD }}>
                <div style={{ fontSize: 12, color: SECONDARY_TEXT, lineHeight: 1.45 }}>This movie stays marked watched — it just won&apos;t show a specific date in Watch History or count toward dated Highlights.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
