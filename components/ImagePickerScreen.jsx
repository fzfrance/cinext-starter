"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Icon from "@/components/ui/Icon";
import { tmdbImage } from "@/lib/tmdb";

const TITLE_BY_TYPE = { backdrop: "Change Covers", poster: "Change Poster", logo: "Change Logo" };
// Backdrops/logos are wide (TMDB's own source frames), posters are the
// standard 2:3 — matches the aspect ratio used everywhere else in the app
// for each art category (PosterCard's 2:3, the hero backdrop's 16:9).
const ASPECT_BY_TYPE = { backdrop: "16 / 9", poster: "2 / 3", logo: "16 / 9" };

/**
 * ImagePickerScreen — compact liquid-glass popup for Show Detail's "..."
 * menu (Change covers / Change poster / Change logo). Fetches TMDB image
 * options and saves on tap (no confirm step).
 *
 * Opened via `?picker=` so browser back still dismisses just the picker.
 */
export default function ImagePickerScreen({ type, showId, currentUrl, onSelect, onClose }) {
  const [items, setItems] = useState(null); // null = loading
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setFailed(false);
    fetch(`/api/shows/${showId}/images?type=${type}`)
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setItems(data.items ?? []); })
      .catch((err) => {
        console.error(`Failed to load ${type} options for show ${showId}:`, err);
        if (!cancelled) { setItems([]); setFailed(true); }
      });
    return () => { cancelled = true; };
  }, [type, showId]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handlePick = (filePath) => {
    onSelect(tmdbImage(filePath, "w780"));
    onClose();
  };

  const gridClass = type === "poster"
    ? "image-picker-grid is-poster"
    : "image-picker-grid is-wide";

  return (
    <div className="image-picker-scrim" onClick={onClose}>
      <div
        className="image-picker-card"
        role="dialog"
        aria-label={TITLE_BY_TYPE[type]}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="image-picker-head">
          <div className="image-picker-title">{TITLE_BY_TYPE[type]}</div>
          <button type="button" className="image-picker-close" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={16} color="#fff" strokeWidth={2.2} />
          </button>
        </div>

        <div className="image-picker-body">
          {items == null ? (
            <div className="image-picker-status">Loading options…</div>
          ) : items.length === 0 ? (
            <div className="image-picker-status">
              {failed ? "Couldn't load options — please try again." : "No options available."}
            </div>
          ) : (
            <div className={gridClass}>
              {items.map((item) => {
                const url = tmdbImage(item.filePath, "w780");
                const selected = currentUrl === url;
                return (
                  <button
                    key={item.filePath}
                    type="button"
                    onClick={() => handlePick(item.filePath)}
                    className={`image-picker-option${type === "logo" ? " is-logo" : ""}${selected ? " is-selected" : ""}`}
                    style={{ aspectRatio: ASPECT_BY_TYPE[type] }}
                  >
                    <Image
                      src={url}
                      alt=""
                      fill
                      sizes={type === "poster" ? "120px" : "180px"}
                      style={type === "logo" ? { objectFit: "contain", padding: 10 } : { objectFit: "cover" }}
                    />
                    {selected && (
                      <div className="image-picker-selected">
                        <Icon name="check" size={12} color="#1a1108" strokeWidth={2.8} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
