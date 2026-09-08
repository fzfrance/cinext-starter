import Icon from "@/components/ui/Icon";
import { badgeForMedia } from "@/lib/media";

/**
 * Movie / TV label for mixed poster grids.
 * Mobile keeps the text pill ("Movie" / "TV Show"); desktop (≥900px) shows the icon chip.
 */
export default function MediaTypeLabel({ mediaType }) {
  if (mediaType !== "movie" && mediaType !== "tv") return null;
  const { icon, label } = badgeForMedia({ mediaType });
  const text = mediaType === "movie" ? "Movie" : "TV Show";
  return (
    <span className="explore-media-type-label" aria-label={label} title={label}>
      <span className="explore-media-type-label-text">{text}</span>
      <span className="explore-media-type-label-icon" aria-hidden="true">
        <Icon name={icon} size={11} color="#fff" strokeWidth={1.9} />
      </span>
    </span>
  );
}
