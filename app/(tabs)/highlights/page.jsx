"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import PosterArt from "@/components/ui/PosterArt";
import { GenreTagRow } from "@/components/GenreTag";
import EpisodeRatingFlow from "@/components/EpisodeRatingFlow";
import WatchDateSheet from "@/components/WatchDateSheet";
import MovieWatchDateSheet from "@/components/MovieWatchDateSheet";
import MovieRatingScreen from "@/components/MovieRatingScreen";
import { useAuth } from "@/lib/auth-context";
import { useNavVisibility } from "@/lib/nav-visibility-context";
import { getWatchedEpisodesForYear, getWatchedYears, hideFromHighlights, rateWatchById, setWatchDate } from "@/lib/episodeWatches";
import { getUserMoviesWatchedInYear, setMovieWatchDate } from "@/lib/userMovies";
import { getAllMovieRatingsForUser, saveMovieRating, deleteMovieRating } from "@/lib/movieRatings";
import { resolveSeasonRatings } from "@/lib/myRatings";
import { computeTopShows, computeTopMovies, computeTopGenres, computeRewatchCount, computePersonality } from "@/lib/highlights";
import { parseISODate } from "@/lib/watchDate";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { bangkokNow as getBangkokNow } from "@/lib/bangkokDate";
import { themes, DEFAULT_ACCENT, statIconGold, statCardBg } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

const MONTH_ABBRS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Index = levelForCount()'s 0-4 output. Level 0 (no dot at all) isn't in
// the spec's own 1-4 list, but needs a value here anyway since the same
// array backs the "Less...More" legend, which does show all 5 steps.
const DOT_OPACITIES = [0, 0.3, 0.55, 0.8, 1];

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}
function levelForCount(count) {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}
function formatDuration(min) {
  if (!min) return "0m";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function SkeletonBlock({ height, width = "100%", style }) {
  return <div className="rounded-2xl" style={{ height, width, background: t.cardFill, border: `1px solid ${t.cardBorder}`, ...style }} />;
}

export default function Page() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const readableLanguages = useReadableLanguages();
  // Bangkok "today" — computed fresh on every render (component-scoped,
  // not module-scoped) rather than once at module load. It used to be the
  // latter, deliberately, on the theory that recomputing it was pointless
  // churn — but that froze "today" at whatever moment the JS bundle first
  // happened to load. A browser tab (or installed PWA) left open across a
  // real Bangkok midnight kept reading the *previous* day as "today"
  // indefinitely, which is exactly why a show marked watched today could
  // "not show up": the calendar was silently still defaulting to
  // yesterday as the selected day. bangkokParts(new Date()) is cheap
  // (no I/O), so recomputing it per render costs nothing and can't drift.
  const bangkokNow = getBangkokNow();
  // Real years with actual watch data, not a fixed "current year back 3"
  // rolling window — that used to silently make any year outside it
  // unreachable from this picker even when it genuinely had entries (e.g.
  // an episode re-dated to 2017 or 2020 via the Watch Date sheet).
  // bangkokNow.year is always included even with zero data yet, so
  // switching to the actual current year (to start tracking it) is
  // always possible regardless of what's been fetched.
  const [availableYears, setAvailableYears] = useState([]);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getWatchedYears(user.id).then((rows) => {
      if (!cancelled) setAvailableYears(rows);
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [user]);
  const years = useMemo(() => {
    const set = new Set(availableYears);
    set.add(bangkokNow.year);
    return [...set].sort((a, b) => b - a);
  }, [availableYears, bangkokNow.year]);
  const [year, setYear] = useState(bangkokNow.year);
  const [yearMenuOpen, setYearMenuOpen] = useState(false);

  // 'loading' | 'ready' | 'empty' | 'error' — whether the WHOLE selected
  // year has any watch activity at all. 'empty' only ever follows a real
  // query that returned zero rows, never a stand-in default while still
  // fetching, and never shown just because one particular month (as
  // opposed to the whole year) happens to be empty — that's monthStatus/
  // monthEntries below, with its own "No watch activity this month yet"
  // copy, distinct from this year-wide state.
  const [yearStatus, setYearStatus] = useState("loading");
  const [yearRows, setYearRows] = useState([]); // raw episode_watches rows for the whole year
  const [retryToken, setRetryToken] = useState(0);
  // Backing refs for the visibility-triggered background refresh below —
  // not state, since none of them should ever themselves cause a render.
  const lastFetchAtRef = useRef(0); // when the year-level fetch last actually ran
  const silentRefetchRef = useRef(false); // consumed once by the year-level effect
  const silentMonthRefetchRef = useRef(false); // consumed once by the month-level effect, set only when the year-level refetch that triggered it was itself silent

  // Movies get their own year-level fetch, entirely independent of the TV
  // one above — user_movies.watched_on is a plain date, no
  // episode_watches-style enrichment pipeline needed for the raw rows
  // themselves. Caught independently wherever it's used (see the effect
  // below) so a still-missing user_movies table degrades to "no movie
  // data" instead of breaking the TV-only Highlights view it used to be.
  const [yearMovieRows, setYearMovieRows] = useState([]); // [{movieId, watchedOn, watchDatePrecision, watchedYear, watchedMonth, watchDateSource}]
  // Overrides the TV-only "empty" verdict when movies alone have activity
  // this year — otherwise a movie-only year would show the false "No
  // highlights for {year}" empty state. Purely a render-time derivation
  // (not baked into yearStatus itself), so it stays correct regardless of
  // which of the two independent fetches below resolves first.
  const effectiveYearStatus = yearStatus === "empty" && yearMovieRows.length > 0 ? "ready" : yearStatus;

  // Defaults to the actual current Bangkok month/year on first load, per
  // spec — not "whichever month has the most recent activity" (an
  // earlier version of this page did that; changed on explicit request).
  const [month, setMonth] = useState(bangkokNow.month);
  // Auto-scrolls the month row so the active month sits at the END
  // (right edge) of the visible scrollable area, with earlier months
  // pushed out of view to the left — same idea as Show Detail's own
  // "Watch Next" row (there, the first unwatched episode leads and
  // watched ones get pushed left via inline:"start"; here it's the
  // opposite edge since the active month is always the LAST one that
  // should be visible, not the first).
  const monthRowRef = useRef(null);
  // First run (PWA cold start / initial mount) scrolls instantly, after
  // waiting a frame for layout to settle — standalone PWA launch on iOS
  // still has its safe-area/viewport metrics settling for a moment after
  // first paint, and an animated scrollIntoView called too early against
  // that not-yet-final layout gets cut short (mid-animation) instead of
  // reaching the true end, landing on an earlier month (observed: June
  // instead of July). A plain, non-animated jump made after that layout
  // settles doesn't have an in-flight animation to interrupt. Later,
  // user-driven month taps still animate smoothly.
  const monthRowMountedRef = useRef(false);
  useEffect(() => {
    const row = monthRowRef.current;
    if (!row) return;
    const isFirstRun = !monthRowMountedRef.current;
    monthRowMountedRef.current = true;

    const snap = () => {
      const btn = row.children[month - 1];
      if (!btn) return;
      if (isFirstRun) {
        // Direct scrollLeft assignment instead of scrollIntoView — an
        // animated scrollIntoView is exactly what was getting interrupted
        // mid-flight on PWA cold start (observed landing on June instead
        // of July); a plain, instant number assignment has nothing an
        // interruption could cut short.
        row.scrollLeft = btn.offsetLeft + btn.offsetWidth - row.clientWidth;
      } else {
        btn.scrollIntoView({ behavior: "smooth", inline: "end", block: "nearest" });
      }
    };

    // Two animation frames, not one — the first only guarantees this
    // frame's own layout is committed, not that a standalone PWA's
    // safe-area/viewport metrics (still settling right after launch) are
    // final yet. A fallback timeout re-snaps once more shortly after, in
    // case even that wasn't enough on a slow first paint — and NOT just
    // for the first run: rAF is fully paused by the browser whenever the
    // tab/PWA is backgrounded or momentarily unfocused (e.g. a quick app-
    // switcher glance mid-tap), which would otherwise silently strand a
    // later month/year change with no fallback at all to recover it. This
    // timeout costs nothing in the normal case — rAF already finished and
    // snap()'s own work is idempotent, so a second call is a harmless no-op.
    let raf2 = null;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(snap); });
    const fallback = setTimeout(snap, 350);

    return () => {
      cancelAnimationFrame(raf1);
      if (raf2 != null) cancelAnimationFrame(raf2);
      clearTimeout(fallback);
    };
  // yearStatus, not just [month, year] — the month row (and monthRowRef)
  // only actually exists in the DOM once yearStatus === "ready" (see the
  // conditional render below), which happens strictly AFTER this
  // component's first render. Without yearStatus as a dependency, this
  // effect's one and only invocation up to that point finds
  // monthRowRef.current still null and bails via the `if (!row) return`
  // above — the real fix never runs since nothing re-triggers it once the
  // row finally mounts, and monthRowMountedRef never even flips to true.
  // That's the actual bug behind "August starts off-screen on load": the
  // snap logic itself was always correct, it just never got a chance to
  // run against a real row element.
  }, [month, year, effectiveYearStatus]);
  const [monthStatus, setMonthStatus] = useState("loading"); // loading | ready | error — the month-level enrichment fetch
  const [monthRetryToken, setMonthRetryToken] = useState(0);
  const [monthEntries, setMonthEntries] = useState([]); // one entry per watch EVENT this month (rewatches included as their own entries), enriched via /api/shows/watch-entries
  const [selectedDay, setSelectedDay] = useState(null);
  // Show ids currently collapsed in the selected day's episode list —
  // reset whenever the selected day changes (see the effect below) so a
  // show collapsed on one day doesn't stay collapsed after picking
  // another day where it also appears.
  const [collapsedShowIds, setCollapsedShowIds] = useState(new Set());
  // Tap-and-hold on an episode row opens a small menu (Rate the Episode /
  // Change Watched Date — "Remove from History" used to be a third option
  // here too, removed from this menu per explicit request; the bulk
  // "remove" mode/bar/hideFromHighlights machinery below is left in place
  // rather than torn out, just currently unreachable from here). "Change
  // Watched Date" enters bulk select mode for the selected day: every
  // episode row gets its own blank circle, this one starts pre-selected,
  // and a persistent bottom bar drives the actual action — one confirm
  // for however many the user picks, not a per-row prompt. It opens the
  // exact same WatchDateSheet the single-episode rating flow uses (see
  // confirmBulkDateChange below) once the user taps "Change (N items)" —
  // no separate date-editing UI. All reset whenever the selected day
  // changes, same as collapsedShowIds, so leaving a day never leaves a
  // stale selection "stuck on" for whichever day the user looks at next.
  const [menuForEntry, setMenuForEntry] = useState(null);
  const [bulkMode, setBulkMode] = useState(null); // null | "remove" | "changeDate"
  // Which entryType this bulk session covers — "remove" is TV-only (no
  // hidden_from_highlights column on user_movies, see lib/userMovies.js),
  // "changeDate" now applies to either, but never mixed: bulkSelectedIds
  // is only ever homogeneous within one session (started fresh by
  // startBulkSelect below, cleared on cancelBulkSelect), so every row
  // gated on this needs to check media type too before joining in.
  const [bulkMediaType, setBulkMediaType] = useState(null); // null | "tv" | "movie"
  // The bulk-select action bar below replaces the global FloatingNav (rather
  // than floating a second fixed bar at the same screen position) for as
  // long as bulk mode is on — see lib/nav-visibility-context.jsx. Reset on
  // unmount too, so navigating away mid-bulk-select never leaves the nav
  // permanently hidden.
  const [, setNavHidden] = useNavVisibility();
  useEffect(() => {
    setNavHidden(!!bulkMode);
    return () => setNavHidden(false);
  }, [bulkMode, setNavHidden]);
  const [bulkSelectedIds, setBulkSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDateSheetOpen, setBulkDateSheetOpen] = useState(false);
  // The entry currently open in the in-place rating card (EpisodeRatingFlow),
  // triggered by the tap-and-hold menu's "Rate the Episode" option — renders
  // right here on Highlights rather than navigating away.
  const [ratingEntry, setRatingEntry] = useState(null);
  // Cast for ratingEntry's own "Who was your favorite?" voting UI — this
  // flow rates an episode without ever loading the rest of the show, so
  // there's no cast array already in state to hand EpisodeRatingFlow
  // (unlike Show Detail/Episode Detail). Fetched only once the rating
  // card actually opens.
  const [ratingCast, setRatingCast] = useState([]);
  useEffect(() => {
    if (!ratingEntry?.showId) { setRatingCast([]); return; }
    let cancelled = false;
    fetch(`/api/shows/${ratingEntry.showId}/cast`)
      .then((res) => res.json())
      .then(({ cast }) => { if (!cancelled) setRatingCast(cast ?? []); })
      .catch(() => { if (!cancelled) setRatingCast([]); });
    return () => { cancelled = true; };
  }, [ratingEntry?.showId]);
  // Movie equivalent of ratingEntry/ratingCast above — "Rate this Movie"
  // opens the SAME MovieRatingScreen Movie Detail uses (not a lightweight
  // inline star flow like EpisodeRatingFlow), since a movie has only ever
  // one rating, period — there's no per-episode-instance rating concept
  // to keep lightweight for. "Change Watched Date" for a movie now goes
  // through the same bulk-select mechanism TV rows use (bulkMode/
  // bulkMediaType/bulkSelectedIds below), not a separate single-item
  // sheet — selecting just one movie and applying is the trivial case of
  // the same flow, no need for a parallel direct-open path.
  const [ratingMovieEntry, setRatingMovieEntry] = useState(null);
  const [ratingMovieCast, setRatingMovieCast] = useState([]);
  useEffect(() => {
    if (!ratingMovieEntry?.movieId) { setRatingMovieCast([]); return; }
    let cancelled = false;
    fetch(`/api/movies/${ratingMovieEntry.movieId}/cast`)
      .then((res) => res.json())
      .then(({ cast }) => { if (!cancelled) setRatingMovieCast(cast ?? []); })
      .catch(() => { if (!cancelled) setRatingMovieCast([]); });
    return () => { cancelled = true; };
  }, [ratingMovieEntry?.movieId]);
  const longPressTimerRef = useRef(null);
  const longPressFiredRef = useRef(false);
  const pressStartRef = useRef({ x: 0, y: 0 });
  // Which row is currently mid-press — drives the row's own "pressed"
  // visual (scaled down, slightly dimmed) for as long as the finger
  // stays down, same idea as menuForEntry but for the press itself
  // rather than the menu it eventually opens.
  const [pressedEntryId, setPressedEntryId] = useState(null);
  useEffect(() => {
    setCollapsedShowIds(new Set());
    setMenuForEntry(null);
    setBulkMode(null);
    setBulkMediaType(null);
    setBulkSelectedIds(new Set());
    setBulkDateSheetOpen(false);
    setRatingEntry(null);
    setRatingMovieEntry(null);
  }, [selectedDay]);

  // Raw TMDB ids collide across media types (a movie id and a TV show id
  // aren't drawn from the same space) — every entry this press/menu
  // machinery touches now spans both, so pressedEntryId/menuForEntry need
  // a media-aware key rather than a bare entry.id (which movie entries
  // don't even have — they only have movieId).
  const entryPressKey = (entry) => (entry.entryType === "movie" ? `movie-${entry.movieId}` : entry.id);

  // Native iOS/Android press-and-hold, not a browser text-selection
  // gesture: pointer events (not just onContextMenu) so this works the
  // same on mouse and touch, a movement threshold that cancels a press
  // that turns into a scroll/drag, and a light haptic + the menu firing
  // together once the hold actually completes.
  const LONG_PRESS_MS = 500;
  const LONG_PRESS_MOVE_THRESHOLD = 10;
  const startLongPress = (entry, ev) => {
    longPressFiredRef.current = false;
    pressStartRef.current = { x: ev.clientX, y: ev.clientY };
    setPressedEntryId(entryPressKey(entry));
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      navigator.vibrate?.(10);
      setMenuForEntry(entry);
      setPressedEntryId(null);
    }, LONG_PRESS_MS);
  };
  const cancelLongPress = () => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    setPressedEntryId(null);
  };
  const handlePressMove = (ev) => {
    if (!longPressTimerRef.current) return;
    const dx = ev.clientX - pressStartRef.current.x;
    const dy = ev.clientY - pressStartRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_THRESHOLD) cancelLongPress();
  };
  // Guards the row's own navigate-on-click — a long press that already
  // opened the menu must not *also* navigate to the episode/movie once
  // the pointer lifts (a plain click fires right after pointerup
  // regardless).
  const handleRowClick = (entry) => {
    if (longPressFiredRef.current) { longPressFiredRef.current = false; return; }
    if (entry.entryType === "movie") { router.push(`/movie/${entry.movieId}`); return; }
    router.push(`/show/${entry.showId}/episode/${entry.season}/${entry.episode}`);
  };

  const startBulkSelect = (entry, mode) => {
    setBulkMode(mode);
    const isMovie = entry.entryType === "movie";
    setBulkMediaType(isMovie ? "movie" : "tv");
    setBulkSelectedIds(new Set([isMovie ? entry.movieId : entry.id]));
  };
  const toggleBulkSelected = (id) => setBulkSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  // Select/deselect every episode under one show group at once — for a
  // show that got bulk-watched in one sitting (e.g. an entire season
  // marked watched together), tapping every individual episode circle to
  // remove/change-date them all is tedious; this toggles the whole
  // group's membership in bulkSelectedIds in one action instead. Acts
  // as a standard "select all" checkbox: if every episode in the group is
  // already selected, tapping it clears all of them; otherwise it selects
  // all of them (regardless of the current partial state).
  const toggleBulkSelectShow = (group) => {
    const ids = group.entries.map((e) => e.id);
    const allSelected = ids.length > 0 && ids.every((id) => bulkSelectedIds.has(id));
    setBulkSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };
  const cancelBulkSelect = () => {
    setBulkMode(null);
    setBulkMediaType(null);
    setBulkSelectedIds(new Set());
    setBulkDateSheetOpen(false);
  };
  // Only yearRows gets touched directly (filtered to drop the
  // now-hidden ids from THIS view's local state — hideFromHighlights
  // itself doesn't delete the row, just flags it, so this filter is
  // exactly what makes it disappear from Highlights specifically).
  // monthRows/monthEntries and every stat derived from them (hours,
  // calendar dots, Top Shows/Genres, personality, rewatch count) recompute
  // on their own via the existing memos/effect, so a bulk removal "undoes"
  // all of it at once with no separate per-stat patching to keep in sync.
  const confirmBulkRemove = async () => {
    if (!user || bulkBusy || bulkSelectedIds.size === 0) return;
    setBulkBusy(true);
    const ids = [...bulkSelectedIds];
    try {
      await Promise.all(ids.map((id) => hideFromHighlights(user.id, id)));
      setYearRows((prev) => prev.filter((r) => !bulkSelectedIds.has(r.id)));
      cancelBulkSelect();
    } catch (err) {
      console.error("Failed to remove watch history entries:", err);
      window.alert("Couldn't remove these — please try again.");
    } finally {
      setBulkBusy(false);
    }
  };

  // The Watch Date sheet computes its "release_date"/"release_month"
  // result using whichever single episodeAirDate prop it was seeded with
  // (see WatchDateSheet's pendingResult) — correct for editing one
  // episode, wrong for a bulk edit spanning episodes with different real
  // TMDB air dates. Every other source (an explicit manual exact date/
  // month/year the user picked once, or "unknown") is meant to apply
  // identically to every selected episode, since the user chose one
  // specific value for all of them — only the two release-based sources
  // need re-deriving per entry from that entry's OWN air date. Returns
  // null when a release-based edit can't apply to a given entry (no air
  // date on file for it) so that entry is just skipped, not corrupted.
  const resolveBulkFields = (result, entry) => {
    if (result.source !== "release_date" && result.source !== "release_month") return result;
    const air = parseISODate(entry.episodeAirDate);
    if (!air) return null;
    return result.source === "release_date"
      ? { precision: "day", watchedOn: entry.episodeAirDate, watchedYear: air.year, watchedMonth: air.month, source: "release_date" }
      : { precision: "month", watchedOn: null, watchedYear: air.year, watchedMonth: air.month, source: "release_month" };
  };

  // Same "patch yearRows in place" pattern as EpisodeRatingFlow's own
  // onWatchDateChange (see the single-entry rating card below) — moving
  // an entry's watched_year/watched_month/watch_date_precision here is
  // enough to make monthRows, monthEntries, the calendar, and every
  // derived stat re-bucket on their own. No separate patching for
  // "remove the old day if it's now empty" or "merge into the new day" —
  // both already fall out of days/dayShowGroups recomputing from the
  // patched yearRows, exactly as they do for a single-episode date edit.
  const confirmBulkDateChange = async (result) => {
    if (!user || bulkBusy || bulkSelectedIds.size === 0) return;
    // entryType !== "movie" guard is defensive, not load-bearing — a
    // movie-scoped bulk session only ever adds movieId values to
    // bulkSelectedIds in the first place (see startBulkSelect), so this
    // just makes the invariant explicit rather than relying on it.
    const entries = (activeDay?.entries ?? []).filter((e) => e.entryType !== "movie" && bulkSelectedIds.has(e.id));
    setBulkBusy(true);
    try {
      const resolved = entries
        .map((entry) => ({ entry, fields: resolveBulkFields(result, entry) }))
        .filter((x) => x.fields);
      await Promise.all(resolved.map(({ entry, fields }) => setWatchDate(user.id, entry.id, fields)));
      const fieldsById = new Map(resolved.map(({ entry, fields }) => [entry.id, fields]));
      // yearRows was fetched scoped to THIS year (getWatchedEpisodesForYear's
      // own .eq("watched_year", year)) — every row in it starts out with
      // watched_year === year by construction. Patching an edited row's
      // fields in place isn't enough on its own when the edit moved it to a
      // DIFFERENT year (e.g. picking "2025" while viewing 2026): the row
      // would otherwise keep sitting inside this year's array with a
      // watched_year that no longer matches, so every view derived from
      // yearRows (the "Watched in {year}" section in particular, which
      // trusts every row here to genuinely belong to `year`) kept showing
      // it under the year being viewed, not the year actually picked. This
      // filter drops any row whose fields moved it to a different year —
      // untouched rows and same-year edits are unaffected either way.
      setYearRows((prev) => prev
        .map((r) => {
          const fields = fieldsById.get(r.id);
          if (!fields) return r;
          return {
            ...r,
            watch_date_precision: fields.precision,
            watched_on: fields.watchedOn,
            watched_year: fields.watchedYear,
            watched_month: fields.watchedMonth,
            watch_date_source: fields.source,
          };
        })
        .filter((r) => r.watched_year === year)
      );
      // If this moved anything into a year the picker doesn't already
      // list, add it now rather than waiting for a remount to re-run
      // getWatchedYears — otherwise the year you just moved these
      // episodes into wouldn't even be selectable yet.
      const newYears = [...new Set(resolved.map(({ fields }) => fields.watchedYear).filter((y) => y != null))];
      setAvailableYears((prev) => [...new Set([...prev, ...newYears])]);
      cancelBulkSelect();
    } catch (err) {
      console.error("Failed to update watch dates:", err);
      window.alert("Couldn't update these — please try again.");
    } finally {
      setBulkBusy(false);
    }
  };

  // Movie equivalent of resolveBulkFields above — full precision parity
  // now that user_movies carries the same watch_date_precision/
  // watched_year/watched_month/watch_date_source columns episode_watches
  // has. Same "release date/month is per-entry, not the seed's" care:
  // re-derives each selected movie's OWN releaseDate rather than stamping
  // every selected movie with whichever movie the sheet happened to be
  // seeded from. Returns null when a release-based edit can't apply to a
  // given entry (no release date on file for it), same as the TV version.
  const resolveBulkMovieFields = (result, entry) => {
    if (result.source !== "release_date" && result.source !== "release_month") return result;
    const release = parseISODate(entry.releaseDate);
    if (!release) return null;
    return result.source === "release_date"
      ? { precision: "day", watchedOn: entry.releaseDate, watchedYear: release.year, watchedMonth: release.month, source: "release_date" }
      : { precision: "month", watchedOn: null, watchedYear: release.year, watchedMonth: release.month, source: "release_month" };
  };

  // Movie equivalent of confirmBulkDateChange above — same "patch
  // yearMovieRows in place" pattern, same drop-if-moved-to-a-different-
  // year rule.
  const confirmBulkMovieDateChange = async (result) => {
    if (!user || bulkBusy || bulkSelectedIds.size === 0) return;
    const entries = (activeDay?.entries ?? []).filter((e) => e.entryType === "movie" && bulkSelectedIds.has(e.movieId));
    setBulkBusy(true);
    try {
      const resolved = entries
        .map((entry) => ({ entry, fields: resolveBulkMovieFields(result, entry) }))
        .filter((x) => x.fields);
      await Promise.all(resolved.map(({ entry, fields }) => setMovieWatchDate(user.id, entry.movieId, fields)));
      const fieldsById = new Map(resolved.map(({ entry, fields }) => [entry.movieId, fields]));
      setYearMovieRows((prev) => prev
        .map((r) => {
          const fields = fieldsById.get(r.movieId);
          if (!fields) return r;
          return {
            ...r,
            watchDatePrecision: fields.precision,
            watchedOn: fields.watchedOn,
            watchedYear: fields.watchedYear,
            watchedMonth: fields.watchedMonth,
            watchDateSource: fields.source,
          };
        })
        // Same "drop it if the edit moved it out of the currently-viewed
        // year" rule as the TV version above — yearMovieRows only ever
        // holds rows genuinely belonging to `year`.
        .filter((r) => r.watchedYear === year)
      );
      const newYears = [...new Set(resolved.map(({ fields }) => fields.watchedYear).filter((y) => y != null))];
      setAvailableYears((prev) => [...new Set([...prev, ...newYears])]);
      cancelBulkSelect();
    } catch (err) {
      console.error("Failed to update watch dates:", err);
      window.alert("Couldn't update these — please try again.");
    } finally {
      setBulkBusy(false);
    }
  };

  // Year-level: just "does this year have any data, and what are its raw
  // rows" — every displayed number/card is computed from the MONTH-level
  // slice of this below, not from the whole year. `silent` (see the
  // visibility effect below) skips the loading-skeleton reset for a
  // background-triggered refresh, so real staleness still gets caught
  // without visibly blanking the screen the user is currently looking at.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const silent = silentRefetchRef.current;
    silentRefetchRef.current = false;
    if (!silent) {
      setYearStatus("loading");
      setYearRows([]);
    }
    lastFetchAtRef.current = Date.now();

    getWatchedEpisodesForYear(user.id, year)
      .then((rows) => {
        if (cancelled) return;
        if (silent) silentMonthRefetchRef.current = true;
        setYearRows(rows);
        setYearStatus(rows.length === 0 ? "empty" : "ready");
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setYearStatus("error");
      });

    return () => { cancelled = true; };
  }, [user, year, retryToken]);

  // Movies' own year-level fetch — same [user, year, retryToken] triggers
  // as the TV one above, but a fully separate request/state, caught on
  // its own so a movie-side failure never touches yearStatus/yearRows.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getUserMoviesWatchedInYear(user.id, year)
      // No client-side filter needed anymore — getUserMoviesWatchedInYear
      // already scopes server-side to rows whose watched_year is this
      // year (day AND month precision alike), so every row returned
      // genuinely belongs here even though watchedOn itself can now be
      // null for a month-precision row.
      .then((rows) => { if (!cancelled) setYearMovieRows(rows); })
      .catch((err) => { console.error(err); if (!cancelled) setYearMovieRows([]); });
    return () => { cancelled = true; };
  }, [user, year, retryToken]);

  // Re-fetches when this tab/app becomes visible again — the above effect
  // only runs on mount (or when year/retryToken change), so a show marked
  // watched elsewhere (a different tab, or the app backgrounded then
  // resumed) while Highlights stayed mounted in the background would
  // otherwise keep showing whatever it fetched before that watch
  // happened. Two things keep this from turning into "the screen
  // refreshes every time I switch apps for two seconds":
  //   1. STALE_AFTER_MS — only actually refetches if it's been away for a
  //      real stretch, not a split-second app switch/notification glance.
  //   2. silentRefetchRef — even when it does refetch, it skips resetting
  //      yearStatus/yearRows to their loading/empty state first (see the
  //      effect above), so the currently-visible screen doesn't blank out
  //      into skeletons while the fresh data loads in behind it; it just
  //      swaps in once ready. A genuine month/year switch by the user
  //      still shows the normal loading state — this flag is only ever
  //      set here, right before a background-triggered retry.
  const STALE_AFTER_MS = 60_000;
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchAtRef.current < STALE_AFTER_MS) return;
      silentRefetchRef.current = true;
      setRetryToken((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  // bfcache restore (back/swipe navigation into this page) — see
  // app/(tabs)/home/page.jsx's identical listener for the full rationale;
  // this page had the visibility/focus listener above but was missing
  // this one. No staleness threshold: a persisted pageshow means nothing
  // here re-ran at all, so it always needs a fresh fetch regardless of
  // elapsed time.
  useEffect(() => {
    const onPageShow = (event) => {
      if (!event.persisted) return;
      silentRefetchRef.current = true;
      setRetryToken((n) => n + 1);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  // Raw rows for just the selected month — filtered client-side from the
  // already-loaded year rows, no extra Supabase query. Kept separate from
  // monthEntries (which is the TMDB-enriched version) because rewatch
  // counting only needs these raw event rows.
  // day precision matches this month by the (year,month) its own
  // watched_on falls in; month precision matches by watched_year/
  // watched_month directly (no watched_on to derive from — that's the
  // whole point of that precision, see episode_watches' schema comment).
  // year/unknown precision never appear in a specific month's view at
  // all — filtered out here entirely, not just hidden further downstream.
  const monthRows = useMemo(
    () => yearRows.filter((r) =>
      (r.watch_date_precision === "day" || r.watch_date_precision === "month") &&
      r.watched_year === year && r.watched_month === month
    ),
    [yearRows, year, month]
  );

  // Month-level: enrich this month's raw rows with real show/episode
  // info (title, poster, still, backdrop, genres, runtime) via
  // /api/shows/watch-entries. Every stat below — hours, episode/show/
  // rewatch counts, personality, Top Shows, Top Genres, the calendar —
  // is derived from this one enriched list plus monthRows, so switching
  // months recomputes everything from a single fetch. monthRows changing
  // because of a SILENT year-level background refresh (see
  // silentMonthRefetchRef above) skips the loading-skeleton reset here
  // too, for the same reason — a genuine month switch by the user still
  // shows it normally.
  useEffect(() => {
    const silent = silentMonthRefetchRef.current;
    silentMonthRefetchRef.current = false;
    if (monthRows.length === 0) { setMonthEntries([]); setMonthStatus("ready"); return; }

    let cancelled = false;
    if (!silent) setMonthStatus("loading");
    fetch("/api/shows/watch-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        episodes: monthRows.map((r) => ({
          id: r.id,
          showId: r.tmdb_show_id,
          season: r.season_number,
          episode: r.episode_number,
          watchedAt: r.watched_at,
          watchDatePrecision: r.watch_date_precision,
          watchedOn: r.watched_on,
          watchedYear: r.watched_year,
          watchedMonth: r.watched_month,
          watchDateSource: r.watch_date_source,
          rating: r.rating,
        })),
      }),
    })
      .then((res) => { if (!res.ok) throw new Error("Failed to resolve watch entries"); return res.json(); })
      .then(({ entries }) => { if (!cancelled) { setMonthEntries(entries); setMonthStatus("ready"); } })
      .catch((err) => { console.error(err); if (!cancelled) setMonthStatus("error"); });

    return () => { cancelled = true; };
  }, [monthRows, monthRetryToken]);

  // Movies' own month-level slice — filtered client-side from the
  // already-loaded yearMovieRows, same precision-aware pattern monthRows
  // above uses now that user_movies carries the same watch_date_precision/
  // watched_year/watched_month columns episode_watches has: day/month
  // precision match this month directly on those columns; year/unknown
  // precision never appear in a specific month's view at all (same rule
  // monthRows already applies to TV).
  const monthMovieRows = useMemo(
    () => yearMovieRows.filter((r) =>
      (r.watchDatePrecision === "day" || r.watchDatePrecision === "month") &&
      r.watchedYear === year && r.watchedMonth === month
    ),
    [yearMovieRows, year, month]
  );

  // Enriches this month's movie ids via /api/movies/batch — proportional
  // to what's actually needed (just this month's movies), same reasoning
  // as yearOnlyEntries below scoping its own TMDB lookups. runtimeMinutes
  // is named to match a TV entry's own field (batch route calls it
  // "runtime") so the day-detail panel's shared duration sum
  // (dayMinutes, further down) can treat TV and movie entries identically
  // without a type check.
  const [monthMovieEntries, setMonthMovieEntries] = useState([]);
  useEffect(() => {
    if (monthMovieRows.length === 0) { setMonthMovieEntries([]); return; }
    let cancelled = false;
    fetch(`/api/movies/batch?ids=${monthMovieRows.map((r) => r.movieId).join(",")}`)
      .then((res) => res.json())
      .then(({ results }) => {
        if (cancelled) return;
        const byId = Object.fromEntries(results.map((m) => [m.id, m]));
        setMonthMovieEntries(
          monthMovieRows
            .map((r) => {
              const meta = byId[r.movieId];
              if (!meta) return null;
              return {
                movieId: r.movieId,
                watchedOn: r.watchedOn,
                watchedAt: r.watchedOn,
                watchDatePrecision: r.watchDatePrecision,
                watchedYear: r.watchedYear,
                watchedMonth: r.watchedMonth,
                watchDateSource: r.watchDateSource,
                title: meta.title,
                originalTitle: meta.originalTitle,
                originalLanguage: meta.originalLanguage,
                posterPath: meta.posterPath,
                backdropPath: meta.backdropPath,
                runtimeMinutes: meta.runtime,
                // releaseDate/genre — not used by the calendar/Top Movies
                // rendering itself, only carried through for the "Rate
                // this Movie" long-press flow's own MovieRatingScreen
                // (year/genre line), so it doesn't need a second fetch.
                releaseDate: meta.releaseDate,
                genre: meta.genre,
              };
            })
            .filter(Boolean)
        );
      })
      .catch((err) => { console.error(err); if (!cancelled) setMonthMovieEntries([]); });
    return () => { cancelled = true; };
  }, [monthMovieRows]);

  // One fetch per signed-in user, not scoped to the month — cheap (no
  // TMDB calls, a direct movie_ratings query), so there's no reason to
  // re-fetch on every month switch the way the TMDB-backed enrichments
  // above do.
  const [movieRatingMap, setMovieRatingMap] = useState(new Map());
  // Full rating records (mood/character/text/savedAt, not just the plain
  // number movieRatingMap above carries for Top Movies' ranking) — feeds
  // MovieRatingScreen's own `manual` prop when opened from Highlights'
  // long-press menu, same shape getMovieRating(userId, movieId) returns
  // for Movie Detail's own rating screen.
  const [movieRatingRecords, setMovieRatingRecords] = useState(new Map());
  useEffect(() => {
    if (!user) { setMovieRatingMap(new Map()); setMovieRatingRecords(new Map()); return; }
    let cancelled = false;
    getAllMovieRatingsForUser(user.id)
      .then((rows) => {
        if (cancelled) return;
        setMovieRatingMap(new Map(rows.map((r) => [r.movieId, r.rating])));
        setMovieRatingRecords(new Map(rows.map((r) => [r.movieId, r])));
      })
      .catch((err) => { console.error(err); if (!cancelled) { setMovieRatingMap(new Map()); setMovieRatingRecords(new Map()); } });
    return () => { cancelled = true; };
  }, [user]);

  // Show ratings for Top Shows' rating-first ranking (see
  // lib/highlights.js's computeTopShows) — scoped to just the
  // (showId, seasonNumber) pairs actually touched by monthEntries, not
  // the user's whole rating history, via lib/myRatings.js's
  // resolveSeasonRatings.
  const [showRatingMap, setShowRatingMap] = useState(new Map());
  useEffect(() => {
    if (!user || monthEntries.length === 0) { setShowRatingMap(new Map()); return; }
    const pairKeys = new Set();
    const pairs = [];
    for (const e of monthEntries) {
      const key = `${e.showId}-${e.season}`;
      if (pairKeys.has(key)) continue;
      pairKeys.add(key);
      pairs.push({ showId: e.showId, seasonNumber: e.season });
    }
    let cancelled = false;
    resolveSeasonRatings(user.id, pairs)
      .then((map) => { if (!cancelled) setShowRatingMap(map); })
      .catch((err) => { console.error(err); if (!cancelled) setShowRatingMap(new Map()); });
    return () => { cancelled = true; };
  }, [user, monthEntries]);

  // "Year only" precision entries have no month to attach to at all (see
  // episode_watches' schema comment — no invented month), so they can
  // never show up in the month view above no matter which month is
  // selected. They still need a real home for Highlights' own "contribute
  // to yearly totals and yearly Top Shows/Genres" requirement — enriched
  // separately here (deliberately NOT folding this into re-enriching the
  // whole year's worth of day/month entries too, which would mean
  // potentially hundreds of extra TMDB lookups just to rebuild a parallel
  // yearly Top Shows view; year-precision entries are typically a small
  // minority of a year's activity, so scoping the fetch to just those
  // keeps this proportional to what's actually being asked for).
  const yearOnlyRows = useMemo(() => yearRows.filter((r) => r.watch_date_precision === "year"), [yearRows]);
  const [yearOnlyEntries, setYearOnlyEntries] = useState([]);
  useEffect(() => {
    if (yearOnlyRows.length === 0) { setYearOnlyEntries([]); return; }
    let cancelled = false;
    fetch("/api/shows/watch-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        episodes: yearOnlyRows.map((r) => ({
          id: r.id,
          showId: r.tmdb_show_id,
          season: r.season_number,
          episode: r.episode_number,
          watchedAt: r.watched_at,
          watchDatePrecision: r.watch_date_precision,
          watchedOn: r.watched_on,
          watchedYear: r.watched_year,
          watchedMonth: r.watched_month,
          watchDateSource: r.watch_date_source,
          rating: r.rating,
        })),
      }),
    })
      .then((res) => { if (!res.ok) throw new Error("Failed to resolve year-only watch entries"); return res.json(); })
      .then(({ entries }) => { if (!cancelled) setYearOnlyEntries(entries); })
      .catch((err) => { console.error(err); if (!cancelled) setYearOnlyEntries([]); });
    return () => { cancelled = true; };
  }, [yearOnlyRows]);
  const yearOnlyHours = useMemo(() => Math.round(yearOnlyEntries.reduce((sum, e) => sum + (e.runtimeMinutes || 0), 0) / 60), [yearOnlyEntries]);
  const yearOnlyTopShows = useMemo(() => computeTopShows(yearOnlyEntries, 5), [yearOnlyEntries]);
  const yearOnlyTopGenres = useMemo(() => computeTopGenres(yearOnlyEntries), [yearOnlyEntries]);

  // Every entry this month contributes to (day + month precision only,
  // per monthRows above) gets a dayKey ONLY if it's real day precision —
  // month precision has no actual day to bucket under (never invented,
  // per episode_watches' schema comment), so it's null here and skipped
  // by every day-level view below (the calendar grid, active-day count,
  // computePersonality's own busiestDay/Binge Watcher check), while still
  // counting toward the broader month-level stats (hours, unique shows,
  // Top Shows/Genres, Completionist/Explorer/etc.) that don't care which
  // specific day something happened on.
  const monthEntriesWithDayKey = useMemo(
    () => monthEntries.map((e) => ({ ...e, dayKey: e.watchDatePrecision === "day" ? e.watchedOn : null, entryType: "episode" })),
    [monthEntries]
  );
  const dayKeyed = useMemo(() => monthEntriesWithDayKey.filter((e) => e.dayKey), [monthEntriesWithDayKey]);
  // Same day/month precision split TV's own dayKey derivation uses now
  // that movies carry the same precision columns — only real day-precision
  // rows get a calendar dot; month-precision movies still count toward
  // this month's totals (they're already in monthMovieEntries) but don't
  // pin to one specific day.
  const movieDayKeyed = useMemo(
    () => monthMovieEntries.map((e) => ({ ...e, dayKey: e.watchDatePrecision === "day" ? e.watchedOn : null, entryType: "movie" })),
    [monthMovieEntries]
  );
  const totalMinutes = useMemo(() => monthEntries.reduce((sum, e) => sum + (e.runtimeMinutes || 0), 0), [monthEntries]);
  const hours = Math.round(totalMinutes / 60);
  const uniqueShowCount = useMemo(() => new Set(monthEntries.map((e) => e.showId)).size, [monthEntries]);
  // Active Days/Rewatched stay TV-only, unchanged — dayKeyed here is still
  // exactly the same TV-only array it always was (movies feed a separate
  // combined `days` memo below, not this).
  const activeDayCount = useMemo(() => new Set(dayKeyed.map((e) => e.dayKey)).size, [dayKeyed]);
  const rewatchCount = useMemo(() => computeRewatchCount(monthRows), [monthRows]);
  const personality = useMemo(() => computePersonality({ entries: monthEntriesWithDayKey, monthRows }), [monthEntriesWithDayKey, monthRows]);
  const topShows = useMemo(() => computeTopShows(monthEntries, 5, showRatingMap), [monthEntries, showRatingMap]);
  const topMovies = useMemo(() => computeTopMovies(monthMovieEntries, 5, movieRatingMap), [monthMovieEntries, movieRatingMap]);
  const topGenres = useMemo(() => computeTopGenres(monthEntries), [monthEntries]);

  // Calendar day cells mix TV + movie activity — a day with one episode
  // and one movie shows the same dot intensity a day with two episodes
  // would, entryType on each entry is what lets the day-detail panel
  // (dayShowGroups/dayMovieEntries below) split them back apart for
  // display.
  const days = useMemo(() => {
    const byDay = new Map();
    // movieDayKeyed isn't pre-filtered to day-precision the way dayKeyed
    // already is (line above) — a month-precision movie has dayKey: null
    // now, which would otherwise crash the .split("-") below.
    for (const e of [...dayKeyed, ...movieDayKeyed.filter((m) => m.dayKey)]) {
      const day = Number(e.dayKey.split("-")[2]);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(e);
    }
    for (const entries of byDay.values()) entries.sort((a, b) => new Date(a.watchedAt) - new Date(b.watchedAt));
    return Array.from({ length: daysInMonth(year, month) }, (_, i) => {
      const day = i + 1;
      const entries = byDay.get(day) || [];
      return { day, level: levelForCount(entries.length), entries };
    });
  }, [dayKeyed, movieDayKeyed, year, month]);

  // Defaults to today (Bangkok) when viewing the actual current month;
  // otherwise the most recent day with activity, matching how a past
  // month has no meaningful "today" to land on.
  const isCurrentMonth = year === bangkokNow.year && month === bangkokNow.month;
  useEffect(() => {
    if (isCurrentMonth) { setSelectedDay(bangkokNow.day); return; }
    const withEntries = days.filter((d) => d.entries.length > 0);
    setSelectedDay(withEntries.length ? withEntries[withEntries.length - 1].day : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-pick when the month's entries actually change, not on every render
  }, [monthEntries]);

  const activeDay = days.find((d) => d.day === selectedDay) || null;
  const dayMinutes = activeDay ? activeDay.entries.reduce((s, e) => s + (e.runtimeMinutes || 0), 0) : 0;

  // Selected day's episodes, grouped by show — each group renders as a
  // collapsible "Show Title >" header with its own episode cards
  // underneath, rather than one flat list mixing shows together. Movie
  // entries are excluded here (a movie has no "show" to group under) and
  // rendered as their own flat list, dayMovieEntries below.
  const dayShowGroups = useMemo(() => {
    const byShow = new Map();
    for (const e of activeDay?.entries ?? []) {
      if (e.entryType === "movie") continue;
      if (!byShow.has(e.showId)) byShow.set(e.showId, { showId: e.showId, showTitle: e.showTitle, entries: [] });
      byShow.get(e.showId).entries.push(e);
    }
    return [...byShow.values()];
  }, [activeDay]);
  const dayMovieEntries = useMemo(
    () => (activeDay?.entries ?? []).filter((e) => e.entryType === "movie"),
    [activeDay]
  );
  const toggleShowGroup = (showId) => setCollapsedShowIds((prev) => {
    const next = new Set(prev);
    next.has(showId) ? next.delete(showId) : next.add(showId);
    return next;
  });

  // Seeds for the bulk Watch Date sheet: `current` is a synthetic "today,
  // exact date" state (not any one selected episode's real stored value —
  // there isn't a single meaningful "current" across a multi-episode,
  // possibly multi-show selection) so the sheet opens in its normal
  // default-to-today state with Save disabled until the user actually
  // picks something, same as opening it fresh for a never-dated episode.
  // episodeAirDate seeds from whichever selected entry happens to be
  // found first purely to decide whether Release date/Release month
  // render enabled — the real per-entry air date is what actually gets
  // applied on save, via resolveBulkFields above.
  const bulkSeedEntry = bulkSelectedIds.size > 0
    ? (activeDay?.entries ?? []).find((e) => (bulkMediaType === "movie" ? e.entryType === "movie" && bulkSelectedIds.has(e.movieId) : bulkSelectedIds.has(e.id)))
    : null;
  const bulkTodayStr = `${bangkokNow.year}-${String(bangkokNow.month).padStart(2, "0")}-${String(bangkokNow.day).padStart(2, "0")}`;

  const changeYear = (y) => {
    setYear(y);
    setYearMenuOpen(false);
  };

  // Calendar's own chevron nav (Watch History view) — wraps the year at
  // the Jan/Dec boundary rather than clamping, so "previous" from
  // January genuinely lands on last December.
  const goToPrevMonth = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1);
  };
  const goToNextMonth = () => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1);
  };

  const stillSrc = (e) => e.stillPath || e.backdropPath || e.posterPath || null;

  // Leading/trailing days from the adjacent month, purely for grid
  // alignment (a calendar starting on Wednesday needs 3 blank-ish cells
  // before day 1) — shown at 30% opacity per spec, not clickable, and
  // carry no watch data of their own since only the selected month's
  // rows are ever fetched.
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const totalCells = Math.ceil((firstWeekday + daysInMonth(year, month)) / 7) * 7;
  const trailingCount = totalCells - firstWeekday - daysInMonth(year, month);
  const prevMonthDays = daysInMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1);
  const leadingDays = Array.from({ length: firstWeekday }, (_, i) => prevMonthDays - firstWeekday + i + 1);
  const trailingDays = Array.from({ length: trailingCount }, (_, i) => i + 1);

  const header = (
    <div className="px-6 relative flex items-center justify-between" style={{ paddingTop: "calc(env(safe-area-inset-top) + 13.2px)" }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>Highlights</div>

      <button
        onClick={() => setYearMenuOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full active:scale-95 transition"
        style={{ padding: "8px 12px", background: t.cardFill, border: `1px solid ${t.cardBorder}` }}
      >
        <Icon name="calendar" size={14} color={t.textDim} strokeWidth={1.7} />
        <span style={{ fontSize: 14.6, fontWeight: 700, color: "#fff" }}>{year}</span>
        <Icon name="chevronDown" size={13} color={t.textDim} strokeWidth={2} />
      </button>

      {yearMenuOpen && (
        <>
          <div className="absolute" onClick={() => setYearMenuOpen(false)} style={{ top: 0, left: -24, right: -24, bottom: -600, zIndex: 35 }} />
          <div className="absolute rounded-2xl overflow-hidden" style={{ top: 48, right: 0, width: 132, background: "#18181b", border: `1px solid ${t.glassBorder}`, boxShadow: "0 20px 50px rgba(0,0,0,0.5)", zIndex: 40 }}>
            {years.map((y) => {
              const active = y === year;
              return (
                <button key={y} onClick={() => changeYear(y)} className="w-full flex items-center justify-between" style={{ padding: "11px 14px", background: active ? "rgba(232,162,76,0.12)" : "transparent" }}>
                  <span style={{ fontSize: 13.5, fontWeight: active ? 700 : 500, color: active ? accent : "#fff" }}>{y}</span>
                  {active && <Icon name="check" size={13} color={accent} strokeWidth={2.2} />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  const monthSelector = (
    <div ref={monthRowRef} className="flex gap-2 px-6 overflow-x-auto" style={{ marginTop: 20, scrollbarWidth: "none" }}>
      {MONTH_ABBRS.map((label, i) => {
        const m = i + 1;
        const active = m === month;
        return (
          <button key={m} onClick={() => setMonth(m)} className="flex-shrink-0 rounded-full active:scale-95 transition" style={{ padding: "8px 16px", background: active ? "#fff" : "transparent", border: "1px solid transparent" }}>
            <span style={{ fontSize: 13.9, fontWeight: 600, color: active ? "#111" : t.textDim }}>{label}</span>
          </button>
        );
      })}
    </div>
  );

  if (!authLoading && !user) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center text-center px-8" style={{ background: t.bg }}>
        <Icon name="playSquare" size={30} color={t.textDim} />
        <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginTop: 14 }}>Sign in to see your Highlights</div>
        <button onClick={() => router.push("/login")} className="rounded-full active:scale-95 transition" style={{ marginTop: 20, padding: "11px 24px", background: accent }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1a1108" }}>Sign In</span>
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Warm gold/amber glow behind the header + "hours watched" stat only
          — a deliberate, isolated exception to the app's usual neutral
          black-only background, since Highlights is a celebratory summary
          screen rather than a browsing one; every other screen keeps the
          plain black background unchanged. Low-medium intensity (0.18
          alpha, fading out well before the TV Personality card starts) so
          it reads as a soft warm light source behind the content, not a
          saturated color wash. Purely amber — no secondary accent hue —
          so it stays a single warm glow. A fixed-height layer, not one
          that tracks content height, so it reads as one continuous wash
          that quietly hands off to the plain flat t.bg black (already
          nearly identical to this gradient's own #050505 floor) rather
          than following the whole page's scroll length. position: absolute
          at zIndex: -1 (not 0) — a positioned element at z-index 0 still
          paints above plain non-positioned siblings per CSS's own paint
          order, so 0 would cover every card below it; -1 is what actually
          keeps it behind ordinary content (the same fix already used for
          the login page's poster backdrop). pointerEvents: none so it
          never intercepts taps meant for the header/year picker/month
          chips sitting on top of it. */}
      <div
        className="absolute inset-x-0 top-0 pointer-events-none"
        style={{
          height: 420,
          zIndex: -1,
          background: `
            radial-gradient(circle at 50% 0%, rgba(232,162,76,0.4), transparent 62%),
            linear-gradient(180deg, #120d09 0%, #070605 45%, #050505 100%)
          `,
        }}
      />
      {header}

      {yearStatus === "loading" && (
        <div className="px-6" style={{ marginTop: 20 }}>
          <SkeletonBlock height={36} width={220} />
          <div className="flex flex-col gap-2" style={{ marginTop: 22 }}>
            <SkeletonBlock height={64} />
            <SkeletonBlock height={140} />
            <SkeletonBlock height={90} />
          </div>
        </div>
      )}

      {yearStatus === "error" && (
        <div className="px-6 flex flex-col items-center text-center" style={{ marginTop: 90 }}>
          <div style={{ fontSize: 14, color: "#e0567a" }}>Couldn&apos;t load your highlights.</div>
          <button onClick={() => setRetryToken((n) => n + 1)} className="rounded-full active:scale-95 transition" style={{ marginTop: 16, padding: "11px 24px", background: "rgba(255,255,255,0.1)" }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "#fff" }}>Retry</span>
          </button>
        </div>
      )}

      {effectiveYearStatus === "empty" && (
        <div className="px-6 flex flex-col items-center text-center" style={{ marginTop: 90 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: t.cardFill, border: `1px solid ${t.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="calendar" size={24} color={t.textDim} strokeWidth={1.5} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginTop: 16 }}>No highlights for {year}</div>
          <div style={{ fontSize: 12.5, color: t.textDim, marginTop: 6, lineHeight: 1.4, maxWidth: 240 }}>You haven&apos;t watched anything tracked in {year} yet.</div>
        </div>
      )}

      {effectiveYearStatus === "ready" && (
        <>
          {monthSelector}

          {monthStatus === "loading" && (
            <div className="px-6 flex flex-col gap-2" style={{ marginTop: 22 }}>
              <SkeletonBlock height={64} />
              <SkeletonBlock height={90} />
              <div className="flex gap-2"><SkeletonBlock height={80} /><SkeletonBlock height={80} /><SkeletonBlock height={80} /><SkeletonBlock height={80} /></div>
            </div>
          )}

          {monthStatus === "error" && (
            <div className="px-6 flex flex-col items-center text-center" style={{ marginTop: 40 }}>
              <div style={{ fontSize: 13.5, color: "#e0567a" }}>Couldn&apos;t load {MONTH_ABBRS[month - 1]} {year}.</div>
              <button onClick={() => setMonthRetryToken((n) => n + 1)} className="rounded-full active:scale-95 transition" style={{ marginTop: 14, padding: "9px 20px", background: "rgba(255,255,255,0.1)" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Retry</span>
              </button>
            </div>
          )}

          {monthStatus === "ready" && monthEntries.length === 0 && (
            <div className="px-6 flex flex-col items-center text-center" style={{ marginTop: 60 }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: t.cardFill, border: `1px solid ${t.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="playSquare" size={20} color={t.textDim} strokeWidth={1.5} />
              </div>
              <div style={{ fontSize: 13.5, color: t.textDim, marginTop: 14 }}>No watch activity this month yet.</div>
            </div>
          )}

          {monthStatus === "ready" && monthEntries.length > 0 && (
            <>
              {/* headline stat — same concise "N hours watched" copy, just
                  a stronger size hierarchy: the number is the dominant
                  element now (clamp so it scales with viewport width
                  instead of a single fixed px), the label bumped up
                  slightly but stays clearly secondary, and the gap between
                  them tightened so they read as one unit. */}
              <div className="px-6" style={{ marginTop: 22 }}>
                <div className="flex items-baseline" style={{ gap: 6 }}>
                  <span style={{ fontSize: "clamp(51px, 12vw, 64px)", fontWeight: 700, letterSpacing: "-0.04em", color: "#fff", lineHeight: 1 }}>{hours}</span>
                  <span style={{ fontSize: 22, fontWeight: 600, color: "rgba(255,255,255,0.62)" }}>hours watched</span>
                </div>
              </div>

              {/* TV personality — was sized at ~1.56x the original card
                  (1.3x, then another 20% on top); scaled back down 10%
                  from that (padding, icon badge, icon, and the name text
                  together, so it still reads as one card shrinking, not
                  just smaller text) plus a new "YOUR TV PERSONALITY"
                  eyebrow label above the name. The description line below
                  the name is reduced a further 30% off its own prior
                  size, independent of that 10% — called out as its own
                  size rather than following the card-wide scale.
                  Surface refined to a "liquid glass" treatment (soft
                  diagonal tint, blur, hairline border, bigger radius, a
                  faint inset highlight + a wide soft shadow instead of a
                  hard one) so this stays the visual focus point of the
                  page relative to the quieter stat cards below — same
                  content, same padding/gap/text sizes, just the card's
                  own surface. The icon's amber glow sits behind the badge
                  in its own absolutely-positioned layer, oversized and
                  centered on it; both the glow and the badge are
                  `position: relative`/`absolute` with explicit z-index
                  (0 and 1) so they stack correctly by z-index rather than
                  relying on DOM order, since two positioned siblings need
                  that to paint in the right order. */}
              {personality && (
                <div className="px-6" style={{ marginTop: 18 }}>
                  <div
                    className="flex items-center rounded-2xl"
                    style={{
                      gap: 16.8,
                      padding: 22.5,
                      background: "linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.018))",
                      backdropFilter: "blur(24px)",
                      WebkitBackdropFilter: "blur(24px)",
                      border: "1px solid rgba(255,255,255,0.09)",
                      borderRadius: 28,
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 48px rgba(0,0,0,0.28)",
                    }}
                  >
                    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: 61.7, height: 61.7 }}>
                      <div
                        className="absolute"
                        style={{ width: 112, height: 112, left: "50%", top: "50%", transform: "translate(-50%, -50%)", borderRadius: "50%", background: "radial-gradient(circle, rgba(232,162,76,0.22), transparent 68%)", zIndex: 0 }}
                      />
                      <div className="relative flex items-center justify-center rounded-full" style={{ width: 61.7, height: 61.7, background: "rgba(232,162,76,0.14)", zIndex: 1 }}>
                        <span style={{ fontSize: 28.1, lineHeight: 1 }}>{personality.emoji}</span>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div style={{ fontSize: 13.2, fontWeight: 700, letterSpacing: "0.08em", color: accent }}>YOUR TV PERSONALITY</div>
                      <div style={{ fontSize: 22.3, fontWeight: 700, color: "#fff", marginTop: 2 }}>{personality.name}</div>
                      <div style={{ fontSize: 12.5, color: t.textDim, marginTop: 2.8, lineHeight: 1.35 }}>{personality.description}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* summary stat cards — colors sampled directly from a
                  supplied reference image (statIconGold/statCardBg in
                  lib/theme.js), deliberately distinct from the app's usual
                  vibrant amber accent so this row reads as its own quieter
                  "antique brushed gold" moment. Fixed comfortable sizes
                  (~64% of the reference's own 68px badge/48px number, two
                  20% reductions compounded), not computed/shrunk to
                  force-fit the screen — the row scrolls horizontally if
                  all 4 don't fit rather than squeezing each card down to
                  whatever width is left. */}
              {/* items-start — without it, flexbox's default cross-axis
                  stretch makes every card match the tallest one (the
                  2-line-wrapping "Active Days" label), leaving visible
                  dead space below the shorter single-line labels in the
                  other 3 cards. Each card now sizes to its own content. */}
              <div className="flex items-start gap-2.5 px-6 overflow-x-auto" style={{ marginTop: 14, scrollbarWidth: "none" }}>
                {/* Widget scaled down another 5% on top of the previous
                    pass (width/padding/icon badge/border-radius/margins),
                    plus the number reduced another 10% on top of its own
                    previous pass. */}
                {/* Active Days dropped from this row per explicit request —
                    it now surfaces as inline text next to the "Watch
                    History" heading below instead (see activeDayCount's
                    other usage). Profile's own separate this-month stats
                    row (app/(tabs)/profile/page.jsx) is untouched — it has
                    its own independent ["Shows","Movies","Active Days",
                    "Rewatched"] tuple, not this one. */}
                {[["episodes", monthEntries.length, "Episodes"], ["layers", uniqueShowCount, "Shows"], ["clapperboard", monthMovieEntries.length, "Movies"], ["refresh", rewatchCount, "Rewatched"]].map(([icon, n, l], i) => (
                  <div key={i} className="flex-shrink-0 flex flex-col items-center text-center" style={{ width: 86.36, padding: "12.70px 11.29px", background: statCardBg, border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12.23 }}>
                    <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 37.62, height: 37.62, background: `${statIconGold}12` }}>
                      <Icon name={icon} size={16.93} color={accent} strokeWidth={1.4} />
                    </div>
                    <div style={{ fontSize: 24.95, fontWeight: 800, color: "#fff", marginTop: 6.75, lineHeight: 1 }}>{n}</div>
                    <div style={{ fontSize: 10.26, fontWeight: 500, color: t.textDim, marginTop: 3.59, textAlign: "center", lineHeight: 1.2 }}>{l}</div>
                  </div>
                ))}
              </div>

              {/* top shows — one horizontal-scrolling row of large
                  posters (matching Home/Explore's existing row pattern),
                  not a wrapping gallery grid: even capped at 5, a grid
                  would still be 2 rows tall, whereas a single scrollable
                  line keeps the section compact regardless of count.
                  Still in ranked order (computeTopShows' minutes ->
                  episodes -> recency sort), just without a visible rank
                  number on the poster. */}
              {topShows.length > 0 && (
                <div style={{ marginTop: 26 }}>
                  <div className="px-6" style={{ fontSize: 16.5, fontWeight: 700, color: "#fff", marginBottom: 12 }}>Top Shows</div>
                  <div className="flex gap-3 pl-6 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                    {topShows.map((s) => {
                      const title = resolveTitle(s, readableLanguages);
                      return (
                        <button key={s.showId} onClick={() => router.push(`/show/${s.showId}`)} className="flex-shrink-0 text-left active:scale-95 transition" style={{ width: 156 }}>
                          {/* Same poster size/count/scroll behavior — just a
                              bigger radius, a deeper/softer shadow, and a
                              touch more contrast on the image itself. */}
                          <div className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: "2 / 3", borderRadius: 22, boxShadow: "0 14px 32px rgba(0,0,0,0.34)", filter: "contrast(1.06) saturate(1.05)" }}>
                            <PosterArt posterPath={s.posterPath} alt={title} />
                            {/* This is the same `rating` computeTopShows already
                                resolves for ranking (whichever touched season had
                                the most watched episodes this month) — shown only
                                when one exists, never a placeholder for an unrated
                                show. */}
                            {s.rating != null && (
                              <div className="absolute flex items-center gap-1 rounded-full" style={{ left: 6, bottom: 6, padding: "3px 6px", background: "rgba(0,0,0,0.68)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}>
                                <Icon name="star" size={9} color={accent} />
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: "#fff" }}>{s.rating.toFixed(1)}</span>
                              </div>
                            )}
                          </div>
                          <div className="mt-2 leading-tight" style={{ fontSize: 12.5, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
                          <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>{s.hours}h · {s.episodeCount} ep</div>
                        </button>
                      );
                    })}
                    <div className="w-2 flex-shrink-0" />
                  </div>
                </div>
              )}

              {/* top movies — directly below Top Shows, same card/row
                  pattern. No episode-count equivalent for a movie, so the
                  subtext is just its runtime. */}
              {topMovies.length > 0 && (
                <div style={{ marginTop: 26 }}>
                  <div className="px-6" style={{ fontSize: 16.5, fontWeight: 700, color: "#fff", marginBottom: 12 }}>Top Movies</div>
                  <div className="flex gap-3 pl-6 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                    {topMovies.map((m) => {
                      const title = resolveTitle(m, readableLanguages);
                      return (
                        <button key={m.movieId} onClick={() => router.push(`/movie/${m.movieId}`)} className="flex-shrink-0 text-left active:scale-95 transition" style={{ width: 156 }}>
                          <div className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: "2 / 3", borderRadius: 22, boxShadow: "0 14px 32px rgba(0,0,0,0.34)", filter: "contrast(1.06) saturate(1.05)" }}>
                            <PosterArt posterPath={m.posterPath} alt={title} />
                            {/* Same rating computeTopMovies already resolves for
                                ranking — shown only when one exists. */}
                            {m.rating != null && (
                              <div className="absolute flex items-center gap-1 rounded-full" style={{ left: 6, bottom: 6, padding: "3px 6px", background: "rgba(0,0,0,0.68)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}>
                                <Icon name="star" size={9} color={accent} />
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: "#fff" }}>{m.rating.toFixed(1)}</span>
                              </div>
                            )}
                          </div>
                          <div className="mt-2 leading-tight" style={{ fontSize: 12.5, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
                          <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>{formatDuration(m.runtimeMinutes)}</div>
                        </button>
                      );
                    })}
                    <div className="w-2 flex-shrink-0" />
                  </div>
                </div>
              )}

              {/* top genres — now a horizontal-scroll row of GenreTag
                  pills (components/GenreTag.jsx) instead of an inline
                  3-column grid. Each genre gets its own accent color
                  (lib/highlights.js's genreColor) rather than sharing
                  the single Highlights accent, per GenreTag's one-color-
                  per-genre design contract. No action in its header —
                  Watch History is its own section below now, not a link
                  tucked into this one. */}
              {topGenres.length > 0 && (
                <div style={{ marginTop: 26 }}>
                  <div className="px-6" style={{ fontSize: 16.5, fontWeight: 700, color: "#fff", marginBottom: 12 }}>Top Genres</div>
                  <GenreTagRow genres={topGenres.map((g) => ({ name: g.genre, color: g.color, icon: g.icon, emoji: g.emoji }))} />
                </div>
              )}
            </>
          )}

          {/* "Year only" precision watches — no month to attach to at
              all (never invented, per episode_watches' schema comment),
              so these can never appear in any month-scoped section above
              regardless of which month is selected. This is exactly why
              this block used to live *inside* the monthEntries.length > 0
              branch above — a real bug: a month with zero watch activity
              of its own (August, say, right after a July that did have
              some) hid this entire section too, even though it has
              nothing to do with the selected month at all. It's scoped to
              the whole selected YEAR, so it now renders independently of
              monthStatus/monthEntries — shown in every month as long as
              there's actually year-only data somewhere in the year. */}
          {yearOnlyEntries.length > 0 && (
            <div style={{ marginTop: 30 }}>
              <div className="px-6 flex items-baseline gap-2" style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 16.5, fontWeight: 700, color: "#fff" }}>Watched in {year}</span>
                <span style={{ fontSize: 12, color: t.textDim }}>no specific date · {yearOnlyHours}h</span>
              </div>
              {yearOnlyTopShows.length > 0 && (
                <div className="flex gap-3 pl-6 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                  {yearOnlyTopShows.map((s) => {
                    const title = resolveTitle(s, readableLanguages);
                    return (
                      <button key={s.showId} onClick={() => router.push(`/show/${s.showId}`)} className="flex-shrink-0 text-left active:scale-95 transition" style={{ width: 156 }}>
                        <div className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: "2 / 3", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                          <PosterArt posterPath={s.posterPath} alt={title} />
                        </div>
                        <div className="mt-2 leading-tight" style={{ fontSize: 12.5, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
                        <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>{s.hours}h · {s.episodeCount} ep</div>
                      </button>
                    );
                  })}
                  <div className="w-2 flex-shrink-0" />
                </div>
              )}
              {yearOnlyTopGenres.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <GenreTagRow genres={yearOnlyTopGenres.map((g) => ({ name: g.genre, color: g.color, icon: g.icon, emoji: g.emoji }))} />
                </div>
              )}
            </div>
          )}

          {/* watch history — its own section on this same page (not a
              separate view/route), title followed directly by the
              calendar, right after Top Genres. Shown whenever the month
              itself finished loading, regardless of whether it had any
              activity — an all-zero calendar is itself a meaningful,
              honest empty state, same as the day-detail panel's own
              "No watch activity" copy below. */}
          {monthStatus === "ready" && (
            <div className="px-6" style={{ marginTop: 26 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 16.5, fontWeight: 700, color: "#fff" }}>Watch History</span>
                {/* Active Days moved here from the stat-card row above — same
                    number (activeDayCount), just relocated to sit next to
                    the calendar it actually describes. */}
                <span style={{ fontSize: 12, fontWeight: 500, color: t.textDim }}>{activeDayCount} Active day{activeDayCount === 1 ? "" : "s"}</span>
              </div>
              <style>{`
                @keyframes highlightsCalSlide { from { opacity: 0; transform: translateX(6px); } to { opacity: 1; transform: translateX(0); } }
                @keyframes highlightsDayFade { from { opacity: 0; } to { opacity: 1; } }
              `}</style>

              {/* Calendar card — exact spec: 24px radius, matte #171717,
                  hairline border, no gradients/glassmorphism. */}
              <div className="rounded-[24px]" style={{ padding: 24, background: "#171717", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center justify-between">
                  <button
                    onClick={goToPrevMonth}
                    className="flex items-center justify-center rounded-full flex-shrink-0 transition hover:bg-white/10 active:scale-[0.96]"
                    style={{ width: 36, height: 36, background: "transparent" }}
                  >
                    <Icon name="back" size={16} color="#fff" />
                  </button>
                  <span key={`${year}-${month}-label`} style={{ fontSize: 20, fontWeight: 600, color: "#fff", animation: "highlightsCalSlide 200ms ease" }}>
                    {MONTH_NAMES[month - 1]} {year}
                  </span>
                  <button
                    onClick={goToNextMonth}
                    className="flex items-center justify-center rounded-full flex-shrink-0 transition hover:bg-white/10 active:scale-[0.96]"
                    style={{ width: 36, height: 36, background: "transparent" }}
                  >
                    <Icon name="chevronRight" size={16} color="#fff" />
                  </button>
                </div>

                {/* legend — tiny 4px dots, grey through to full accent */}
                <div className="flex items-center justify-end gap-1.5" style={{ marginTop: 18 }}>
                  <span style={{ fontSize: 10, color: "#8A8A8A" }}>Less</span>
                  {DOT_OPACITIES.map((op, i) => (
                    <div key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: accent, opacity: Math.max(op, 0.12) }} />
                  ))}
                  <span style={{ fontSize: 10, color: "#8A8A8A" }}>More</span>
                </div>

                {/* weekday row */}
                <div className="grid grid-cols-7" style={{ marginTop: 20 }}>
                  {WEEKDAY_LABELS.map((d, i) => (
                    <div key={i} style={{ fontSize: 11, fontWeight: 500, color: "#8A8A8A", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.04em" }}>{d}</div>
                  ))}
                </div>

                {/* date grid — square cells, dot centered beneath the
                    number rather than a filled cell background; ring
                    (not fill) marks selection, per spec. */}
                <div key={`${year}-${month}-grid`} className="grid grid-cols-7" style={{ marginTop: 4, animation: "highlightsCalSlide 200ms ease" }}>
                  {leadingDays.map((n, i) => (
                    <div key={`lead-${i}`} className="flex items-center justify-center" style={{ aspectRatio: "1" }}>
                      <span style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.3)" }}>{n}</span>
                    </div>
                  ))}
                  {days.map((d) => {
                    const isSelected = selectedDay === d.day;
                    const isToday = isCurrentMonth && d.day === bangkokNow.day;
                    return (
                      <button
                        key={d.day}
                        onClick={() => setSelectedDay(d.day)}
                        className="relative flex flex-col items-center justify-center transition hover:bg-white/10 active:scale-[0.96]"
                        style={{ aspectRatio: "1", borderRadius: "50%" }}
                      >
                        <div
                          className="absolute rounded-full"
                          style={{
                            inset: 3,
                            border: isSelected ? `2px solid ${accent}` : isToday ? "1px solid rgba(255,255,255,0.3)" : "none",
                            transition: "border 150ms ease",
                          }}
                        />
                        <span style={{ fontSize: 15, fontWeight: 500, color: "#fff", position: "relative" }}>{d.day}</span>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", marginTop: 3, background: accent, opacity: DOT_OPACITIES[d.level], position: "relative" }} />
                      </button>
                    );
                  })}
                  {trailingDays.map((n, i) => (
                    <div key={`trail-${i}`} className="flex items-center justify-center" style={{ aspectRatio: "1" }}>
                      <span style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.3)" }}>{n}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* selected day header — no toggle here anymore; bulk
                  select is entered via a tap-and-hold on an episode row
                  below instead (see the menu/circles there). */}
              <div key={`${selectedDay}-header`} style={{ marginTop: 20, animation: "highlightsDayFade 200ms ease" }}>
                <div style={{ fontSize: 22, fontWeight: 600, color: "#fff" }}>
                  {activeDay ? `${MONTH_ABBRS[month - 1]} ${activeDay.day}` : "Select a date"}
                </div>
                {activeDay && activeDay.entries.length > 0 && (
                  <div style={{ fontSize: 14, color: t.textDim, marginTop: 4 }}>
                    {(() => {
                      const epCount = activeDay.entries.length - dayMovieEntries.length;
                      const parts = [];
                      if (epCount > 0) parts.push(`${epCount} episode${epCount !== 1 ? "s" : ""}`);
                      if (dayMovieEntries.length > 0) parts.push(`${dayMovieEntries.length} movie${dayMovieEntries.length !== 1 ? "s" : ""}`);
                      return `${parts.join(", ")} · ${formatDuration(dayMinutes)} watched`;
                    })()}
                  </div>
                )}
              </div>

              {/* grouped episode rows — one container, not separate
                  floating cards, per spec, and (per explicit follow-up
                  request) grouped by show within it: a "Show Title >"
                  header per show, collapsible, with that show's episode
                  cards revealed underneath rather than one flat list
                  mixing every show together. */}
              {activeDay && activeDay.entries.length > 0 ? (
                <div key={`${selectedDay}-list`} className="rounded-2xl overflow-hidden" style={{ marginTop: 14, background: "#171717", border: "1px solid rgba(255,255,255,0.05)", animation: "highlightsDayFade 200ms ease" }}>
                  {dayShowGroups.map((group, gi) => {
                    const collapsed = collapsedShowIds.has(group.showId);
                    const selectColor = bulkMode === "remove" ? "#e0567a" : accent;
                    const checkColor = bulkMode === "remove" ? "#fff" : "#1a1108";
                    const groupIds = group.entries.map((e) => e.id);
                    // Gated on bulkMediaType === "tv" too, not just
                    // bulkMode — a movie-scoped bulk session (entered from
                    // a movie row's own "Change Watched Date") must not
                    // also turn TV show groups into selection targets;
                    // they render at rest, same as when no bulk mode is
                    // active at all.
                    const bulkActiveHere = bulkMode && bulkMediaType === "tv";
                    const groupAllSelected = bulkActiveHere && groupIds.length > 0 && groupIds.every((id) => bulkSelectedIds.has(id));
                    return (
                      <div key={group.showId} style={{ borderTop: gi > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                        {/* Two separate tap targets, not one row-wide
                            button: the title/count navigates to the show
                            (per explicit request — episode rows already
                            went to episode detail, but there was no way
                            to reach the show itself from here), while the
                            chevron toggles this group's collapse state.
                            Once bulk select is on, the title button's own
                            action switches from "navigate to show" to
                            "select/deselect every episode in this show at
                            once" — a circle next to the name shows which
                            state it's in, filled + checkmarked once every
                            episode underneath is selected. This is what
                            makes bulk-removing/re-dating a whole
                            bulk-watched show fast instead of tapping each
                            episode's own circle one at a time. */}
                        <div className="w-full flex items-center justify-between">
                          <button
                            onClick={() => (bulkActiveHere ? toggleBulkSelectShow(group) : router.push(`/show/${group.showId}`))}
                            className="flex items-center gap-2 min-w-0 flex-1 text-left transition hover:bg-white/[0.03] active:opacity-70"
                            style={{ padding: "14px 16px" }}
                          >
                            {bulkActiveHere && (
                              <span
                                className="flex items-center justify-center rounded-full flex-shrink-0"
                                style={{
                                  width: 20,
                                  height: 20,
                                  border: `1.5px solid ${groupAllSelected ? selectColor : "rgba(255,255,255,0.5)"}`,
                                  background: groupAllSelected ? selectColor : "transparent",
                                }}
                              >
                                {groupAllSelected && <Icon name="check" size={11} color={checkColor} strokeWidth={3} />}
                              </span>
                            )}
                            <span style={{ fontSize: 14.5, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.showTitle}</span>
                            <span style={{ fontSize: 12, color: t.textDim, flexShrink: 0 }}>{group.entries.length} ep{group.entries.length !== 1 ? "s" : ""}</span>
                          </button>
                          <button
                            onClick={() => toggleShowGroup(group.showId)}
                            className="flex items-center justify-center flex-shrink-0 transition hover:bg-white/[0.03] active:opacity-70"
                            style={{ padding: "14px 16px" }}
                          >
                            <span style={{ display: "inline-flex", transform: collapsed ? "rotate(0deg)" : "rotate(90deg)", transition: "transform 150ms ease" }}>
                              <Icon name="chevronRight" size={14} color={t.textDim} strokeWidth={2} />
                            </span>
                          </button>
                        </div>
                        {/* Tap-and-hold opens the Rate/Change Date/Remove
                            menu (handleRowClick swallows the click that
                            would otherwise fire right after the
                            long-press's pointerup and navigate to the
                            episode). Once bulk select is on, every row
                            instead shows its own checkbox-style circle —
                            tapping the row itself is disabled in that
                            mode, only the circle toggles selection,
                            filling + checkmarking when selected. */}
                        {!collapsed && group.entries.map((e, i) => {
                          const entryKey = e.id ?? i;
                          const isSelected = bulkSelectedIds.has(e.id);
                          const isPressed = pressedEntryId === e.id;
                          return (
                            <div key={entryKey} className="w-full flex items-center gap-3" style={{ padding: "0 16px 16px" }}>
                              <button
                                onPointerDown={(ev) => !bulkMode && startLongPress(e, ev)}
                                onPointerMove={handlePressMove}
                                onPointerUp={cancelLongPress}
                                onPointerLeave={cancelLongPress}
                                onPointerCancel={cancelLongPress}
                                onContextMenu={(ev) => ev.preventDefault()}
                                onClick={() => !bulkMode && handleRowClick(e)}
                                className="flex-1 min-w-0 flex items-center gap-3 text-left transition hover:bg-white/[0.03]"
                                style={{
                                  touchAction: "manipulation",
                                  userSelect: "none",
                                  WebkitUserSelect: "none",
                                  WebkitTouchCallout: "none",
                                  WebkitTapHighlightColor: "transparent",
                                  transform: isPressed ? "scale(0.975) translateY(1px)" : "scale(1) translateY(0)",
                                  filter: isPressed ? "brightness(0.92)" : "brightness(1)",
                                  transition: "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), filter 140ms ease-out",
                                }}
                              >
                                <div className="relative flex-shrink-0 rounded-xl overflow-hidden" style={{ width: 88, height: 50 }}>
                                  <PosterArt posterPath={stillSrc(e)} alt={e.showTitle} />
                                  {/* Personal rating badge — same corner/style
                                      convention Show Detail's own episode
                                      thumbnails already use. Play icon
                                      overlay removed per explicit request
                                      now that this badge is here. */}
                                  {e.rating != null && (
                                    <div className="absolute flex items-center gap-1 rounded-full" style={{ left: 5, bottom: 5, padding: "2px 6px", background: "rgba(0,0,0,0.55)" }}>
                                      <Icon name="star" size={8} color={accent} />
                                      <span style={{ fontSize: 10, fontWeight: 600, color: "#fff" }}>{e.rating.toFixed(1)}/5</span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.episodeTitle}</div>
                                  <div style={{ fontSize: 13, color: "#9B9BA3", marginTop: 2 }}>S{e.season}E{e.episode}</div>
                                  <div style={{ fontSize: 12, color: t.textDim, marginTop: 2 }}>{formatDuration(e.runtimeMinutes)} watched</div>
                                </div>
                              </button>
                              {bulkActiveHere && (
                                <button
                                  onClick={() => toggleBulkSelected(e.id)}
                                  aria-label={isSelected ? "Deselect" : "Select"}
                                  className="flex items-center justify-center rounded-full flex-shrink-0 active:scale-90 transition"
                                  style={{
                                    width: 24,
                                    height: 24,
                                    border: `1.5px solid ${isSelected ? selectColor : "rgba(255,255,255,0.5)"}`,
                                    background: isSelected ? selectColor : "transparent",
                                  }}
                                >
                                  {isSelected && <Icon name="check" size={13} color={checkColor} strokeWidth={3} />}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {/* Movies watched this day — a flat list (no "show" to
                      group under), rendered as a sibling section inside
                      the same container rather than a separate floating
                      card, same reasoning as the per-show groups above.
                      Same tap-and-hold menu as episode rows now (Rate
                      this Movie / Change Watched Date) — see
                      entryPressKey/startLongPress/handleRowClick above
                      for the media-aware wiring shared with TV rows. Bulk
                      select mirrors the per-episode circle pattern too
                      (gated on bulkMediaType === "movie" — see
                      bulkActiveHereMovie below — so a TV-scoped bulk
                      session doesn't turn movie rows into selection
                      targets, same guard reasoning as dayShowGroups'
                      own bulkActiveHere). */}
                  {dayMovieEntries.length > 0 && (() => {
                    const bulkActiveHereMovie = bulkMode && bulkMediaType === "movie";
                    return (
                      <div style={{ borderTop: dayShowGroups.length > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                        {dayMovieEntries.map((e) => {
                          const isPressed = pressedEntryId === entryPressKey(e);
                          const isSelected = bulkSelectedIds.has(e.movieId);
                          const movieRating = movieRatingMap.get(e.movieId);
                          return (
                            <div key={e.movieId} className="w-full flex items-center gap-3" style={{ padding: "0 16px 16px" }}>
                              <button
                                onPointerDown={(ev) => !bulkMode && startLongPress(e, ev)}
                                onPointerMove={handlePressMove}
                                onPointerUp={cancelLongPress}
                                onPointerLeave={cancelLongPress}
                                onPointerCancel={cancelLongPress}
                                onContextMenu={(ev) => ev.preventDefault()}
                                onClick={() => !bulkMode && handleRowClick(e)}
                                className="flex-1 min-w-0 flex items-center gap-3 text-left transition hover:bg-white/[0.03]"
                                style={{
                                  touchAction: "manipulation",
                                  userSelect: "none",
                                  WebkitUserSelect: "none",
                                  WebkitTouchCallout: "none",
                                  WebkitTapHighlightColor: "transparent",
                                  transform: isPressed ? "scale(0.975) translateY(1px)" : "scale(1) translateY(0)",
                                  filter: isPressed ? "brightness(0.92)" : "brightness(1)",
                                  transition: "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), filter 140ms ease-out",
                                }}
                              >
                                <div className="relative flex-shrink-0 rounded-xl overflow-hidden" style={{ width: 88, height: 50 }}>
                                  <PosterArt posterPath={e.backdropPath ?? e.posterPath} alt={resolveTitle(e, readableLanguages)} />
                                  {/* Personal rating badge — same corner/
                                      style convention as the episode
                                      thumbnails' own badge above, just the
                                      movie's real 0-10 scale (movieRatingMap,
                                      same source Top Movies' ranking reads
                                      from) instead of an episode's 0-5 stars. */}
                                  {movieRating != null && (
                                    <div className="absolute flex items-center gap-1 rounded-full" style={{ left: 5, bottom: 5, padding: "2px 6px", background: "rgba(0,0,0,0.55)" }}>
                                      <Icon name="star" size={8} color={accent} />
                                      <span style={{ fontSize: 10, fontWeight: 600, color: "#fff" }}>{movieRating.toFixed(1)}/10</span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{resolveTitle(e, readableLanguages)}</div>
                                  <div style={{ fontSize: 13, color: "#9B9BA3", marginTop: 2 }}>Movie</div>
                                  <div style={{ fontSize: 12, color: t.textDim, marginTop: 2 }}>{formatDuration(e.runtimeMinutes)} watched</div>
                                </div>
                              </button>
                              {bulkActiveHereMovie && (
                                <button
                                  onClick={() => toggleBulkSelected(e.movieId)}
                                  aria-label={isSelected ? "Deselect" : "Select"}
                                  className="flex items-center justify-center rounded-full flex-shrink-0 active:scale-90 transition"
                                  style={{
                                    width: 24,
                                    height: 24,
                                    border: `1.5px solid ${isSelected ? accent : "rgba(255,255,255,0.5)"}`,
                                    background: isSelected ? accent : "transparent",
                                  }}
                                >
                                  {isSelected && <Icon name="check" size={13} color="#1a1108" strokeWidth={3} />}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div key={`${selectedDay}-empty`} className="flex flex-col items-center text-center rounded-2xl" style={{ marginTop: 14, padding: "36px 20px", background: "#171717", border: "1px solid rgba(255,255,255,0.05)", animation: "highlightsDayFade 200ms ease" }}>
                  <Icon name="calendar" size={22} color={t.textDim} strokeWidth={1.5} />
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "#fff", marginTop: 12 }}>No watch activity</div>
                  <div style={{ fontSize: 12, color: t.textDim, marginTop: 4 }}>Looks like you took the day off.</div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Tap-and-hold menu — small liquid-glass popup, matches this app's
          existing anchored-popover style (e.g. Show Detail's more menu)
          but centered rather than row-anchored, since a long-pressed row
          can be anywhere in a scrolled list. "Rate the Episode"/"Rate this
          Movie" opens EpisodeRatingFlow/MovieRatingScreen right here (see
          below) rather than navigating away. Movie rows use the same menu
          shell, branched by menuForEntry.entryType — "Rate this Movie"
          opens the full MovieRatingScreen (a movie has just one rating,
          period, unlike an episode's lightweight per-instance star flow),
          "Change Watched Date" opens MovieWatchDateSheet directly instead
          of going through show rows' bulk-select detour (there's nothing
          to multi-select for a single movie's single watched_on). */}
      {menuForEntry && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuForEntry(null)} />
          <div
            className="fixed z-50 rounded-2xl overflow-hidden"
            style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 240, background: "rgba(22,18,14,0.97)", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", boxShadow: "0 20px 50px rgba(0,0,0,0.6)" }}
          >
            {menuForEntry.entryType === "movie" ? (
              <button
                onClick={() => { setRatingMovieEntry(menuForEntry); setMenuForEntry(null); }}
                className="w-full flex items-center gap-3 active:opacity-70 transition"
                style={{ padding: "14px 16px" }}
              >
                <Icon name="star" size={16} color="#fff" />
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "#fff" }}>Rate this Movie</span>
              </button>
            ) : (
              <button
                onClick={() => { setRatingEntry(menuForEntry); setMenuForEntry(null); }}
                className="w-full flex items-center gap-3 active:opacity-70 transition"
                style={{ padding: "14px 16px" }}
              >
                <Icon name="star" size={16} color="#fff" />
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "#fff" }}>Rate the Episode</span>
              </button>
            )}
            <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />
            <button
              onClick={() => {
                startBulkSelect(menuForEntry, "changeDate");
                setMenuForEntry(null);
              }}
              className="w-full flex items-center gap-3 active:opacity-70 transition"
              style={{ padding: "14px 16px" }}
            >
              <Icon name="calendar" size={16} color="#fff" />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "#fff" }}>Change Watched Date</span>
            </button>
          </div>
        </>
      )}

      {/* In-place rating card — same component Show Detail/Episode Detail
          use, opened here instead of navigating away. onSave targets this
          exact watch event by its row id (rateWatchById), not "the most
          recent watch" of that episode, since the one being rated from
          here could be an older rewatch. subject.watch is already fully
          known (this exact entry, not "most recent"), so EpisodeRatingFlow
          skips its own lookup — same precision reasoning as the rating
          itself. onWatchDateChange patches yearRows in place so a changed
          date/precision immediately re-buckets through the same monthRows/
          monthEntries pipeline a genuine remove already goes through —
          no separate patching logic, and the old calendar entry
          disappears on its own if the edit moved it out of this month. */}
      {ratingEntry && (
        <EpisodeRatingFlow
          subject={{
            eyebrow: `S${ratingEntry.season} E${ratingEntry.episode}`,
            title: ratingEntry.episodeTitle,
            posterPath: stillSrc(ratingEntry),
            runtimeMin: ratingEntry.runtimeMinutes,
            episodeAirDate: ratingEntry.episodeAirDate,
            watch: {
              id: ratingEntry.id,
              watchDatePrecision: ratingEntry.watchDatePrecision,
              watchedOn: ratingEntry.watchedOn,
              watchedYear: ratingEntry.watchedYear,
              watchedMonth: ratingEntry.watchedMonth,
              watchDateSource: ratingEntry.watchDateSource,
            },
          }}
          cast={ratingCast}
          onClose={() => setRatingEntry(null)}
          onSave={({ stars }) => {
            if (!user || !stars) return;
            // Optimistic — patches the rating badge onto this entry's
            // thumbnail immediately, same reasoning as onWatchDateChange
            // below: no dismiss/reload flash waiting for a refetch.
            setMonthEntries((prev) => prev.map((e) => (e.id === ratingEntry.id ? { ...e, rating: stars } : e)));
            rateWatchById(user.id, ratingEntry.id, stars).catch(console.error);
          }}
          onWatchDateChange={(updated) => {
            // Same "drop it if the edit moved it to a different year" fix
            // as confirmBulkDateChange above — yearRows only ever holds
            // rows genuinely belonging to the currently-viewed `year`, so
            // an edit that changes watchedYear to something else has to
            // remove the row here, not just patch its fields in place.
            setYearRows((prev) => prev
              .map((r) => (r.id === updated.id ? {
                ...r,
                watch_date_precision: updated.watchDatePrecision,
                watched_on: updated.watchedOn,
                watched_year: updated.watchedYear,
                watched_month: updated.watchedMonth,
                watch_date_source: updated.watchDateSource,
              } : r))
              .filter((r) => r.watched_year === year)
            );
            // Same "make the new year selectable right away" reasoning as
            // confirmBulkDateChange above.
            if (updated.watchedYear != null) {
              setAvailableYears((prev) => (prev.includes(updated.watchedYear) ? prev : [...prev, updated.watchedYear]));
            }
          }}
        />
      )}

      {/* Movie rating screen — same component Movie Detail uses, opened
          here instead of navigating away (mirrors ratingEntry/
          EpisodeRatingFlow's own inline-render approach above). onSave/
          onDelete patch movieRatingMap/movieRatingRecords optimistically
          so Top Movies' ranking and a reopened menu both reflect the
          change immediately, no refetch. */}
      {ratingMovieEntry && (
        <MovieRatingScreen
          movieTitle={resolveTitle(ratingMovieEntry, readableLanguages)}
          movie={{
            posterPath: ratingMovieEntry.posterPath,
            year: ratingMovieEntry.releaseDate ? ratingMovieEntry.releaseDate.slice(0, 4) : "",
            runtime: ratingMovieEntry.runtimeMinutes,
          }}
          manual={movieRatingRecords.get(ratingMovieEntry.movieId) ?? null}
          cast={ratingMovieCast}
          backdropPath={ratingMovieEntry.backdropPath}
          logoUrl={null}
          movieGenre={ratingMovieEntry.genre}
          initialEditing={!movieRatingRecords.get(ratingMovieEntry.movieId)}
          onClose={() => setRatingMovieEntry(null)}
          onSave={async (payload) => {
            if (!user) return;
            await saveMovieRating(user.id, ratingMovieEntry.movieId, payload);
            setMovieRatingMap((prev) => new Map(prev).set(ratingMovieEntry.movieId, payload.rating));
            setMovieRatingRecords((prev) => new Map(prev).set(ratingMovieEntry.movieId, { movieId: ratingMovieEntry.movieId, ...payload, savedAt: new Date() }));
          }}
          onDelete={async () => {
            if (!user) return;
            await deleteMovieRating(user.id, ratingMovieEntry.movieId);
            setMovieRatingMap((prev) => { const next = new Map(prev); next.delete(ratingMovieEntry.movieId); return next; });
            setMovieRatingRecords((prev) => { const next = new Map(prev); next.delete(ratingMovieEntry.movieId); return next; });
          }}
        />
      )}

      {/* Persistent bulk-action bar — REPLACES the global FloatingNav at
          this same bottom screen position for as long as bulk select is on
          (see the useNavVisibility effect above, which hides FloatingNav
          for exactly this window), rather than floating a second fixed
          bottom element alongside it. zIndex 60 only needs to clear this
          page's own menuForEntry backdrop/popup (z-40/z-50) above — it no
          longer has to out-rank FloatingNav, since FloatingNav isn't
          mounted at all while this is showing. Same bar for both actions,
          just re-labeled/re-colored per bulkMode: "Remove" hides these from
          Highlights only (see hideFromHighlights) — the episodes stay
          watched everywhere else. "Change" opens the shared Watch Date
          sheet below instead of applying anything directly. */}
      {bulkMode && (
        <div
          className="fixed left-0 right-0 flex items-center justify-between"
          style={{ bottom: 0, zIndex: 60, padding: "12px 16px calc(env(safe-area-inset-bottom, 0px) + 12px)", background: "rgba(10,10,12,0.97)", borderTop: `1px solid ${t.glassBorder}`, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}
        >
          <button onClick={cancelBulkSelect} style={{ fontSize: 13.5, fontWeight: 600, color: t.textDim, padding: "10px 16px" }}>Cancel</button>
          {bulkMode === "remove" ? (
            <button
              onClick={confirmBulkRemove}
              disabled={bulkSelectedIds.size === 0 || bulkBusy}
              className="rounded-full active:scale-95 transition"
              style={{ padding: "12px 22px", background: "#e0567a", opacity: (bulkSelectedIds.size === 0 || bulkBusy) ? 0.5 : 1 }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "#fff" }}>
                {bulkBusy ? "Removing…" : `Remove (${bulkSelectedIds.size} item${bulkSelectedIds.size === 1 ? "" : "s"})`}
              </span>
            </button>
          ) : (
            <button
              onClick={() => setBulkDateSheetOpen(true)}
              disabled={bulkSelectedIds.size === 0 || bulkBusy}
              className="rounded-full active:scale-95 transition"
              style={{ padding: "12px 22px", background: accent, opacity: (bulkSelectedIds.size === 0 || bulkBusy) ? 0.5 : 1 }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1a1108" }}>
                {bulkBusy ? "Updating…" : `Change (${bulkSelectedIds.size} item${bulkSelectedIds.size === 1 ? "" : "s"})`}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Bulk Watch Date sheet — components/WatchDateSheet for TV,
          components/MovieWatchDateSheet for movies (bulkMediaType ===
          "movie") — full precision parity between the two now, both
          opened from here with a neutral "today" seed instead of one
          specific entry's stored value (see bulkSeedEntry above).
          confirmBulkDateChange/confirmBulkMovieDateChange apply the
          result to every selected entry, re-deriving Release date/Release
          month per entry from its own real air/release date. */}
      {bulkDateSheetOpen && (
        bulkMediaType === "movie" ? (
          <MovieWatchDateSheet
            current={{ watchDatePrecision: "day", watchedOn: bulkTodayStr, watchedYear: bangkokNow.year, watchedMonth: bangkokNow.month, watchDateSource: null }}
            movieReleaseDate={bulkSeedEntry?.releaseDate ?? null}
            onClose={() => setBulkDateSheetOpen(false)}
            onSave={confirmBulkMovieDateChange}
          />
        ) : (
          <WatchDateSheet
            current={{ watchDatePrecision: "day", watchedOn: bulkTodayStr, watchedYear: bangkokNow.year, watchedMonth: bangkokNow.month, watchDateSource: null }}
            episodeAirDate={bulkSeedEntry?.episodeAirDate ?? null}
            onClose={() => setBulkDateSheetOpen(false)}
            onSave={confirmBulkDateChange}
          />
        )
      )}
    </div>
  );
}
