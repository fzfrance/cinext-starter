// ---------------------------------------------------------------------------
// Custom cover/poster/logo picks (Supabase `movie_customizations` table)
// ---------------------------------------------------------------------------
// Fork of lib/showCustomizations.js, one media type over — see that
// file's own comment for why this is a separate table rather than
// columns on user_movies. Each of the three url columns is nullable and
// upserted independently; null means "no override, use TMDB's default
// art for this category".

import { supabase } from "@/lib/supabase";

const FIELD_BY_TYPE = { backdrop: "custom_backdrop_url", poster: "custom_poster_url", logo: "custom_logo_url" };

// Returns { [tmdbMovieId]: { custom_backdrop_url, custom_poster_url, custom_logo_url } }
// for every movie this user has customized anything for — the shared
// favorites-context-style bulk load (see lib/movie-customizations-context.jsx).
export async function getAllMovieCustomizations(userId) {
  const { data, error } = await supabase
    .from("movie_customizations")
    .select("tmdb_movie_id, custom_backdrop_url, custom_poster_url, custom_logo_url")
    .eq("user_id", userId);
  if (error) throw error;

  const byMovie = {};
  for (const row of data) byMovie[row.tmdb_movie_id] = row;
  return byMovie;
}

// Upsert-only — a custom art pick has nothing to do with library
// membership, same reasoning as setShowCustomImage. Only touches the one
// column present in the payload, so setting a poster never clobbers an
// already-picked backdrop/logo on the same row.
export async function setMovieCustomImage(userId, tmdbMovieId, type, url) {
  const field = FIELD_BY_TYPE[type];
  if (!field) throw new Error(`Unknown custom image type: ${type}`);

  const { error } = await supabase.from("movie_customizations").upsert(
    { user_id: userId, tmdb_movie_id: tmdbMovieId, [field]: url, updated_at: new Date().toISOString() },
    { onConflict: "user_id,tmdb_movie_id" }
  );
  if (error) throw error;
}
