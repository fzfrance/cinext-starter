import { themes } from "@/lib/theme";
import Icon from "@/components/ui/Icon";

const t = themes.dark;

/**
 * GenreTag
 * -----------------------------------------------------------------------
 * The pill used for genres (and anything else that's "a labeled category
 * with one accent color") — e.g. Top Genres on Highlights, genre chips on
 * Show Detail, filter chips on Browse.
 *
 * Design contract: a genre is defined by exactly ONE color. Everything else
 * (icon stroke, swatch tint, border) is derived from that single value, so
 * adding a new genre never requires a second design decision.
 *
 * Usage:
 *   <GenreTag name="Drama" color="#e8a24c" />
 *   <GenreTag name="Sci-Fi" color="#a985e8" icon="sparkle" />
 *   <GenreTag name="Thriller" color="#6fb4ee" selected onClick={...} />
 */

// Derives the low-opacity swatch background from a genre's single accent color.
// 0x22 ≈ 13% opacity — enough to tint, not enough to compete with the icon.
function swatchBg(color) {
  return `${color}22`;
}

export default function GenreTag({
  name,
  color,
  icon = "sparkle",
  emoji, // optional — real emoji instead of the SVG icon when provided (Highlights' Top Genres); other callers that don't pass one keep the icon exactly as before
  selected = false,
  onClick,
}) {
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      onClick={onClick}
      className="flex-shrink-0 flex items-center gap-2.5 rounded-full active:scale-95 transition"
      style={{
        padding: "10px 16px",
        background: selected ? `${color}14` : t.cardFill,
        border: `1px solid ${selected ? color : t.cardBorder}`,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 7,
          background: swatchBg(color),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {emoji ? <span style={{ fontSize: 12, lineHeight: 1 }}>{emoji}</span> : <Icon name={icon} size={11} color={color} />}
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
        {name}
      </span>
    </Tag>
  );
}

/**
 * GenreTagRow
 * -----------------------------------------------------------------------
 * Horizontal scrollable row wrapper — the layout Top Genres uses. Pass the
 * same [{ name, color }] shape already used in monthsData.topGenres, or any
 * genre/category list with that shape.
 *
 * Usage:
 *   <GenreTagRow genres={data.topGenres} />
 *   <GenreTagRow genres={allGenres} selected={activeGenre} onSelect={setActiveGenre} />
 */
export function GenreTagRow({ genres, selected, onSelect }) {
  return (
    <div
      className="flex gap-2.5 overflow-x-auto px-6"
      style={{ scrollbarWidth: "none" }}
    >
      {genres.map((g) => (
        <GenreTag
          key={g.name}
          name={g.name}
          color={g.color}
          icon={g.icon}
          emoji={g.emoji}
          selected={selected === g.name}
          onClick={onSelect ? () => onSelect(g.name) : undefined}
        />
      ))}
    </div>
  );
}
