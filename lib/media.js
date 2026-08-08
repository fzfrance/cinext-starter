// ---------------------------------------------------------------------------
// Mixed-content (movie + TV show) helpers
// ---------------------------------------------------------------------------
// Every item flowing through a mixed-content surface (Explore's hero/
// Trending/For You, Browse All, Search) carries a `mediaType: "movie" |
// "tv"` field. These two helpers are the ONE place that turns that field
// into a route or a badge — every card site calls these instead of its
// own hand-written ternary, so there's one function to get right instead
// of N chances to typo "movie"/"tv" or forget a call site.
//
// mediaKey is the other half of this: movie and TV `id` numbers are NOT
// globally unique across media types (a movie id and a TV show id can
// collide on the same number, referring to two unrelated titles), so
// anywhere mixed-content items get pooled/deduped/keyed by id (Explore's
// hero pool, recommended-for-you's dedup map, status maps, etc.) must use
// this composite key instead of the bare numeric id.

export function hrefForMedia(item) {
  return item.mediaType === "movie" ? `/movie/${item.id}` : `/show/${item.id}`;
}

export function badgeForMedia(item) {
  return item.mediaType === "movie" ? { icon: "ticket", label: "MOVIE" } : { icon: "tv", label: "TV SHOW" };
}

export function mediaKey(item) {
  return `${item.mediaType}-${item.id}`;
}
