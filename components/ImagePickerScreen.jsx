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
// Backdrops/logos are wide (TMDB's own source frames), posters are the
// standard 2:3 — matches the aspect ratio used everywhere else in the app
// for each art category (PosterCard's 2:3, the hero backdrop's 16:9).
const ASPECT_BY_TYPE = { backdrop: "16 / 9", poster: "2 / 3", logo: "16 / 9" };

/**
 * ImagePickerScreen — shared full-screen picker for Show Detail's "..."
 * menu (Change covers / Change poster / Change logo), parameterized by
 * `type` rather than three near-duplicate screens. Fetches TMDB's real
 * image options for this show/category, shows them in the same
 * `grid-cols-3 gap-x-3 gap-y-5` gallery Explore's own section-grid pages
 * use, and saves the instant a thumbnail is tapped — no separate confirm
 * step, matching every other one-tap toggle in this app (favorite heart,
 * status pick, etc).
 *
 * props:
 *   type: "backdrop" | "poster" | "logo"
 *   showId: tmdb_show_id
 *   currentUrl: the show's currently-selected custom_*_url (or null),
 *     from the shared show-customizations context — marks that option
 *     with a checkmark badge.
 *   onSelect(url): called immediately on tap, before closing.
 *   onClose(): back button / picking an image. The caller (ShowDetailClient)
 *     still opens this screen via a `?picker=` URL query param (so the
 *     device/browser back button/swipe gesture closes just this screen
 *     instead of leaving Show Detail entirely), but wires onClose to a
 *     `router.replace` back to the plain show URL rather than
 *     `router.back()` — the on-screen close button needs to work
 *     regardless of how the picker was reached (deep link, refresh, a
 *     double-tap on "..."), and replace doesn't depend on the history
 *     stack looking any particular way the way back() does.
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

  const handlePick = (filePath) => {
    onSelect(tmdbImage(filePath, "w780"));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50" style={{ background: t.bg }}>
      <div className="h-full overflow-y-auto pb-24" style={{ scrollbarWidth: "none" }}>
        <div className="flex items-center px-6" style={{ paddingTop: "env(safe-area-inset-top)", position: "relative" }}>
          <GlassCircle onClick={onClose} t={t}><Icon name="back" size={16} color={t.text} /></GlassCircle>
          {/* pointer-events: none — this absolutely-positioned label spans
              the full row width (left:0/right:0) and, with items-center on
              the row, its static position overlaps the back button's box.
              Positioned elements paint above static ones regardless of DOM
              order, so without this the label (not the button) would
              catch the click. */}
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
                    // Logos are transparent PNGs — a neutral dark card
                    // behind them (instead of the page's own background,
                    // in case that ever changes) is what makes a
                    // white/light logo actually visible and comparable
                    // against the others, rather than floating on
                    // nothing.
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
