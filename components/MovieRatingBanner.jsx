"use client";

import Icon from "@/components/ui/Icon";
import PosterArt from "@/components/ui/PosterArt";
import { moodMetasFromField } from "@/components/SeasonBanner";
import { DEFAULT_ACCENT } from "@/lib/theme";

const accent = DEFAULT_ACCENT;

// Movie Detail's "My Rating" tab summary row — fork of SeasonBanner minus
// the AUTO badge/auto-score state entirely: a movie has no per-episode
// ratings to average, so it's simply rated (manual) or not-yet-rated
// (empty), never "auto". Reuses SeasonBanner's own moodMetasFromField
// (generic mood vocabulary, no reason to duplicate it).

const fmtDate = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export default function MovieRatingBanner({ movie, manual, backdropPath, logoUrl, onClick }) {
  const moodMetas = manual ? moodMetasFromField(manual.mood) : [];
  const isEmpty = !manual;
  return (
    <button
      onClick={onClick}
      className="relative w-full rounded-2xl overflow-hidden text-left active:scale-[0.98] transition flex items-center"
      style={{ height: 84, marginBottom: 10, border: manual ? "none" : "1.5px dashed rgba(255,255,255,0.14)" }}
    >
      <PosterArt posterPath={backdropPath || movie.posterPath} base={movie.base} glow={movie.glow} alt={movie.title} />
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(100deg, rgba(0,0,0,${isEmpty ? 0.72 : 0.62}) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.15) 100%)` }} />

      <div className="relative flex items-center w-full" style={{ padding: "0 15px", gap: 12 }}>
        <div className="relative flex-shrink-0 rounded-lg overflow-hidden" style={{ width: 44, height: 66, boxShadow: "0 4px 10px rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.18)" }}>
          <PosterArt posterPath={movie.posterPath} base={movie.base} glow={movie.glow} alt={movie.title} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- resolved TMDB CDN URL
              <img src={logoUrl} alt="" style={{ maxWidth: 74, maxHeight: 16, objectFit: "contain" }} />
            ) : (
              <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{movie.title}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 3 }}>
            {manual ? (
              <>
                {moodMetas.length > 0 && <span style={{ fontSize: 12.5 }}>{moodMetas.map((m) => m.emoji).join(" ")}</span>}
                {manual.characterName && <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.75)" }}>{manual.characterName}</span>}
                <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)" }}>{fmtDate(manual.savedAt)}</span>
              </>
            ) : (
              <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)" }}>Not rated yet — tap to rate</span>
            )}
          </div>
        </div>
        {manual ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <Icon name="star" size={13} color={accent} />
            <span style={{ fontSize: 16, fontWeight: 800, color: accent }}>{manual.rating.toFixed(1)}</span>
          </div>
        ) : (
          <div className="flex items-center justify-center flex-shrink-0 rounded-full" style={{ width: 26, height: 26, background: "rgba(255,255,255,0.08)" }}>
            <Icon name="star" size={12} color="rgba(255,255,255,0.4)" />
          </div>
        )}
      </div>
    </button>
  );
}
