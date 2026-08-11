// ---------------------------------------------------------------------------
// Season rating state (Supabase `season_ratings` table)
// ---------------------------------------------------------------------------
// A parallel table to season_reviews (lib/seasonReviews.js), not a
// replacement for it — season_reviews stays on its own 0-5 scale for
// whatever already reads it; season_ratings is the new 0-10 scale +
// favorite-character feature (reference/season_rating_prototype.jsx).
// Same shape of table (one row per (user, show, season), upsert against a
// unique constraint) so this mirrors that file's conventions exactly:
// userId passed in explicitly (RLS still enforces auth.uid() = user_id,
// this just avoids an extra getUser() round trip), errors thrown rather
// than swallowed.
//
// Real columns (season_ratings already existed in the live database before
// this file did, created outside supabase/schema.sql): id, user_id,
// show_id (NOT tmdb_show_id), season_number, rating, mood,
// favorite_character_id, favorite_character_name, review_text, share_id,
// created_at, updated_at.

import { supabase } from "@/lib/supabase";

// favorite_character_id is a `text` column (comes back from Supabase as a
// string, e.g. "1875840"), but every cast entry's own `id` (TMDB's person
// id, from lib/tmdb.js / aggregate_credits) is a plain JS number — so a
// naive `cast.find(c => c.id === manual.characterId)` always failed
// (string !== number), silently falling back to a blank initials avatar
// on the saved rating card even when the actual person WAS still in the
// cast list. Normalizing to a number at read time, once here, means every
// caller can keep using a plain `===` against `c.id` and just works.
const toCharacterId = (v) => (v == null || v === "" ? null : Number(v));

// Every season_ratings row for this user, across ALL of their shows — the
// "manual" half of Profile's My Ratings row (see lib/episodeWatches.js's
// getRatedEpisodesAcrossShows for the "auto" half). createdAt (distinct
// from savedAt/updated_at, which shifts on every edit) is what
// ShareRatingCard's "REVIEW NO." uses — the Nth rating you've ever saved,
// by real creation order, not a fabricated id.
// review_date -> null on rows saved before that column existed — falls
// back to this row's own updated_at date so an old rating's displayed
// date doesn't silently change just because this migration ran. Kept as
// a plain "YYYY-MM-DD" string throughout (not a Date object) — matches
// how every other watch-date field in this app is stored/passed around
// (see lib/watchDate.js), and is exactly what the calendar picker both
// reads and writes.
const resolveReviewDate = (row) => row.review_date ?? new Date(row.updated_at).toISOString().slice(0, 10);

export async function getAllSeasonRatingsForUser(userId) {
  const { data, error } = await supabase
    .from("season_ratings")
    .select("show_id, season_number, rating, mood, favorite_character_id, favorite_character_name, review_text, review_date, created_at, updated_at")
    .eq("user_id", userId);
  if (error) throw error;
  return data.map((row) => ({
    showId: row.show_id,
    seasonNumber: row.season_number,
    rating: row.rating,
    mood: row.mood,
    characterId: toCharacterId(row.favorite_character_id),
    characterName: row.favorite_character_name,
    text: row.review_text ?? "",
    reviewDate: resolveReviewDate(row),
    createdAt: new Date(row.created_at),
    savedAt: new Date(row.updated_at),
  }));
}

// Returns { [seasonNumber]: { rating, mood, characterId, characterName, text, shareId, savedAt } }
export async function getSeasonRatings(userId, showId) {
  const { data, error } = await supabase
    .from("season_ratings")
    .select("season_number, rating, mood, favorite_character_id, favorite_character_name, review_text, review_date, share_id, updated_at")
    .eq("user_id", userId)
    .eq("show_id", showId);
  if (error) throw error;

  const bySeason = {};
  for (const row of data) {
    bySeason[row.season_number] = {
      rating: row.rating,
      mood: row.mood,
      characterId: toCharacterId(row.favorite_character_id),
      characterName: row.favorite_character_name,
      text: row.review_text ?? "",
      reviewDate: resolveReviewDate(row),
      shareId: row.share_id,
      savedAt: new Date(row.updated_at),
    };
  }
  return bySeason;
}

// One season's manual rating, or null — used by the public share view
// (which only knows a showId/seasonNumber, not "give me the whole show").
export async function getSeasonRating(userId, showId, seasonNumber) {
  const { data, error } = await supabase
    .from("season_ratings")
    .select("season_number, rating, mood, favorite_character_id, favorite_character_name, review_text, review_date, share_id, updated_at")
    .eq("user_id", userId)
    .eq("show_id", showId)
    .eq("season_number", seasonNumber)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    rating: data.rating,
    mood: data.mood,
    characterId: toCharacterId(data.favorite_character_id),
    characterName: data.favorite_character_name,
    text: data.review_text ?? "",
    reviewDate: resolveReviewDate(data),
    shareId: data.share_id,
    savedAt: new Date(data.updated_at),
  };
}

// reviewDate ("YYYY-MM-DD" | undefined) — only ever passed when the user
// explicitly changed it via the rating screen's calendar picker. Omitted
// from the payload otherwise, so: a brand-new row gets the review_date
// column's own `default current_date` (today, with zero extra code here —
// see supabase/pending_migration.sql), and an edit that didn't touch the
// date leaves whatever was already stored untouched (Supabase's upsert
// only writes columns present in the payload; a column left out of an
// ON CONFLICT UPDATE keeps its existing value, it does NOT fall back to
// the table's own default the way a fresh INSERT would).
export async function saveSeasonRating(userId, showId, seasonNumber, { rating, mood, characterId, characterName, text, reviewDate }) {
  const payload = {
    user_id: userId,
    show_id: showId,
    season_number: seasonNumber,
    rating,
    mood,
    favorite_character_id: characterId,
    favorite_character_name: characterName,
    review_text: text,
    updated_at: new Date().toISOString(),
  };
  if (reviewDate !== undefined) payload.review_date = reviewDate;
  const { error } = await supabase.from("season_ratings").upsert(payload, { onConflict: "user_id,show_id,season_number" });
  if (error) throw error;
}

export async function deleteSeasonRating(userId, showId, seasonNumber) {
  const { error } = await supabase
    .from("season_ratings")
    .delete()
    .eq("user_id", userId)
    .eq("show_id", showId)
    .eq("season_number", seasonNumber);
  if (error) throw error;
}

// Every season-rating row for this show, gone — mirrors
// deleteAllSeasonReviewsForShow, called from the same removeUserShow
// cascade (lib/userShows.js) so "Remove" resets this data too.
export async function deleteAllSeasonRatingsForShow(userId, showId) {
  const { error } = await supabase
    .from("season_ratings")
    .delete()
    .eq("user_id", userId)
    .eq("show_id", showId);
  if (error) throw error;
}

// Opt-in public sharing (Step 4's Copy Link) — generates a short id and
// stamps it onto this row ONLY when the user explicitly asks to share it.
// Returns the shareId to build the public URL from. Reuses the existing
// shareId if this rating was already shared before (so re-sharing doesn't
// mint a new URL and orphan the old one).
export async function ensureShareId(userId, showId, seasonNumber) {
  const existing = await getSeasonRating(userId, showId, seasonNumber);
  if (existing?.shareId) return existing.shareId;

  const shareId = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  // .select() + checking `data` — a bare .update() silently affects zero
  // rows (no error) when there's no season_ratings row to update, which is
  // exactly the case for an auto-computed score that was never manually
  // saved. Without this check, callers (Copy Link, Share's URL fallback)
  // got back a shareId that was never actually persisted anywhere — a
  // real-looking success ("Link copied!") pointing at a /s/[shareId] page
  // that 404s, instead of a genuine error.
  const { data, error } = await supabase
    .from("season_ratings")
    .update({ share_id: shareId })
    .eq("user_id", userId)
    .eq("show_id", showId)
    .eq("season_number", seasonNumber)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Can't create a share link for a rating that hasn't been saved yet.");
  return shareId;
}

// Averages episode_watches.rating (0-5 half-star scale, same as
// season_reviews — ShowDetailClient's own `seasons[].episodes[].myRating`
// is already this exact value, hydrated from getEpisodeWatches()) across
// whichever of this season's episodes the user has actually rated, then
// doubles it onto a 0-10 scale — mirrors
// reference/season_rating_prototype.jsx's seasonAuto() exactly, same
// `episodes` shape ({ n, myRating }) so no reshaping is needed at the
// call site. Returns null if nothing in this season has been rated yet
// (no auto score to show).
// Averaging arbitrary half-star episode ratings produces arbitrary
// decimals (e.g. 9.2), which don't read as a real score next to manual
// ratings that only ever land on a clean half-point (9.0/9.5/10) — round
// UP to the nearest half-point rather than to the nearest one, so an
// average never displays as better than what it actually earned.
export const roundUpToHalf = (n) => Math.ceil(n * 2) / 2;

export function getAutoSeasonScore(episodes) {
  const rated = episodes.filter((e) => e.myRating != null);
  if (!rated.length) return null;
  const avg = rated.reduce((a, e) => a + e.myRating, 0) / rated.length;
  return { avg10: roundUpToHalf(avg * 2), ratedCount: rated.length, total: episodes.length };
}

// The public read-only share view (Step 4) needs to look a rating up by
// share_id alone, with no user_id/showId in hand yet — this is exactly
// what the "public read of shared ratings" RLS policy (share_id is not
// null) exists for.
export async function getSeasonRatingByShareId(shareId) {
  const { data, error } = await supabase
    .from("season_ratings")
    .select("show_id, season_number, rating, mood, favorite_character_id, favorite_character_name, review_text, review_date, updated_at")
    .eq("share_id", shareId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    showId: data.show_id,
    seasonNumber: data.season_number,
    rating: data.rating,
    mood: data.mood,
    characterId: toCharacterId(data.favorite_character_id),
    characterName: data.favorite_character_name,
    text: data.review_text ?? "",
    reviewDate: resolveReviewDate(data),
    savedAt: new Date(data.updated_at),
  };
}
