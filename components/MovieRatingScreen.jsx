"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import StarInput from "@/components/ui/StarInput";
import PosterArt from "@/components/ui/PosterArt";
import MiniDatePicker from "@/components/ui/MiniDatePicker";
import { tmdbImage } from "@/lib/tmdb";
import { SEASON_MOOD_LIST, moodIdsFromField, moodMetasFromField } from "@/components/SeasonBanner";
import { themes, DEFAULT_ACCENT, initialsOf } from "@/lib/theme";
import { useNavVisibility } from "@/lib/nav-visibility-context";
import { bangkokNow } from "@/lib/bangkokDate";
import { parseISODate } from "@/lib/watchDate";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// Fork of components/SeasonRatingScreen.jsx, not a parameterized version
// of it — see that file's own threading of season/manual/auto through
// ~15 conditionals; a movie has no `auto` concept at all (no per-episode
// ratings to average), so always passing auto=null would leave dead
// branches littered through a shared file. The season/episode-specific
// surface this strips is small and precise: the "{season.title}" +
// "{N} Episodes" lines become the movie's own year/runtime line, and the
// entire "Auto Rating + Rating Breakdown" card is gone outright (no
// movie equivalent). Everything else below — atmosphere-tint sampling,
// 10-star rating, mood grid, favorite-character picker, review text,
// save flow, "Rating Saved!" confirmation — is copied verbatim, since
// none of it is season-specific to begin with. No onShare prop — movie
// ratings aren't publicly shareable in this pass.

const fmtDate = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const fmtISODate = (iso) => {
  const p = parseISODate(iso);
  return p ? fmtDate(new Date(p.year, p.month - 1, p.day)) : "";
};
const todayISO = () => {
  const n = bangkokNow();
  return `${n.year}-${String(n.month).padStart(2, "0")}-${String(n.day).padStart(2, "0")}`;
};

function extractEdgeColor(url) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const w = 32, h = 32;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const stripY = Math.floor(h * 0.66);
        const { data } = ctx.getImageData(0, stripY, w, h - stripY);
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
        resolve([Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = url;
  });
}

const CARD_BORDER = "rgba(255,255,255,0.14)";

function GlassButton({ children, onClick, style }) {
  return (
    <button onClick={onClick} style={{ background: t.cardFill, color: "#fff", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", ...style }} className="flex items-center justify-center gap-2 rounded-full active:scale-95 transition">
      {children}
    </button>
  );
}

export default function MovieRatingScreen({ movieTitle, movie, manual, cast, backdropPath, logoUrl, movieGenre, initialEditing, onClose, onSave, onDelete, onShare }) {
  const [atmoRGB, setAtmoRGB] = useState([10, 10, 12]);
  useEffect(() => {
    const src = backdropPath ?? movie.posterPath;
    if (!src) { setAtmoRGB([10, 10, 12]); return; }
    let cancelled = false;
    extractEdgeColor(tmdbImage(src, "w200"))
      .then((rgb) => { if (!cancelled) setAtmoRGB(rgb); })
      .catch(() => { if (!cancelled) setAtmoRGB([10, 10, 12]); });
    return () => { cancelled = true; };
  }, [backdropPath, movie.posterPath]);

  const mixRGB = (amt) => atmoRGB.map((c) => Math.round(c * amt + 12 * (1 - amt))).join(",");
  const CARD_BG = `linear-gradient(180deg, rgb(${mixRGB(0.32)}) 0%, rgb(${mixRGB(0.14)}) 55%, #141414 100%)`;

  const [, setNavHidden] = useNavVisibility();
  useEffect(() => {
    setNavHidden(true);
    return () => setNavHidden(false);
  }, [setNavHidden]);

  const [editing, setEditing] = useState(initialEditing);
  const [draftRating, setDraftRating] = useState(manual ? manual.rating : 0);
  const [draftMoods, setDraftMoods] = useState(moodIdsFromField(manual?.mood));
  const [draftCharacterId, setDraftCharacterId] = useState(manual?.characterId || null);
  const [draftCharacterName, setDraftCharacterName] = useState(manual?.characterName || null);
  const [draftText, setDraftText] = useState(manual?.text || "");
  // Only ever surfaced when editing an already-saved rating (manual
  // truthy) — see the hero header's own "Review date" row below.
  const [draftReviewDate, setDraftReviewDate] = useState(manual?.reviewDate ?? todayISO());
  const [dateEditorOpen, setDateEditorOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const readMoodMetas = manual ? moodMetasFromField(manual.mood) : [];
  const canSave = true;

  const toggleDraftMood = (id) => {
    setDraftMoods((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  };

  const loadDraftFromManual = () => {
    setDraftRating(manual ? manual.rating : 0);
    setDraftMoods(moodIdsFromField(manual?.mood));
    setDraftCharacterId(manual?.characterId || null);
    setDraftCharacterName(manual?.characterName || null);
    setDraftText(manual?.text || "");
    setDraftReviewDate(manual?.reviewDate ?? todayISO());
  };

  const startEdit = () => {
    loadDraftFromManual();
    setEditing(true);
    setMoreOpen(false);
  };

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSave({
        rating: draftRating, mood: draftMoods.join(","), characterId: draftCharacterId, characterName: draftCharacterName, text: draftText.trim(),
        // Always explicit — same "caller merges this straight into local
        // state, no refetch" reasoning as SeasonRatingScreen.jsx's
        // identical save().
        reviewDate: manual ? draftReviewDate : todayISO(),
      });
      setEditing(false);
      setJustSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40" style={{ background: "#0A0A0C" }}>
      <div className="h-full overflow-y-auto pb-12" style={{ scrollbarWidth: "none" }}>
        <div className="relative w-full" style={{ height: 400 }}>
          <PosterArt posterPath={backdropPath ?? movie.posterPath} base={movie.base} glow={movie.glow} alt={movieTitle} tmdbSize="w780" />
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, rgba(10,8,6,0.15) 0%, rgba(10,8,6,0.35) 45%, #0A0A0C 100%)` }} />

          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
            <GlassButton onClick={onClose} style={{ width: 38, height: 38 }}><Icon name="back" size={16} /></GlassButton>
            {/* No auto-rating concept for movies (see lib/movieRatings.js),
                so this condition is just `manual` — the show version's
                equivalent gates on `manual || auto` since an unsaved auto
                score can still be shared there. */}
            {!editing && manual && (
              <div className="flex items-center gap-2">
                <GlassButton onClick={onShare} style={{ width: 38, height: 38 }}><Icon name="share" size={15} /></GlassButton>
                <div className="relative">
                  <GlassButton onClick={() => setMoreOpen((v) => !v)} style={{ width: 38, height: 38 }}><Icon name="more" size={16} /></GlassButton>
                  {moreOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setMoreOpen(false)} />
                      <div className="absolute z-30 rounded-2xl" style={{ right: 0, top: "calc(100% + 8px)", width: 170, padding: 6, background: "rgba(28,22,16,0.95)", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(24px)", boxShadow: "0 20px 44px rgba(0,0,0,0.55)" }}>
                        <button onClick={startEdit} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "10px 12px" }}><Icon name="edit" size={14} /><span style={{ fontSize: 13.5, color: "#fff", fontWeight: 500 }}>Edit Rating</span></button>
                        <button onClick={remove} disabled={deleting} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "10px 12px", opacity: deleting ? 0.5 : 1 }}><Icon name="trash" size={14} color="#e0567a" /><span style={{ fontSize: 13.5, color: "#e0567a", fontWeight: 500 }}>{deleting ? "Deleting…" : "Delete Rating"}</span></button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="absolute left-0 right-0 px-6" style={{ bottom: 22 }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- resolved TMDB CDN URL
              <img src={logoUrl} alt={movieTitle} style={{ maxWidth: "85.8%", maxHeight: 43, objectFit: "contain" }} />
            ) : (
              <div style={{ fontSize: 13.2, letterSpacing: "0.14em", color: accent, fontWeight: 600 }}>{movieTitle.toUpperCase()}</div>
            )}
            <div style={{ fontSize: 12, fontWeight: 500, color: "#fff", marginTop: 3.3 }}>
              {movie.year}{movie.runtime ? ` · ${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` : ""}
            </div>
            {movieGenre && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>{movieGenre}</div>
            )}
            {!editing && manual && (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: "rgba(255,255,255,0.1)", border: `1px solid ${t.glassBorder}` }}>
                  <Icon name="star" size={12} color={accent} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{manual.rating.toFixed(1)}<span style={{ color: t.textDim, fontWeight: 500 }}>/10</span></span>
                </div>
                <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)" }}>{fmtISODate(manual.reviewDate)}</span>
              </div>
            )}
            {/* Review date, editable — under the genre row, same position
                the read-only date sits, NOT inside the Rating card below.
                Same reasoning as SeasonRatingScreen.jsx's identical row. */}
            {editing && manual && (
              <div className="relative mt-2" style={{ width: "fit-content" }}>
                <button
                  type="button"
                  onClick={() => setDateEditorOpen((v) => !v)}
                  className="flex items-center gap-1.5 rounded-full active:scale-95 transition"
                  style={{ padding: "6px 12px", background: "rgba(255,255,255,0.1)", border: `1px solid ${t.glassBorder}` }}
                >
                  <Icon name="calendar" size={11} color="rgba(255,255,255,0.7)" />
                  <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)" }}>Date</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "#fff" }}>{fmtISODate(draftReviewDate)}</span>
                </button>
                {dateEditorOpen && (
                  <MiniDatePicker
                    value={draftReviewDate}
                    onChange={setDraftReviewDate}
                    onClose={() => setDateEditorOpen(false)}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 relative">
          <div
            className="absolute top-0 left-0 right-0"
            style={{
              height: 420,
              zIndex: 0,
              pointerEvents: "none",
              background: `linear-gradient(180deg, #0A0A0C 0%, rgba(${atmoRGB.map((c) => Math.round(c * 0.22)).join(",")},0.9) 20%, rgba(${atmoRGB.map((c) => Math.round(c * 0.42)).join(",")},0.95) 55%, #0A0A0C 100%)`,
            }}
          />
          <div className="relative" style={{ zIndex: 1, marginTop: 20 }}>
          {/* Rating — 10-star row, centered, card-grouped */}
          <div className="rounded-3xl flex flex-col items-center text-center" style={{ padding: "22px 14px", background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}>
            <div style={{ fontSize: 15.5, fontWeight: 600, color: "#fff" }}>{editing ? "Rate this movie" : "Your Rating"}</div>
            <div className="mt-4">
              <StarInput
                value={editing ? draftRating : (manual?.rating ?? 0)}
                onChange={setDraftRating}
                readOnly={!editing}
                maxStars={10}
                autoFit
                autoFitMin={30}
                autoFitMax={43}
                autoFitGapMin={3}
                autoFitGapMax={6}
                rowPaddingInline={4}
              />
            </div>
            {editing && <div style={{ fontSize: 15.73, fontWeight: 700, color: accent, marginTop: 9 }}>{draftRating.toFixed(1)}/10</div>}
            {!editing && manual && <div style={{ fontSize: 15.73, fontWeight: 700, color: accent, marginTop: 9 }}>{manual.rating.toFixed(1)}/10</div>}
          </div>

          {/* Mood — multi-select */}
          {(editing || readMoodMetas.length > 0) && (
            <div className="mt-4 rounded-3xl text-center" style={{ padding: "22px 16px", background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}>
              <div style={{ fontSize: 15.5, fontWeight: 600, color: "#fff" }}>{editing ? "How did it make you feel?" : "Your Mood"}</div>
              {editing ? (
                <div className="mt-4 grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", rowGap: 16, columnGap: 4 }}>
                  {SEASON_MOOD_LIST.map((m) => {
                    const active = draftMoods.includes(m.id);
                    return (
                      <button key={m.id} onClick={() => toggleDraftMood(m.id)} className="flex flex-col items-center gap-1.5 active:scale-95 transition">
                        <div className="flex items-center justify-center rounded-full" style={{ width: 44, height: 44, background: active ? "rgba(232,162,76,0.14)" : "rgba(255,255,255,0.06)", border: `1.5px solid ${active ? accent : "transparent"}` }}>
                          <span style={{ fontSize: 19 }}>{m.emoji}</span>
                        </div>
                        <span style={{ fontSize: 10.5, color: active ? accent : t.textDim, fontWeight: active ? 700 : 500 }}>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-2 mt-3.5">
                  {readMoodMetas.map((meta) => (
                    <div key={meta.id} className="flex items-center gap-2 rounded-full" style={{ padding: "5px 12px 5px 5px", background: "rgba(255,255,255,0.06)" }}>
                      <div className="flex items-center justify-center rounded-full" style={{ width: 34, height: 34, background: "rgba(255,255,255,0.06)" }}><span style={{ fontSize: 17 }}>{meta.emoji}</span></div>
                      <span style={{ fontSize: 14, color: "#fff", fontWeight: 500 }}>{meta.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Favorite character */}
          {(editing || manual?.characterName) && (
            <div className="mt-4 rounded-3xl text-center" style={{ padding: "22px 16px", background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}>
              <div style={{ fontSize: 15.5, fontWeight: 600, color: "#fff" }}>{editing ? "Favorite character?" : "Favorite Character"}</div>
              {editing ? (
                <div className="mt-1 flex gap-4 overflow-x-auto" style={{ scrollbarWidth: "none", paddingTop: 12 }}>
                  {cast.length === 0 ? (
                    <div style={{ fontSize: 12, color: t.textDim, padding: "8px 0" }}>No cast listed for this movie yet.</div>
                  ) : cast.map((c) => {
                    const active = draftCharacterId === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => { setDraftCharacterId(active ? null : c.id); setDraftCharacterName(active ? null : c.role); }}
                        className="flex-shrink-0 flex flex-col items-center gap-1.5 active:scale-95 transition"
                      >
                        <div className="relative">
                          <div className="relative overflow-hidden" style={{ width: 52, height: 52, borderRadius: "50%", background: c.grad, display: "flex", alignItems: "center", justifyContent: "center", border: active ? `2px solid ${accent}` : "2px solid transparent" }}>
                            {c.profilePath ? (
                              // eslint-disable-next-line @next/next/no-img-element -- TMDB CDN path, small avatar in a scrollable row
                              <img src={tmdbImage(c.profilePath, "w185")} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} />
                            ) : (
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{initialsOf(c.role)}</span>
                            )}
                          </div>
                          {active && <div style={{ position: "absolute", top: -8, right: -4, width: 18, height: 18, borderRadius: "50%", background: accent, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="crown" size={10} color="#1a1108" /></div>}
                        </div>
                        <span style={{ fontSize: 11, color: active ? "#fff" : t.textDim }}>{c.role}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 mt-3.5">
                  {(() => {
                    const c = cast.find((x) => x.id === manual.characterId);
                    return (
                      <div className="relative overflow-hidden" style={{ width: 34, height: 34, borderRadius: "50%", background: c?.grad || "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {c?.profilePath ? (
                          // eslint-disable-next-line @next/next/no-img-element -- TMDB CDN path
                          <img src={tmdbImage(c.profilePath, "w185")} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} />
                        ) : (
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: "#fff" }}>{initialsOf((c ? c.role : manual.characterName) || "?")}</span>
                        )}
                      </div>
                    );
                  })()}
                  <span style={{ fontSize: 14, color: "#fff", fontWeight: 500 }}>{manual.characterName}</span>
                </div>
              )}
            </div>
          )}

          {/* Review */}
          {(editing || manual?.text) && (
            <div className="mt-4 rounded-3xl" style={{ padding: "22px 16px", background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}>
              <div className="text-center" style={{ fontSize: 15.5, fontWeight: 600, color: "#fff" }}>{editing ? "Write your review" : "Your Review"} {editing && <span style={{ fontSize: 12, color: t.textDim, fontWeight: 500 }}>(optional)</span>}</div>
              {editing ? (
                <div className="relative rounded-2xl mt-4" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} placeholder="Share your thoughts..." rows={4} className="w-full bg-transparent outline-none" style={{ padding: "12px 14px 14px", fontSize: 13.5, color: "#fff", lineHeight: 1.5, resize: "none", textAlign: "left" }} />
                </div>
              ) : (
                // whiteSpace: pre-wrap — see SeasonRatingScreen.jsx's
                // identical fix for the full reasoning (a plain div
                // collapses the textarea's own newlines into one run-on
                // paragraph otherwise).
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.85)", marginTop: 10, textAlign: "left", whiteSpace: "pre-wrap" }}>{manual.text}</div>
              )}
            </div>
          )}

          {editing && (
            <button onClick={save} disabled={!canSave || saving} className="w-full mt-5 rounded-full active:scale-95 transition" style={{ padding: 14, background: canSave ? "#fff" : "rgba(255,255,255,0.15)", color: canSave ? "#111" : "rgba(255,255,255,0.4)", fontSize: 14.5, fontWeight: 700, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Saving…" : "Save Rating"}
            </button>
          )}
          </div>
        </div>
      </div>

      {justSaved && (
        <div className="absolute inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full rounded-t-3xl flex flex-col items-center text-center flex-shrink-0" style={{ padding: "40px 28px 28px", background: "#161210", border: `1px solid ${t.glassBorder}`, borderBottom: "none", boxShadow: "0 -20px 60px rgba(0,0,0,0.6)" }}>
            <div className="flex items-center justify-center rounded-full" style={{ width: 76, height: 76, border: `2px solid ${accent}` }}><Icon name="check" size={30} color={accent} strokeWidth={3} /></div>
            <div style={{ fontSize: 19, fontWeight: 800, color: "#fff", marginTop: 18 }}>Rating Saved!</div>
            <div style={{ fontSize: 13, color: t.textDim, marginTop: 5 }}>Thanks for rating this movie.</div>
            <button onClick={() => setJustSaved(false)} className="w-full rounded-full active:scale-95 transition" style={{ marginTop: 24, padding: 14, background: "#fff" }}><span style={{ fontSize: 14.5, fontWeight: 700, color: "#111" }}>Done</span></button>
          </div>
        </div>
      )}
    </div>
  );
}
