"use client";

import Icon from "@/components/ui/Icon";
import { useFavorites } from "@/lib/favorites-context";
import { useMovieFavorites } from "@/lib/movie-favorites-context";

// Mixed-content version of Explore's own ExploreFavoriteBadge — same
// dark-circle top-right heart, just branching which favorites context to
// read/write based on the item's own mediaType instead of always
// assuming a TV show. One shared component instead of a
// mediaType-ternary repeated at every mixed-content card site
// (TrendingCard/RecommendedCard/hero/Browse All/Search).
export default function MediaFavoriteBadge({ item, source = "unknown" }) {
  const showFavorites = useFavorites();
  const movieFavorites = useMovieFavorites();
  const { isFavorite, toggleFavorite } = item.mediaType === "movie" ? movieFavorites : showFavorites;

  if (!isFavorite(item.id)) return null;
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(item.id, source); }}
      className="absolute flex items-center justify-center active:scale-90 transition"
      style={{ top: 6, right: 6, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.5)", zIndex: 5 }}
    >
      <Icon name="heart" size={13} color="#e0567a" />
    </button>
  );
}
