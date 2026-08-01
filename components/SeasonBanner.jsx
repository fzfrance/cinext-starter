"use client";

import Icon from "@/components/ui/Icon";
import PosterArt from "@/components/ui/PosterArt";
import { DEFAULT_ACCENT } from "@/lib/theme";

const accent = DEFAULT_ACCENT;

// Canonical season-mood list, for DISPLAY lookups (MOOD_LIST.find(id))
// wherever an already-saved season rating's mood needs to resolve to its
// emoji/label — this is the full set ever used, including "bored", which
// the actual input UI (SEASON_MOOD_LIST below) no longer offers as a new
// choice but which older saved ratings can still carry. "wow"'s id is
// kept as-is (not renamed to "impressed") for the same reason — only its
// display label changed, so existing rows keep resolving correctly.
export const MOOD_LIST = [
  { id: "wow", label: "Impressed", emoji: "😮" },
  { id: "satisfied", label: "Satisfied", emoji: "😌" },
  { id: "thrilled", label: "Thrilled", emoji: "🤩" },
  { id: "touched", label: "Touched", emoji: "🥹" },
  { id: "amused", label: "Amused", emoji: "😂" },
  { id: "sad", label: "Sad", emoji: "😭" },
  { id: "frustrated", label: "Frustrated", emoji: "😤" },
  { id: "reflective", label: "Reflective", emoji: "🤔" },
  { id: "shocked", label: "Shocked", emoji: "😱" },
  { id: "tense", label: "Tense", emoji: "😰" },
  { id: "scared", label: "Scared", emoji: "😨" },
  { id: "disappointed", label: "Disappointed", emoji: "😞" },
  { id: "bored", label: "Bored", emoji: "😑" },
];

// The actual input choices for rating a season — MOOD_LIST minus the
// legacy-only "bored" entry, same order (renders as 3 rows of 4 in the
// season rating screen's grid).
export const SEASON_MOOD_LIST = MOOD_LIST.filter((m) => m.id !== "bored");

// season_ratings.mood is still a single `text` column — multiple selections
// are stored as a comma-joined list of ids ("satisfied,shocked") rather
// than needing a schema/type migration. Every reader of a saved mood value
// should go through these two instead of a raw MOOD_LIST.find(id ===
// manual.mood), which only ever matched the first id in a multi-mood
// string. A plain old single-id value (everything saved before this
// feature) is just a "list of one" here, so it keeps resolving correctly
// with no backfill needed.
export function moodIdsFromField(moodField) {
  if (!moodField) return [];
  return moodField.split(",").map((s) => s.trim()).filter(Boolean);
}
export function moodMetasFromField(moodField) {
  return moodIdsFromField(moodField)
    .map((id) => MOOD_LIST.find((m) => m.id === id))
    .filter(Boolean);
}

const fmtDate = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

// Compact season preview card — three states, all always rendered (no
// filtering): manual (a real saved season_ratings row), auto (no manual
// row, but some episodes in this season have been star-rated — see
// lib/seasonRatings.js's getAutoSeasonScore), empty (neither). Background
// is the SHOW's own backdrop (landscape) when available — not the
// vertical season poster, which crops badly into this wide/short card —
// with the show's real logo art standing in for the plain-text title
// wherever TMDB has one, same "real logo over real art" treatment used on
// Show Detail's own header and the season rating screen.
export default function SeasonBanner({ season, manual, auto, backdropPath, logoUrl, onClick }) {
  const moodMetas = manual ? moodMetasFromField(manual.mood) : [];
  const isEmpty = !manual && !auto;
  const score = manual ? manual.rating : auto ? auto.avg10 : null;
  return (
    <button
      onClick={onClick}
      className="relative w-full rounded-2xl overflow-hidden text-left active:scale-[0.98] transition flex items-center"
      style={{ height: 84, marginBottom: 10, border: manual ? "none" : "1.5px dashed rgba(255,255,255,0.14)" }}
    >
      <PosterArt posterPath={backdropPath || season.posterPath} base={season.base} glow={season.glow} alt={season.title} />
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(100deg, rgba(0,0,0,${isEmpty ? 0.72 : 0.62}) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.15) 100%)` }} />

      <div className="relative flex items-center w-full" style={{ padding: "0 15px", gap: 12 }}>
        {/* Real season poster inset, left side — matches the reference's
            small framed poster next to episode info, rather than relying
            only on the full-bleed backdrop behind the whole card. */}
        <div className="relative flex-shrink-0 rounded-lg overflow-hidden" style={{ width: 44, height: 66, boxShadow: "0 4px 10px rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.18)" }}>
          <PosterArt posterPath={season.posterPath} base={season.base} glow={season.glow} alt={season.title} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- resolved TMDB CDN URL
              <img src={logoUrl} alt="" style={{ maxWidth: 74, maxHeight: 16, objectFit: "contain" }} />
            ) : null}
            <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{season.title}</span>
            {!manual && !isEmpty && (
              <span className="flex items-center gap-1" style={{ fontSize: 9, fontWeight: 700, color: accent }}>
                <Icon name="sparkle" size={8} color={accent} />AUTO
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 3 }}>
            {manual ? (
              <>
                {moodMetas.length > 0 && <span style={{ fontSize: 12.5 }}>{moodMetas.map((m) => m.emoji).join(" ")}</span>}
                {manual.characterName && <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.75)" }}>{manual.characterName}</span>}
                <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)" }}>{fmtDate(manual.savedAt)}</span>
              </>
            ) : isEmpty ? (
              <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)" }}>Not rated yet — tap to rate</span>
            ) : (
              <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)" }}>{auto.ratedCount}/{auto.total} episodes rated</span>
            )}
          </div>
        </div>
        {score != null ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <Icon name="star" size={13} color={accent} />
            <span style={{ fontSize: 16, fontWeight: 800, color: accent }}>{score.toFixed(1)}</span>
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
