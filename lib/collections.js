// ---------------------------------------------------------------------------
// Collections (Supabase `collections` + `collection_shows` tables)
// ---------------------------------------------------------------------------
// `collection_shows` has no user_id column of its own — RLS scopes it via
// its parent `collections` row (auth.uid() = collections.user_id), so every
// write here is only ever reachable for collections the caller's own
// session actually owns; there's nothing extra to check client-side.

import { supabase } from "@/lib/supabase";

// Returns [{ id, name, description, coverStyle, createdAt, showIds, movieIds }]
// for the user's whole collections list, newest first. movieIds queried
// independently from collection_movies (a separate table, not a schema
// change to collection_shows — see supabase/schema.sql) and caught on its
// own so a still-missing collection_movies table degrades to "no movies
// in any collection" rather than breaking Collections entirely.
export async function getCollections(userId) {
  const { data: collections, error } = await supabase
    .from("collections")
    .select("id, name, description, cover_style, created_at, shared")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (collections.length === 0) return [];

  const collectionIds = collections.map((c) => c.id);
  const { data: shows, error: showsError } = await supabase
    .from("collection_shows")
    .select("collection_id, tmdb_show_id")
    .in("collection_id", collectionIds);
  if (showsError) throw showsError;

  const movies = await supabase
    .from("collection_movies")
    .select("collection_id, tmdb_movie_id")
    .in("collection_id", collectionIds)
    .then((res) => res.data ?? [])
    .catch((err) => { console.error(err); return []; });

  return collections.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    coverStyle: c.cover_style,
    createdAt: c.created_at,
    // Cosmetic-only for now (see the Library shelf's "SHARED" badge) — no
    // real multi-user access/RLS change backs this yet.
    shared: c.shared ?? false,
    showIds: shows.filter((s) => s.collection_id === c.id).map((s) => s.tmdb_show_id),
    movieIds: movies.filter((m) => m.collection_id === c.id).map((m) => m.tmdb_movie_id),
  }));
}

// Single collection + its shows/movies, for the collection detail page.
export async function getCollection(userId, collectionId) {
  const { data: collection, error } = await supabase
    .from("collections")
    .select("id, name, description, cover_style, created_at, shared")
    .eq("user_id", userId)
    .eq("id", collectionId)
    .maybeSingle();
  if (error) throw error;
  if (!collection) return null;

  const { data: shows, error: showsError } = await supabase
    .from("collection_shows")
    .select("tmdb_show_id, added_at")
    .eq("collection_id", collectionId)
    .order("added_at", { ascending: true });
  if (showsError) throw showsError;

  const movies = await supabase
    .from("collection_movies")
    .select("tmdb_movie_id, added_at")
    .eq("collection_id", collectionId)
    .order("added_at", { ascending: true })
    .then((res) => res.data ?? [])
    .catch((err) => { console.error(err); return []; });

  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    coverStyle: collection.cover_style,
    shared: collection.shared ?? false,
    showIds: shows.map((s) => s.tmdb_show_id),
    movieIds: movies.map((m) => m.tmdb_movie_id),
  };
}

// Every collection_shows row across ALL of the user's collections, with
// which collection each addition belongs to — Activity's feed (lib/
// activity.js) needs this to generate "added (Show) to {Collection}"
// events, which getCollections/getCollection don't expose on their own
// (getCollections drops added_at entirely; getCollection only returns one
// collection's own rows).
export async function getRecentCollectionAdditions(userId) {
  const { data: collections, error } = await supabase
    .from("collections")
    .select("id, name")
    .eq("user_id", userId);
  if (error) throw error;
  if (collections.length === 0) return [];

  const nameById = Object.fromEntries(collections.map((c) => [c.id, c.name]));
  const { data: shows, error: showsError } = await supabase
    .from("collection_shows")
    .select("collection_id, tmdb_show_id, added_at")
    .in("collection_id", collections.map((c) => c.id));
  if (showsError) throw showsError;

  return shows.map((s) => ({
    showId: s.tmdb_show_id,
    collectionId: s.collection_id,
    collectionName: nameById[s.collection_id] ?? "a collection",
    addedAt: new Date(s.added_at),
  }));
}

// The one collection-cover field that actually persists (backdropTheme/
// customImage on the detail page stay local-only/cosmetic, see that
// page's own comments) — a real selectable style, not a per-session tweak.
export async function updateCollectionCoverStyle(collectionId, coverStyle) {
  const { error } = await supabase.from("collections").update({ cover_style: coverStyle }).eq("id", collectionId);
  if (error) throw error;
}

// cover_style defaults to "boxset" (real fanned posters from the
// collection's own content), not left null — null reads as "explicitly
// chose the plain gradient," but a freshly created collection hasn't
// chosen anything yet, and a blank gradient card for something the user
// just added a real title to (e.g. the quick "New Collection" flow inside
// Show/Movie Detail's Collections sheet) read as broken, not "no cover
// picked." CollectionBoxSet already handles 0-5 shows gracefully (down to
// just the neutral background when empty), so this is safe from the
// start. Explicitly picking a gradient theme or custom image later
// writes coverStyle back to null itself (see collections/[id]/page.jsx).
export async function createCollection(userId, name, description = null) {
  const { data, error } = await supabase
    .from("collections")
    .insert({ user_id: userId, name, description, cover_style: "boxset" })
    .select("id, name, description, created_at, cover_style")
    .single();
  if (error) throw error;
  return data;
}

export async function renameCollection(collectionId, name) {
  const { error } = await supabase.from("collections").update({ name }).eq("id", collectionId);
  if (error) throw error;
}

export async function updateCollectionDescription(collectionId, description) {
  const { error } = await supabase.from("collections").update({ description }).eq("id", collectionId);
  if (error) throw error;
}

export async function deleteCollection(collectionId) {
  const { error } = await supabase.from("collections").delete().eq("id", collectionId);
  if (error) throw error;
}

// Upsert with ignoreDuplicates so tapping an already-added show twice is a
// harmless no-op instead of a primary-key violation.
export async function addShowToCollection(collectionId, tmdbShowId) {
  const { error } = await supabase.from("collection_shows").upsert(
    { collection_id: collectionId, tmdb_show_id: tmdbShowId },
    { onConflict: "collection_id,tmdb_show_id", ignoreDuplicates: true }
  );
  if (error) throw error;
}

export async function removeShowFromCollection(collectionId, tmdbShowId) {
  const { error } = await supabase
    .from("collection_shows")
    .delete()
    .eq("collection_id", collectionId)
    .eq("tmdb_show_id", tmdbShowId);
  if (error) throw error;
}

// Movie equivalents of the two functions above — collection_movies is a
// separate table (not a schema change to collection_shows), same upsert-
// with-ignoreDuplicates pattern.
export async function addMovieToCollection(collectionId, tmdbMovieId) {
  const { error } = await supabase.from("collection_movies").upsert(
    { collection_id: collectionId, tmdb_movie_id: tmdbMovieId },
    { onConflict: "collection_id,tmdb_movie_id", ignoreDuplicates: true }
  );
  if (error) throw error;
}

export async function removeMovieFromCollection(collectionId, tmdbMovieId) {
  const { error } = await supabase
    .from("collection_movies")
    .delete()
    .eq("collection_id", collectionId)
    .eq("tmdb_movie_id", tmdbMovieId);
  if (error) throw error;
}
