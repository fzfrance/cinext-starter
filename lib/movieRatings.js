// ---------------------------------------------------------------------------
// Movie rating state (Supabase `movie_ratings` table)
// ---------------------------------------------------------------------------
// Mirrors lib/seasonRatings.js's conventions exactly (userId passed in
// explicitly, errors thrown rather than swallowed), minus season_number —
// one row per (user, movie), not per (user, movie, season), since a movie
// has no seasons at all. share_id/ensureMovieShareId/getMovieRatingByShareId
// mirror season_ratings' own opt-in public-sharing mechanism (Movie
// Detail's Share button/MovieShareRatingCard). No getAutoMovieScore/
// roundUpToHalf equivalent — a movie has no per-episode ratings to
// average, so there is no "auto" rating concept for movies at all, manual
// only.

import { supabase } from "@/lib/supabase";

// favorite_character_id is a `text` column but cast entry ids are plain JS
// numbers — same normalization reasoning as lib/seasonRatings.js's
// toCharacterId.
const toCharacterId = (v) => (v == null || v === "" ? null : Number(v));

// Every movie_ratings row for this user, across ALL of their movies — for
// a future "My Ratings" row equivalent that includes movies alongside
// shows (not wired up yet, but shaped to match getAllSeasonRatingsForUser
// so that's a natural follow-up).
// review_date -> null on rows saved before that column existed — falls
// back to this row's own updated_at date, same reasoning as
// lib/seasonRatings.js's identical helper (see that file's own comment).
const resolveReviewDate = (row) => row.review_date ?? new Date(row.updated_at).toISOString().slice(0, 10);

export async function getAllMovieRatingsForUser(userId) {
  const { data, error } = await supabase
    .from("movie_ratings")
    .select("tmdb_movie_id, rating, mood, favorite_character_id, favorite_character_name, review_text, review_date, share_id, created_at, updated_at")
    .eq("user_id", userId);
  if (error) throw error;
  return data.map((row) => ({
    movieId: row.tmdb_movie_id,
    rating: row.rating,
    mood: row.mood,
    characterId: toCharacterId(row.favorite_character_id),
    characterName: row.favorite_character_name,
    text: row.review_text ?? "",
    reviewDate: resolveReviewDate(row),
    shareId: row.share_id,
    createdAt: new Date(row.created_at),
    savedAt: new Date(row.updated_at),
  }));
}

// One movie's rating, or null.
export async function getMovieRating(userId, tmdbMovieId) {
  const { data, error } = await supabase
    .from("movie_ratings")
    .select("rating, mood, favorite_character_id, favorite_character_name, review_text, review_date, share_id, updated_at")
    .eq("user_id", userId)
    .eq("tmdb_movie_id", tmdbMovieId)
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

// reviewDate ("YYYY-MM-DD" | undefined) — same omit-unless-explicitly-
// changed contract as lib/seasonRatings.js's saveSeasonRating (see that
// function's own comment for the full reasoning).
export async function saveMovieRating(userId, tmdbMovieId, { rating, mood, characterId, characterName, text, reviewDate }) {
  const payload = {
    user_id: userId,
    tmdb_movie_id: tmdbMovieId,
    rating,
    mood,
    favorite_character_id: characterId,
    favorite_character_name: characterName,
    review_text: text,
    updated_at: new Date().toISOString(),
  };
  if (reviewDate !== undefined) payload.review_date = reviewDate;
  const { error } = await supabase.from("movie_ratings").upsert(payload, { onConflict: "user_id,tmdb_movie_id" });
  if (error) throw error;
}

export async function deleteMovieRating(userId, tmdbMovieId) {
  const { error } = await supabase
    .from("movie_ratings")
    .delete()
    .eq("user_id", userId)
    .eq("tmdb_movie_id", tmdbMovieId);
  if (error) throw error;
}

// Opt-in public sharing (MovieRatingScreen's Share button) — mirrors
// lib/seasonRatings.js's ensureShareId exactly, one media type over.
// Generates a short id and stamps it onto this row ONLY when the user
// explicitly asks to share it; reuses the existing shareId if this rating
// was already shared before (so re-sharing doesn't mint a new URL and
// orphan the old one).
export async function ensureMovieShareId(userId, tmdbMovieId) {
  const existing = await getMovieRating(userId, tmdbMovieId);
  if (existing?.shareId) return existing.shareId;

  const shareId = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const { data, error } = await supabase
    .from("movie_ratings")
    .update({ share_id: shareId })
    .eq("user_id", userId)
    .eq("tmdb_movie_id", tmdbMovieId)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Can't create a share link for a rating that hasn't been saved yet.");
  return shareId;
}

// The public read-only share view (app/s/[shareId]/page.jsx) needs to
// look a rating up by share_id alone, with no user_id/movieId in hand
// yet — backed by movie_ratings' own "public read of shared ratings" RLS
// policy (share_id is not null), mirroring season_ratings' identical
// mechanism.
export async function getMovieRatingByShareId(shareId) {
  const { data, error } = await supabase
    .from("movie_ratings")
    .select("tmdb_movie_id, rating, mood, favorite_character_id, favorite_character_name, review_text, review_date, updated_at")
    .eq("share_id", shareId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    movieId: data.tmdb_movie_id,
    rating: data.rating,
    mood: data.mood,
    characterId: toCharacterId(data.favorite_character_id),
    characterName: data.favorite_character_name,
    text: data.review_text ?? "",
    reviewDate: resolveReviewDate(data),
    savedAt: new Date(data.updated_at),
  };
}
