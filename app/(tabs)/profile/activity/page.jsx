"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import ActivityPageSwitcher from "@/components/profile/ActivityPageSwitcher";
import ActivityCard from "@/components/profile/ActivityCard";
import { useAuth } from "@/lib/auth-context";
import { getProfile } from "@/lib/profile";
import { getUserShows } from "@/lib/userShows";
import { getUserMovies } from "@/lib/userMovies";
import { getAllMovieRatingsForUser } from "@/lib/movieRatings";
import { getRecentEpisodeWatches, getShowWatchSummary } from "@/lib/episodeWatches";
import { getAllSeasonRatingsForUser } from "@/lib/seasonRatings";
import { getRecentCollectionAdditions } from "@/lib/collections";
import { fallbackPalette } from "@/lib/library";
import { buildActivityEvents, groupActivityByRecency } from "@/lib/activity";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { themes } from "@/lib/theme";

const t = themes.dark;

// Only the signed-in user's own actions appear here — there's no
// friends/following system in this app yet (see lib/activity.js's header
// comment), so this is a real personal history feed, not a social one.
// Rendering caps at RENDER_LIMIT most-recent events for a reasonably
// scannable feed; rewatch-detection itself still runs over the FULL watch
// history underneath (getRecentEpisodeWatches has no limit) so an old
// show's rewatch isn't misread as a first watch just because most of its
// history falls outside what's actually rendered.
const RENDER_LIMIT = 80;

export default function Page() {
  const router = useRouter();
  const { user } = useAuth();
  const readableLanguages = useReadableLanguages();
  const [tab, setTab] = useState("activity"); // "activity" | "notifications" — local tab, not a route
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [displayName, setDisplayName] = useState("You");
  const [feed, setFeed] = useState(null); // null = loading, else { groups, showsById }
  const [now] = useState(() => new Date());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [profile, byShow, episodeWatches, seasonRatings, collectionAdditions, byMovie, movieRatings] = await Promise.all([
        getProfile(user.id),
        getUserShows(user.id),
        getRecentEpisodeWatches(user.id),
        getAllSeasonRatingsForUser(user.id),
        getRecentCollectionAdditions(user.id),
        // Independently caught — a movie-side failure must degrade to "no
        // movie activity" rather than blanking this whole feed (same
        // resilience pattern as every other TV+movie merge this session).
        getUserMovies(user.id).catch((err) => { console.error(err); return {}; }),
        getAllMovieRatingsForUser(user.id).catch((err) => { console.error(err); return []; }),
      ]);
      if (cancelled) return;
      setAvatarUrl(profile?.avatarUrl ?? null);
      setDisplayName(profile?.displayName || "You");

      const userShows = Object.entries(byShow).map(([showId, s]) => ({ showId: Number(showId), ...s }));
      const userMovies = Object.entries(byMovie).map(([movieId, s]) => ({ movieId: Number(movieId), ...s }));

      // Real completion (not just the raw `status` column) needs live
      // episode-progress counts, same as Library's own DVD-shelf page —
      // paused/drop/completed are unconditional overrides inside
      // resolveShowStatus itself, so those don't need the (expensive)
      // episode fetch at all.
      const resolvableIds = userShows.filter((s) => s.status !== "paused" && s.status !== "drop" && s.status !== "completed").map((s) => s.showId);
      const watchSummary = await getShowWatchSummary(user.id, resolvableIds);

      const otherIds = [...new Set([...episodeWatches.map((w) => w.showId), ...seasonRatings.map((r) => r.showId), ...collectionAdditions.map((c) => c.showId)])];
      const allShowIds = [...new Set([...userShows.map((s) => s.showId), ...otherIds])];
      const allMovieIds = [...new Set([...userMovies.map((s) => s.movieId), ...movieRatings.map((r) => r.movieId)])];
      if (allShowIds.length === 0 && allMovieIds.length === 0) {
        if (!cancelled) setFeed({ groups: [], showsById: {}, moviesById: {} });
        return;
      }

      const [showRes, movieRes] = await Promise.all([
        allShowIds.length > 0
          ? fetch("/api/shows/library-detail", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                shows: allShowIds.map((id) => ({
                  id,
                  needsProgress: resolvableIds.includes(id),
                  watched: watchSummary[id]?.watchedKeys ?? [],
                })),
              }),
            }).then((r) => r.json())
          : Promise.resolve({ results: [] }),
        allMovieIds.length > 0
          ? fetch(`/api/movies/batch?ids=${allMovieIds.join(",")}`).then((r) => r.json()).catch((err) => { console.error(err); return { results: [] }; })
          : Promise.resolve({ results: [] }),
      ]);
      if (cancelled) return;

      const detailById = Object.fromEntries(showRes.results.map((r) => [r.id, r]));
      const progressByShowId = Object.fromEntries(
        resolvableIds
          .filter((id) => detailById[id])
          .map((id) => [id, { releasedEpisodes: detailById[id].releasedEpisodes, watchedReleasedEpisodes: detailById[id].watchedReleasedEpisodes }])
      );
      // Raw title fields kept as-is here, NOT resolved through
      // resolveTitle yet — this object is built inside a fetch effect that
      // only reruns on [user, now], while useReadableLanguages() resolves
      // asynchronously after its own profile fetch completes; resolving
      // here would bake in whatever readableLanguages happened to be
      // (usually still the ["en"] default) at the moment this effect ran,
      // and never update once the real preference loads. Resolved at
      // render time below instead, same as every other list in the app
      // (Highlights, Explore, Library, Profile's own My Ratings row) —
      // that reads readableLanguages fresh on every render.
      const showsById = Object.fromEntries(Object.entries(detailById).map(([id, r]) => {
        const { base, glow } = fallbackPalette(id);
        return [id, { id: r.id, title: r.title, originalTitle: r.originalTitle, originalLanguage: r.originalLanguage, posterPath: r.posterPath, base, glow }];
      }));
      const moviesById = Object.fromEntries(movieRes.results.map((r) => {
        const { base, glow } = fallbackPalette(r.id);
        return [r.id, { id: r.id, title: r.title, originalTitle: r.originalTitle, originalLanguage: r.originalLanguage, posterPath: r.posterPath, base, glow }];
      }));

      const events = buildActivityEvents({ userShows, episodeWatches, seasonRatings, collectionAdditions, progressByShowId, userMovies, movieRatings }).slice(0, RENDER_LIMIT);
      const groups = groupActivityByRecency(events, now)
        .map(([label, items]) => [label, items.filter((e) => (e.mediaType === "movie" ? moviesById[e.movieId] : showsById[e.showId]))])
        .filter(([, items]) => items.length > 0);

      setFeed({ groups, showsById, moviesById });
    })().catch(console.error);
    return () => { cancelled = true; };
  }, [user, now]);

  if (!user) {
    return (
      <>
        <ActivityPageSwitcher active={tab} onChange={setTab} />
        <div className="flex flex-col items-center text-center px-8" style={{ marginTop: 100 }}>
          <Icon name="user" size={30} color={t.textDim} />
          <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginTop: 14 }}>Sign in to see your activity</div>
          <button onClick={() => router.push("/login")} className="rounded-full active:scale-95 transition" style={{ marginTop: 20, padding: "11px 24px", background: "#fff" }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1a1108" }}>Sign In</span>
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <ActivityPageSwitcher active={tab} onChange={setTab} />

      {tab === "notifications" ? (
        // Placeholder — real notifications need something to actually
        // trigger them (a friends/following system, or per-show release
        // alerts), neither of which exists yet.
        <div style={{ margin: "56px 20px 0", height: 220, borderRadius: 20, border: "1px dashed rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
          <div>
            <Icon name="bell" size={22} color={t.textDim} />
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginTop: 10, marginBottom: 6 }}>Notifications</div>
            <div style={{ fontSize: 12.5, color: t.textDim }}>Nothing to notify you about yet.</div>
          </div>
        </div>
      ) : (
        <>
          {feed === null && (
            <div style={{ padding: "80px 24px", textAlign: "center", fontSize: 13, color: t.textDim }}>Loading…</div>
          )}

          {feed?.groups.length === 0 && (
            <div style={{ padding: "80px 24px", textAlign: "center", fontSize: 13, color: t.textDim }}>
              Watch, rate, or add a show and it&apos;ll show up here.
            </div>
          )}

          {feed?.groups.map(([label, items]) => (
            <div key={label} style={{ marginTop: 8 }}>
              <div className="px-6" style={{ fontSize: 15, fontWeight: 700, color: t.textDim, letterSpacing: "0.01em", marginTop: 18, marginBottom: 2 }}>{label}</div>
              {items.map((e, i) => {
                const show = e.mediaType === "movie" ? feed.moviesById[e.movieId] : feed.showsById[e.showId];
                const displayShow = show ? { ...show, title: resolveTitle(show, readableLanguages) } : show;
                return (
                  <ActivityCard key={`${e.type}-${e.mediaType}-${e.showId ?? e.movieId}-${e.seasonNumber ?? ""}-${e.episodeNumber ?? ""}-${e.timestamp.getTime()}-${i}`} event={e} show={displayShow} avatarUrl={avatarUrl} displayName={displayName} now={now} />
                );
              })}
            </div>
          ))}

          <div style={{ height: 30 }} />
        </>
      )}
    </>
  );
}
