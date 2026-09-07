"use client";

import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import PosterCard from "@/components/ui/PosterCard";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// One section per collection — heading + chevron, horizontal PosterCards.
// Desktop Library passes posterWidth=168 + withShelf to match Movies/Shows
// genre shelves; mobile keeps the compact 104 default.
export default function CollectionRow({
  id,
  name,
  shared,
  items,
  posterWidth = 104,
  withShelf = false,
}) {
  const router = useRouter();
  if (!items.length) return null;
  return (
    <div className="library-collection-row">
      <div className="library-collection-row-head">
        <span className="library-collection-row-title">{name}</span>
        {shared && (
          <span className="library-collection-row-shared">
            <Icon name="globe" size={10} color={accent} />
            <span>SHARED</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => router.push(`/profile/collections/${id}`)}
          className="library-collection-row-more"
          aria-label={`Open ${name}`}
        >
          <Icon name="chevronRight" size={16} color={t.textDim} />
        </button>
      </div>
      <div className="library-collection-row-scroller no-scrollbar">
        <div className="library-collection-row-track-wrap">
          <div className="library-collection-row-track" style={{ gap: posterWidth >= 140 ? 16 : 10 }}>
            {items.map((s) => (
              <div
                key={`${s.mediaType ?? "tv"}-${s.id}`}
                className="library-collection-poster"
                data-lib-ambient={s.posterPath || undefined}
              >
                <PosterCard
                  show={s}
                  href={s.mediaType === "movie" ? `/movie/${s.id}` : `/show/${s.id}`}
                  width={posterWidth}
                  titlePlacement="overlay"
                  favorite={s.favorite}
                  pressScale={false}
                  tmdbSize="w342"
                  sizes={`${posterWidth}px`}
                />
              </div>
            ))}
            <div className="library-collection-row-endcap" aria-hidden="true" />
          </div>
          {withShelf ? <div className="library-aisle-shelf" aria-hidden="true" /> : null}
        </div>
      </div>
    </div>
  );
}
