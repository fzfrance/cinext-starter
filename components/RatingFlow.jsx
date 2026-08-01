"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";
import PosterArt from "@/components/ui/PosterArt";
import StarInput from "@/components/ui/StarInput";
import { MOOD_LIST, SEASON_MOOD_LIST } from "@/components/SeasonBanner";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

function GlassButton({ children, onClick, style }) {
  return (
    <button onClick={onClick} style={{
      background: t.cardFill, color: "#fff",
      border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", ...style
    }} className="flex items-center justify-center gap-2 rounded-full active:scale-95 transition">
      {children}
    </button>
  );
}

const formatReviewDate = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/**
 * RatingFlow — unified rating/review sheet used for both rating a single
 * episode and reviewing a season or show. Same visual design and
 * interaction everywhere (full-bleed backdrop art + numbered steps:
 * 1. Rate, 2. How did it make you feel, 3. Write your review) — only the
 * content shown and where the caller persists the result differ per
 * context. The caller controls visibility by conditionally rendering this
 * component, same as every other overlay in this app, rather than an
 * internal `open` prop.
 *
 * props:
 *   subject: { eyebrow, title, meta, posterPath, base, glow } — display
 *     info for the hero art + header. `eyebrow` is the small accent label
 *     above the title (an episode code like "S1 E5", or a category label
 *     like "SEASON REVIEW" / "TV SHOW"); `meta` is an optional secondary
 *     line under the title.
 *   ratingNoun: "episode" | "season" | "show" — fills "1. Rate this ___"
 *   existingReview: { stars, mood, text, savedAt } | null — pass this to
 *     open straight into the read/edit view; omit to start the fresh
 *     "rate it" flow.
 *   onClose: () => void
 *   onSave: ({ stars, mood, text, savedAt }) => void — the caller decides
 *     what to persist and where (episode_watches.rating vs
 *     season_reviews); not every field necessarily has a column on every
 *     target (episode_watches has no mood/text columns yet, for example).
 *   onDelete: () => void — only called when existingReview was provided
 */
export default function RatingFlow({ subject, ratingNoun = "episode", existingReview = null, onClose, onSave, onDelete }) {
  const [stage, setStage] = useState(existingReview ? "read" : "prompt");
  const [stars, setStars] = useState(existingReview?.stars ?? 0);
  const [mood, setMood] = useState(existingReview?.mood ?? null);
  const [text, setText] = useState(existingReview?.text ?? "");
  const [savedAt, setSavedAt] = useState(existingReview?.savedAt ?? null);
  const [moreOpen, setMoreOpen] = useState(false);

  const rating10 = stars * 2;
  const canSave = stars > 0 && !!mood;

  const save = () => {
    if (!canSave) return;
    const now = new Date();
    setSavedAt(now);
    onSave?.({ stars, mood, text, savedAt: now });
    setStage("saved");
  };

  const editAgain = () => { setMoreOpen(false); setStage("prompt"); };

  const deleteReview = () => {
    setMoreOpen(false);
    onDelete?.();
    setSavedAt(null);
    setStage("prompt");
    setStars(0);
    setMood(null);
    setText("");
  };

  const moodMeta = MOOD_LIST.find((m) => m.id === mood);
  const showHeader = stage !== "saved";

  return (
    <div className="fixed inset-0 z-50" style={{ background: t.bg }}>
      <div className="h-full overflow-y-auto pb-8" style={{ scrollbarWidth: "none" }}>

        {/* hero art — shared across every stage */}
        <div className="relative w-full" style={{ height: stage === "saved" ? 260 : 300 }}>
          <PosterArt posterPath={subject.posterPath} base={subject.base} glow={subject.glow} alt={subject.title} />
          <div className="absolute inset-0" style={{ background: stage === "saved" ? "linear-gradient(0deg, #0A0A0C 4%, rgba(10,10,12,0.55) 45%, rgba(10,10,12,0.15) 100%)" : "linear-gradient(0deg, #0A0A0C 6%, transparent 55%)" }} />

          {showHeader && (
            <>
              <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6" style={{ paddingTop: "env(safe-area-inset-top)" }}>
                <GlassButton onClick={onClose} style={{ width: 38, height: 38 }}><Icon name={stage === "read" ? "back" : "x"} size={16} color={t.text} /></GlassButton>
                {existingReview && (
                  <div className="relative">
                    <GlassButton onClick={() => setMoreOpen((v) => !v)} style={{ width: 38, height: 38 }}><Icon name="more" size={16} color={t.text} /></GlassButton>
                    {moreOpen && (
                      <div className="absolute z-30 rounded-2xl" style={{ right: 0, top: "calc(100% + 8px)", width: 170, padding: "6px", background: "rgba(28,22,16,0.95)", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(24px)", boxShadow: "0 20px 44px rgba(0,0,0,0.55)" }}>
                        <button onClick={editAgain} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "10px 12px" }}>
                          <Icon name="edit" size={14} color="#fff" />
                          <span style={{ fontSize: 13.5, color: "#fff", fontWeight: 500 }}>Edit Review</span>
                        </button>
                        <button onClick={deleteReview} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "10px 12px" }}>
                          <Icon name="trash" size={14} color="#e0567a" />
                          <span style={{ fontSize: 13.5, color: "#e0567a", fontWeight: 500 }}>Delete Review</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="absolute left-0 right-0 px-6" style={{ bottom: 18 }}>
                <div style={{ fontSize: 12, letterSpacing: "0.14em", color: accent, fontWeight: 600 }}>{subject.eyebrow}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", marginTop: 2 }}>{subject.title}</div>
                {subject.meta && <div style={{ fontSize: 12, color: t.textDim, marginTop: 6 }}>{subject.meta}</div>}
              </div>
            </>
          )}

          {stage === "saved" && (
            <div className="relative h-full flex flex-col items-center justify-end pb-6">
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(232,162,76,0.15)", display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${accent}`, backdropFilter: "blur(10px)" }}>
                <Icon name="check" size={24} color={accent} strokeWidth={2.4} />
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginTop: 14 }}>Review Saved!</div>
            </div>
          )}
        </div>

        {stage === "prompt" && (
          <div className="px-6" style={{ marginTop: 22 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: "#fff" }}>1. Rate this {ratingNoun}</div>
            <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
              <StarInput value={stars} onChange={setStars} size={28} />
              <span style={{ fontSize: 14, fontWeight: 700, color: accent }}>{rating10.toFixed(1)}/10</span>
            </div>

            <div style={{ fontSize: 14.5, fontWeight: 700, color: "#fff", marginTop: 22 }}>2. How did it make you feel?</div>
            {/* grid, not a single justify-between row — 8 entries (was 5)
                need to wrap, same layout SeasonRatingScreen's own mood
                picker uses. */}
            <div className="mt-2.5 grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", rowGap: 16, columnGap: 4 }}>
              {SEASON_MOOD_LIST.map((m) => {
                const active = mood === m.id;
                return (
                  <button key={m.id} onClick={() => setMood(active ? null : m.id)} className="flex flex-col items-center gap-1.5 active:scale-95 transition">
                    <div className="flex items-center justify-center rounded-full" style={{ width: 44, height: 44, background: active ? "rgba(232,162,76,0.14)" : "rgba(255,255,255,0.06)", border: `1.5px solid ${active ? accent : "transparent"}` }}>
                      <span style={{ fontSize: 19 }}>{m.emoji}</span>
                    </div>
                    <span style={{ fontSize: 10.5, color: active ? accent : t.textDim, fontWeight: active ? 700 : 500 }}>{m.label}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: 14.5, fontWeight: 700, color: "#fff", marginTop: 22 }}>3. Write your review <span style={{ fontSize: 12, color: t.textDim, fontWeight: 500 }}>(optional)</span></div>
            <div className="relative rounded-2xl" style={{ marginTop: 10, background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
              <textarea value={text} onChange={(e) => e.target.value.length <= 500 && setText(e.target.value)} placeholder="Share your thoughts..." rows={4} className="w-full bg-transparent outline-none" style={{ padding: "12px 14px 22px", fontSize: 13.5, color: "#fff", lineHeight: 1.5, resize: "none" }} />
              <span style={{ position: "absolute", right: 12, bottom: 8, fontSize: 10.5, color: t.textDim }}>{text.length}/500</span>
            </div>

            <button onClick={save} disabled={!canSave} className="w-full mt-6 rounded-full active:scale-95 transition" style={{ padding: 14, background: canSave ? "#fff" : "rgba(255,255,255,0.15)", color: canSave ? "#111" : "rgba(255,255,255,0.4)", fontSize: 14.5, fontWeight: 700 }}>
              Save Review
            </button>

            {existingReview && (
              <button onClick={deleteReview} className="w-full mt-3 rounded-full active:scale-95 transition" style={{ padding: 12, background: "transparent", border: "1px solid rgba(224,86,122,0.4)" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#e0567a" }}>Delete Review</span>
              </button>
            )}
          </div>
        )}

        {stage === "saved" && (
          <div className="px-6" style={{ marginTop: 24 }}>
            {/* Closes the whole sheet, landing back on the screen that
                opened it (Show Detail) — not the read/edit view. Reopening
                an already-saved review (e.g. tapping it in the Reviews
                tab) is a separate entry point that mounts this component
                fresh with existingReview set, landing on "read" directly. */}
            <button onClick={onClose} className="w-full rounded-full active:scale-95 transition" style={{ padding: 14, background: "#fff" }}>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: "#111" }}>Done</span>
            </button>
          </div>
        )}

        {stage === "read" && savedAt && (
          <div className="px-6" style={{ marginTop: 6 }}>
            <div style={{ fontSize: 12, color: t.textDim }}>{formatReviewDate(savedAt)}</div>

            <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${t.cardBorder}` }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", color: t.textDim }}>YOUR RATING</div>
              <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
                <StarInput value={stars} onChange={() => {}} size={22} readOnly />
                <span style={{ fontSize: 13.5, fontWeight: 700, color: accent }}>{rating10.toFixed(1)}<span style={{ color: t.textDim, fontWeight: 500 }}>/10</span></span>
              </div>
            </div>

            {moodMeta && (
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${t.cardBorder}` }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", color: t.textDim }}>YOUR MOOD</div>
                <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
                  <div className="flex items-center justify-center rounded-full" style={{ width: 30, height: 30, background: "rgba(255,255,255,0.06)" }}><span style={{ fontSize: 15 }}>{moodMeta.emoji}</span></div>
                  <span style={{ fontSize: 13.5, color: "#fff", fontWeight: 500 }}>{moodMeta.label}</span>
                </div>
              </div>
            )}

            <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${t.cardBorder}` }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", color: t.textDim }}>YOUR REVIEW</div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: text ? "rgba(255,255,255,0.85)" : t.textDim, marginTop: 8, fontStyle: text ? "normal" : "italic" }}>
                {text || "No written review."}
              </div>
            </div>

            <div className="flex items-center gap-3" style={{ marginTop: 26 }}>
              <button onClick={editAgain} className="flex-1 rounded-full active:scale-95 transition" style={{ padding: 14, background: "rgba(255,255,255,0.1)", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Edit Review</span>
              </button>
              <button onClick={deleteReview} className="flex items-center justify-center rounded-full active:scale-90 transition flex-shrink-0" style={{ width: 48, height: 48, background: "rgba(224,86,122,0.12)", border: "1px solid rgba(224,86,122,0.35)" }}>
                <Icon name="trash" size={16} color="#e0567a" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
