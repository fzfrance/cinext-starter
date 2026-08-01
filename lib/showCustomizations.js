// ---------------------------------------------------------------------------
// Custom cover/poster/logo picks (Supabase `show_customizations` table)
// ---------------------------------------------------------------------------
// One row per (user, show), independent of user_shows — see
// supabase/schema.sql's comment on this table for why it isn't just
// columns on user_shows. Each of the three url columns is nullable and
// upserted independently; null means "no override, use TMDB's default
// art for this category".

import { supabase } from "@/lib/supabase";

const FIELD_BY_TYPE = { backdrop: "custom_backdrop_url", poster: "custom_poster_url", logo: "custom_logo_url" };

// Returns { [tmdbShowId]: { custom_backdrop_url, custom_poster_url, custom_logo_url } }
// for every show this user has customized anything for — the shared
// favorites-context-style bulk load (see lib/show-customizations-context.jsx),
// so every screen that renders a poster reads from one already-loaded set
// instead of querying per show.
export async function getAllShowCustomizations(userId) {
  const { data, error } = await supabase
    .from("show_customizations")
    .select("tmdb_show_id, custom_backdrop_url, custom_poster_url, custom_logo_url")
    .eq("user_id", userId);
  if (error) throw error;

  const byShow = {};
  for (const row of data) byShow[row.tmdb_show_id] = row;
  return byShow;
}

// Upsert-only, unlike user_shows writes — a custom art pick has nothing
// to do with library membership (it's fine to customize a show's poster
// before ever adding it to any list), so there's no "must already exist"
// guard the way lib/userShows.js's setShowFavorite has. Upsert only
// touches the one column present in the payload (same reasoning as
// setShowStatus's comment), so setting a poster never clobbers an
// already-picked backdrop/logo on the same row.
export async function setShowCustomImage(userId, tmdbShowId, type, url) {
  const field = FIELD_BY_TYPE[type];
  if (!field) throw new Error(`Unknown custom image type: ${type}`);

  const { error } = await supabase.from("show_customizations").upsert(
    { user_id: userId, tmdb_show_id: tmdbShowId, [field]: url, updated_at: new Date().toISOString() },
    { onConflict: "user_id,tmdb_show_id" }
  );
  if (error) throw error;
}
