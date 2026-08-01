// ---------------------------------------------------------------------------
// Season review state (Supabase `season_reviews` table)
// ---------------------------------------------------------------------------
// Unlike episode_watches (an event log), this table holds one row per
// (user, show, season) — a real review, not a toggle — so writes are a
// straight upsert against its unique(user_id, tmdb_show_id, season_number)
// constraint rather than an insert/delete dance.
//
// RLS requires auth.uid() = user_id, so callers pass the signed-in user's
// id explicitly rather than these helpers re-deriving it — Postgres still
// rejects any mismatched id, this just avoids an extra
// supabase.auth.getUser() round trip per call.

import { supabase } from "@/lib/supabase";

// Returns { [seasonNumber]: { rating, mood, text, savedAt } }
export async function getSeasonReviews(userId, tmdbShowId) {
  const { data, error } = await supabase
    .from("season_reviews")
    .select("season_number, rating, mood, review_text, updated_at")
    .eq("user_id", userId)
    .eq("tmdb_show_id", tmdbShowId);
  if (error) throw error;

  const bySeason = {};
  for (const row of data) {
    bySeason[row.season_number] = {
      rating: row.rating,
      mood: row.mood,
      text: row.review_text ?? "",
      savedAt: new Date(row.updated_at),
    };
  }
  return bySeason;
}

export async function upsertSeasonReview(userId, tmdbShowId, seasonNumber, { rating, mood, text }) {
  const { error } = await supabase.from("season_reviews").upsert(
    {
      user_id: userId,
      tmdb_show_id: tmdbShowId,
      season_number: seasonNumber,
      rating,
      mood,
      review_text: text,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,tmdb_show_id,season_number" }
  );
  if (error) throw error;
}

export async function deleteSeasonReview(userId, tmdbShowId, seasonNumber) {
  const { error } = await supabase
    .from("season_reviews")
    .delete()
    .eq("user_id", userId)
    .eq("tmdb_show_id", tmdbShowId)
    .eq("season_number", seasonNumber);
  if (error) throw error;
}

// Every season-review row for this show, gone — not a per-season unmark.
// Used by lib/userShows.js's removeUserShow, which treats "Remove" as a
// full reset of the show for this user (not just the library row).
export async function deleteAllSeasonReviewsForShow(userId, tmdbShowId) {
  const { error } = await supabase
    .from("season_reviews")
    .delete()
    .eq("user_id", userId)
    .eq("tmdb_show_id", tmdbShowId);
  if (error) throw error;
}
