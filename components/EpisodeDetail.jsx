"use client";

import { useState } from "react";
import Image from "next/image";
import Icon from "@/components/ui/Icon";
import PosterArt from "@/components/ui/PosterArt";
import { tmdbImage } from "@/lib/tmdb";
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

/**
 * EpisodeDetail — the single episode-detail UI in the app: full-bleed
 * still art, watched toggle (+ rewatch / mark-with-previous menus),
 * synopsis, cast. Used both as Show Detail's in-context overlay (tapping
 * an episode row) and as the body of the standalone
 * /show/[id]/episode/[season]/[ep] page that Home's Continue Watching hero
 * opens — same component either way. Callers own the surrounding
 * container (a `fixed inset-0` overlay vs. a plain page) and wire the
 * mark-watched callbacks to wherever their watched state actually lives;
 * this component owns none of that persistence, only the UI and the two
 * small bits of menu-open state (the skip-ahead / rewatch dropdowns) that
 * never need to be visible to a caller.
 *
 * props:
 *   showTitle: string — header eyebrow label (only shown when no breadcrumb)
 *   seasonNumber: number
 *   episode: { n, title, date, runtime, synopsis, posterPath, base, glow,
 *     watched, watchCount, myRating, daysUntil }
 *   watchedDateLabel: string | null — optional, e.g. "Jul 15, 2026" (already
 *     formatted via lib/watchDate.js's formatWatchDateLabel). Only rendered
 *     when the episode is watched and this is provided — omit it (as
 *     ShowDetailClient's overlay usage does) and nothing changes.
 *   cast: [{ id, name, role, initials, grad, profilePath }] — optional, omit/empty hides the row
 *   hasEarlierUnwatched: boolean — whether an earlier aired episode (this
 *     show, any season) is still unwatched; gates the "only this / previous
 *     episodes too" menu when marking watched
 *   onClose: () => void — top-left back button
 *   onCastClick: (id) => void — optional
 *   onMarkWatched: () => void — no earlier-unwatched conflict, mark watched
 *   onMarkOnlyThis / onMarkWithPrevious: () => void — skip-ahead menu choices
 *   onMarkNotWatched / onMarkRewatched / onMarkWatchedOnce: () => void — already-watched menu choices
 *   breadcrumb: { label, onClick } — optional top-right TV-icon button that
 *     opens the show's detail page, for the standalone page (Show Detail's
 *     own overlay is already on the show, so it never passes this). `label`
 *     is no longer rendered (icon-only button now) but still accepted so
 *     callers don't need to change what they pass.
 */
export default function EpisodeDetail({
  showTitle,
  seasonNumber,
  episode: ep,
  watchedDateLabel,
  cast = [],
  hasEarlierUnwatched = false,
  onClose,
  onCastClick,
  onMarkWatched,
  onMarkOnlyThis,
  onMarkWithPrevious,
  onMarkNotWatched,
  onMarkRewatched,
  onMarkWatchedOnce,
  breadcrumb,
}) {
  const [skipMenuOpen, setSkipMenuOpen] = useState(false);
  const [watchMenuOpen, setWatchMenuOpen] = useState(false);

  const handleTopButtonClick = () => {
    if (ep.watched) { setSkipMenuOpen(false); setWatchMenuOpen(true); return; }
    setWatchMenuOpen(false);
    if (hasEarlierUnwatched) { setSkipMenuOpen(true); return; }
    onMarkWatched?.();
  };

  const handleBottomButtonClick = () => {
    // Matches the original behavior this was extracted from: unmarking via
    // this big CTA also closes/leaves the episode view, while the same
    // "Not Watched" choice from the top button's dropdown (handled by the
    // caller's onMarkNotWatched alone) leaves the view open.
    if (ep.watched) { onClose?.(); onMarkNotWatched?.(); return; }
    if (hasEarlierUnwatched) { setSkipMenuOpen(true); return; }
    onMarkWatched?.();
  };

  return (
    <div className="h-full overflow-y-auto pb-8" style={{ scrollbarWidth: "none" }}>
      <div className="relative w-full" style={{ height: 300 }}>
        <PosterArt posterPath={ep.posterPath} base={ep.base} glow={ep.glow} alt={ep.title} tmdbSize="original" sizes="100vw" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, #0A0A0C 8%, transparent 50%, rgba(0,0,0,0.1) 100%)" }} />
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
          <GlassButton onClick={onClose} style={{ width: 38, height: 38 }}><Icon name="back" size={16} color={t.text} /></GlassButton>
          {breadcrumb ? (
            <GlassButton onClick={breadcrumb.onClick} style={{ width: 38, height: 38 }}><Icon name="tv" size={16} color={t.text} /></GlassButton>
          ) : (
            <>
              <span style={{ fontSize: 12.5, color: t.textDim, fontWeight: 600, letterSpacing: "0.06em" }}>{(showTitle ?? "").toUpperCase()}</span>
              <div style={{ width: 38 }} />
            </>
          )}
        </div>
      </div>

      <div className="px-6" style={{ marginTop: 18 }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div style={{ fontSize: 11.5, color: accent, fontWeight: 600, letterSpacing: "0.12em" }}>SEASON {seasonNumber} · EPISODE {ep.n}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginTop: 3 }}>{ep.title}</div>
          </div>
          <div className="relative flex-shrink-0">
            <button onClick={ep.daysUntil != null ? undefined : handleTopButtonClick} disabled={ep.daysUntil != null} className="flex items-center justify-center active:scale-90 transition" style={{ width: 34, height: 34, opacity: ep.daysUntil != null ? 0.4 : 1 }}>
              {ep.watched && (ep.watchCount || 1) >= 2
                ? <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#7CC950", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 12, fontWeight: 700, color: "#0d1a06" }}>×{ep.watchCount}</span></div>
                : <Icon name={ep.watched ? "checkCircle" : "circle"} size={30} color={ep.watched ? accent : "rgba(255,255,255,0.3)"} />}
            </button>
            {skipMenuOpen && (
              <div className="absolute z-30 rounded-2xl" style={{ right: 0, top: "calc(100% + 8px)", width: 220, padding: "8px", background: "rgba(28,22,16,0.97)", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(24px)", boxShadow: "0 20px 44px rgba(0,0,0,0.55)" }}>
                <div style={{ fontSize: 10.5, color: t.textDim, fontWeight: 600, letterSpacing: "0.08em", padding: "4px 10px 6px" }}>SET WATCH STATUS</div>
                <button onClick={() => { setSkipMenuOpen(false); onMarkOnlyThis?.(); }} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                  <Icon name="checkCircle" size={18} color={accent} />
                  <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Only for this episode</span>
                </button>
                <button onClick={() => { setSkipMenuOpen(false); onMarkWithPrevious?.(); }} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                  <Icon name="collection" size={17} color="#fff" />
                  <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Previous episodes too</span>
                </button>
              </div>
            )}
            {watchMenuOpen && (
              <div className="absolute z-30 rounded-2xl" style={{ right: 0, top: "calc(100% + 8px)", width: 200, padding: "8px", background: "rgba(28,22,16,0.97)", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(24px)", boxShadow: "0 20px 44px rgba(0,0,0,0.55)" }}>
                <div style={{ fontSize: 10.5, color: t.textDim, fontWeight: 600, letterSpacing: "0.08em", padding: "4px 10px 6px" }}>MARK AS…</div>
                <button onClick={() => { setWatchMenuOpen(false); onMarkNotWatched?.(); }} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                  <Icon name="eyeOff" size={15} color="#fff" />
                  <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Not Watched</span>
                </button>
                <button onClick={() => { setWatchMenuOpen(false); onMarkRewatched?.(); }} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                  <div style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>+1</span>
                  </div>
                  <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Rewatched</span>
                </button>
                <button onClick={() => { setWatchMenuOpen(false); onMarkWatchedOnce?.(); }} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                  <div style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>1</span>
                  </div>
                  <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Watched Once</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-x-2 gap-y-1" style={{ marginTop: 10, fontSize: 12, color: t.textDim }}>
          <span>{ep.date}</span><span>·</span><span>{ep.runtime}m</span>
          {ep.watched && ep.myRating && (<><span>·</span><span className="flex items-center gap-1"><Icon name="star" size={10} color={accent} />{ep.myRating.toFixed(1)}/5</span></>)}
          {ep.watched && watchedDateLabel && (<><span>·</span><span className="flex items-center gap-1"><Icon name="calendar" size={10} color={t.textDim} />Watched: {watchedDateLabel}</span></>)}
        </div>

        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "rgba(255,255,255,0.78)", marginTop: 16 }}>
          {ep.synopsis || "No synopsis available for this episode yet."}
        </div>

        {cast.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 10 }}>Cast &amp; Crew</div>
            <div className="flex gap-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {cast.map((c) => (
                <button key={c.id} onClick={() => onCastClick?.(c.id)} className="flex-shrink-0 flex flex-col items-center gap-1.5 active:scale-95 transition" style={{ width: 68 }}>
                  <div className="relative overflow-hidden flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: "50%", background: c.grad }}>
                    {c.profilePath ? (
                      <Image src={tmdbImage(c.profilePath, "w92")} alt="" fill sizes="56px" style={{ objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{c.initials}</span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 500, color: "#fff", textAlign: "center" }}>{c.name.split(" ")[0]}</span>
                  <span style={{ fontSize: 10, color: t.textDim, textAlign: "center" }}>{c.role}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button onClick={ep.daysUntil != null ? undefined : handleBottomButtonClick} disabled={ep.daysUntil != null} className="w-full active:scale-95 transition" style={{ marginTop: 28, padding: "13px", borderRadius: 999, background: ep.daysUntil != null ? "rgba(255,255,255,0.06)" : ep.watched ? t.cardFill : "#fff", color: ep.daysUntil != null ? t.textDim : ep.watched ? "#fff" : "#111", border: (ep.watched || ep.daysUntil != null) ? `1px solid ${t.glassBorder}` : "none", fontSize: 14.5, fontWeight: 600 }}>
          {ep.daysUntil != null ? `Airs in ${ep.daysUntil} day${ep.daysUntil === 1 ? "" : "s"}` : ep.watched ? "Mark as Unwatched" : "Mark as Watched"}
        </button>
      </div>
    </div>
  );
}
