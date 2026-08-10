"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import StarInput from "@/components/ui/StarInput";
import PosterArt from "@/components/ui/PosterArt";
import { tmdbImage } from "@/lib/tmdb";
import { SEASON_MOOD_LIST, moodIdsFromField, moodMetasFromField } from "@/components/SeasonBanner";
import { themes, DEFAULT_ACCENT, initialsOf } from "@/lib/theme";
import { useNavVisibility } from "@/lib/nav-visibility-context";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

const fmtDate = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

// Same technique as Home's own adaptive atmosphere (app/(tabs)/home/page.jsx's
// extractEdgeColor) — samples the lower third of a small canvas-drawn copy
// of the backdrop and averages it to one RGB triplet. Replaces an earlier
// attempt that mirrored/blurred a literal copy of the image itself: that
// worked fine for moody, low-contrast posters, but a graphically bold one
// (e.g. a bright poster with a single strong graphic shape) still read as a
// visible blurred "blob" of that shape rather than a smooth wash, since
// blurring a photo doesn't erase its underlying geometry, just softens its
// edges. A flat color average has no shape to leak through in the first
// place — it's just a number, so the resulting gradient is guaranteed
// smooth regardless of how visually bold the source poster is.
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

// No backdrop-filter here — that's a known WebKit/iOS Safari repaint bug
// inside a scrolling container (it can fail to recompute the blurred-
// behind content as you scroll, leaving a stale/ghosted snapshot showing
// through). A plain rgba fill has no such issue (ordinary alpha
// compositing, nothing to "recompute" on scroll), so the low-opacity tint
// below is safe despite that earlier caution — it's a different mechanism
// than the backdrop-filter one it was guarding against.
const CARD_BORDER = "rgba(255,255,255,0.14)";

function GlassButton({ children, onClick, style }) {
  return (
    <button onClick={onClick} style={{ background: t.cardFill, color: "#fff", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", ...style }} className="flex items-center justify-center gap-2 rounded-full active:scale-95 transition">
      {children}
    </button>
  );
}

// Tiny read-only 5-star row for the per-episode breakdown list — matches
// episode_watches.rating's own 0-5 half-star scale (EpisodeRatingFlow),
// not the season's 0-10 one.
function MiniStars({ value }) {
  return (
    <div className="flex" style={{ gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => <Icon key={i} name="star" size={11} color={value >= i ? accent : "rgba(255,255,255,0.16)"} />)}
    </div>
  );
}

// The unified season rating screen — replaces what would otherwise be a
// separate breakdown sheet + composer sheet + read view
// (reference/season_rating_prototype.jsx). One `editing` state model:
// manual ratings open straight to the read view; auto/empty seasons open
// straight into editing (encourages actually rating it). Real data only —
// no mock cast/mood beyond MOOD_LIST, which is intentionally fixed
// everywhere a mood is entered or shown.
export default function SeasonRatingScreen({ showTitle, season, manual, auto, cast, backdropPath, logoUrl, showGenre, initialEditing, onClose, onSave, onDelete, onShare }) {
  // Sampled once per season (backdropPath/season.posterPath change) —
  // neutral near-black until it resolves, same fallback Home's own
  // heroEdgeRGB uses.
  const [atmoRGB, setAtmoRGB] = useState([10, 10, 12]);
  useEffect(() => {
    const src = backdropPath ?? season.posterPath;
    if (!src) { setAtmoRGB([10, 10, 12]); return; }
    let cancelled = false;
    extractEdgeColor(tmdbImage(src, "w200"))
      .then((rgb) => { if (!cancelled) setAtmoRGB(rgb); })
      .catch(() => { if (!cancelled) setAtmoRGB([10, 10, 12]); });
    return () => { cancelled = true; };
  }, [backdropPath, season.posterPath]);

  // Each card reads as "an extension of the poster" via its own top-to-
  // bottom gradient, tinted with atmoRGB and fading to a flat near-black —
  // NOT the old approach (a near-transparent fill letting whatever sits
  // behind it, i.e. the atmosphere layer, show through). That was the
  // "muddy" bug: opacity-based bleed-through reads differently depending
  // on what's behind the card at that scroll position, and stacked with
  // the atmosphere layer's own gradient it produced an uncontrolled,
  // washed-out cast. Blending atmoRGB directly into an opaque dark base
  // (mixRGB below) makes every stop fully solid — the card's color never
  // depends on anything behind it, so it's identical regardless of where
  // it sits on the page or what's rendered underneath.
  const mixRGB = (amt) => atmoRGB.map((c) => Math.round(c * amt + 12 * (1 - amt))).join(",");
  const CARD_BG = `linear-gradient(180deg, rgb(${mixRGB(0.32)}) 0%, rgb(${mixRGB(0.14)}) 55%, #141414 100%)`;

  // FloatingNav sits at zIndex:100 (deliberately dominant over ordinary
  // in-page overlays) — this full-screen overlay is only z-40, so without
  // hiding the nav it paints on top of this screen the whole time it's
  // open, same fix CaseOverlay already needed.
  const [, setNavHidden] = useNavVisibility();
  useEffect(() => {
    setNavHidden(true);
    return () => setNavHidden(false);
  }, [setNavHidden]);

  const [editing, setEditing] = useState(initialEditing);
  const [draftRating, setDraftRating] = useState(manual ? manual.rating : 0);
  // Multiple moods can be selected at once — stored back as a single
  // comma-joined string in the same `mood` text column (moodIdsFromField/
  // moodMetasFromField in SeasonBanner.jsx parse it back out), so no
  // schema change was needed to support this.
  const [draftMoods, setDraftMoods] = useState(moodIdsFromField(manual?.mood));
  const [draftCharacterId, setDraftCharacterId] = useState(manual?.characterId || null);
  const [draftCharacterName, setDraftCharacterName] = useState(manual?.characterName || null);
  const [draftText, setDraftText] = useState(manual?.text || "");
  const [moreOpen, setMoreOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const readMoodMetas = manual ? moodMetasFromField(manual.mood) : [];
  const viewingAuto = !editing && !manual && auto; // read-only view of an auto score, no manual saved yet
  // 0 is now a legitimate, explicit rating ("no stars"), not just "nothing
  // entered yet" — so Save is always available in editing, not gated on
  // a nonzero value the way it used to be.
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
      await onSave({ rating: draftRating, mood: draftMoods.join(","), characterId: draftCharacterId, characterName: draftCharacterName, text: draftText.trim() });
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

  // Flat neutral — NOT a gradient. This is the outermost fixed viewport
  // layer, sitting behind literally everything (hero, content, cards), so
  // any color painted here shows through anywhere those don't fully cover
  // it: card gaps, iOS rubber-band/momentum-scroll overscroll revealing
  // area beyond the laid-out content, etc. It previously carried its own
  // independent warm-to-black gradient — a second, differently-sourced
  // color ramp stacked in the same vertical span as the atmosphere layer
  // below (which is driven by atmoRGB, the actual sampled show color).
  // Two independently-authored gradients covering the same region is
  // exactly what kept producing seam/mismatch bugs across several rounds:
  // this one's stops had no relationship to atmoRGB, so they could never
  // reliably line up at the boundary. The adaptive tint now lives only in
  // the atmosphere layer, scoped behind the hero/top-card area; this root
  // layer is just a solid neutral backstop, matching the app's own black.
  return (
    <div className="fixed inset-0 z-40" style={{ background: "#0A0A0C" }}>
      <div className="h-full overflow-y-auto pb-12" style={{ scrollbarWidth: "none" }}>
        {/* backdrop — the show's own landscape cover art (not the vertical
            season poster), stretching to nearly half the screen so the
            real art carries the color down instead of cutting to black */}
        <div className="relative w-full" style={{ height: 400 }}>
          <PosterArt posterPath={backdropPath ?? season.posterPath} base={season.base} glow={season.glow} alt={season.title} tmdbSize="w780" />
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, rgba(10,8,6,0.15) 0%, rgba(10,8,6,0.35) 45%, #0A0A0C 100%)` }} />

          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
            <GlassButton onClick={onClose} style={{ width: 38, height: 38 }}><Icon name="back" size={16} /></GlassButton>
            {!editing && (manual || auto) && (
              <div className="flex items-center gap-2">
                <GlassButton onClick={onShare} style={{ width: 38, height: 38 }}><Icon name="share" size={15} /></GlassButton>
                {manual && (
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
                )}
              </div>
            )}
          </div>

          <div className="absolute left-0 right-0 px-6" style={{ bottom: 22 }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- resolved TMDB CDN URL
              <img src={logoUrl} alt={showTitle} style={{ maxWidth: "78%", maxHeight: 39, objectFit: "contain" }} />
            ) : (
              <div style={{ fontSize: 12, letterSpacing: "0.14em", color: accent, fontWeight: 600 }}>{showTitle.toUpperCase()}</div>
            )}
            <div style={{ fontSize: 28, fontWeight: 500, color: "#fff", marginTop: 3 }}>{season.title}</div>
            {/* Episode count and genre on their own separate rows — no year,
                and genre no longer shares a line with the episode count. */}
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
              {season.episodes.length} Episode{season.episodes.length === 1 ? "" : "s"}
            </div>
            {showGenre && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>{showGenre}</div>
            )}
            {!editing && (manual || auto) && (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: viewingAuto ? "rgba(232,162,76,0.16)" : "rgba(255,255,255,0.1)", border: `1px solid ${viewingAuto ? accent : t.glassBorder}` }}>
                  {viewingAuto && <Icon name="sparkle" size={10} color={accent} />}
                  <Icon name="star" size={12} color={accent} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{(manual ? manual.rating : auto.avg10).toFixed(1)}<span style={{ color: t.textDim, fontWeight: 500 }}>/10</span></span>
                </div>
                <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)" }}>{manual ? fmtDate(manual.savedAt) : `${auto.ratedCount}/${auto.total} episodes rated`}</span>
              </div>
            )}
          </div>
        </div>

        {/* No marginTop here (moved onto the zIndex:1 content div below) —
            this wrapper's own top has to sit flush against the real
            backdrop image above it, with nothing in between. A gap here
            left a sliver where neither the image nor the atmosphere layer
            (which starts at this wrapper's own top:0) rendered anything,
            revealing the page's own static outer background gradient
            underneath — a warm brown/amber tone that doesn't match
            whatever's on screen, reading as a random warm-colour gap. */}
        <div className="px-6 relative">
          {/* Adaptive atmosphere — a flat gradient tinted with atmoRGB (the
              backdrop's own sampled dominant color, extractEdgeColor
              above), NOT a literal mirrored/blurred copy of the image
              itself (tried and reverted — a graphically bold poster, e.g.
              one dominated by a single bright graphic shape, still read
              as a visible blurred "blob" of that shape rather than a
              smooth wash, since blurring a photo softens edges without
              erasing its underlying geometry). A flat sampled color has
              no shape to leak through at all, so this is guaranteed smooth
              regardless of how bold the source poster is — directly
              addressing "there's a gap in a different colour" (that gap
              WAS the blurred shape from the old image-mirror approach).
              Starts genuinely near-black right at the top (continuing the
              real backdrop's own already-dark edge above it, per "starting
              from dark"), then holds a deliberately saturated, "thick"
              version of the sampled color through the middle — dark
              source art naturally samples to a low/near-black RGB already
              (so this just stays pitch dark, as requested), while bright
              source art still samples a genuinely bright RGB that reads
              as an intense, saturated wash here rather than a washed-out
              pastel. Fades to flat neutral #0A0A0C by the bottom, same as
              before. Sized to a fixed 420px, not the whole arbitrarily-
              tall card stack — reaches neutral well before the later
              cards, same as Home's own atmosphere layer. zIndex:0, with
              the cards wrapped at zIndex:1 right below — a positioned
              layer like this always paints above plain, non-positioned
              flow content regardless of DOM order otherwise. */}
          <div
            className="absolute top-0 left-0 right-0"
            style={{
              height: 420,
              zIndex: 0,
              pointerEvents: "none",
              // Starts at the exact same flat #0A0A0C the image's own
              // overlay ends at (was rgba(atmoDark,0.9) — a different,
              // color-tinted value at less than full opacity, letting the
              // page's own warm-brown background bleed through the
              // remaining 10% right at the seam) — that mismatch was the
              // visible "random background break" line. Eases into the
              // tinted atmosphere shortly after instead of right at 0%,
              // then back to the same neutral by the end.
              background: `linear-gradient(180deg, #0A0A0C 0%, rgba(${atmoRGB.map((c) => Math.round(c * 0.22)).join(",")},0.9) 20%, rgba(${atmoRGB.map((c) => Math.round(c * 0.42)).join(",")},0.95) 55%, #0A0A0C 100%)`,
            }}
          />
          {/* marginTop:20 lives here now, not on the outer wrapper — this
              div is zIndex:1 (painted above the atmosphere layer), so the
              20px gap before the first card is now covered by the
              atmosphere's own dark/tinted gradient showing through,
              instead of being empty space above everything. */}
          <div className="relative" style={{ zIndex: 1, marginTop: 20 }}>
          {/* Rating — 10-star row, centered, card-grouped */}
          <div className="rounded-3xl flex flex-col items-center text-center" style={{ padding: "22px 14px", background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}>
            <div style={{ fontSize: 15.5, fontWeight: 600, color: "#fff" }}>{editing ? "Rate this season" : viewingAuto ? "Auto Rating" : "Your Rating"}</div>
            {/* autoFit — no existing 10-star row in this codebase to copy a
                fixed size from (EpisodeRatingFlow's own StarInput usage is
                5 stars); 10 stars is a lot tighter to fit across real phone
                widths than 5, so this measures its actual container instead
                of trusting a fixed prototype pixel size. Min/max bumped 50%
                over the original pass — the initial autoFit range read as
                too small for this card's own visual weight. */}
            <div className="mt-4">
              <StarInput
                value={editing ? draftRating : viewingAuto ? auto.avg10 : (manual?.rating ?? 0)}
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
            {!editing && !viewingAuto && manual && <div style={{ fontSize: 15.73, fontWeight: 700, color: accent, marginTop: 9 }}>{manual.rating.toFixed(1)}/10</div>}
            {viewingAuto && (
              <>
                <div style={{ fontSize: 12, color: t.textDim, marginTop: 8 }}>Calculated from your episode ratings</div>
                <button onClick={startEdit} className="rounded-full active:scale-95 transition" style={{ marginTop: 14, padding: "9px 18px", background: "rgba(232,162,76,0.14)", border: `1px solid ${accent}` }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: accent }}>Rate This Season Yourself</span>
                </button>
              </>
            )}
          </div>

          {/* Mood — multi-select: any number of moods can be active at once,
              each toggled independently rather than one replacing another. */}
          {(editing || readMoodMetas.length > 0) && (
            <div className="mt-4 rounded-3xl text-center" style={{ padding: "22px 16px", background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}>
              <div style={{ fontSize: 15.5, fontWeight: 600, color: "#fff" }}>{editing ? "How did it make you feel?" : "Your Mood"}</div>
              {editing ? (
                // grid, not the old 5-item justify-between row — the full
                // list is too many entries to fit legibly across one row.
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

          {/* Favorite character — real cast, real photos when TMDB has one */}
          {(editing || manual?.characterName) && (
            <div className="mt-4 rounded-3xl text-center" style={{ padding: "22px 16px", background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}>
              <div style={{ fontSize: 15.5, fontWeight: 600, color: "#fff" }}>{editing ? "Favorite character?" : "Favorite Character"}</div>
              {/* mt-1 + paddingTop:12 (not mt-4 alone) — overflow-x:auto
                  forces the browser's computed overflow-y to "auto" too
                  (a CSS Overflow spec rule: an axis left at its default
                  "visible" gets force-changed to "auto" the moment the
                  OTHER axis is anything but "visible"), so this row was
                  silently clipping the crown badge's -8px top offset even
                  though overflow-y was never explicitly set. The padding
                  gives that offset real room without visually moving the
                  row (margin was reduced by the same amount). */}
              {editing ? (
                // No justify-center here — with this many cast entries the
                // row always overflows, and centering an overflowing flex
                // row makes the browser start it scrolled to the MIDDLE of
                // the content instead of the first item, forcing a scroll
                // backward just to see #1. Left-aligned always starts at
                // scrollLeft 0.
                <div className="mt-1 flex gap-4 overflow-x-auto" style={{ scrollbarWidth: "none", paddingTop: 12 }}>
                  {cast.length === 0 ? (
                    <div style={{ fontSize: 12, color: t.textDim, padding: "8px 0" }}>No cast listed for this show yet.</div>
                  ) : cast.map((c) => {
                    const active = draftCharacterId === c.id;
                    return (
                      // Character name (c.role), not the real actor name —
                      // both the persisted characterName and the label
                      // below now show who they played, not who played
                      // them. The avatar photo (when there is one) still
                      // shows the real actor's face, same as any "who's
                      // your favorite character" UI — only the caption/
                      // fallback initials change.
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

          {/* Review — header centered like the other cards, body left-aligned for readability */}
          {(editing || manual?.text) && (
            <div className="mt-4 rounded-3xl" style={{ padding: "22px 16px", background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}>
              <div className="text-center" style={{ fontSize: 15.5, fontWeight: 600, color: "#fff" }}>{editing ? "Write your review" : "Your Review"} {editing && <span style={{ fontSize: 12, color: t.textDim, fontWeight: 500 }}>(optional)</span>}</div>
              {editing ? (
                <div className="relative rounded-2xl mt-4" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} placeholder="Share your thoughts..." rows={4} className="w-full bg-transparent outline-none" style={{ padding: "12px 14px 14px", fontSize: 13.5, color: "#fff", lineHeight: 1.5, resize: "none", textAlign: "left" }} />
                </div>
              ) : (
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.85)", marginTop: 10, textAlign: "left" }}>{manual.text}</div>
              )}
            </div>
          )}

          {/* Auto Rating + Rating Breakdown — inline reference, no separate sheet */}
          {auto && (
            <div className="mt-4 rounded-3xl" style={{ padding: "22px 16px", background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}>
              <div className="text-center">
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: t.textDim }}>AUTO RATING</div>
                <div className="flex items-end justify-center gap-1.5" style={{ marginTop: 6 }}>
                  <span style={{ fontSize: 33, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{auto.avg10.toFixed(1)}</span>
                  <span style={{ fontSize: 13, color: t.textDim, marginBottom: 3 }}>/10</span>
                </div>
                <div style={{ fontSize: 11.5, color: t.textDim, marginTop: 4 }}>Based on {auto.ratedCount} of {auto.total} rated episodes</div>
              </div>

              <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${t.cardBorder}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: t.textDim, marginBottom: 6 }}>RATING BREAKDOWN</div>
                {season.episodes.map((e) => (
                  <div key={e.n} className="flex items-center justify-between" style={{ padding: "6px 0" }}>
                    <span style={{ fontSize: 13, color: e.myRating ? "#fff" : t.textDim, fontWeight: 500 }}>Episode {e.n}</span>
                    {e.myRating ? <MiniStars value={e.myRating} /> : <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.28)", fontStyle: "italic" }}>Not rated</span>}
                  </div>
                ))}
              </div>
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

      {/* ---------------- Saved confirmation ---------------- */}
      {justSaved && (
        <div className="absolute inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full rounded-t-3xl flex flex-col items-center text-center flex-shrink-0" style={{ padding: "40px 28px 28px", background: "#161210", border: `1px solid ${t.glassBorder}`, borderBottom: "none", boxShadow: "0 -20px 60px rgba(0,0,0,0.6)" }}>
            <div className="flex items-center justify-center rounded-full" style={{ width: 76, height: 76, border: `2px solid ${accent}` }}><Icon name="check" size={30} color={accent} strokeWidth={3} /></div>
            <div style={{ fontSize: 19, fontWeight: 800, color: "#fff", marginTop: 18 }}>Rating Saved!</div>
            <div style={{ fontSize: 13, color: t.textDim, marginTop: 5 }}>Thanks for rating this season.</div>
            <button onClick={() => setJustSaved(false)} className="w-full rounded-full active:scale-95 transition" style={{ marginTop: 24, padding: 14, background: "#fff" }}><span style={{ fontSize: 14.5, fontWeight: 700, color: "#111" }}>Done</span></button>
          </div>
        </div>
      )}
    </div>
  );
}
