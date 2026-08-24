import Link from "next/link";
import Icon from "./Icon";
import PosterArt from "./PosterArt";
import { useShowCustomizations } from "@/lib/show-customizations-context";
import { useLongPress } from "@/lib/useLongPress";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

/**
 * PosterCard — single shared show-poster card, used everywhere a poster
 * needs the standard TMDB 2:3 treatment (Home's rows, Profile's Library /
 * Favorites). Always exactly 2:3 via CSS `aspect-ratio` rather than a
 * hardcoded pixel height, so it stays correct at any width — a fixed px
 * width for horizontal-scroll rows, or "100%" to fill a grid column.
 * PosterArt already gives the image itself `object-fit: cover`; this
 * component is just the consistent card chrome around it (radius, tap
 * feedback, optional title/badge/progress) that every call site used to
 * redefine slightly differently.
 *
 * props:
 *   show: { id, title, posterPath, base, glow } — glow/base are optional
 *     decorative fallback colors (see PosterArt); real TMDB posters don't
 *     need them. When show.id has a custom_poster_url picked (Show
 *     Detail's "..." menu -> Change poster), it's used instead of
 *     show.posterPath automatically — every caller gets this for free,
 *     no prop needed, as long as `show.id` is the tmdb_show_id.
 *   href / onClick: at most one — renders as a Link, a button, or (if
 *     neither) a plain non-interactive div.
 *   width: number (px) or CSS string — default 128 (matches the existing
 *     carousel cards this replaces). Pass "100%" for grid layouts.
 *   shrink: false to omit `flex-shrink: 0` when NOT in a horizontal row.
 *   titlePlacement: "overlay" (dark gradient + title on the image, like
 *     Profile's library cards) or "below" (plain text under the poster,
 *     like Home's watchlist row). Default "below".
 *   subtitle: optional secondary text line under the poster (e.g.
 *     "2019 · Drama" or "S2E4 · Episode 6").
 *   favorite: shows a heart badge, top-right on the poster, filled whenever
 *     true. Static by default; pass `onToggleFavorite` to make it an
 *     interactive toggle button instead — it stops the click from also
 *     triggering card navigation, so a `favorite` + `onToggleFavorite` pair
 *     is safe to combine with `href`/`onClick` on the same card. For a
 *     completely different top-right control (reorder handle, remove "x"
 *     in draggable grids), pass `badge` instead — it renders in the same
 *     slot and takes priority over `favorite` when both are given.
 *   progress: 0–100 — renders a thin progress bar under the poster.
 *   border: optional CSS border override on the poster box (e.g. a dashed
 *     outline while a grid is in drag-reorder mode).
 *   pressScale: set false for cards inside native horizontal scrollers.
 *     Mobile Safari can let the transform started by :active compete with
 *     its pan gesture recognition, making the same row intermittently feel
 *     unresponsive. Defaults true for existing standalone/grid cards.
 *   onLongPress: fn(show, rect) — holding the card (500ms, same mechanics
 *     as Highlights' own episode-row long press, see lib/useLongPress.js)
 *     fires this instead of the card's own href/onClick navigation. `rect`
 *     is the card's own getBoundingClientRect() at press time, for
 *     anchoring a popover (see PosterQuickStatusMenu). Pass undefined/omit
 *     to disable (e.g. while a grid is in drag-reorder mode, where a
 *     native HTML5 drag already owns the press gesture).
 */
// Dark circular backing behind the heart so it stays legible over both
// light and dark posters — the bare icon alone (no backing) could
// disappear against a bright frame.
function FavoriteHeartTag({ onToggle }) {
  const style = { top: 6, right: 6, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.5)" };
  if (!onToggle) {
    return (
      <div className="absolute flex items-center justify-center" style={style}>
        <Icon name="heart" size={13} color="#e0567a" />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
      className="absolute flex items-center justify-center active:scale-90 transition"
      style={style}
    >
      <Icon name="heart" size={13} color="#e0567a" />
    </button>
  );
}

export default function PosterCard({
  show,
  href,
  onClick,
  width = 128,
  shrink = true,
  titlePlacement = "below",
  subtitle,
  favorite = false,
  onToggleFavorite,
  badge,
  progress,
  border,
  tmdbSize,
  sizes,
  pressScale = true,
  onLongPress,
}) {
  const { getCustomPoster } = useShowCustomizations();
  const cssWidth = typeof width === "number" ? `${width}px` : width;
  const Wrapper = href ? Link : onClick ? "button" : "div";

  const longPress = useLongPress((rect) => onLongPress?.(show, rect));
  const wrapperProps = href
    ? { href, onClick: (e) => { if (onLongPress && longPress.consumeClick()) e.preventDefault(); } }
    : onClick
    ? { type: "button", onClick: (e) => { if (onLongPress && longPress.consumeClick()) return; onClick(e); } }
    : {};
  const longPressHandlers = onLongPress ? longPress.handlers : {};

  return (
    <div style={{ width: cssWidth, flexShrink: shrink ? 0 : undefined }}>
      <Wrapper
        {...wrapperProps}
        {...longPressHandlers}
        className={`relative block w-full rounded-2xl overflow-hidden text-left${pressScale ? " active:scale-95 transition" : ""}`}
        style={{
          aspectRatio: "2 / 3",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          border: border || "none",
          ...(!pressScale || onLongPress ? { touchAction: "manipulation", WebkitTouchCallout: "none", WebkitTapHighlightColor: "transparent" } : null),
        }}
      >
        <PosterArt posterPath={show.posterPath} overrideSrc={getCustomPoster(show.id)} base={show.base} glow={show.glow} alt={show.title} tmdbSize={tmdbSize} sizes={sizes} />
        {titlePlacement === "overlay" && (
          <div className="absolute inset-0 flex items-end p-2.5" style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.65) 0%, transparent 50%)" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", lineHeight: 1.25 }}>{show.title}</span>
          </div>
        )}
        {badge ? (
          <div className="absolute" style={{ top: 6, right: 6 }}>{badge}</div>
        ) : favorite && (
          <FavoriteHeartTag onToggle={onToggleFavorite} />
        )}
      </Wrapper>

      {/* height + line-clamp together, not line-clamp alone — clamp only
          stops text past 2 lines, it doesn't reserve space for text
          shorter than that, so a 1-line title and a 2-line title on
          neighboring cards would still leave the progress bar (and
          anything else below) at two different vertical positions across
          a row/grid. The explicit height is what actually keeps every
          card's text block — and everything under it — aligned
          regardless of content length. */}
      {titlePlacement === "below" && (
        <div
          className="mt-2 text-white text-[13px] font-semibold"
          style={{ lineHeight: 1.25, height: "2.5em", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {show.title}
        </div>
      )}
      {subtitle && (
        <div
          className="text-[11px]"
          style={{ marginTop: titlePlacement === "below" ? 2 : 6, color: t.textDim, lineHeight: 1.4, height: "2.8em", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {subtitle}
        </div>
      )}
      {progress != null && (
        <div className="mt-2 rounded-full" style={{ height: 3, background: "rgba(255,255,255,0.18)" }}>
          <div style={{ width: `${progress}%`, height: "100%", background: accent, borderRadius: 4 }} />
        </div>
      )}
    </div>
  );
}
