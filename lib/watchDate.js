// ---------------------------------------------------------------------------
// Watch Date precision — shared label/selection logic
// ---------------------------------------------------------------------------
// Used by both EpisodeRatingFlow (the tappable date label) and
// WatchDateSheet (the option list's own selection state), so the two can
// never disagree about what a given precision/source combination reads as
// or which of the sheet's 6 options it maps back to when reopened to edit.

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Parses a bare "YYYY-MM-DD" directly rather than `new Date(str)`, which
// interprets it as UTC midnight and can print a day early/late depending
// on the viewer's timezone — same reasoning as every other date-from-TMDB/
// date-from-storage formatter already in this app.
export function parseISODate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [year, month, day] = parts;
  return { year, month, day };
}

export function formatWatchDateLabel(watch) {
  const precision = watch?.watchDatePrecision;
  if (!precision || precision === "unknown") return "Date not remembered";

  if (precision === "day" && watch.watchedOn) {
    const parsed = parseISODate(watch.watchedOn);
    if (!parsed) return "Date not remembered";
    const base = `${MONTH_NAMES[parsed.month - 1]} ${parsed.day}, ${parsed.year}`;
    return watch.watchDateSource === "release_date" ? `${base} · Release date` : base;
  }
  if (precision === "month" && watch.watchedYear && watch.watchedMonth) {
    const base = `${MONTH_NAMES[watch.watchedMonth - 1]} ${watch.watchedYear}`;
    return watch.watchDateSource === "release_month" ? `${base} · Release month` : base;
  }
  if (precision === "year" && watch.watchedYear) {
    return `${watch.watchedYear}`;
  }
  return "Date not remembered";
}

// Which of the Watch Date sheet's 4 rows a stored precision/source
// combination maps back to when reopened to edit. Deliberately derived
// (not stored). There's no standalone "Month or Year" row anymore —
// "Exact date" covers all three of day/month/year precision now, via its
// own "No date" checkbox (checked = month/year-only, with a month of
// None meaning year-only) — so any non-release-sourced month/year/day
// precision row always reopens under "day", with WatchDateSheet itself
// deriving the checkbox/month-wheel state from the precision.
export function selectedWatchDateOptionId(watch) {
  const precision = watch?.watchDatePrecision;
  const source = watch?.watchDateSource;
  if (precision === "day") return source === "release_date" ? "release_date" : "day";
  if (precision === "month") return source === "release_month" ? "release_month" : "day";
  if (precision === "year") return "day";
  return "unknown";
}
