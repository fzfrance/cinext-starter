// ---------------------------------------------------------------------------
// Highlights calculation helpers
// ---------------------------------------------------------------------------
// Pure, deterministic aggregation over an already-fetched month of watch
// data — no Supabase/TMDB calls in here, no Date.now()/timezone logic
// (that stays in app/(tabs)/highlights/page.jsx, which already has the
// established Asia/Bangkok date-bucketing pattern; callers attach a
// `dayKey` — a Bangkok calendar-day string — to each entry before calling
// into this module, so there's exactly one place in the app that does
// timezone math, not two).
//
// Every function here takes the same two shapes as input:
//   entries   — this month's watched episodes, enriched via
//               /api/shows/watch-entries: { showId, showTitle, posterPath,
//               genres: string[], runtimeMinutes, watchedAt, dayKey,
//               seasonEpisodeCount, season }
//   monthRows — the raw episode_watches rows for the month (from
//               getWatchedEpisodesForYear, filtered client-side to the
//               selected month): { tmdb_show_id, season_number,
//               episode_number, watched_at }. Kept separate from `entries`
//               because rewatch counting needs every raw watch *event*
//               row, not the deduplicated-by-episode entries list.

// TMDB TV genre -> Icon.jsx name. Cosmetic only, and intentionally not
// one-icon-per-genre — several genres reuse the closest fit. Anything not
// listed (a genre TMDB adds later, an unusual show) falls back to
// "layers", the same generic genre icon Show Detail's Genres row uses.
const GENRE_ICON = {
  "Action & Adventure": "flame",
  Animation: "sparkle",
  Comedy: "sun",
  Crime: "warning",
  Documentary: "camera",
  Drama: "heart",
  Family: "home",
  Kids: "sparkle",
  Mystery: "search",
  News: "info",
  Reality: "tv",
  "Sci-Fi & Fantasy": "sparkle",
  Soap: "heart",
  Talk: "info",
  "War & Politics": "flame",
  Western: "sun",
};
export function genreIcon(genre) {
  return GENRE_ICON[genre] ?? "layers";
}

// TMDB TV genre -> real emoji, for Highlights' Top Genres tags specifically
// (GenreTag's optional `emoji` prop — see components/GenreTag.jsx — falls
// back to the SVG icon above everywhere else, e.g. Show Detail's genre
// chips, that don't pass one). Keyed on TMDB's actual TV genre strings —
// TV and movie genres are different lists on TMDB; there's no standalone
// "Thriller"/"Sci-Fi"/"Horror"/"Fantasy"/"Romance" genre for TV shows, so
// a couple of picks below are the closest real TV equivalent instead
// (Sci-Fi + Fantasy are one combined TV genre; Soap is the closest TV
// genre to "Romance").
const GENRE_EMOJI = {
  "Action & Adventure": "🔥",
  Animation: "🎨",
  Comedy: "😄",
  Crime: "🚨",
  Documentary: "🎥",
  Drama: "🎭",
  Family: "🏠",
  Kids: "🧸",
  Mystery: "🔍",
  News: "📰",
  Reality: "📹",
  "Sci-Fi & Fantasy": "🚀",
  Soap: "💕",
  Talk: "🎙️",
  "War & Politics": "⚔️",
  Western: "🤠",
};
export function genreEmoji(genre) {
  return GENRE_EMOJI[genre] ?? "🎬";
}

// TMDB TV genre -> accent hex, for GenreTag's one-color-per-genre design.
// Fallback matches DEFAULT_ACCENT (lib/theme.js) so an unlisted genre still
// reads as "on brand" rather than a jarring one-off.
const GENRE_COLOR = {
  "Action & Adventure": "#e0567a",
  Animation: "#a985e8",
  Comedy: "#FACC15",
  Crime: "#e0567a",
  Documentary: "#6fb4ee",
  Drama: "#E8A24C",
  Family: "#8FBF8A",
  Kids: "#a985e8",
  Mystery: "#6fb4ee",
  News: "#9B9BA3",
  Reality: "#8FBF8A",
  "Sci-Fi & Fantasy": "#a985e8",
  Soap: "#e0567a",
  Talk: "#9B9BA3",
  "War & Politics": "#e0567a",
  Western: "#FACC15",
};
export function genreColor(genre) {
  return GENRE_COLOR[genre] ?? "#E8A24C";
}

// Ranks shows by total minutes watched (1), episode count as a tie-break
// (2), then most recent activity as the final tie-break (3) — exactly the
// three-level sort requested, applied in that literal order so an actual
// tie at level 1 always falls through to level 2, and a tie at both only
// then falls through to level 3.
export function computeTopShows(entries, limit = 3) {
  const byShow = new Map();
  for (const e of entries) {
    const bucket = byShow.get(e.showId) ?? {
      showId: e.showId,
      title: e.showTitle,
      // Carried through (not derived) so callers can run each result
      // through resolveTitle (lib/languages.js) themselves, same as every
      // other show list in the app — this function doesn't know the
      // viewer's Readable Languages, only the show's own real fields.
      originalTitle: e.originalTitle ?? null,
      originalLanguage: e.originalLanguage ?? null,
      posterPath: e.posterPath,
      totalMinutes: 0,
      episodeCount: 0,
      lastWatchedAt: e.watchedAt,
    };
    bucket.totalMinutes += e.runtimeMinutes || 0;
    bucket.episodeCount += 1;
    if (new Date(e.watchedAt) > new Date(bucket.lastWatchedAt)) bucket.lastWatchedAt = e.watchedAt;
    byShow.set(e.showId, bucket);
  }

  return [...byShow.values()]
    .sort((a, b) =>
      b.totalMinutes - a.totalMinutes ||
      b.episodeCount - a.episodeCount ||
      new Date(b.lastWatchedAt) - new Date(a.lastWatchedAt)
    )
    .slice(0, limit)
    .map((s) => ({ ...s, hours: Math.round((s.totalMinutes / 60) * 10) / 10 }));
}

// Percentages of total watched minutes, per genre — not raw library
// membership. A show with multiple genres has its runtime split *evenly*
// across them (the explicitly preferred option over crediting the full
// runtime to every genre, which would inflate totals past 100%). Shows
// with no genre data from TMDB are skipped rather than guessed at.
export function computeTopGenres(entries, limit = 3) {
  const totalMinutes = entries.reduce((sum, e) => sum + (e.runtimeMinutes || 0), 0);
  if (totalMinutes === 0) return [];

  const byGenre = new Map();
  for (const e of entries) {
    const genres = e.genres ?? [];
    if (genres.length === 0) continue;
    const share = (e.runtimeMinutes || 0) / genres.length;
    for (const g of genres) {
      byGenre.set(g, (byGenre.get(g) ?? 0) + share);
    }
  }

  return [...byGenre.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([genre, minutes]) => ({
      genre,
      icon: genreIcon(genre),
      emoji: genreEmoji(genre),
      color: genreColor(genre),
      percent: Math.round((minutes / totalMinutes) * 100),
    }));
}

// Every episode_watches row beyond the chronologically-first one for the
// same (show, season, episode) is a real rewatch — the table already
// stores one row per watch *event* (see supabase/schema.sql), so this is
// counting, not estimating.
export function computeRewatchCount(monthRows) {
  const byEpisode = new Map();
  for (const r of monthRows) {
    const key = `${r.tmdb_show_id}-${r.season_number}-${r.episode_number}`;
    if (!byEpisode.has(key)) byEpisode.set(key, []);
    byEpisode.get(key).push(r.watched_at);
  }
  let rewatches = 0;
  for (const watches of byEpisode.values()) {
    if (watches.length > 1) rewatches += watches.length - 1;
  }
  return rewatches;
}

const PERSONALITIES = {
  completionist: { icon: "trophy", emoji: "🏆", name: "Completionist", description: "You enjoy seeing stories through to the end and rarely leave shows unfinished." },
  bingeWatcher: { icon: "flame", emoji: "🔥", name: "Binge Watcher", description: "Once you're hooked, it's hard to stop. You love immersive marathon sessions." },
  explorer: { icon: "globe", emoji: "🌍", name: "Explorer", description: "You're always exploring something new, whether it's a different culture, language, or genre." },
  comfortRewatcher: { icon: "refresh", emoji: "📺", name: "Comfort Rewatcher", description: "Some stories are worth revisiting. You find comfort in returning to your favorite shows." },
  slowBurner: { icon: "clock", emoji: "⏳", name: "Slow Burner", description: "You took it easy this month, watching at your own pace without rushing through your watchlist." },
  allRounder: { icon: "sparkle", emoji: "✨", name: "All-Rounder", description: "You balanced multiple viewing styles this month." },
};

// One deterministic, centralized classifier. Four independent criteria
// are each checked as a plain true/false (not a top-to-bottom "first
// match wins" chain — that's what the old version did, but it can't
// express "qualified for 2+ personalities" at all), then:
//   2+ criteria true  -> All-Rounder
//   exactly 1 true    -> that personality
//   none true         -> Slow Burner (the catch-all "took it easy" case)
export function computePersonality({ entries, monthRows }) {
  if (entries.length === 0) return null;

  // --- Completionist: finished more than 2 seasons this month. A
  // completed season that happens to be a show's last one already *is*
  // finishing the show, so there's no separate "shows finished" tally
  // needed on top of this — same seasonEpisodeCount-based completion
  // check as before, just a stricter threshold ("more than 2" = 3+,
  // was >= 2). ---
  const seasonWatchedCounts = new Map();
  const seasonTotals = new Map();
  for (const e of entries) {
    const key = `${e.showId}-${e.season}`;
    seasonWatchedCounts.set(key, (seasonWatchedCounts.get(key) ?? new Set()).add(e.episode));
    if (e.seasonEpisodeCount) seasonTotals.set(key, e.seasonEpisodeCount);
  }
  let completedSeasons = 0;
  for (const [key, watchedSet] of seasonWatchedCounts) {
    const total = seasonTotals.get(key);
    if (total && watchedSet.size >= total) completedSeasons += 1;
  }
  const isCompletionist = completedSeasons > 2;

  // --- Binge Watcher: more than 5 episodes OR more than 5 hours in the
  // single busiest day this month. Month-precision entries carry no
  // dayKey (never invented — see episode_watches' schema comment) and
  // are excluded from both tallies: an "undefined" bucket lumping every
  // month-precision entry into one fake busiest-day would misfire this
  // check on entries that were never actually watched on the same real
  // day, or any day at all. ---
  const dayEpisodeCount = new Map();
  const dayMinutes = new Map();
  for (const e of entries) {
    if (!e.dayKey) continue;
    dayEpisodeCount.set(e.dayKey, (dayEpisodeCount.get(e.dayKey) ?? 0) + 1);
    dayMinutes.set(e.dayKey, (dayMinutes.get(e.dayKey) ?? 0) + (e.runtimeMinutes || 0));
  }
  const busiestDayEpisodes = Math.max(0, ...dayEpisodeCount.values());
  const busiestDayMinutes = Math.max(0, ...dayMinutes.values());
  const isBingeWatcher = busiestDayEpisodes > 5 || busiestDayMinutes > 5 * 60;

  // --- Explorer: 2+ shows from different countries/languages this
  // month, OR more than 3 distinct genres. Resolved per SHOW, not per
  // entry — a single co-produced show can carry more than one country in
  // TMDB's own origin_country array, and counting every value in that
  // array directly would let one show alone (re)watched several times
  // satisfy "2 shows from different countries," which isn't what the
  // rule means. Each show's first listed country stands in as "the"
  // country for that show; original_language is already a single scalar
  // so it needs no such reduction. ---
  const showOrigin = new Map();
  for (const e of entries) {
    if (!showOrigin.has(e.showId)) {
      showOrigin.set(e.showId, { country: e.originCountry?.[0] ?? null, language: e.originalLanguage ?? null });
    }
  }
  const distinctCountries = new Set([...showOrigin.values()].map((o) => o.country).filter(Boolean));
  const distinctLanguages = new Set([...showOrigin.values()].map((o) => o.language).filter(Boolean));
  const genreSet = new Set(entries.flatMap((e) => e.genres ?? []));
  const isExplorer = distinctCountries.size >= 2 || distinctLanguages.size >= 2 || genreSet.size > 3;

  // --- Comfort Rewatcher: rewatched episodes outnumber first-time
  // watches this month. computeRewatchCount is already scoped to
  // monthRows (this month's own rows only, not lifetime), so
  // "first-time watched" is symmetrically scoped the same way: every
  // monthRows entry that ISN'T a rewatch, within this same month. ---
  const rewatchCount = computeRewatchCount(monthRows);
  const firstTimeCount = monthRows.length - rewatchCount;
  const isComfortRewatcher = rewatchCount > firstTimeCount;

  const matchCount = [isCompletionist, isBingeWatcher, isExplorer, isComfortRewatcher].filter(Boolean).length;

  if (matchCount >= 2) return PERSONALITIES.allRounder;
  if (isCompletionist) return PERSONALITIES.completionist;
  if (isBingeWatcher) return PERSONALITIES.bingeWatcher;
  if (isExplorer) return PERSONALITIES.explorer;
  if (isComfortRewatcher) return PERSONALITIES.comfortRewatcher;
  return PERSONALITIES.slowBurner;
}
