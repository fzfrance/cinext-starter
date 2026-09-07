"use client";

import Image from "next/image";
import Icon from "@/components/ui/Icon";
import { tmdbImage } from "@/lib/tmdb";

// Desktop collection picker — enough thumbs to fill the wide row without
// crowding the check control on the right.
const PREVIEW_LIMIT = 9;

/**
 * Compact collection row for the desktop quick-add popover / view-all modal.
 * Name + count, poster strip (+N), check on the right.
 */
export default function CollectionQuickRow({ collection, onClick }) {
  const covers = collection.covers ?? [];
  const shown = covers.slice(0, PREVIEW_LIMIT);
  const extra = Math.max(0, (collection.count || 0) - shown.length);

  return (
    <button type="button" className="show-collection-row" onClick={onClick}>
      <div className="show-collection-row-main">
        <div className="show-collection-row-text">
          <div className="show-collection-row-name">{collection.name}</div>
          <div className="show-collection-row-count">
            {collection.count} title{collection.count === 1 ? "" : "s"}
          </div>
        </div>
        <div className="show-collection-thumbs" aria-hidden="true">
          {shown.map((item, i) => {
            const src = tmdbImage(item.posterPath, "w92");
            return (
              <div
                key={`${item.mediaType || "tv"}-${item.id}-${i}`}
                className="show-collection-thumb"
                style={{ zIndex: shown.length - i }}
              >
                {src ? (
                  <Image src={src} alt="" fill sizes="41px" style={{ objectFit: "cover" }} />
                ) : (
                  <div className="show-collection-thumb-fallback" />
                )}
              </div>
            );
          })}
          {extra > 0 && (
            <div className="show-collection-thumb-more">+{extra}</div>
          )}
        </div>
      </div>
      <span className={`show-collection-check${collection.inShow ? " is-on" : ""}`}>
        {collection.inShow ? <Icon name="check" size={12} color="#111" strokeWidth={2.8} /> : null}
      </span>
    </button>
  );
}
