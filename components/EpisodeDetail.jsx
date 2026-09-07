"use client";

import { useState } from "react";
import Image from "next/image";
import Icon from "@/components/ui/Icon";
import PosterArt from "@/components/ui/PosterArt";
import { tmdbImage } from "@/lib/tmdb";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";


const t = themes.dark;
const accent = DEFAULT_ACCENT;

function GlassButton({ children, onClick, style, className = "" }) {
  return (
    <button onClick={onClick} style={{
      background: t.cardFill, color: "#fff",
      border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", ...style
    }} className={`flex items-center justify-center gap-2 rounded-full active:scale-95 transition ${className}`}>
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
 *     watched, watchCount, skipped, myRating, daysUntil }
 *   watchedDateLabel: string | null — optional, e.g. "Jul 15, 2026" (already
 *     formatted via lib/watchDate.js's formatWatchDateLabel). Only rendered
 *     when the episode is watched and this is provided — omit it (as
 *     ShowDetailClient's overlay usage does) and nothing changes.
 *   cast: [{ id, name, role, initials, grad, profilePath }] — optional, omit/empty hides the row
 *   hasEarlierUnwatched: boolean — whether an earlier aired episode (this
 *     show, any season) is still unwatched/unskipped; gates the "only this /
 *     previous episodes too" menu when marking watched
 *   onClose: () => void — top-left back button
 *   onCastClick: (id) => void — optional
 *   onMarkWatched: () => void — no earlier-unwatched conflict, mark watched
 *   onMarkOnlyThis / onMarkWithPrevious: () => void — skip-ahead menu choices
 *   onMarkNotWatched / onMarkSkipped / onMarkRewatched / onMarkWatchedOnce: () => void — already-watched/skipped menu choices
 *   breadcrumb: { label, onClick } — optional TV-icon button that opens
 *     the show's detail page (Home hero / standalone episode route). Shown
 *     immediately left of the watch check, not in the hero header. `label`
 *     is no longer rendered (icon-only) but still accepted so callers don't
 *     need to change what they pass.
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
  onMarkSkipped,
  onMarkRewatched,
  onMarkWatchedOnce,
  breadcrumb,
}) {
  const [skipMenuOpen, setSkipMenuOpen] = useState(false);
  const [watchMenuOpen, setWatchMenuOpen] = useState(false);

  // Skipped behaves like watched for the purposes of "does tapping the
  // check button open the Mark As… menu" — both are a *resolved* status
  // the user has to explicitly change via that menu, as opposed to the
  // blank not-started state where a tap directly marks it watched.
  const handleTopButtonClick = () => {
    // Already resolved → Mark As… menu. First mark → watched + rating immediately
    // (no skip-ahead dropdown on the first click).
    if (ep.watched || ep.skipped) { setSkipMenuOpen(false); setWatchMenuOpen(true); return; }
    setSkipMenuOpen(false);
    setWatchMenuOpen(false);
    onMarkWatched?.();
  };

  const handleBottomButtonClick = () => {
    // Stay on the episode card after unmarking so the CTA/check flip to
    // the unwatched state in place. Closing is left to the back/backdrop.
    if (ep.watched) { onMarkNotWatched?.(); return; }
    if (ep.skipped) { setSkipMenuOpen(false); setWatchMenuOpen(true); return; }
    setSkipMenuOpen(false);
    setWatchMenuOpen(false);
    onMarkWatched?.();
  };

  return (
    <div className="episode-detail-root overflow-y-auto pb-8" style={{ scrollbarWidth: "none" }}>
      <div className="episode-detail-hero relative w-full" style={{ height: 300 }}>
        <PosterArt posterPath={ep.posterPath} base={ep.base} glow={ep.glow} alt={ep.title} tmdbSize="original" sizes="100vw" />
        <div className="episode-detail-hero-fade absolute inset-0" style={{ background: "linear-gradient(0deg, #0A0A0C 8%, transparent 50%, rgba(0,0,0,0.1) 100%)" }} />
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
          <GlassButton onClick={onClose} className="ep-detail-back" style={{ width: 38, height: 38 }}><Icon name="back" size={16} color={t.text} /></GlassButton>
          {breadcrumb ? (
            <div className="ep-detail-spacer" style={{ width: 38 }} />
          ) : (
            <>
              <span className="ep-detail-show-title" style={{ fontSize: 12.5, color: t.textDim, fontWeight: 600, letterSpacing: "0.06em" }}>{(showTitle ?? "").toUpperCase()}</span>
              <div className="ep-detail-spacer" style={{ width: 38 }} />
            </>
          )}
        </div>
      </div>

      <div className="episode-detail-body px-6" style={{ marginTop: 18 }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div style={{ fontSize: 11.5, color: accent, fontWeight: 600, letterSpacing: "0.12em" }}>SEASON {seasonNumber} · EPISODE {ep.n}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginTop: 3 }}>{ep.title}</div>
          </div>
          <div className="relative flex-shrink-0 flex items-center gap-2">
            {breadcrumb ? (
              <GlassButton
                onClick={breadcrumb.onClick}
                className="ep-detail-tv"
                style={{ width: 34, height: 34 }}
              >
                <Icon name="tv" size={15} color={t.text} />
              </GlassButton>
            ) : null}
            <button
              onClick={ep.daysUntil != null ? undefined : handleTopButtonClick}
              disabled={ep.daysUntil != null}
              className="flex items-center justify-center active:scale-90 transition"
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                opacity: ep.daysUntil != null ? 0.4 : 1,
                background: ep.watched
                  ? ((ep.watchCount || 1) >= 2 ? "#7CC950" : "#fff")
                  : ep.skipped
                  ? "#6B7280"
                  : t.cardFill,
                backdropFilter: ep.watched || ep.skipped ? undefined : "blur(20px)",
                WebkitBackdropFilter: ep.watched || ep.skipped ? undefined : "blur(20px)",
                border: ep.watched && (ep.watchCount || 1) < 2
                  ? "1.5px solid #fff"
                  : ep.watched || ep.skipped
                  ? "1.5px solid transparent"
                  : `1px solid ${t.glassBorder}`,
              }}
            >
              {ep.watched && (ep.watchCount || 1) >= 2
                ? <span style={{ fontSize: 12, fontWeight: 700, color: "#0d1a06" }}>×{ep.watchCount}</span>
                : ep.skipped
                ? <Icon name="skip" size={15} color="#fff" />
                : <Icon name="check" size={14} color={ep.watched ? "#111" : t.text} strokeWidth={2} />}
            </button>
            {skipMenuOpen && (
              <div className="absolute z-30 rounded-2xl" style={{ right: 0, top: "calc(100% + 8px)", width: 220, padding: "8px", background: "rgba(48, 50, 54, 0.92)", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(24px)", boxShadow: "0 20px 44px rgba(0,0,0,0.55)" }}>
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
              <div className="absolute z-30 rounded-2xl" style={{ right: 0, top: "calc(100% + 8px)", width: 200, padding: "8px", background: "rgba(48, 50, 54, 0.92)", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(24px)", boxShadow: "0 20px 44px rgba(0,0,0,0.55)" }}>
                <div style={{ fontSize: 10.5, color: t.textDim, fontWeight: 600, letterSpacing: "0.08em", padding: "4px 10px 6px" }}>MARK AS…</div>
                <button onClick={() => { setWatchMenuOpen(false); onMarkNotWatched?.(); }} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                  <Icon name="eyeOff" size={15} color="#fff" />
                  <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Not Watched</span>
                </button>
                <button onClick={() => { setWatchMenuOpen(false); onMarkSkipped?.(); }} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                  <Icon name="skip" size={15} color="#fff" />
                  <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Skipped</span>
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
          <div style={{ marginTop: 44 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 10 }}>Cast &amp; Crew</div>
            <div className="episode-detail-cast-row flex gap-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
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

        <button
          onClick={ep.daysUntil != null ? undefined : handleBottomButtonClick}
          disabled={ep.daysUntil != null}
          className="episode-detail-cta active:scale-95 transition"
          style={{
            marginTop: 36,
            padding: "12px 28px",
            borderRadius: 999,
            background: ep.daysUntil != null
              ? "rgba(255,255,255,0.06)"
              : ep.watched
              ? "#fff"
              : "rgba(255,255,255,0.12)",
            color: ep.daysUntil != null ? t.textDim : ep.watched ? "#111" : "#fff",
            border: ep.daysUntil != null ? `1px solid ${t.glassBorder}` : "none",
            backdropFilter: !ep.watched && ep.daysUntil == null ? "blur(12px)" : undefined,
            WebkitBackdropFilter: !ep.watched && ep.daysUntil == null ? "blur(12px)" : undefined,
            fontSize: 14.5,
            fontWeight: 600,
            width: "100%",
          }}
        >
          {ep.daysUntil === Infinity ? "Release date TBA" : ep.daysUntil != null ? `Airs in ${ep.daysUntil} day${ep.daysUntil === 1 ? "" : "s"}` : ep.watched ? "Mark as Unwatched" : "Mark as Watched"}
        </button>
      </div>
    </div>
  );
}
