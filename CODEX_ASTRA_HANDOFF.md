# Codex Astra handoff — Cinext desktop web

This document is a current-state handoff for desktop-web work, with Highlights as the next priority. It is intentionally descriptive: do not treat it as authorization to redesign unrelated pages.

## Scope and guardrails

- Desktop web means the existing `@media (min-width: 900px)` rules in `app/globals.css`.
- Preserve the phone/tablet/PWA layout unless a change is explicitly shared and visually neutral on those breakpoints.
- Keep the existing TMDB/Supabase data model and existing recommendation/watch-state logic. Prefer the smallest desktop-only CSS/component change.
- The worktree is intentionally dirty from prior product work. Do not reset, clean, or discard unrelated changes.
- Do not run `npm run build` while the dev server is running; this has caused stale `.next` chunk 404s in this project.

## Desktop application shell

`app/layout.jsx` wraps the authenticated app in `AuthProvider`, `RequireAuth`, favorites/customization providers, navigation providers, `DesktopSearchProvider`, and `DesktopGlobalNav`.

`components/ui/DesktopGlobalNav.jsx` is the desktop top navigation. It is rendered by the root layout, not by individual tab pages. Current routes are `/home` (See Next), `/explore`, `/library`, `/highlights`, and `/profile`; Search navigates to `/search`. It hides itself on `/login`, `/signup`, and `/search` (the search page owns its own field).

`components/ui/FloatingNav.jsx` remains the mobile/tablet bottom liquid-glass nav. Desktop CSS hides that shell and shows the top nav. Do not add a second desktop nav inside a tab page.

The desktop breakpoint and global nav styles are near the top of `app/globals.css`; the desktop Explore rules are near the later `@media (min-width: 900px)` section.

## Explore state (reference only; do not redesign for this handoff)

- Server/data entry: `app/(tabs)/explore/page.jsx` calls `getExploreData()` and fetches TMDB provider data.
- Client layout/state: `app/(tabs)/explore/ExploreClient.jsx`.
- Desktop components in that file include `ExploreDesktopLayout`, `HeroTitleLogo`, and `DesktopShelf`.
- Current desktop ordering is hero, For You, Streaming Services, Top 10 TV Shows, Top 10 Movies. The mobile layout is separate and hidden on desktop.
- For You uses the existing personalized flow (`getUserShows`, `getUserMovies`, and `/api/shows/recommended-for-you`), not arbitrary random content. An empty result can be legitimate when there are no recommendation seeds.
- Desktop poster shelves are single horizontal flex rows (`.explore-desktop-poster-row`) with no wrapping. Existing poster status/favorite badges and hero actions should be reused.

Provider-brand work is separate from Highlights. Before adding provider assets, inspect the existing PWA/public assets and keep TMDB provider IDs as the source of truth; use a centralized mapping and TMDB `logo_path` fallback rather than colored placeholder blocks.

## Sign-in page (reference only)

Desktop sign-in is in `app/login/LoginClient.jsx` with `app/login/page.jsx`, `components/ui/AuthPosterBackground.jsx`, and relevant `.auth-*` rules in `app/globals.css`. It is a static, non-scrollable desktop composition with a non-clickable auth nav. Email uses Supabase `signInWithPassword`; Google uses `signInWithOAuth`; preserve those real handlers.

## Highlights: exact current hierarchy

Primary page: `app/(tabs)/highlights/page.jsx` (client component). Calculation helpers: `lib/highlights.js`. Supporting data modules include `lib/episodeWatches.js`, `lib/userMovies.js`, `lib/movieRatings.js`, `lib/myRatings.js`, `lib/watchDate.js`, `lib/bangkokDate.js`, and `lib/languages.js`.

At render time the page is structured as:

1. `.highlights-page` root and top header/year selector.
2. Month selector row.
3. Year loading/error/empty states.
4. For a ready year: month loading/error/empty states, then the monthly overview (`.highlights-overview`) containing hours, four summary stats (Episodes, Shows, Movies, Rewatched), and the TV personality card when available.
5. Top Shows and Top Genres in `.highlights-tops-primary`, then Top Movies in `.highlights-tops-movies`.
6. Year-only precision watches (`yearOnlyEntries`) render independently of the selected month.
7. Watch History (`.highlights-history`) contains the calendar, selected-day detail, long-press row menu, bulk actions, rating flows, and date sheets.

Important interactive children: `EpisodeRatingFlow`, `WatchDateSheet`, `MovieWatchDateSheet`, `MovieRatingScreen`, `PosterArt`, `GenreTagRow`, and `Icon`.

## Highlights data/state flow

- Auth comes from `useAuth()`; unauthenticated users get the sign-in prompt.
- `bangkokNow = getBangkokNow()` is recalculated per render. The default year/month are Bangkok current year/month.
- `availableYears` comes from `getWatchedYears(user.id)` and always includes the current year.
- `yearRows` comes from `getWatchedEpisodesForYear(user.id, year)`; `yearStatus` is `loading | ready | empty | error`.
- `yearMovieRows` comes independently from `getUserMoviesWatchedInYear(user.id, year)`. Movie-only activity promotes an otherwise empty TV year to an effective ready state.
- Month TV entries are derived from year rows and enriched through `POST /api/shows/watch-entries` with the selected year/month rows.
- Month movie entries are enriched through `GET /api/movies/batch?ids=...`.
- Movie ratings load through `getAllMovieRatingsForUser(user.id)`; season ratings use `resolveSeasonRatings`.
- A per-user/year/month `highlightsSessionCache` seeds state to avoid blank transitions, then effects refresh data. Visibility/pageshow listeners silently refresh when appropriate.
- `computeTopShows`, `computeTopMovies`, `computeTopGenres`, `computeRewatchCount`, and `computePersonality` in `lib/highlights.js` are pure aggregators. Do not put network/timezone logic there.
- Watch date edits patch local year rows and available years; removing/hiding history also updates the local derived state. Keep media type keys distinct (`movie-${movieId}` vs episode row id).

## Desktop Highlights guidance

There is no separate desktop Highlights component today; the page uses one JSX tree plus Highlights CSS. Any desktop redesign should add scoped rules/components under the desktop breakpoint and preserve existing mobile behavior. Reuse the page’s already-computed values instead of issuing duplicate TMDB/Supabase requests. The likely safe seam is adding desktop presentation classes around the existing overview/top/history sections, not rewriting fetch effects.

Before changing anything, reproduce the requested desktop issue at `/highlights`, inspect the browser console/network, and identify whether the problem is data state (`yearStatus`/`monthStatus`), layout CSS, or a breakpoint override. Verify year-only and movie-only cases as well as a normal TV+movie month.

## Known server/dev pitfall

Multiple Next dev processes or a build during dev can leave a stale `.next` manifest and make refresh/navigation look “broken.” Clean recovery is:

```sh
kill duplicate Next processes
rm -rf /Users/phonlakritlapjaturapit/Cinext/cinext-starter/.next
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Only remove the project’s `.next` directory. Do not reset the repository.

## Recent deployed context

### Mobile Highlights restoration — deployed 2026-09-08

- Root cause verified against the public production bundle: the mobile Highlights JSX was present, but the mobile Highlights CSS rules were absent from the served CSS. Therefore hard refreshes could not change the broken composition; this was not a client-cache problem.
- Restored mobile-only rules in `app/globals.css` under `@media (max-width: 899px)`, including the original ordering and styling for hours watched, personality card, stat widgets, top shelves, calendar, and watch-history cards. Desktop rules remain isolated under the existing desktop breakpoints.
- Build passed with `npm run build`.
- Commit: `6f3dbdd` (`Restore mobile Highlights styling`).
- Production deployment: Vercel deployment `6322181500`, status `success`; public alias is `https://cinext-starter.vercel.app`.
- Live verification fetched `/highlights` and confirmed the served CSS contains the restored selectors, including `.highlights-hours-stack,.highlights-stat-widget{display:contents}` and the mobile `.highlights-summary-stats` rules.
- No Astra handoff tool/connector was available in the session; this document is the handoff artifact.

- Commit `9c720c2` removed Crime/Drama from Explore Library filter chips.
- Commit `4aa2181` removed Crime/Drama from actual Library genre shelves in `lib/library.js` (`GENRE_PRIORITY`), and was deployed successfully at `https://cinext-starter-f2gpuudmf-fzfrances-projects.vercel.app`.
- The current worktree may contain newer uncommitted desktop/UI work; inspect `git status` and the actual files before assuming deployed behavior.

## First task recommendation for Astra

Start with a read-only audit of `/highlights` on a desktop viewport: document the desired visual/functional change, map it to the existing section/classes above, and propose the smallest scoped patch. Do not modify Explore, recommendation logic, navigation, auth, provider mapping, or server configuration while working on Highlights.
