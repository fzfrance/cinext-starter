# Cinext mobile restoration and removal audit — September 8, 2026

The user's last known good period was September 7 evening. The closest Git baseline is `1d5ff1e`, committed at 18:25:27 Bangkok time. This identifies a source baseline; the corresponding live deployment was not independently verified.

## What caused the design drift

`925a52e` at 22:06 changed 84 files (18,722 additions, 2,545 deletions). Despite its desktop Library title, it changed Home, Highlights, Library, Show/Movie Detail, rating flows, and shared poster/DVD components. `df21eda` and subsequent restoration commits then changed the CSS and JSX again. This was a shared-source regression, not merely a viewport or browser-cache problem.

Examples against the evening baseline:

- Mobile Home lost its In Progress “See All” entry in favor of the desktop toggle; Upcoming and Upcoming Movies were combined.
- Collection artwork changed from the original 140px cover treatment to a 104px PosterCard default, with different title and shared-badge treatment.
- Shared DVD cases and rating flows changed their visual treatment.
- Highlights' replacement mobile CSS used `!important` for personality backgrounds, spacing, border radii and typography. Restoring the JSX alone still left these later declarations overriding the original inline design.
- Show Detail's shared presentation and controls changed alongside its new desktop layout.

## Restoration approach

The four affected routes select exactly one client implementation at the established 900px breakpoint. Their September 7 mobile implementations and 37 reachable component snapshots live separately from the existing desktop implementations. Original markup, inline colors, copy, dimensions, and interactions are retained. The original global CSS is restored below 900px, including its own touch-tablet adaptation; the superseded Highlights approximation block is removed.

Authentication, Supabase access, TMDB access, data helpers, and providers remain shared and current. Mobile Home/Highlights use the current shared caches and invalidation event. Presentation copies deliberately cost some source duplication: future shared behavior fixes must use lib/ where possible, and changes to either UI tree need separate review. Dynamic imports avoid mounting two sets of effects/data requests.

`MOBILE_RESTORATION_MANIFEST.json` lists the baseline and restored files. JSX reference tests compare the entire rendered source tree, including literal text and inline styling, against Git. This is source fidelity evidence, not a screenshot comparison.

## Removal findings and repair

1. Deployed `a5be05b` used `Promise.allSettled` for dependent cleanup, logged failures, and still deleted `user_shows`. That permitted orphaned watch history. Existing uncommitted code had already made watches/skips mandatory; those fixes are preserved.
2. Component-local promise chains did not coordinate with other screens. The shared per-user/show mutation queue now drains already-scheduled watch/skip/status writes before reset, blocks new writes during reset, and invalidates pending Completed/reconciliation computations using a generation check.
3. Restored mobile Show Detail drains its own pending chains before Remove and ignores pre-reset hydration responses. Desktop Show Detail clears its local state only after success; failures no longer immediately paint a successful removal.
4. Watch and library deletion results are checked with exact counts. Missing counts and remaining rows are failures. Reviews/ratings cleanup failures also propagate instead of claiming a full reset succeeded.
5. Home/Highlights caches are invalidated even after partial failure. Favorites refreshes its state. Storage events notify other browser tabs; they do not carry watch history or credentials.
6. Watchlist progress clearing uses the reset barrier and changes status only after watches/skips are cleared.

A numeric route string is not by itself proof of a PostgREST mismatch: numeric strings are normally coerced by the database API. ID normalization is retained as validation, not presented as the established root cause.

## Verification and limits

- 15 automated tests pass: 5 source-baseline fidelity tests and 10 removal/queue failure/race tests. Run `node --test tests/*.test.mjs` from the project.
- Production build passes when network access permits the existing TMDB prerender reads. Initial sandbox-only build compiled but failed on TMDB DNS.
- The original project's dev server and `.next` directory were left untouched; builds ran in the isolated investigation copy.
- Browser-control startup failed twice. Phone/tablet/desktop screenshots and signed-in interaction checks remain unverified. Do not describe this as visually approved or verified in production.
- No production deployment, database migration, or deletion of real watch history was performed.
- The browser queue is per-tab. Storage broadcasts refresh views but do not make writes from different devices atomic. A database transaction/RPC is the appropriate follow-up if simultaneous cross-device writes must be guaranteed. Sequential client cleanup can partially succeed before a later permission failure; the patch reports that failure and refreshes state.
- Actual live Supabase DELETE policies and historical orphan rows were not audited with an authenticated session. The patch cannot retroactively infer which missing-library shows the user previously intended to remove. No historical data is bulk-deleted.

## Next live checks before release

At 390px, 768px touch and desktop widths, compare Home, Highlights (TV+movie, movie-only, year-only, empty), Library (all view modes and collections), and Show Detail against the evening design. With a disposable test show, exercise Completed → Remove, episode mark → Remove, a failed deletion, reload/re-add, and navigation back to Home/Highlights. Re-add must show zero watched/skipped episodes and no saved season ratings. Use a test account for destructive checks.
