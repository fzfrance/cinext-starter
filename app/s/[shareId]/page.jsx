import { notFound } from "next/navigation";
import Icon from "@/components/ui/Icon";
import PosterArt from "@/components/ui/PosterArt";
import { getSeasonRatingByShareId } from "@/lib/seasonRatings";
import { getMovieRatingByShareId } from "@/lib/movieRatings";
import { getShowDetails, getMovieDetails } from "@/lib/tmdb";
import { fallbackPalette, seasonLabel } from "@/lib/library";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// Public, read-only view for a season/movie rating someone explicitly
// shared via Share (Show Detail/Movie Detail's rating screens) —
// reachable with no auth, backed by season_ratings'/movie_ratings' own
// "public read of shared ratings" RLS policy (only rows with a share_id
// set at all). Deliberately doesn't expose which user this is (no
// username/profile lookup) — sharing a single rating is opt-in per-item,
// not an invitation to browse someone's whole profile.
//
// share_id values from both tables are drawn from the same generation
// scheme (lib/seasonRatings.js's ensureShareId / lib/movieRatings.js's
// ensureMovieShareId — both crypto.randomUUID().slice(0,10)), so a
// shareId can only ever validly resolve against ONE of the two tables in
// practice; tries the season lookup first, falls back to the movie one.
export const metadata = { title: "Cinext — Rating" };

export default async function SharedRatingPage({ params }) {
  const seasonRating = await getSeasonRatingByShareId(params.shareId);
  const movieRating = seasonRating ? null : await getMovieRatingByShareId(params.shareId);
  if (!seasonRating && !movieRating) notFound();

  const rating = seasonRating ?? movieRating;
  const show = seasonRating ? await getShowDetails(seasonRating.showId).catch(() => null) : null;
  const movie = movieRating ? await getMovieDetails(movieRating.movieId).catch(() => null) : null;
  const title = seasonRating ? (show?.name ?? "Unknown Show") : (movie?.title ?? "Unknown Movie");
  const posterPath = seasonRating ? show?.poster_path : movie?.poster_path;
  const { base, glow } = fallbackPalette(seasonRating ? seasonRating.showId : movieRating.movieId);
  const subLabel = seasonRating ? seasonLabel(seasonRating.seasonNumber) : (movie?.release_date ? movie.release_date.slice(0, 4) : "");

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6" style={{ background: t.bg }}>
      <div className="relative rounded-3xl overflow-hidden" style={{ width: 288, height: 478, boxShadow: "0 30px 70px rgba(0,0,0,0.6)" }}>
        <PosterArt posterPath={posterPath} base={base} glow={glow} alt={title} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 45%, rgba(0,0,0,0.4) 100%)" }} />

        <div className="relative h-full flex flex-col items-center text-center" style={{ padding: "24px 22px 20px" }}>
          <div className="flex items-center gap-1" style={{ opacity: 0.5 }}>
            <Icon name="sparkle" size={9} color="#fff" />
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", color: "#fff" }}>CINEXT</span>
          </div>

          <div className="relative rounded-2xl overflow-hidden flex-shrink-0" style={{ width: 96, height: 142, marginTop: 16, boxShadow: "0 16px 32px rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.16)" }}>
            <PosterArt posterPath={posterPath} base={base} glow={glow} alt={title} />
          </div>

          <div style={{ fontSize: 11, letterSpacing: "0.14em", color: "rgba(255,255,255,0.75)", fontWeight: 600, marginTop: 14 }}>{title.toUpperCase()}</div>
          {subLabel && <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginTop: 2 }}>{subLabel}</div>}

          <div className="flex items-center gap-1.5" style={{ marginTop: 10 }}>
            <Icon name="star" size={16} color={accent} />
            <span style={{ fontSize: 24, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{rating.rating.toFixed(1)}</span>
            <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)" }}>/10</span>
          </div>

          {rating.characterName && (
            <div className="flex items-center gap-1.5 rounded-full" style={{ marginTop: 12, padding: "4px 9px", background: "rgba(255,255,255,0.12)" }}>
              <span style={{ fontSize: 10.5, color: "#fff", fontWeight: 600 }}>{rating.characterName}</span>
            </div>
          )}

          {rating.text && (
            <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "rgba(255,255,255,0.85)", fontStyle: "italic", marginTop: 14 }}>
              &ldquo;{rating.text}&rdquo;
            </div>
          )}
        </div>
      </div>

      <a href="/" className="rounded-full active:scale-95 transition" style={{ marginTop: 22, padding: "11px 22px", background: t.cardFill, border: `1px solid ${t.glassBorder}` }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Open Cinext</span>
      </a>
    </div>
  );
}
