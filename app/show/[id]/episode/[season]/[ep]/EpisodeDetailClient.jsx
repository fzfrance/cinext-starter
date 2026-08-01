"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import EpisodeDetail from "@/components/EpisodeDetail";
import EpisodeRatingFlow from "@/components/EpisodeRatingFlow";
import FloatingNav from "@/components/ui/FloatingNav";
import { useAuth } from "@/lib/auth-context";
import { getEpisodeWatches, syncEpisodeWatchCount, rateLatestWatch, getLatestWatchDate } from "@/lib/episodeWatches";
import { formatWatchDateLabel } from "@/lib/watchDate";
import { themes, tintColorForShow } from "@/lib/theme";

const t = themes.dark;

// The only real entry point today is Home's Continue Watching hero, which
// always queues the earliest unwatched *aired* episode in season/episode
// order (see /api/shows/library-detail) — so there is never an
// earlier-unwatched gap within this show left to resolve here. Computing
// that for real would mean fetching every season's episodes + watch state
// just to answer one boolean nobody can currently trigger; skip it and
// mark straight through instead of opening the "only this / previous
// episodes too" choice Show Detail's own episode rows still show.
const HAS_EARLIER_UNWATCHED = false;

export default function EpisodeDetailClient({ showId, showTitle, seasonNumber, episode: initialEpisode, cast }) {
  const router = useRouter();
  const { user } = useAuth();
  const [episode, setEpisode] = useState({ ...initialEpisode, watched: false, watchCount: 0, myRating: null });
  const [ratingOpen, setRatingOpen] = useState(false);
  const [watchedDateLabel, setWatchedDateLabel] = useState(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getEpisodeWatches(user.id, showId).then((byEpisode) => {
      if (cancelled) return;
      const hit = byEpisode[`${seasonNumber}-${initialEpisode.n}`];
      if (hit) setEpisode((e) => ({ ...e, watched: true, watchCount: hit.watchCount, myRating: hit.rating != null ? hit.rating : e.myRating }));
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [user, showId, seasonNumber, initialEpisode.n]);

  // Re-fetches whenever watched state changes (freshly marked, rewatched,
  // reset to "watched once", or unmarked) so the label always reflects
  // the most recent watch event, same "most recent row wins" rule
  // WatchDateBadge (components/EpisodeRatingFlow.jsx) already uses.
  useEffect(() => {
    if (!user || !episode.watched) { setWatchedDateLabel(null); return; }
    let cancelled = false;
    getLatestWatchDate(user.id, showId, seasonNumber, episode.n).then((watch) => {
      if (!cancelled) setWatchedDateLabel(watch ? formatWatchDateLabel(watch) : null);
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [user, showId, seasonNumber, episode.n, episode.watched, episode.watchCount]);

  const setWatchCount = (count) => {
    setEpisode((e) => ({ ...e, watched: count > 0, watchCount: count }));
    if (user) syncEpisodeWatchCount(user.id, showId, seasonNumber, episode.n, count).catch(console.error);
  };

  const markWatched = () => {
    if (!user) { router.push("/login"); return; }
    setWatchCount(1);
    setRatingOpen(true);
  };

  return (
    <div className="min-h-dvh" style={{ background: t.bg }}>
      <div className="pb-24">
        <EpisodeDetail
          showTitle={showTitle}
          seasonNumber={seasonNumber}
          episode={episode}
          watchedDateLabel={watchedDateLabel}
          cast={cast}
          hasEarlierUnwatched={HAS_EARLIER_UNWATCHED}
          breadcrumb={{ label: showTitle, onClick: () => router.push(`/show/${showId}`) }}
          onClose={() => router.back()}
          onCastClick={(id) => router.push(`/person/${id}`)}
          onMarkWatched={markWatched}
          onMarkOnlyThis={markWatched}
          onMarkWithPrevious={markWatched}
          onMarkNotWatched={() => setWatchCount(0)}
          onMarkRewatched={() => setWatchCount((episode.watchCount || 1) + 1)}
          onMarkWatchedOnce={() => setWatchCount(1)}
        />
      </div>

      {/* This route sits outside the (tabs) group (no shared layout nav —
          see lib/nav-tint-context.jsx's comment), so it renders its own
          FloatingNav directly rather than going through context. Tinted by
          the show, not the episode still, matching Show Detail's own nav. */}
      <FloatingNav tintColor={tintColorForShow(showId)} />

      {/* Same rating sheet Show Detail uses for a freshly-watched episode.
          onSave only persists — the actual "return to Home" navigation
          happens in onClose, which fires whether the user submits (taps
          Done on the saved screen) or skips (taps the X on the prompt
          screen), so both paths return the same way. */}
      {ratingOpen && (
        <EpisodeRatingFlow
          subject={{
            eyebrow: `S${seasonNumber} E${episode.n}`,
            title: episode.title,
            runtimeMin: episode.runtime,
            episodeAirDate: episode.date,
            posterPath: episode.posterPath,
            showId,
            season: seasonNumber,
            episode: episode.n,
          }}
          cast={cast}
          onClose={() => { setRatingOpen(false); router.back(); }}
          onSave={({ stars }) => {
            setEpisode((e) => ({ ...e, myRating: stars || e.myRating }));
            if (user && stars) rateLatestWatch(user.id, showId, seasonNumber, episode.n, stars).catch(console.error);
          }}
        />
      )}
    </div>
  );
}
