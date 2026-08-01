# Cinext

A premium TV series tracking app. This is the real Next.js scaffold —
the prototype screens (17 `.jsx` files) get migrated in one at a time
from here.

## Setup

```bash
npm install
cp .env.local.example .env.local
```

Fill in `.env.local`:

1. **TMDB** — free account at https://www.themoviedb.org/settings/api,
   grab the "API Read Access Token."
2. **Supabase** — free project at https://supabase.com. Copy the Project
   URL and anon key from Settings > API. Then open the SQL Editor and run
   everything in `supabase/schema.sql` once, to create the tables.

```bash
npm run dev
```

Open http://localhost:3000 — it redirects to `/home`. Every tab and route
already exists as a placeholder page, so the app runs and is fully
navigable from the very first `npm run dev`, before any screen is migrated.

To try it on your phone: with your Mac and phone on the same wifi, visit
`http://<your-mac's-local-ip>:3000` from your phone's browser, then
"Add to Home Screen" — that installs it as a real PWA icon.

## What's already built

- **All 17 prototype screens are migrated** — every route and shared
  component in the checklist below is real, not a placeholder. The app is
  fully navigable end to end. What's left is wiring real TMDB/Supabase
  data in behind the UI (see the `TODO` comments throughout each page)
  and building the global `ThemeProvider` noted in `settings/page.jsx`.
- `lib/theme.js` — the design token system (colors, themes, accent palette),
  extracted from the prototype so it's declared once instead of per-file.
- `lib/tmdb.js` — TMDB fetch helpers (search, show/season/episode details,
  cast, image URLs).
- `lib/supabase.js` — Supabase client.
- `supabase/schema.sql` — starter Postgres schema: `user_shows`,
  `episode_watches`, `season_reviews`, `collections`, `collection_shows`,
  with row-level security so data is private per user.
- `components/ui/` — shared `Icon` (grew to cover every icon used across
  all 17 screens), `GlassCircle`, `Grain`, `PageHeader`, `PosterArt`
  (renders real TMDB art, falls back to the gradient style).
- `components/` — shared full-screen sheets opened from multiple places:
  `EpisodeRatingFlow`, `SeasonReview`, `CastProfile`. Each is mounted by
  its caller (`{condition && <Sheet ... />}`), not by an internal `open`
  prop.
- `app/(tabs)/layout.jsx` — the bottom tab bar (Home / Explore /
  Highlights / Profile).
- Every route below is a real migrated page — the whole nav works,
  nothing 404s.

## Migration checklist

Work through these one at a time in Claude Code. For each: open the
prototype file (bring it into the project), drop the fixed 390×844
phone-frame wrapper div, swap local `Icon`/`GlassCircle`/`Grain`/theme
constants for the shared ones in `components/ui/` and `lib/theme.js`,
replace hardcoded sample data with real TMDB/Supabase calls, and paste
the result into the matching placeholder page below.

Two files (`show_detail.jsx`, `episode_rating_flow.jsx`,
`season_review.jsx`) had duplicate inline copies of features that exist
as their own standalone files — use the standalone versions as canonical
and delete the inline duplicates when migrating `show_detail.jsx`.

- [x] `home_dashboard.jsx` → `app/(tabs)/home/page.jsx`
- [x] `explore_page.jsx` → `app/(tabs)/explore/page.jsx`
- [x] `browse_by_year.jsx` → `app/(tabs)/explore/browse/year/page.jsx`
- [x] `browse_by_genre.jsx` → `app/(tabs)/explore/browse/genre/page.jsx`
- [x] `browse_by_platform.jsx` → `app/(tabs)/explore/browse/platform/page.jsx`
- [x] `highlights.jsx` → `app/(tabs)/highlights/page.jsx`
- [x] `profile.jsx` → `app/(tabs)/profile/page.jsx`
- [x] `edit_profile.jsx` → `app/(tabs)/profile/edit/page.jsx`
- [x] `favorites.jsx` → `app/(tabs)/profile/favorites/page.jsx`
- [x] `collections.jsx` → `app/(tabs)/profile/collections/page.jsx` +
      `app/(tabs)/profile/collections/[id]/page.jsx` (split list vs. detail)
- [x] `settings.jsx` → `app/(tabs)/profile/settings/page.jsx`
- [x] `show_detail.jsx` → `app/show/[id]/page.jsx` (thin out — see note above)
- [x] `episode_detail.jsx` → `app/show/[id]/episode/[season]/[ep]/page.jsx`
- [x] `cast_profile.jsx` → `components/CastProfile.jsx` (shared component,
      opened from show detail)
- [x] `episode_rating_flow.jsx` → `components/EpisodeRatingFlow.jsx`
      (shared sheet, opened from Home hero card + show detail)
- [x] `season_review.jsx` → `components/SeasonReview.jsx` (shared sheet,
      opened from show detail)

## Deploying

Push to GitHub, then import the repo at https://vercel.com/new — add the
same env vars from `.env.local` in the Vercel project settings. Every
push to `main` deploys automatically.
