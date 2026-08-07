"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Icon from "@/components/ui/Icon";
import PosterArt from "@/components/ui/PosterArt";
import StarInput from "@/components/ui/StarInput";
import WatchDateSheet from "@/components/WatchDateSheet";
import { useAuth } from "@/lib/auth-context";
import { getLatestWatchDate, setWatchDate } from "@/lib/episodeWatches";
import { formatWatchDateLabel } from "@/lib/watchDate";
import { tmdbImage } from "@/lib/tmdb";
import { themes, DEFAULT_ACCENT, initialsOf } from "@/lib/theme";
import { useNavVisibility } from "@/lib/nav-visibility-context";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// "Thanks for rating!" screen refinement — sizing/spacing only, same
// three boxes/order/content as before. Card's own defaults (mx-6 = 24px
// side margin, mt-4 = 16px between cards, "18px 16px" padding) are left
// untouched since they're shared with the "rate" stage's cards too;
// these overrides apply only to the 3 done-stage Card instances below,
// via inline style (which wins over the mx-6/mt-4 classes on the same
// element). One shared gap value for every section transition (header→
// card 1, card→card, last card→Done) instead of the previous 24/16/16/22
// mix, per the explicit "keep consistent spacing between all sections" ask.
const DONE_SECTION_GAP = 14;
const DONE_CARD_STYLE = {
  marginLeft: 16,
  marginRight: 16,
  padding: "21px 19px",
  justifyContent: "center",
  alignItems: "stretch",
  textAlign: "left",
};

function GlassButton({ children, filled, onClick, style }) {
  return (
    <button onClick={onClick} style={{
      background: filled ? "#fff" : t.cardFill, color: filled ? "#111" : "#fff",
      border: `1px solid ${filled ? "transparent" : t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", ...style
    }} className="flex items-center justify-center gap-2 rounded-full active:scale-95 transition">
      {children}
    </button>
  );
}

// Rounded glass card every question section lives in — matches
// episode_rating_flow.jsx's grouped-card layout (as opposed to
// RatingFlow.jsx's numbered-list layout, which is the season/show review
// pattern this screen used to mistakenly borrow).
function Card({ children, style }) {
  return (
    <div className="mx-6 mt-4 rounded-3xl flex flex-col items-center text-center" style={{ padding: "18px 16px", background: t.cardFill, border: `1px solid ${t.cardBorder}`, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", ...style }}>
      {children}
    </div>
  );
}

// Row-major order (grid-cols-4 below) — three rows of four, per spec:
// Shocked/Amused/Touched/Thrilled, Sad/Frustrated/Tense/Confused,
// Satisfied/Reflective/Disappointed/Bored.
const moodList = [
  { id: "shocked", label: "Shocked", emoji: "😱" },
  { id: "amused", label: "Amused", emoji: "😂" },
  { id: "touched", label: "Touched", emoji: "🥹" },
  { id: "thrilled", label: "Thrilled", emoji: "🤩" },
  { id: "sad", label: "Sad", emoji: "😭" },
  { id: "frustrated", label: "Frustrated", emoji: "😤" },
  { id: "tense", label: "Tense", emoji: "😬" },
  { id: "confused", label: "Confused", emoji: "😕" },
  { id: "satisfied", label: "Satisfied", emoji: "😌" },
  { id: "reflective", label: "Reflective", emoji: "🤔" },
  { id: "disappointed", label: "Disappointed", emoji: "😞" },
  { id: "bored", label: "Bored", emoji: "😑" },
];

const ratingLabels = { 1: "Poor", 2: "Okay", 3: "Good", 4: "Great", 5: "Amazing" };
// stars is a half-star value on a 0-5 scale (StarInput's maxStars={5}
// here, matching RatingFlow.jsx's season/show reviews) — rounds to the
// nearest whole star just to look up which qualitative label it's
// closest to.
const ratingLabelFor = (stars) => ratingLabels[Math.max(1, Math.min(5, Math.round(stars)))];

function CastAvatar({ person, size = 56 }) {
  // Character-based fallback initials (this component is only ever used
  // for the "who's your favorite character" voting UI below, never the
  // real Cast & Crew tab), matching the character-name label shown
  // alongside it — showing the actor's own initials here while the
  // caption says the character's name would read as mismatched.
  const imageUrl = person.profilePath ? tmdbImage(person.profilePath, "w185") : null;
  return (
    <div className="relative overflow-hidden flex items-center justify-center" style={{ width: size, height: size, borderRadius: "50%", background: person.grad }}>
      {imageUrl ? (
        <Image src={imageUrl} alt="" fill sizes={`${size}px`} style={{ objectFit: "cover" }} />
      ) : (
        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{initialsOf(person.role || person.name)}</span>
      )}
    </div>
  );
}

// Tappable Watch Date badge — same pill styling as the "Watched" badge
// next to it either way, just interactive once the underlying watch row
// is known. Shows nothing (rather than a wrong/blank date) until then.
function WatchDateBadge({ watch, onClick }) {
  if (!watch) return null;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 active:opacity-70 transition"
      style={{ background: t.cardFill, border: `1px solid ${t.glassBorder}`, fontSize: 11, color: t.textDim }}
    >
      <Icon name="calendar" size={11} color={t.textDim} /> {formatWatchDateLabel(watch)}
      <Icon name="chevronDown" size={9} color={t.textDim} strokeWidth={2.4} />
    </button>
  );
}

/**
 * EpisodeRatingFlow — the episode-specific rating sheet, matching
 * episode_rating_flow.jsx: grouped glass cards (rating / mood / MVP), a
 * 5-star half-star score (StarInput's maxStars={5}, same scale as
 * RatingFlow.jsx's season/show reviews), an 8-option mood grid, a
 * real-cast favorite-cast picker, and no free-text field. Structurally separate from
 * RatingFlow.jsx (season/show reviews keep their own numbered-list +
 * quarter-star + text-field design — that pattern is correct there, it
 * was just wrongly reused here too).
 *
 * Only `stars` persists onto episode_watches.rating via the caller's
 * onSave — mood/MVP are still local-only (no schema columns for them).
 * The Watch Date badge is a separate, independent concern: it edits
 * whichever specific watch_date_* fields that row already has (see
 * lib/episodeWatches.js's setWatchDate), entirely apart from rating/
 * mood/MVP, and can be changed whether or not a rating is ever saved.
 *
 * props:
 *   subject: { eyebrow, title, posterPath, base, glow, runtimeMin,
 *     episodeAirDate, showId, season, episode, watch }
 *     — episodeAirDate: TMDB "YYYY-MM-DD" | null, backs the sheet's
 *       Release date/Release month options (disabled when null).
 *     — showId/season/episode: identifies which watch row to resolve
 *       when `watch` isn't already known (see below).
 *     — watch: { id, watchDatePrecision, watchedOn, watchedYear,
 *       watchedMonth, watchDateSource } | undefined — pass this when the
 *       caller already knows exactly which row (Highlights, viewing one
 *       specific day's entry). Omit it for a fresh mark-watched flow
 *       (Show Detail/Episode Detail) — this component resolves "the most
 *       recently watched row for this episode" itself, the same
 *       targeting rateLatestWatch already uses for star ratings in that
 *       same flow, so both agree on which row "this rating session"
 *       means.
 *   cast: [{ id, name, initials, grad, profilePath }] — this show's real
 *     cast, not a hardcoded list
 *   onClose: () => void
 *   onSave: ({ stars, moods: string[], mvp: string|null }) => void
 *   onWatchDateChange: (watch) => void — called after a successful Watch
 *     Date save with the row's new state, so a caller keeping its own
 *     list (Highlights) can update it in place without a full refetch.
 */
export default function EpisodeRatingFlow({ subject, cast = [], onClose, onSave, onWatchDateChange }) {
  const { user } = useAuth();
  // FloatingNav sits at zIndex:100, above this flow's own z-50 — without
  // hiding it, the nav renders on top of this entire screen for as long as
  // it's open, silently swallowing taps on anything underneath it,
  // including the "Not now" button whenever it happens to land in that
  // same bottom region. Same fix CaseOverlay/SeasonRatingScreen/
  // ShareRatingCard already needed for the identical reason.
  const [, setNavHidden] = useNavVisibility();
  useEffect(() => {
    setNavHidden(true);
    return () => setNavHidden(false);
  }, [setNavHidden]);
  const [stage, setStage] = useState("rate"); // rate | done
  const [stars, setStars] = useState(0);
  const [moods, setMoods] = useState(new Set());
  const [mvp, setMvp] = useState(null);
  const [watch, setWatchState] = useState(subject.watch ?? null);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);

  // Resolves which specific row this session edits, only when the caller
  // didn't already know (subject.watch) — a fresh mark-watched action.
  // Retries briefly: toggleEp/setEpisodeWatchCount fire the insert without
  // awaiting it before this component mounts, so the very first lookup
  // can occasionally run just ahead of the row actually existing yet.
  useEffect(() => {
    if (subject.watch || !user || !subject.showId) return;
    let cancelled = false;
    let attempts = 0;
    const tryFetch = () => {
      getLatestWatchDate(user.id, subject.showId, subject.season, subject.episode)
        .then((row) => {
          if (cancelled) return;
          if (!row && attempts < 3) { attempts += 1; setTimeout(tryFetch, 150); return; }
          setWatchState(row);
        })
        .catch(console.error);
    };
    tryFetch();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolves once per mount for a given episode; subject.watch intentionally not re-checked after the initial render
  }, [user, subject.showId, subject.season, subject.episode]);

  const toggleMood = (id) => {
    setMoods((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const canSave = stars > 0;

  const save = () => {
    if (!canSave) return;
    onSave?.({ stars, moods: [...moods], mvp });
    setStage("done");
  };

  const saveWatchDate = (result) => {
    if (!user || !watch) return;
    const updated = { id: watch.id, watchDatePrecision: result.precision, watchedOn: result.watchedOn, watchedYear: result.watchedYear, watchedMonth: result.watchedMonth, watchDateSource: result.source };
    setWatchState(updated); // updates the label immediately, no dismiss/reload flash
    setDateSheetOpen(false);
    setWatchDate(user.id, watch.id, result)
      .then(() => onWatchDateChange?.(updated))
      .catch(console.error);
  };

  const watchedBadge = subject.runtimeMin ? `Watched · ${subject.runtimeMin}m` : "Watched";
  const mvpPerson = mvp && mvp !== "other" ? cast.find((c) => c.id === mvp) : null;

  return (
    <div className="fixed inset-0 z-50" style={{ background: t.bg }}>
      <div className="h-full overflow-y-auto pb-8" style={{ scrollbarWidth: "none" }}>

        {/* hero art — same fixed height on both stages (previously
            300/260, which read as compressed: the episode info and the
            "Thanks for rating!" confirmation both sat close to the top of
            the screen instead of low in the hero). 420 gives the image
            real room to breathe above the content, and PosterArt's own
            object-fit: cover just fills whatever height it's given, no
            crop/position changes needed. Content within stays anchored
            near the bottom of this box (bottom:18 / pb-6 below) exactly
            as before — a taller box alone is what pushes that content
            down into the hero's lower third instead of the middle. */}
        <div className="relative w-full" style={{ height: 420 }}>
          <PosterArt posterPath={subject.posterPath} base={subject.base} glow={subject.glow} alt={subject.title} />
          <div className="absolute inset-0" style={{ background: stage === "done" ? "linear-gradient(0deg, #0A0A0C 4%, rgba(10,10,12,0.55) 45%, rgba(10,10,12,0.15) 100%)" : "linear-gradient(0deg, #0A0A0C 6%, transparent 55%)" }} />

          {stage === "rate" && (
            <>
              <div className="absolute top-0 left-0 right-0 flex items-center px-6" style={{ paddingTop: "env(safe-area-inset-top)" }}>
                <GlassButton onClick={onClose} style={{ width: 38, height: 38 }}><Icon name="x" size={16} color={t.text} /></GlassButton>
              </div>
              <div className="absolute left-0 right-0 px-6" style={{ bottom: 18 }}>
                <div style={{ fontSize: 12, letterSpacing: "0.14em", color: accent, fontWeight: 600 }}>{subject.eyebrow}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", marginTop: 2 }}>{subject.title}</div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: t.cardFill, border: `1px solid ${t.glassBorder}`, fontSize: 11, color: t.textDim }}>
                    <Icon name="check" size={11} color={t.textDim} strokeWidth={2.4} /> {watchedBadge}
                  </div>
                  <WatchDateBadge watch={watch} onClick={() => setDateSheetOpen(true)} />
                </div>
              </div>
            </>
          )}

          {stage === "done" && (
            <div className="relative h-full flex flex-col items-center justify-end pb-6">
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(232,162,76,0.15)", display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${accent}`, backdropFilter: "blur(10px)" }}>
                <Icon name="check" size={24} color={accent} strokeWidth={2.4} />
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginTop: 14 }}>Thanks for rating!</div>
            </div>
          )}
        </div>

        {stage === "rate" && (
          <>
            {/* Reduced side padding (not the card's own outer margin —
                that stays consistent with the cards below it) so the
                star row has more interior width to size up into. Only 5
                stars now (down from 10), so each one can render
                noticeably larger for the same card width. hitPaddingBlock
                stays 10 so the row's own touch strip stays >=44px tall
                (icon + 2x padding) even at the smallest auto-fit size
                this range can produce. */}
            <Card style={{ marginTop: 24, padding: "18px 8px" }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>How was this episode?</div>
              <div className="mt-5">
                <StarInput
                  value={stars}
                  onChange={setStars}
                  color={accent}
                  maxStars={5}
                  autoFit
                  autoFitMin={32}
                  autoFitMax={46}
                  autoFitGapMin={6}
                  autoFitGapMax={10}
                  rowPaddingInline={4}
                  hitPaddingBlock={10}
                />
              </div>
              {stars > 0 && (
                <div className="mt-3">
                  <span style={{ fontSize: 22, fontWeight: 700, color: accent, lineHeight: 1 }}>{stars}<span style={{ fontSize: 13, color: t.textDim }}>/5</span></span>
                  <div style={{ fontSize: 12, color: t.textDim, marginTop: 3 }}>{ratingLabelFor(stars)}</div>
                </div>
              )}
            </Card>

            <Card>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>How did you feel?</div>
              <div style={{ fontSize: 12, color: t.textDim, marginTop: 2 }}>Select all that apply</div>
              <div className="mt-3.5 grid grid-cols-4 gap-2 w-full">
                {moodList.map((m) => {
                  const active = moods.has(m.id);
                  return (
                    <button key={m.id} onClick={() => toggleMood(m.id)} className="flex flex-col items-center justify-center gap-1 rounded-xl active:scale-95 transition" style={{ padding: "9px 4px", background: active ? "rgba(232,162,76,0.10)" : "transparent", border: `1px solid ${active ? accent : t.cardBorder}` }}>
                      <span style={{ fontSize: 16, lineHeight: 1 }}>{m.emoji}</span>
                      <span style={{ fontSize: 10, fontWeight: 400, color: active ? "#fff" : t.textDim }}>{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </Card>

            {cast.length > 0 && (
              <Card>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>Who was your favorite?</div>
                {/* mt-1 + paddingTop:12 (not mt-3.5 alone) — overflow-x:auto
                    forces the browser's computed overflow-y to "auto" too
                    (an axis left at the default "visible" gets force-
                    changed to "auto" once the other axis isn't "visible"),
                    so this row was silently clipping the crown badge's
                    -8px top offset despite overflow-y never being set
                    explicitly. Padding gives that offset real room without
                    visually moving the row (margin reduced by the same
                    amount). */}
                {/* No justify-center — with enough cast entries this row
                    overflows, and centering an overflowing flex row makes
                    the browser start it scrolled to the MIDDLE of the
                    content instead of the first item, forcing a scroll
                    backward just to see #1. Left-aligned always starts at
                    scrollLeft 0. */}
                <div className="mt-1 flex gap-4 overflow-x-auto w-full" style={{ scrollbarWidth: "none", paddingTop: 12 }}>
                  {cast.map((c) => {
                    const active = mvp === c.id;
                    return (
                      <button key={c.id} onClick={() => setMvp(active ? null : c.id)} className="flex-shrink-0 flex flex-col items-center gap-1.5 active:scale-95 transition">
                        <div className="relative">
                          <div style={{ borderRadius: "50%", border: active ? `2px solid ${accent}` : "2px solid transparent", boxShadow: active ? "0 0 0 3px rgba(232,162,76,0.18)" : "none" }}>
                            <CastAvatar person={c} />
                          </div>
                          {active && (
                            <div style={{ position: "absolute", top: -8, right: -4, width: 20, height: 20, borderRadius: "50%", background: accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <Icon name="crown" size={11} color="#1a1108" />
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: 11, color: active ? "#fff" : t.textDim, fontWeight: active ? 600 : 400 }}>{c.role}</span>
                      </button>
                    );
                  })}
                  <button onClick={() => setMvp(mvp === "other" ? null : "other")} className="flex-shrink-0 flex flex-col items-center gap-1.5 active:scale-95 transition">
                    <div style={{ width: 56, height: 56, borderRadius: "50%", background: t.cardFill, border: `1px solid ${t.glassBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="more" size={16} color={t.textDim} />
                    </div>
                    <span style={{ fontSize: 11, color: t.textDim }}>Other</span>
                  </button>
                </div>
              </Card>
            )}

            <div className="px-6 mt-6 flex flex-col gap-2.5">
              <GlassButton filled={canSave} onClick={save} style={{ padding: "14px", opacity: canSave ? 1 : 0.4 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Save Rating</span>
              </GlassButton>
              <button onClick={onClose} style={{ fontSize: 13, color: t.textDim, textAlign: "center", padding: "6px" }}>Not now</button>
            </div>
          </>
        )}

        {stage === "done" && (
          <div className="px-6">
            {/* Wider (16px side margin instead of Card's own 24px mx-6),
                roomier internal padding, and one consistent 14px gap
                between every section (header→card, card→card, last
                card→Done) rather than the previous 24/16/16/22px mix —
                same three boxes, same order, same content, just fuller
                and evenly paced. justifyContent: center keeps each box's
                content vertically centered now that the taller padding
                can leave more room than the content strictly needs. */}
            <Card style={{ ...DONE_CARD_STYLE, marginTop: DONE_SECTION_GAP }}>
              {/* Text/info sized up ~12% across this card (eyebrow 13->14.5,
                  title 19->21.5, runtime 13->14.5, star recap 14->16px +
                  gap 2->2.25, rating label 14->15.5, plus the matching
                  ~12% bump on the spacing between them) per the "feels too
                  tight" ask — same card padding/margin/width as before, so
                  the bigger content just fills the existing box better
                  instead of sitting small inside it. WatchDateBadge is left
                  untouched since it's a shared component also used in the
                  "rate" stage's hero overlay, not something local to this
                  card alone. */}
              <div className="flex items-center justify-between w-full">
                <div>
                  <div style={{ fontSize: 14.5, color: accent, fontWeight: 600, letterSpacing: "0.1em" }}>{subject.eyebrow}</div>
                  <div style={{ fontSize: 21.5, fontWeight: 700, color: "#fff", marginTop: 2 }}>{subject.title}</div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  {subject.runtimeMin && <span style={{ fontSize: 14.5, color: t.textDim }}>{subject.runtimeMin}m</span>}
                  <WatchDateBadge watch={watch} onClick={() => setDateSheetOpen(true)} />
                </div>
              </div>
              {/* StarInput (readOnly) rather than a plain Icon loop — stars
                  can now be a half-star value (e.g. 3.5 out of 5), which a binary
                  `stars >= i` fill can't render correctly; StarInput
                  already knows how to paint a half-filled star. */}
              <div style={{ marginTop: 18 }}><StarInput value={stars} onChange={() => {}} size={26} color={accent} gap={4} maxStars={5} readOnly /></div>
              {stars > 0 && <div style={{ fontSize: 15.5, color: t.textDim, marginTop: 4.5 }}>{ratingLabelFor(stars)}</div>}
            </Card>

            {moods.size > 0 && (
              <Card style={{ ...DONE_CARD_STYLE, marginTop: DONE_SECTION_GAP }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 10 }}>Your feelings</div>
                <div className="flex flex-wrap gap-2.5">
                  {moodList.filter((m) => moods.has(m.id)).map((m) => (
                    <div key={m.id} className="flex items-center gap-1 rounded-full" style={{ padding: "9px 15px", background: "rgba(232,162,76,0.10)", border: `1px solid ${accent}` }}>
                      <span style={{ fontSize: 15 }}>{m.emoji}</span>
                      <span style={{ fontSize: 13, color: "#fff" }}>{m.label}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {mvpPerson && (
              <Card style={{ ...DONE_CARD_STYLE, marginTop: DONE_SECTION_GAP }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 10 }}>Your MVP</div>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <CastAvatar person={mvpPerson} size={56} />
                    <div style={{ position: "absolute", top: -6, right: -4, width: 20, height: 20, borderRadius: "50%", background: accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="crown" size={11} color="#1a1108" />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>{mvpPerson.role}</div>
                    <div style={{ fontSize: 14, color: t.textDim, marginTop: 1 }}>That performance stood out!</div>
                  </div>
                </div>
              </Card>
            )}

            <button onClick={onClose} className="w-full rounded-full active:scale-95 transition" style={{ marginTop: DONE_SECTION_GAP, padding: 14, background: "#fff" }}>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: "#111" }}>Done</span>
            </button>
          </div>
        )}
      </div>

      {dateSheetOpen && watch && (
        <WatchDateSheet
          current={watch}
          episodeAirDate={subject.episodeAirDate}
          onClose={() => setDateSheetOpen(false)}
          onSave={saveWatchDate}
        />
      )}
    </div>
  );
}
