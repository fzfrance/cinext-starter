// ---------------------------------------------------------------------------
// Library status + favorite (Supabase `user_shows` table)
// ---------------------------------------------------------------------------
// One row per (user, show), unique(user_id, tmdb_show_id). `status` must
// match the DB check constraint exactly: watchlist | watching | paused |
// drop | completed. "completed" is the single canonical token for this
// status everywhere — the DB column, components/StatusMenu's option id,
// lib/theme.js's statusMeta key, and every app-level status comparison
// (Profile's library filter/counts, Explore's statusMap, Show Detail's
// status pill) all use it as-is. There used to be a second UI-only token,
// "watched", translated through toDbStatus/fromDbStatus — that indirection
// was the bug: getUserShows/getUserShow returned "watched" while
// lib/theme.js's statusMeta (and Profile's filter pills built from it) key
// off "completed", so `s.status === "completed"` never matched a real row
// and the Completed filter/count silently showed zero. Removed rather than
// patched at the comparison site, so no other call site can reintroduce the
// same mismatch by comparing against the wrong token.

import { supabase } from "@/lib/supabase";
import { getEpisodeWatches, addEpisodeWatches, getShowWatchSummary, deleteAllEpisodeWatchesForShow } from "@/lib/episodeWatches";
import { deleteAllSeasonReviewsForShow } from "@/lib/seasonReviews";
import { deleteAllSeasonRatingsForShow } from "@/lib/seasonRatings";
import { resolveShowStatus } from "@/lib/statusResolver";

// ---------------------------------------------------------------------------
// TEMPORARY diagnostic logging — every write to user_shows logs who
// triggered it, from where, and what changed, so "why did this show's
// status change" can be answered from the console instead of guessed at.
// Added while investigating unexpected library writes; remove once that's
// closed out and this file's mutation call sites have stayed clean for a
// while. `source` is a "Component.function" string every caller below
// passes explicitly — never inferred — so a log line always points at a
// real handler, not a guess.
function logLibraryWrite(action, { source, tmdbShowId, oldStatus, newStatus, note }) {
  const route = typeof window !== "undefined" ? window.location.pathname : "(server)";
  console.log(
    `[library-write] action=${action} source=${source ?? "unknown"} tmdbId=${tmdbShowId} old=${oldStatus ?? "(none)"} new=${newStatus ?? "(n/a)"} route=${route}${note ? ` note=${note}` : ""}`
  );
}

// Returns { [tmdbShowId]: { status, favorite, addedAt, updatedAt } } for the
// user's whole library. addedAt is the row's created_at, in ms — there's no
// separate "favorited at" column, so favorites sorting uses this same
// timestamp (when the show was first touched at all, not specifically
// when it was favorited). updatedAt (also ms) is bumped by setShowStatus/
// setShowFavorite on every write — Home's Continue Watching hero uses it to
// pick the most recently touched "watching" show.
export async function getUserShows(userId) {
  const { data, error } = await supabase
    .from("user_shows")
    .select("tmdb_show_id, status, favorite, created_at, updated_at")
    .eq("user_id", userId);
  if (error) throw error;

  const byShow = {};
  for (const row of data) {
    byShow[row.tmdb_show_id] = {
      status: row.status,
      favorite: row.favorite,
      addedAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at ?? row.created_at).getTime(),
    };
  }
  return byShow;
}

// Single-show lookup, for Show Detail.
export async function getUserShow(userId, tmdbShowId) {
  const { data, error } = await supabase
    .from("user_shows")
    .select("status, favorite, status_explicit")
    .eq("user_id", userId)
    .eq("tmdb_show_id", tmdbShowId)
    .maybeSingle();
  if (error) throw error;
  return data ? { status: data.status, favorite: data.favorite, statusExplicit: data.status_explicit } : null;
}

// Upsert is safe here without touching `favorite`: PostgREST's upsert only
// generates DO UPDATE SET for columns present in the payload, so an
// existing row's `favorite` is left untouched, and a brand-new row falls
// back to the column default (false). `status` must already be one of the
// DB check constraint's values (watchlist | watching | paused | drop |
// completed) — callers pass it straight through, no translation layer.
// `source` is required in spirit (every real call site below passes one) —
// see the logLibraryWrite comment above for why.
//
// options.explicit controls status_explicit the same way `favorite`
// above is left alone: omit it and an existing row's current value is
// untouched (a brand-new row falls back to the column default, true).
// Real callers pass explicit: true for a genuine user pick (status menu,
// Watchlist-confirm, Completed) and explicit: false only for the one
// implicit-creation path (ShowDetailClient's episode-marked sync effect,
// the first time it creates a row nothing had explicitly added yet) —
// never explicit: false against a row that might already be true, since
// that would silently strip a real pick's protection.
export async function setShowStatus(userId, tmdbShowId, status, source = "unknown", { explicit } = {}) {
  const { data: existing } = await supabase.from("user_shows").select("status").eq("user_id", userId).eq("tmdb_show_id", tmdbShowId).maybeSingle();
  logLibraryWrite(existing ? "status-change" : "status-create", { source, tmdbShowId, oldStatus: existing?.status ?? null, newStatus: status });

  const payload = { user_id: userId, tmdb_show_id: tmdbShowId, status, updated_at: new Date().toISOString() };
  if (explicit !== undefined) payload.status_explicit = explicit;

  const { error } = await supabase.from("user_shows").upsert(payload, { onConflict: "user_id,tmdb_show_id" });
  if (error) throw error;
}

// Reverts a show out of the library entirely — used only when its status
// existed purely as a side effect of marking episodes watched
// (status_explicit = false) and every one of those episodes has since
// been unmarked, so nothing actually justifies the row anymore. Unlike
// removeUserShow, this never touches episode_watches or season_reviews:
// watched count is already zero here (there's nothing to cascade-delete),
// and a season review, if one somehow exists independent of watch count,
// is a rating/opinion that shouldn't be destroyed just because an
// implicit status evaporated. Only ever call this against a row already
// confirmed status_explicit = false — doing this to an explicitly-chosen
// status is the exact bug that flag exists to prevent.
export async function removeImplicitLibraryRow(userId, tmdbShowId, source = "unknown") {
  const { data: existing } = await supabase.from("user_shows").select("status").eq("user_id", userId).eq("tmdb_show_id", tmdbShowId).maybeSingle();
  logLibraryWrite("remove-implicit", { source, tmdbShowId, oldStatus: existing?.status ?? null, newStatus: null, note: "status_explicit=false row reverted; episode_watches/season_reviews untouched" });

  const { error } = await supabase.from("user_shows").delete().eq("user_id", userId).eq("tmdb_show_id", tmdbShowId);
  if (error) throw error;
}

// Deliberately UPDATE-only. This used to insert a fresh row with a
// hardcoded status: "watchlist" when none existed yet — that was the bug:
// favoriting a show that wasn't already in the library silently added it
// with a status the user never chose. `status` is NOT NULL, so there's no
// honest value to insert on its behalf; a library row may only ever be
// created by an explicit status pick (setShowStatus), never as a side
// effect of favoriting. If the show isn't already in the library, this is
// a no-op and returns false — the caller can use that to prompt "add it
// to your library first" rather than the row being fabricated silently.
export async function setShowFavorite(userId, tmdbShowId, favorite, source = "unknown") {
  const { data: existing, error: selectError } = await supabase
    .from("user_shows")
    .select("id, status")
    .eq("user_id", userId)
    .eq("tmdb_show_id", tmdbShowId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (!existing) return false;

  logLibraryWrite("favorite", { source, tmdbShowId, oldStatus: existing.status, newStatus: existing.status, note: `favorite=${favorite}` });
  const { error } = await supabase.from("user_shows").update({ favorite, updated_at: new Date().toISOString() }).eq("id", existing.id);
  if (error) throw error;
  return true;
}

// "Remove" is a full reset of this show for this user, not just the
// library row: episode_watches and season_reviews are deleted too, so a
// removed show comes back with zero watched episodes and zero reviews if
// re-added later, and nothing it left behind (Continue Watching, season
// completion checkmarks, episode ratings) can outlive the library row that
// used to justify showing it. This used to leave watch history/reviews
// alone on the theory that they're "a record of what was actually
// watched, independent of library status" — that was the bug: pressing
// Remove deleted the status row but every season still rendered fully
// watched, because episode_watches (the actual source of "watched") was
// never touched. Deletes dependents (episode_watches, season_reviews,
// season_ratings) before the parent user_shows row, on purpose: if a
// dependent delete fails, the user_shows row — and therefore the show —
// is still in the library and visibly unremoved, rather than silently
// gone from the library while orphaned watch data lingers invisibly
// underneath it.
export async function removeUserShow(userId, tmdbShowId, source = "unknown") {
  const { data: existing } = await supabase.from("user_shows").select("status").eq("user_id", userId).eq("tmdb_show_id", tmdbShowId).maybeSingle();
  logLibraryWrite("remove", { source, tmdbShowId, oldStatus: existing?.status ?? null, newStatus: null, note: "cascading: episode_watches + season_reviews + season_ratings + user_shows" });

  await deleteAllEpisodeWatchesForShow(userId, tmdbShowId);
  await deleteAllSeasonReviewsForShow(userId, tmdbShowId);
  await deleteAllSeasonRatingsForShow(userId, tmdbShowId);

  const { error } = await supabase.from("user_shows").delete().eq("user_id", userId).eq("tmdb_show_id", tmdbShowId);
  if (error) throw error;
}

// Canonical "mark this show Completed" behavior: status -> completed AND
// every currently-aired episode (all seasons) recorded watched — shared by
// every entry point that can set this status without already having full
// season/episode data loaded locally. Show Detail has that data in memory
// already and marks episodes directly (ShowDetailClient's
// markAllSeasonsWatched); this is for callers like Explore's search
// results, which only have a tmdb_show_id and need the aired-episode list
// fetched first. Episodes already watched are skipped so this never
// inserts a duplicate/rewatch event — marking Completed twice in a row
// must not double every episode's watch count.
export async function markShowCompleted(userId, tmdbShowId, source = "unknown") {
  const [alreadyWatched, res] = await Promise.all([
    getEpisodeWatches(userId, tmdbShowId),
    fetch(`/api/shows/${tmdbShowId}/aired-episodes`).then((r) => r.json()),
  ]);
  const toMark = (res.episodes ?? [])
    .filter((e) => !alreadyWatched[`${e.season}-${e.episode}`])
    .map((e) => ({ seasonNumber: e.season, episodeNumber: e.episode }));

  await Promise.all([
    setShowStatus(userId, tmdbShowId, "completed", source, { explicit: true }),
    addEpisodeWatches(userId, tmdbShowId, toMark),
  ]);
}

// "Watchlist" is definitionally zero watched episodes (see
// lib/statusResolver.js) — a show can't honestly be "to watch" while some
// of it is already watched. Callers must get the user's explicit
// confirmation first (this doesn't ask itself); once confirmed, it clears
// every episode_watches row for the show and sets status in the same
// step, so the stored status can never observably disagree with the
// stored watch history, even for a moment. Season reviews are left alone —
// they're a rating/opinion, not a watch-progress fact, and the task's own
// repair rules are explicit that ratings/progress aren't something a
// status change should delete.
export async function setWatchlistAndClearProgress(userId, tmdbShowId, source = "unknown") {
  await Promise.all([
    setShowStatus(userId, tmdbShowId, "watchlist", source, { explicit: true }),
    deleteAllEpisodeWatchesForShow(userId, tmdbShowId),
  ]);
}

// Reconciliation for existing contradictory records — e.g. a show whose
// status stayed "watchlist" while every episode was already watched. Every
// UI already resolves the *displayed* status live via resolveShowStatus,
// so this isn't required for what's shown to be correct — it only rewrites
// the stored value to match. Only touches user_shows.status; never deletes
// episode_watches or season_reviews rows.
//
// NOT called anywhere in the app right now, deliberately: this writes to
// user_shows, and a library write may only happen as the direct result of
// an explicit user action (selecting a status, marking an episode watched,
// etc.) — never automatically from a page load or component mount, no
// matter how well-intentioned the reconciliation is. It used to be
// auto-invoked from Home/Profile/Explore's load effects; that was itself
// the bug (opening a page could rewrite a status the user never touched).
// If this is ever wired up again, it must be behind an explicit control
// (e.g. a "Fix my library" button the user taps), not a mount effect.
// Scoped to status === "watchlist" specifically (not every status), per
// the original repair instructions — a "watching" or "completed" show
// that's since become fully/partially watched-through-and-through is
// reconciled by ShowDetailClient's own explicit-trigger sync instead.
export async function repairContradictoryStatuses(userId) {
  const byShow = await getUserShows(userId);
  const watchlistIds = Object.entries(byShow)
    .filter(([, s]) => s.status === "watchlist")
    .map(([id]) => Number(id));
  if (watchlistIds.length === 0) return;

  const summaries = await getShowWatchSummary(userId, watchlistIds);
  const contradictoryIds = watchlistIds.filter((id) => (summaries[id]?.watchedKeys?.length ?? 0) > 0);
  if (contradictoryIds.length === 0) return;

  await Promise.all(contradictoryIds.map(async (id) => {
    const watchedKeys = new Set(summaries[id].watchedKeys);
    const res = await fetch(`/api/shows/${id}/aired-episodes`);
    const { episodes } = await res.json();
    const releasedEpisodes = episodes.length;
    const watchedReleasedEpisodes = episodes.filter((e) => watchedKeys.has(`${e.season}-${e.episode}`)).length;

    const resolved = resolveShowStatus({ explicitStatus: "watchlist", watchedReleasedEpisodes, releasedEpisodes });
    if (resolved && resolved !== "watchlist") {
      await setShowStatus(userId, id, resolved, "repairContradictoryStatuses");
    }
  }));
}
