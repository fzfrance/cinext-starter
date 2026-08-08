"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Icon from "@/components/ui/Icon";
import GlassCircle from "@/components/ui/GlassCircle";
import { tmdbImage } from "@/lib/tmdb";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

const TITLE_BY_TYPE = { backdrop: "Change Covers", poster: "Change Poster", logo: "Change Logo" };
const ASPECT_BY_TYPE = { backdrop: "16 / 9", poster: "2 / 3", logo: "16 / 9" };

// Fork of components/ImagePickerScreen.jsx, one media type over — same
// layout/behavior verbatim, only the fetch URL and prop name (movieId
// instead of showId) differ. See that file's own docstring for the full
// reasoning behind the ?picker= deep-link / onClose contract.
export default function MovieImagePickerScreen({ type, movieId, currentUrl, onSelect, onClose }) {
  const [items, setItems] = useState(null); // null = loading
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setFailed(false);
    fetch(`/api/movies/${movieId}/images?type=${type}`)
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setItems(data.items ?? []); })
      .catch((err) => {
        console.error(`Failed to load ${type} options for movie ${movieId}:`, err);
        if (!cancelled) { setItems([]); setFailed(true); }
      });
    return () => { cancelled = true; };
  }, [type, movieId]);

  const handlePick = (filePath) => {
    onSelect(tmdbImage(filePath, "w780"));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50" style={{ background: t.bg }}>
      <div className="h-full overflow-y-auto pb-24" style={{ scrollbarWidth: "none" }}>
        <div className="flex items-center px-6" style={{ paddingTop: "env(safe-area-inset-top)", position: "relative" }}>
          <GlassCircle onClick={onClose} t={t}><Icon name="back" size={16} color={t.text} /></GlassCircle>
          <div style={{ position: "absolute", left: 0, right: 0, textAlign: "center", fontSize: 19, fontWeight: 700, color: "#fff", pointerEvents: "none" }}>
            {TITLE_BY_TYPE[type]}
          </div>
        </div>

        {items == null ? (
          <div style={{ padding: "60px 0", textAlign: "center", fontSize: 13, color: t.textDim }}>Loading options…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: "60px 24px", textAlign: "center", fontSize: 13, color: t.textDim }}>
            {failed ? "Couldn't load options — please try again." : "No options available."}
          </div>
        ) : (
          <div className="px-6 grid grid-cols-3 gap-x-3 gap-y-5" style={{ marginTop: 22 }}>
            {items.map((item) => {
              const url = tmdbImage(item.filePath, "w780");
              const selected = currentUrl === url;
              return (
                <button
                  key={item.filePath}
                  onClick={() => handlePick(item.filePath)}
                  className="relative rounded-xl overflow-hidden active:scale-95 transition"
                  style={{
                    aspectRatio: ASPECT_BY_TYPE[type],
                    boxShadow: "0 6px 16px rgba(0,0,0,0.45)",
                    background: type === "logo" ? t.cardFill : undefined,
                    border: type === "logo" ? `1px solid ${t.cardBorder}` : "none",
                  }}
                >
                  <Image
                    src={url}
                    alt=""
                    fill
                    sizes="200px"
                    style={type === "logo" ? { objectFit: "contain", padding: 10 } : { objectFit: "cover" }}
                  />
                  {selected && (
                    <div className="absolute flex items-center justify-center rounded-full" style={{ top: 6, right: 6, width: 22, height: 22, background: accent }}>
                      <Icon name="check" size={13} color="#1a1108" strokeWidth={2.8} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
