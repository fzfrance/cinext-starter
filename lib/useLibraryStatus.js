"use client";

// ---------------------------------------------------------------------------
// Shared "decorate any show with this user's real library status, and let
// them change it from a StatusMenu" logic — extracted so the new global
// Search screen (app/search/SearchClient.jsx) doesn't need its own
// re-implementation of Explore's existing status-map machinery
// (app/(tabs)/explore/ExploreClient.jsx keeps its own inline copy
// untouched, since it also drives the hero/trending/recommended rows there,
// not just search — this hook is for net-new call sites only).
// ---------------------------------------------------------------------------

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getUserShows, setShowStatus, removeUserShow, markShowCompleted, setWatchlistAndClearProgress } from "@/lib/userShows";
import { getEpisodeWatches, getShowWatchSummary } from "@/lib/episodeWatches";
import { resolveShowStatus } from "@/lib/statusResolver";

// `source` is just a label for this app's write-logging convention (see
// lib/userShows.js's logLibraryWrite) — pass a short "ScreenName" string.
export function useLibraryStatus(source) {
  const router = useRouter();
  const { user } = useAuth();
  const [statusMap, setStatusMap] = useState({}); // raw stored status — the source for writes
  // What's actually displayed (status icon, StatusMenu highlight) —
  // resolved from real released/watched episode counts, same as every
  // other screen (lib/statusResolver.js).
  const [resolvedStatusMap, setResolvedStatusMap] = useState({});
  const [ratingItem, setRatingItem] = useState(null); // show item just marked Watched, or null

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const byShow = await getUserShows(user.id);
      if (cancelled) return;
      const map = {};
      for (const [id, s] of Object.entries(byShow)) map[id] = s.status;
      setStatusMap(map);
      setResolvedStatusMap(map); // first pass — corrected below once progress data resolves

      const ids = Object.keys(byShow).map(Number);
      const resolvableIds = ids.filter((id) => byShow[id].status !== "paused" && byShow[id].status !== "drop");
      if (resolvableIds.length === 0) return;

      const summary = await getShowWatchSummary(user.id, resolvableIds);
      const res = await fetch("/api/shows/library-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shows: resolvableIds.map((id) => ({ id, needsProgress: true, watched: summary[id]?.watchedKeys ?? [] })) }),
      });
      const { results } = await res.json();
      if (cancelled) return;
      const byId = Object.fromEntries(results.map((r) => [r.id, r]));
      setResolvedStatusMap((prev) => {
        const next = { ...prev };
        for (const id of resolvableIds) {
          const result = byId[id];
          if (!result) continue;
          next[id] = resolveShowStatus({
            explicitStatus: byShow[id].status,
            watchedReleasedEpisodes: result.watchedReleasedEpisodes ?? 0,
            releasedEpisodes: result.releasedEpisodes ?? 0,
          });
        }
        return next;
      });
    })().catch(console.error);
    return () => { cancelled = true; };
  }, [user]);

  // Watchlist is definitionally zero watched episodes — landing there
  // while progress already exists would recreate the exact contradiction
  // lib/statusResolver.js exists to prevent, so this confirms before
  // clearing real watch history.
  const confirmClearIfWatched = async (id, title) => {
    const watches = await getEpisodeWatches(user.id, id).catch(() => ({}));
    if (Object.keys(watches).length === 0) return true;
    return window.confirm(`${title} has watched episodes. Moving it to Watchlist will clear its watch history — this can't be undone. Continue?`);
  };

  const selectStatus = async (item, statusId) => {
    if (!user) { router.push("/login"); return; }
    if (statusId === "remove") {
      removeUserShow(user.id, item.id, `${source}:selectStatus:remove`)
        .then(() => {
          setStatusMap((prev) => { const next = { ...prev }; delete next[item.id]; return next; });
          setResolvedStatusMap((prev) => { const next = { ...prev }; delete next[item.id]; return next; });
        })
        .catch((err) => {
          console.error(err);
          window.alert("Couldn't remove this show — please try again.");
        });
      return;
    }
    if (statusId === "watchlist") {
      const proceed = await confirmClearIfWatched(item.id, item.title);
      if (!proceed) return;
      setStatusMap((prev) => ({ ...prev, [item.id]: "watchlist" }));
      setResolvedStatusMap((prev) => ({ ...prev, [item.id]: "watchlist" }));
      setWatchlistAndClearProgress(user.id, item.id, `${source}:selectStatus:watchlist-confirm`).catch(console.error);
      return;
    }
    setStatusMap((prev) => ({ ...prev, [item.id]: statusId }));
    setResolvedStatusMap((prev) => ({ ...prev, [item.id]: statusId }));
    setShowStatus(user.id, item.id, statusId, `${source}:selectStatus`, { explicit: true }).catch(console.error);
    if (statusId === "completed") {
      markShowCompleted(user.id, item.id, `${source}:selectStatus:completed`).catch(console.error);
      setRatingItem(item);
    }
  };

  return { statusMap, resolvedStatusMap, ratingItem, setRatingItem, selectStatus };
}
