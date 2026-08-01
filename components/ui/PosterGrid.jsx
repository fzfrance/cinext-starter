import { Children } from "react";

/**
 * PosterGrid — shared responsive poster grid for every "browse many
 * posters at once" screen (Profile Library, Home's In Progress/Watchlist
 * See All, Collections detail, Favorites). Replaces page-specific
 * `grid-cols-3` / `flex flex-wrap` / fixed-px `auto-fill` layouts, all of
 * which left dead space on the right on wider phones/tablets — a fixed
 * column count doesn't grow with the container, and `auto-fill` with a
 * fixed (non-1fr) track size just repeats as many same-size columns as
 * fit, reserving empty trailing tracks instead of redistributing that
 * width.
 *
 * `auto-fit` (not the `auto-fill` in a naive "responsive grid" snippet)
 * is what actually makes an incomplete final row centered instead of
 * left-aligned with a gap after it: auto-fit collapses unused tracks to
 * zero width and lets the real ones share what's left via `1fr`, so a
 * short last row's cards grow to fill the row — each capped at
 * `maxCardWidth` (via the per-child wrapper below) so they don't blow up
 * to fill an entire wide column, and `justify-content: center`
 * re-centers whatever's left once every card has hit that cap.
 *
 * Each child is wrapped in its own `width: 100%; max-width: maxCardWidth`
 * box rather than adding a maxWidth prop to PosterCard itself — every
 * caller already passes `width="100%"` PosterCards (or similar draggable
 * wrapper divs around them, e.g. Collections/Favorites' reorder mode),
 * and this way the cap applies uniformly without those call sites
 * needing to change.
 *
 * fixed: true switches to `repeat(auto-fill, minmax(minCardWidthpx, 1fr))`
 * — auto-fill (not auto-fit) computes the same max whole number of
 * minCardWidth-or-wider tracks the container can hold, but — unlike
 * auto-fit — does NOT collapse a track to zero width just because no
 * item landed in it. Every track, filled or not, shares the container's
 * full width equally via 1fr. That combination is exactly what this mode
 * needs and the other two modes don't:
 *   - vs. the old literal fixed-px auto-fill (`repeat(auto-fill,
 *     ${minCardWidth}px)`): that left a partial track's worth of unused
 *     space whenever the container width wasn't an exact multiple of
 *     minCardWidth (very common on a narrow phone — e.g. a 128px card in
 *     a ~330px content width fits 2 columns with ~55px left over), and
 *     `justify-content: center` split that leftover into equal dead
 *     margins beyond the container's own edge padding — "way too much
 *     side padding," only on a phone since a wide desktop window has far
 *     more columns and a proportionally tiny, unnoticeable leftover.
 *     1fr tracks remove the leftover entirely; every card always spans
 *     its exact equal share of the full width.
 *   - vs. the default auto-fit mode below: auto-fit's track-collapsing
 *     is wrong here because Favorites/Home's "See All" grids can have as
 *     few as one item — auto-fit would collapse every *other* track to
 *     zero and let that lone card's 1fr balloon to the entire container
 *     width, wildly oversized compared to Home's own horizontal-scroll
 *     row. auto-fill keeps the reserved column count (and therefore each
 *     card's width) constant regardless of how many items actually fill
 *     it — unused trailing tracks just render as blank space, not a
 *     stretched card.
 * Callers must pass `width="100%"` on their PosterCard (not a fixed px
 * width) so the rendered card itself stretches to match its track's
 * width — see Home's In Progress/Watchlist "See All" grids and
 * Favorites.
 *
 * alignItems: "start" — grid's default (stretch) would otherwise size
 * every cell to the row's tallest card (e.g. one with a two-line
 * subtitle), leaving shorter cards visually uneven even though each
 * poster itself is already a fixed 2:3 box. Every card keeps its own
 * natural height instead.
 *
 * columns: a fixed column *count* (e.g. 4) instead of a fixed column
 * *width* — `repeat(columns, 1fr)`, so every card is always exactly
 * `container / columns` wide regardless of viewport size, unlike `fixed`
 * (constant px width, so the column count itself varies by viewport) or
 * the default auto-fit mode (both width and count can vary). Takes
 * priority over `fixed`/minCardWidth/maxCardWidth when set. Children
 * render directly (like `fixed`) — no wrapper needed since the column
 * itself is already the size constraint.
 */
export default function PosterGrid({ children, minCardWidth = 140, maxCardWidth = 180, gap = 16, fixed = false, columns, className = "", style }) {
  const gridTemplateColumns = columns
    ? `repeat(${columns}, 1fr)`
    : fixed
    ? `repeat(auto-fill, minmax(${minCardWidth}px, 1fr))`
    : `repeat(auto-fit, minmax(${minCardWidth}px, 1fr))`;

  return (
    <div
      className={`grid ${className}`}
      style={{
        gridTemplateColumns,
        gap,
        justifyItems: "center",
        justifyContent: "center",
        alignItems: "start",
        ...style,
      }}
    >
      {columns || fixed
        ? children
        : Children.map(children, (child) => (
            <div style={{ width: "100%", maxWidth: maxCardWidth }}>{child}</div>
          ))}
    </div>
  );
}
