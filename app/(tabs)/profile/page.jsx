"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import Grain from "@/components/ui/Grain";
import GlassCircle from "@/components/ui/GlassCircle";
import PosterCard from "@/components/ui/PosterCard";
import PosterQuickStatusMenu from "@/components/ui/PosterQuickStatusMenu";
import PosterArt from "@/components/ui/PosterArt";
import StarInput from "@/components/ui/StarInput";
import { moodMetasFromField } from "@/components/SeasonBanner";
import { useAuth } from "@/lib/auth-context";
import { useFavorites } from "@/lib/favorites-context";
import { useMovieFavorites } from "@/lib/movie-favorites-context";
import { getUserShows } from "@/lib/userShows";
import { getUserMoviesWatchedInYear } from "@/lib/userMovies";
import { getShowWatchSummary, getWatchedEpisodesForYear } from "@/lib/episodeWatches";
import { getMyRatingsForUser } from "@/lib/myRatings";
import { resolveShowStatus } from "@/lib/statusResolver";
import { getCollections } from "@/lib/collections";
import { getProfile } from "@/lib/profile";
import { fallbackPalette, seasonLabel } from "@/lib/library";
import { tmdbImage } from "@/lib/tmdb";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { themes, DEFAULT_ACCENT, collectionPalette } from "@/lib/theme";
import { computeRewatchCount } from "@/lib/highlights";
import { bangkokNow as getBangkokNow } from "@/lib/bangkokDate";
import CollectionBoxSet from "@/components/CollectionBoxSet";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// Two-cover blended backdrop for collection cards — distinct from
// PosterArt's single-cover gradient, no shared equivalent.
function CollectionBackdrop({ covers }) {
  const c1 = covers[0] || { base: "#221a14", glow: accent };
  const c2 = covers[1] || c1;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: `linear-gradient(120deg, ${c1.glow}40 0%, ${c1.base} 45%, ${c2.base} 100%)` }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 25% 30%, ${c1.glow}45, transparent 60%)` }} />
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 80% 70%, ${c2.glow}30, transparent 55%)` }} />
      <Grain />
    </div>
  );
}

// Neutral radial-glow header backdrop — generic, no shared equivalent.
// Renders the user's saved background image (if any) under the same
// gradient/grain treatment, so the empty hero area gets real content
// without changing the existing readable-dark-gradient look when there's
// no image to show. Base gradient and ambient glow are both neutral
// gray/white now (were warm brown + amber) — amber is reserved for
// functional accents (buttons/progress/ratings/active states), not a
// decorative background wash.
function AtmosBackdrop({ imageUrl }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "linear-gradient(160deg, #232323 0%, #17171a 55%, #0a0a0c 100%)" }}>
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- a Storage URL, not a TMDB path PosterArt/next-image is built for
        <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} />
      )}
      <div style={{ position: "absolute", right: -60, top: "10%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)", filter: "blur(20px)" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, #0A0A0C 0%, rgba(10,10,12,0.2) 55%, rgba(0,0,0,0.15) 100%)" }} />
      <Grain />
    </div>
  );
}

export default function Page() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { isFavorite, toggleFavorite, loading: favoritesCtxLoading } = useFavorites();
  const { isFavorite: isMovieFavorite, toggleFavorite: toggleMovieFavorite, favoriteEntries: movieFavoriteEntries, loading: movieFavoritesCtxLoading } = useMovieFavorites();
  const readableLanguages = useReadableLanguages();
  const [library, setLibrary] = useState([]);
  // "Favorite Movies" preview row — a lightweight one-shot fetch keyed on
  // the favorited-id set's own identity, unlike the dedicated Favorites
  // Movies page's incremental sync-diff (app/(tabs)/profile/favorites/
  // movies/page.jsx): this row only ever shows 6 items, so refetching the
  // small batch whenever the set of favorited movie ids changes is simpler
  // and cheap enough not to need that page's more careful diffing.
  const [movieFavorites, setMovieFavorites] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [longPress, setLongPress] = useState(null);
  const [libraryRefreshToken, setLibraryRefreshToken] = useState(0);
  const [collections, setCollections] = useState([]);
  const [profile, setProfile] = useState(null);
  const [monthStats, setMonthStats] = useState(null);
  const [myRatings, setMyRatings] = useState([]);

  // Display name/bio/avatar/background — null (not yet saved) falls back
  // to the account email + decorative gradient placeholders below.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getProfile(user.id).then((p) => { if (!cancelled) setProfile(p); }).catch(console.error);
    return () => { cancelled = true; };
  }, [user]);

  // This-month stats widget — a direct duplicate of Highlights' own four
  // stat cards (episodes/shows/active days/rewatched), same current-month
  // scope Highlights defaults to on open. Deliberately its own small,
  // self-contained fetch rather than reusing Highlights' full state
  // machine (year rows + silent background refresh + retry tokens + TMDB
  // enrichment) — none of that is needed here since every number below
  // only needs the raw episode_watches rows, not enriched show/episode
  // data: uniqueShowCount only needs tmdb_show_id (already on the raw
  // row), activeDayCount only needs watched_on for day-precision rows,
  // and computeRewatchCount (lib/highlights.js) already operates on raw
  // rows directly. null (not []) until loaded so this section doesn't
  // flash a misleading "0" row before the real numbers arrive.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const now = getBangkokNow();
    Promise.all([
      getWatchedEpisodesForYear(user.id, now.year),
      // Independently caught — a movie-side failure must degrade to 0
      // rather than blanking the whole widget row (same reasoning as
      // every other TV+movie merge this session).
      getUserMoviesWatchedInYear(user.id, now.year).catch((err) => { console.error(err); return []; }),
    ]).then(([rows, movieRows]) => {
      if (cancelled) return;
      const monthRows = rows.filter((r) =>
        (r.watch_date_precision === "day" || r.watch_date_precision === "month") &&
        r.watched_year === now.year && r.watched_month === now.month
      );
      // user_movies.watched_on is a plain date column (no watched_year/
      // watched_month columns like episode_watches has) — parse the
      // year/month straight out of the "YYYY-MM-DD" string instead.
      const monthMovies = movieRows.filter((r) => {
        const [y, m] = r.watchedOn.split("-").map(Number);
        return y === now.year && m === now.month;
      });
      setMonthStats({
        shows: new Set(monthRows.map((r) => r.tmdb_show_id)).size,
        movies: monthMovies.length,
        activeDays: new Set(monthRows.filter((r) => r.watch_date_precision === "day").map((r) => r.watched_on)).size,
        rewatched: computeRewatchCount(monthRows),
      });
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [user]);

  // user_shows rows, joined against TMDB for title/poster/progress —
  // library-detail (not the lighter /api/shows/batch) because the
  // *displayed* status must be resolved from real released/watched episode
  // counts (lib/statusResolver.js), the same way Home/Explore/Show Detail
  // all do it — a show can't show "Watchlist" here while its Show Detail
  // page shows "Watched" for the same watch history.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLibraryLoading(true);
    (async () => {
      // repairContradictoryStatuses is intentionally NOT called here — see
      // app/(tabs)/home/page.jsx's identical note. Status is already
      // resolved live below (resolveShowStatus), so this page displays
      // correctly without needing to rewrite the stored value, and a
      // page-load effect must never write to user_shows.
      const byShow = await getUserShows(user.id);
      const ids = Object.keys(byShow).map(Number);
      if (ids.length === 0) { if (!cancelled) { setLibrary([]); setLibraryLoading(false); } return; }

      // Paused/dropped are exempt — resolveShowStatus returns those
      // unconditionally, so there's no need to pay for their progress data.
      const resolvableIds = ids.filter((id) => byShow[id].status !== "paused" && byShow[id].status !== "drop");
      const summary = await getShowWatchSummary(user.id, resolvableIds);

      const res = await fetch("/api/shows/library-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shows: ids.map((id) => ({
            id,
            needsProgress: resolvableIds.includes(id),
            watched: summary[id]?.watchedKeys ?? [],
          })),
        }),
      });
      const { results } = await res.json();
      const byId = Object.fromEntries(results.map((r) => [r.id, r]));

      if (cancelled) return;
      setLibrary(ids.map((id) => {
        const result = byId[id];
        if (!result) return null;
        const resolvedStatus = resolveShowStatus({
          explicitStatus: byShow[id].status,
          watchedReleasedEpisodes: result.watchedReleasedEpisodes ?? 0,
          releasedEpisodes: result.releasedEpisodes ?? 0,
        });
        // Spread byShow[id] first so its raw `status` is overridden by the
        // resolved one below — every downstream filter/count in this file
        // reads `s.status` and must see the resolved value, not the stored one.
        return { id: result.id, title: resolveTitle(result, readableLanguages), posterPath: result.posterPath, genre: result.genre, ...byShow[id], status: resolvedStatus };
      }).filter(Boolean));
      setLibraryLoading(false);
    })().catch((err) => { console.error(err); if (!cancelled) setLibraryLoading(false); });
    return () => { cancelled = true; };
  }, [user, libraryRefreshToken]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getCollections(user.id).then(async (rows) => {
      if (cancelled) return;
      const mapped = rows.map((c, i) => ({
        id: c.id,
        name: c.name,
        coverStyle: c.coverStyle,
        count: c.showIds.length,
        showIds: c.showIds,
        covers: [{ base: collectionPalette[i % collectionPalette.length].c2, glow: collectionPalette[i % collectionPalette.length].c1 }],
      }));
      setCollections(mapped);

      // Only Collector Box Set needs real per-show art (posters/backdrops)
      // — every other style stays the palette-gradient placeholder above.
      const boxsetOnes = mapped.filter((c) => c.coverStyle === "boxset" && c.showIds.length > 0);
      await Promise.all(boxsetOnes.map(async (c) => {
        const res = await fetch(`/api/shows/batch?ids=${c.showIds.slice(0, 8).join(",")}`);
        const { results } = await res.json();
        if (cancelled) return;
        setCollections((prev) => prev.map((p) => (p.id === c.id ? { ...p, covers: results } : p)));
      }));
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [user]);

  // "My Ratings" preview — the first 10 of getMyRatingsForUser's full,
  // most-recent-activity-first list (see lib/myRatings.js, shared with
  // the full "My Ratings" page this section's ">" links to).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyRatingsForUser(user.id)
      .then((entries) => { if (!cancelled) setMyRatings(entries.slice(0, 10)); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [user]);

  // "Favorite Movies" preview row — see movieFavorites' own declaration
  // comment for why this is a simple refetch-on-id-set-change rather than
  // the dedicated Favorites Movies page's more careful incremental sync.
  useEffect(() => {
    if (!user) { setMovieFavorites([]); return; }
    const ids = movieFavoriteEntries.slice(0, 6).map((e) => e.id);
    if (ids.length === 0) { setMovieFavorites([]); return; }
    let cancelled = false;
    fetch(`/api/movies/batch?ids=${ids.join(",")}`)
      .then((res) => res.json())
      .then(({ results }) => {
        if (cancelled) return;
        const addedAtById = Object.fromEntries(movieFavoriteEntries.map((e) => [e.id, e.addedAt]));
        setMovieFavorites(results.map((movie) => ({ ...movie, addedAt: addedAtById[movie.id] })));
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [user, movieFavoriteEntries]);

  if (!loading && !user) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center text-center px-8" style={{ background: t.bg }}>
        <Icon name="user" size={30} color={t.textDim} />
        <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginTop: 14 }}>Sign in to see your profile</div>
        <div style={{ fontSize: 13, color: t.textDim, marginTop: 4 }}>Your library, favorites, and collections live here once you&apos;re signed in.</div>
        <button onClick={() => router.push("/login")} className="rounded-full active:scale-95 transition" style={{ marginTop: 20, padding: "11px 24px", background: accent }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1a1108" }}>Sign In</span>
        </button>
      </div>
    );
  }

  const displayName = profile?.displayName || user?.email || "";
  const bio = profile?.bio ?? "";

  // isFavorite (shared favorites-context), not s.favorite from this page's
  // own getUserShows call — so a toggle made anywhere else in the app
  // (Explore, Collections, the dedicated Favorites screen) is reflected
  // here immediately without this page needing its own refetch.
  const favorites = library.filter((s) => isFavorite(s.id));
  // This row depends on TWO independent fetches resolving — this page's
  // own (heavier, status-resolving) library load and favorites-context's
  // own separate getUserShows call — so it was the one section that stayed
  // visibly empty noticeably longer than My Ratings/Collections (each just
  // their own single fetch) before popping in. A real loading placeholder
  // instead of silently rendering zero cards while waiting on both.
  const favoritesRowLoading = libraryLoading || favoritesCtxLoading;
  const movieFavoritesRowLoading = movieFavoritesCtxLoading;

  return (
    <>
      <div className="relative w-full" style={{ height: 190 }}>
        <AtmosBackdrop imageUrl={profile?.backgroundUrl} />
        <div className="absolute top-0 right-0 flex items-center gap-2 px-6" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <GlassCircle onClick={() => router.push("/profile/settings")} t={t}>
            <Icon name="settings" size={16} color="#fff" />
          </GlassCircle>
        </div>
        {/* Edit Profile moved to Settings > Account — editing now happens
            from there instead of this pill. Activity takes over this same
            slot (frosted-glass pill, same position/size) — a feed +
            notification center entry point. top: 105% (not bottom: ...)
            anchors it just below the backdrop's bottom edge, nudged down
            slightly past it rather than sitting flush — still positioned
            against this same relative container so it doesn't disturb the
            avatar row's own -34px overlap positioning right after it in
            the DOM. Safe from that row's box overlapping it (same
            vertical band the avatar overlaps into) because that row is
            pointerEvents: none. */}
        <button onClick={() => router.push("/profile/activity")} className="absolute flex items-center gap-1.5 rounded-full active:scale-95 transition" style={{ top: "115.5%", right: 20, padding: "7.92px 13.86px", background: t.cardFill, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
          <Icon name="activity" size={13.86} color="#fff" />
          <span style={{ fontSize: 12.375, fontWeight: 600, color: "#fff" }}>Activity</span>
        </button>
      </div>

      {/* pointerEvents: none — nothing here is interactive (plain avatar
          image + name/handle/bio text), but its box is full-width and
          pulled up -34px with zIndex:10 to overlap the backdrop, which
          would otherwise silently swallow taps on the Edit Profile button
          above it (the exact bug already found and fixed on the Edit
          Profile screen itself).
          Avatar on top, name/@handle/bio stacked directly under it (not
          beside it) — @handle only when one's actually set, quietly
          omitted rather than showing a bare "@". */}
      <div className="px-6" style={{ marginTop: -34, position: "relative", zIndex: 10, pointerEvents: "none" }}>
        <div className="overflow-hidden" style={{ width: 76, height: 76, borderRadius: "50%", background: "linear-gradient(135deg,#e8a24c,#5a3420)", border: "3px solid #0A0A0C", flexShrink: 0 }}>
          {profile?.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a Storage URL, not a TMDB path
            <img src={profile.avatarUrl} alt="" className="w-full h-full" style={{ objectFit: "cover" }} />
          )}
        </div>
        <div className="text-left" style={{ marginTop: 10, minWidth: 0 }}>
          <div className="truncate" style={{ fontSize: 20.9, fontWeight: 700, color: "#fff" }}>{displayName}</div>
          {profile?.handle && <div className="truncate" style={{ fontSize: 13.75, color: t.textDim, marginTop: 2 }}>@{profile.handle}</div>}
          <div className="truncate" style={{ fontSize: 13.75, color: t.textDim, marginTop: 2 }}>{bio}</div>
        </div>
      </div>

      {/* This-month stats — duplicated from Highlights' own stat cards
          (same style), so it's a quick at-a-glance summary right on
          Profile without opening Highlights. Episodes dropped (redundant
          with Shows right next to it) and Movies added — Shows, Movies,
          Active Days, Rewatched, per explicit request. */}
      {/* Plain text columns now — no icon, no per-stat card/background.
          Same four stats, same real data, just a big bold number with a
          smaller gray label under it, side by side. */}
      {monthStats && (
        <div className="flex gap-2 px-6" style={{ marginTop: 22 }}>
          {[[monthStats.shows, "Shows"], [monthStats.movies, "Movies"], [monthStats.activeDays, "Active Days"], [monthStats.rewatched, "Rewatched"]].map(([n, l], i) => (
            <div key={i} className="flex-1 flex flex-col items-center text-center">
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{n}</div>
              <div style={{ fontSize: 11, color: t.textDim, marginTop: 3, textAlign: "center", lineHeight: 1.2 }}>{l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Separator between the stats row and Favorites — was just a
          shared 26/28px top margin before, with nothing visually marking
          the two sections apart. */}
      <div style={{ height: 1, background: t.cardBorder, margin: "22px 24px 0" }} />

      <div style={{ marginTop: 22 }}>
        <div className="flex items-center justify-between px-6 mb-3">
          <span style={{ fontSize: 17.25, fontWeight: 600, color: "#fff" }}>Favorite Shows</span>
          <Link href="/profile/favorites"><Icon name="chevronRight" size={18} color={t.textDim} /></Link>
        </div>
        <div className="flex gap-2.5 overflow-x-auto px-6" style={{ scrollbarWidth: "none" }}>
          {favoritesRowLoading ? (
            [0, 1, 2].map((i) => (
              <div key={i} className="flex-shrink-0 rounded-xl" style={{ width: 104, aspectRatio: "2 / 3", background: t.cardFill, border: `1px solid ${t.cardBorder}` }} />
            ))
          ) : (
            // Same heart badge as the Library grid below — every card here
            // is already a favorite by definition, so it's always filled,
            // but still shown for consistency and to let it be unfavorited
            // right from this row.
            favorites.slice(0, 6).map((s) => (
              <PosterCard key={s.id} show={s} href={`/show/${s.id}`} width={104} titlePlacement="overlay" favorite={isFavorite(s.id)} onToggleFavorite={() => toggleFavorite(s.id, "Profile:favoritesRow")} onLongPress={(show, rect) => setLongPress({ show, rect })} />
            ))
          )}
        </div>
      </div>

      <div style={{ marginTop: 26 }}>
        <div className="flex items-center justify-between px-6 mb-3">
          <span style={{ fontSize: 17.25, fontWeight: 600, color: "#fff" }}>Favorite Movies</span>
          <Link href="/profile/favorites/movies"><Icon name="chevronRight" size={18} color={t.textDim} /></Link>
        </div>
        <div className="flex gap-2.5 overflow-x-auto px-6" style={{ scrollbarWidth: "none" }}>
          {movieFavoritesRowLoading ? (
            [0, 1, 2].map((i) => (
              <div key={i} className="flex-shrink-0 rounded-xl" style={{ width: 104, aspectRatio: "2 / 3", background: t.cardFill, border: `1px solid ${t.cardBorder}` }} />
            ))
          ) : (
            movieFavorites.slice(0, 6).map((m) => (
              <PosterCard key={m.id} show={m} href={`/movie/${m.id}`} width={104} titlePlacement="overlay" favorite={isMovieFavorite(m.id)} onToggleFavorite={() => toggleMovieFavorite(m.id, "Profile:movieFavoritesRow")} />
            ))
          )}
        </div>
      </div>

      <div style={{ marginTop: 26 }}>
        <div className="flex items-center justify-between px-6 mb-3">
          <span style={{ fontSize: 17.25, fontWeight: 600, color: "#fff" }}>Collections</span>
          <Link href="/profile/collections"><Icon name="chevronRight" size={18} color={t.textDim} /></Link>
        </div>
        <div className="flex gap-2.5 overflow-x-auto px-6" style={{ scrollbarWidth: "none" }}>
          {collections.map((l) => (
            <button
              key={l.id}
              onClick={() => router.push(`/profile/collections/${l.id}`)}
              className="relative flex-shrink-0 rounded-2xl overflow-hidden active:scale-95 transition text-left"
              style={{ width: 168, height: 133 }}
            >
              {l.coverStyle === "boxset" ? (
                <CollectionBoxSet shows={l.covers} compact />
              ) : (
                <CollectionBackdrop covers={l.covers} />
              )}
              <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.25) 55%, transparent 78%)" }} />
              <div className="absolute left-0 right-0 bottom-0" style={{ padding: "11px 13px" }}>
                <div style={{ fontSize: 14.3, fontWeight: 700, color: "#fff" }}>{l.name}</div>
                <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.72)", marginTop: 2 }}>{l.count} title{l.count === 1 ? "" : "s"}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {myRatings.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <div className="flex items-center justify-between px-6 mb-3">
            <span style={{ fontSize: 17.25, fontWeight: 600, color: "#fff" }}>My Ratings</span>
            <Link href="/profile/ratings"><Icon name="chevronRight" size={18} color={t.textDim} /></Link>
          </div>
          <div className="flex gap-2.5 overflow-x-auto px-6" style={{ scrollbarWidth: "none" }}>
            {myRatings.map((r) => {
              const isMovie = r.mediaType === "movie";
              const moodMetas = moodMetasFromField(r.mood);
              // Original-language title when the show's original_language is
              // one of the user's Readable Languages (Settings), same rule
              // resolveTitle() enforces everywhere else in the app — not the
              // English title unconditionally.
              const displayTitle = r.title ? resolveTitle(r, readableLanguages) : null;
              // Raw ids collide across media types — see the same branch in
              // app/(tabs)/profile/ratings/page.jsx for the full reasoning.
              const key = isMovie ? `movie-${r.movieId}` : `tv-${r.showId}-${r.seasonNumber}`;
              const detailPath = isMovie ? `/movie/${r.movieId}` : `/show/${r.showId}`;
              const ratingPath = isMovie ? `/movie/${r.movieId}?tab=reviews` : `/show/${r.showId}?tab=reviews&reviewSeason=${r.seasonNumber}`;
              const palette = fallbackPalette(isMovie ? r.movieId : r.showId);
              return (
                // Poster opens the show/movie itself; the rest of the card
                // opens the season's/movie's official saved rating card
                // directly (same deep link SeasonRatingScreen's/
                // MovieRatingScreen's own edit-pencil uses, minus &edit=1 —
                // a rating that already exists should land in its read-only
                // "saved" view, not force the editor). Neither one opens
                // ShareRatingCard anymore — that's only reachable from
                // inside the saved card's own Share button now, not as an
                // immediate first tap.
                <div
                  key={key}
                  onClick={() => router.push(ratingPath)}
                  className="flex-shrink-0 flex items-center text-left active:scale-95 transition rounded-2xl cursor-pointer"
                  style={{ width: 264, gap: 12, padding: 12, background: t.cardFill, border: `1px solid ${t.cardBorder}` }}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); router.push(detailPath); }}
                    className="relative rounded-xl overflow-hidden flex-shrink-0"
                    style={{ width: 84, aspectRatio: "2 / 3" }}
                  >
                    <PosterArt posterPath={r.posterPath} base={palette.base} glow={palette.glow} alt={displayTitle ?? ""} />
                    {r.isAuto && (
                      <div className="absolute flex items-center gap-1 rounded-full" style={{ left: 5, top: 5, padding: "2px 5px", background: "rgba(232,162,76,0.2)" }}>
                        <Icon name="sparkle" size={8} color={accent} />
                      </div>
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate" style={{ fontSize: 14.5, fontWeight: 700, color: "#fff" }}>{displayTitle ?? "…"}</div>
                    <div className="flex items-center gap-1.5" style={{ marginTop: 2 }}>
                      {!isMovie && <span style={{ fontSize: 12, color: t.textDim }}>{seasonLabel(r.seasonNumber)}</span>}
                      {moodMetas.length > 0 && <span style={{ fontSize: 12 }}>{moodMetas.map((m) => m.emoji).join(" ")}</span>}
                    </div>
                    {/* value is r.rating/2 — r.rating is the app's usual 0-10
                        scale, StarInput's own scale is 0-5 (maxStars
                        default), and it already knows how to paint a half-
                        filled star, so a 9.0/10 rating correctly shows as
                        4.5/5 (4 full + 1 half), not 4 full + a plain empty
                        5th star. */}
                    <div style={{ marginTop: 8 }}>
                      <StarInput value={r.rating / 2} onChange={() => {}} size={14} gap={2.5} readOnly />
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginTop: 5, lineHeight: 1 }}>{r.rating.toFixed(1)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <PosterQuickStatusMenu
        show={longPress?.show ?? null}
        anchorRect={longPress?.rect ?? null}
        userId={user?.id}
        source="Profile:posterLongPress"
        onClose={() => setLongPress(null)}
        onStatusChange={() => setLibraryRefreshToken((n) => n + 1)}
      />
    </>
  );
}
