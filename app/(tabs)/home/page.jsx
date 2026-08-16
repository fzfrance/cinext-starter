"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import Grain from "@/components/ui/Grain";
import GlassCircle from "@/components/ui/GlassCircle";
import PosterArt from "@/components/ui/PosterArt";
import PosterCard from "@/components/ui/PosterCard";
import PosterGrid from "@/components/ui/PosterGrid";
import PosterQuickStatusMenu from "@/components/ui/PosterQuickStatusMenu";
import EpisodeRatingFlow from "@/components/EpisodeRatingFlow";
import { useAuth } from "@/lib/auth-context";
import { useFavorites } from "@/lib/favorites-context";
import { useMovieFavorites } from "@/lib/movie-favorites-context";
import { useShowCustomizations } from "@/lib/show-customizations-context";
import { useLongPress } from "@/lib/useLongPress";
import { getUserShows } from "@/lib/userShows";
import { getUserMovies } from "@/lib/userMovies";
import { getShowWatchSummary, addEpisodeWatches, rateLatestWatch } from "@/lib/episodeWatches";
import { getProfile } from "@/lib/profile";
import { resolveShowStatus } from "@/lib/statusResolver";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { tmdbImage } from "@/lib/tmdb";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// Persists See All → In Progress's grid/gallery choice, same localStorage-
// backed per-browser preference pattern as e.g. Library's own view-mode
// toggle (LIBRARY_VIEW_MODE_KEY in app/(tabs)/library/LibraryClient.jsx) —
// also read by Home's own In Progress row below, so picking "gallery" in
// the full page carries back to the row instead of only affecting the
// expanded view.
const IN_PROGRESS_VIEW_MODE_KEY = "cinext:homeInProgressViewMode";

// TMDB show.status values that mean "this show will not air anything else" —
// Upcoming excludes these even if a stray next_episode_to_air slipped
// through (shouldn't normally happen, but this is the one thing the UI
// actually promises: "do not show ended shows with no future episode").
const NOT_AIRING_STATUSES = new Set(["Ended", "Canceled"]);

const UPCOMING_TZ = "Asia/Bangkok";
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// { year, month, day } for "now" as seen in Asia/Bangkok — not the
// browser's local timezone, and not UTC. Needed because Math.round on a
// raw millisecond diff (the old approach) mixes time-of-day into what
// should be a pure calendar-day comparison: on July 14 at 10pm Bangkok
// time, an episode airing July 17 is <3 days> away by the clock but was
// showing <2 days> because `new Date() ` captured a fractional-day
// remainder that rounded down.
function bangkokTodayParts() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: UPCOMING_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

// TMDB's next_episode_to_air only ever gives air_date as a bare
// YYYY-MM-DD calendar date — there's no separate airtime field, so there's
// no real hour to convert from any timezone. Parsing it with `new
// Date("YYYY-MM-DD")` treats it as UTC midnight, which is already the
// previous evening in Bangkok (UTC+7) and can shift the countdown by a
// day; parsing the string's own Y-M-D fields directly and treating them as
// the Bangkok calendar date sidesteps that entirely.
function parseAirDateParts(airDateStr) {
  const [year, month, day] = airDateStr.split("-").map(Number);
  return { year, month, day };
}

// Whole-day difference between two Y-M-D calendar dates. Date.UTC here is
// just a neutral integer day-axis for two already-resolved calendar dates
// — not a timezone conversion of either one — so this can't reintroduce
// the UTC-shift bug the way `new Date(airDateStr) - new Date()` did.
function calendarDayDiff(from, to) {
  return Math.round((Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / 86400000);
}

function formatFullDate(airDateStr) {
  const { year, month, day } = parseAirDateParts(airDateStr);
  return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}

// Returns a { primary, secondary } pair for the right-aligned countdown.
// 0/1 days out read as words ("Today" / "Tomorrow"); anything further
// out is a stacked number + "DAYS" label, matching the reference UI.
function getCountdown(airDateStr) {
  const diffDays = calendarDayDiff(bangkokTodayParts(), parseAirDateParts(airDateStr));
  if (diffDays <= 0) return { primary: "Today", secondary: null };
  if (diffDays === 1) return { primary: "Tomorrow", secondary: null };
  return { primary: String(diffDays), secondary: "DAYS" };
}

// Samples the lower third of a backdrop image (same region the hero's
// bottom-fade gradient sits over) and averages it to one RGB triplet, so
// the overlay can be tinted to that image's own tone instead of a fixed
// generic dark gray — reads as the image deepening into black rather than
// a flat scrim dropped on top. TMDB's image CDN sends permissive CORS
// headers, so this doesn't taint the canvas; if it ever did (or the image
// fails to load), the caller just keeps its neutral fallback color.
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

// Samples 5 regions of the SAME backdrop (corners + center) and averages
// each separately — a simple, deterministic stand-in for real dominant-
// color clustering, using this image's own actual spatial color variation
// (e.g. a bright sky/highlight corner vs. dark shadow corner vs. a warm
// midtone center) rather than one flat average. Each swatch also carries
// an (x%, y%) anchor roughly matching where it was sampled from, so the
// page-wide atmosphere layer can place its radial gradients somewhere
// visually plausible instead of a purely arbitrary grid.
function extractPalette(url) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const w = 48, h = 48;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        const avg = (x0, y0, x1, y1) => {
          let r = 0, g = 0, b = 0, n = 0;
          for (let y = Math.floor(y0); y < y1; y++) {
            for (let x = Math.floor(x0); x < x1; x++) {
              const i = (y * w + x) * 4;
              r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
            }
          }
          return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [10, 10, 12];
        };
        resolve([
          { rgb: avg(0, 0, w * 0.5, h * 0.4), x: 15, y: 8 },
          { rgb: avg(w * 0.5, 0, w, h * 0.4), x: 85, y: 12 },
          { rgb: avg(w * 0.25, h * 0.35, w * 0.75, h * 0.65), x: 50, y: 42 },
          { rgb: avg(0, h * 0.6, w * 0.5, h), x: 22, y: 78 },
          { rgb: avg(w * 0.5, h * 0.6, w, h), x: 80, y: 85 },
        ]);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = url;
  });
}

function Ring({ pct, size = 28, accent = "#E8A24C" }) {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.22)" strokeWidth="2.5" fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={accent} strokeWidth="2.5" fill="none"
        strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

function GlassPill({ children, filled, onClick, round }) {
  return (
    <button onClick={onClick} style={{
      background: filled ? "rgba(255,255,255,0.95)" : t.cardFill, color: filled ? "#111" : "#fff",
      border: `1px solid ${filled ? "transparent" : t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
    }} className={`flex items-center justify-center gap-2 active:scale-95 transition ${round ? "w-11 h-11 rounded-full" : "px-5 py-2.5 rounded-full text-[14px] font-medium"}`}>
      {children}
    </button>
  );
}

// Shared by every Home row section (Continue Watching / In Progress) so
// the title text/padding/structure can never quietly drift between them
// again — margin-top is the one thing that legitimately varies per section
// (how much room the section above it needs), passed in via className
// rather than baked in here.
function SectionHeader({ title, onSeeAll, className }) {
  return (
    <div className={`px-6 flex items-center justify-between ${className || ""}`}>
      <div className="text-white text-[19.55px] font-semibold">{title}</div>
      {onSeeAll && <button className="text-[13px]" style={{ color: t.textDim }} onClick={onSeeAll}>See All</button>}
    </div>
  );
}

// ---------- Shared header for the See All views ----------
// paddingTop 67 (was pt-14/56px) — 20% more breathing room at the very
// top of these full-page views. `right` is an optional slot (e.g. the
// gallery/grid view toggle) rendered at the far right via justify-between.
function SeeAllHeader({ title, count, onBack, right }) {
  return (
    <div className="flex items-center justify-between gap-3 px-6 pb-1" style={{ paddingTop: 67 }}>
      <div className="flex items-center gap-3 min-w-0">
        <GlassCircle onClick={onBack} t={t}>
          <Icon name="back" size={16} color={t.text} />
        </GlassCircle>
        <div className="min-w-0">
          <div className="text-white text-[23px] font-semibold leading-tight">{title}</div>
          <div className="text-[12px]" style={{ color: t.textDim }}>{count} {count === 1 ? "show" : "shows"}</div>
        </div>
      </div>
      {right}
    </div>
  );
}

// Long-press quick-status wrapper for the In Progress gallery card — a
// plain onClick div can't call useLongPress itself (it's rendered inside
// a .map(), and hooks can't run inside a loop callback), so this is its
// own component instance per item instead, same reason PosterCard itself
// is a real component rather than an inline div.
// Structure match to a reference design, deliberately not modernized/
// simplified beyond it yet. Second pass, per explicit feedback on the
// first: the artwork is the hero (footer trimmed to ~1/4 of the card,
// title text sized down, poster+pills+checkmark all pulled smaller/
// closer together), and the artwork's own bottom gradient now fades hard
// enough into the footer's exact color that the seam between the two
// stacked sections reads as one continuous card instead of "image, then
// a separate black rectangle." Poster+pills now cluster together near
// the BOTTOM of the artwork (right above the footer) rather than pinned
// to the top with a large gap of bare artwork beneath them before the
// title — that bare-artwork space still exists, it's just above the
// cluster now instead of below it, so the artwork still reads as
// unobstructed hero image up top.
const PILL_STYLE = { height: 30, padding: "0 13px", borderRadius: 999, display: "flex", alignItems: "center", background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.10)", fontSize: 12, fontWeight: 600, color: "#fff", whiteSpace: "nowrap" };
const FOOTER_BG = "#131316";

function InProgressGalleryCard({ item, onLongPress }) {
  const router = useRouter();
  const longPress = useLongPress((rect) => onLongPress(item.show, rect));
  const epLabel = item.season != null && item.episode != null ? `S${String(item.season).padStart(2, "0")} · E${String(item.episode).padStart(2, "0")}` : null;
  // "+N" beyond the one already named above — episodesLeft itself counts
  // this episode too, so subtract 1.
  const moreLeft = item.episodesLeft != null ? item.episodesLeft - 1 : 0;
  return (
    <div
      onClick={() => { if (longPress.consumeClick()) return; router.push(`/show/${item.id}`); }}
      className="relative rounded-[22.8px] overflow-hidden active:scale-[0.98] transition cursor-pointer"
      style={{
        // Subtle layered-above-the-background frame — thin translucent
        // white border plus a soft drop shadow, so a dark-artwork card
        // doesn't visually merge into the page's own black background.
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 12px 28px rgba(0,0,0,0.4)",
        touchAction: "manipulation", WebkitTouchCallout: "none", WebkitTapHighlightColor: "transparent",
      }}
      {...longPress.handlers}
    >
      {/* ---- Artwork zone ---- */}
      {/* Back to the original 3:2 proportions (square read as too
          stretched-out), then progressively shorter (7%, then another
          10% on top of that) so the poster and the S01·E09 pill sit
          closer together — the crop/fit inside PosterArt itself
          (object-fit: cover, w780 source) is untouched, only this
          container's own height changes. */}
      <div className="relative" style={{ aspectRatio: "3 / 1.674" }}>
        <PosterArt posterPath={item.landscapeImage} base={item.show.base} glow={item.show.glow} alt={item.show.title} tmdbSize="w780" />
        {/* No bottom fade into the footer anymore — a clean, visible cut
            between the backdrop and the footer's flat grey is the
            intended look now, not a blended one. Pills/check button
            already carry their own translucent backgrounds, so they
            stay legible without a gradient underlay. */}

        {/* Poster — stays pinned near the TOP of the artwork, with a real
            margin off the edge (not flush against it). Pills below are
            now a separate cluster at the bottom, not tucked under this. */}
        <div className="absolute" style={{ left: 16, top: 16 }}>
          {/* relative — PosterArt's own root is position:absolute/inset:0,
              which needs THIS box specifically as its containing block
              (not some bigger ancestor) or the image renders at the
              wrong size, unclipped. */}
          <div className="relative rounded-2xl overflow-hidden" style={{ width: 68, height: 99, boxShadow: "0 10px 22px rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.2)" }}>
            <PosterArt posterPath={item.show.posterPath} base={item.show.base} glow={item.show.glow} alt="" />
          </div>
        </div>

        {/* Episode metadata pills — bottom-left, on the same row as the
            complete button (bottom:12 on both), not clustered under the
            poster anymore. */}
        <div className="absolute flex items-center gap-1.5" style={{ left: 16, bottom: 12 }}>
          {epLabel && <div style={PILL_STYLE}>{epLabel}</div>}
          {moreLeft > 0 && <div style={PILL_STYLE}>+{moreLeft}</div>}
        </div>

        {/* Complete button — the original small floating mark, brought
            back as-is rather than the bigger solid-white circle this
            redesign pass had tried. */}
        <div className="absolute flex items-center justify-center rounded-full" style={{ right: 12, bottom: 12, width: 36, height: 36, background: "rgba(255,255,255,0.10)" }}>
          <Icon name="check" size={16} color="rgba(255,255,255,0.85)" strokeWidth={2.6} />
        </div>
      </div>

      {/* ---- Title section — its own dark block below the artwork,
          trimmed to roughly a quarter of the card's total height (was
          reading as an oversized separate black rectangle). ---- */}
      <div style={{ background: FOOTER_BG, padding: "10.8px 16px 12.6px" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", lineHeight: 1.2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.show.title}</div>
        {item.episode != null && (
          <div style={{ marginTop: 4, fontSize: 10.1, fontWeight: 600, letterSpacing: "0.08em", color: "rgba(255,255,255,0.6)", textTransform: "uppercase" }}>Episode {item.episode}</div>
        )}
      </div>
    </div>
  );
}

// The Home row's own "gallery" card — a fixed-width, flex-shrink-0
// sibling of InProgressGalleryCard above for the horizontal-scroll In
// Progress row, not that component reused/resized. Deliberately drops
// the small poster-thumbnail overlay InProgressGalleryCard pins over its
// artwork: that overlay exists there to keep the show identifiable
// alongside a POSTER-mode row elsewhere on the same page, but here the
// row itself already commits fully to the backdrop-card look, so a
// second, smaller poster competing for attention on an already-compact
// card just reads as clutter — the show's own title in the footer below
// already identifies it.
function InProgressCompactCard({ item, onLongPress }) {
  const router = useRouter();
  const longPress = useLongPress((rect) => onLongPress(item.show, rect));
  const moreLeft = item.episodesLeft != null ? item.episodesLeft - 1 : 0;
  return (
    <div
      onClick={() => { if (longPress.consumeClick()) return; router.push(`/show/${item.id}`); }}
      className="relative flex-shrink-0 rounded-[16px] overflow-hidden active:scale-[0.98] transition cursor-pointer"
      style={{
        width: 220,
        // Taller than InProgressGalleryCard's own artwork-only ratio — no
        // separate footer block here (title/episode sit directly on the
        // image itself, gradient-scrimmed, below), so the card needs the
        // extra height to give that text room without crowding the mark.
        aspectRatio: "3 / 2.05",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 12px 28px rgba(0,0,0,0.4)",
        touchAction: "manipulation", WebkitTouchCallout: "none", WebkitTapHighlightColor: "transparent",
      }}
      {...longPress.handlers}
    >
      <PosterArt posterPath={item.landscapeImage} base={item.show.base} glow={item.show.glow} alt={item.show.title} tmdbSize="w780" />
      {/* Bottom scrim + title/episode directly on the artwork — matches
          PosterCard's own titlePlacement="overlay" convention, no
          separate solid-color footer block. Right padding clears the
          complete mark pinned in this same corner below. */}
      <div className="absolute left-0 right-0 bottom-0" style={{ padding: "26px 40px 9px 11px", background: "linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 55%, transparent 100%)" }}>
        <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "#fff", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{item.show.title}</div>
          {moreLeft > 0 && <div style={{ ...PILL_STYLE, height: 19, padding: "0 7px", fontSize: 9, flexShrink: 0 }}>+{moreLeft}</div>}
        </div>
        {item.episode != null && (
          <div style={{ marginTop: 3, fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", color: "rgba(255,255,255,0.7)", textTransform: "uppercase" }}>Episode {item.episode}</div>
        )}
      </div>
      {/* Complete mark — bottom-right corner, a solid dark backing (not
          the faint translucent-white fill used elsewhere) so the
          checkmark stays legible against whatever the artwork/scrim
          behind it happens to be. */}
      <div className="absolute flex items-center justify-center rounded-full" style={{ right: 9, bottom: 9, width: 28, height: 28, background: "rgba(0,0,0,0.65)" }}>
        <Icon name="check" size={13} color="#fff" strokeWidth={2.6} />
      </div>
      {item.progress != null && (
        <div className="absolute left-0 right-0 bottom-0" style={{ height: 3, background: "rgba(255,255,255,0.15)" }}>
          <div style={{ height: "100%", width: `${item.progress}%`, background: accent }} />
        </div>
      )}
    </div>
  );
}

// Same reasoning as InProgressGalleryCard above — its own component
// instance per item so it can call useLongPress itself. item.show has no
// `id` of its own (see upcomingEpisodes' mapping above), so onLongPress is
// handed a plain { id, title } built from the outer item instead of
// item.show directly.
function UpcomingRow({ item, onLongPress }) {
  const router = useRouter();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { getCustomPoster } = useShowCustomizations();
  const longPress = useLongPress((rect) => onLongPress({ id: item.id, title: item.show.title }, rect));
  const { primary, secondary } = getCountdown(item.airDate);
  const favorited = isFavorite(item.id);
  return (
    <div
      onClick={() => { if (longPress.consumeClick()) return; router.push(`/show/${item.id}`); }}
      className="flex items-center gap-3 p-3 rounded-2xl active:scale-[0.98] transition cursor-pointer"
      style={{ background: t.cardFill, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(16px)", touchAction: "manipulation", WebkitTouchCallout: "none", WebkitTapHighlightColor: "transparent" }}
      {...longPress.handlers}
    >
      <div className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
        <PosterArt posterPath={item.show.posterPath} overrideSrc={getCustomPoster(item.id)} base={item.show.base} glow={item.show.glow} alt={item.show.title} />
        {favorited && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleFavorite(item.id, "Home:upcomingRow"); }}
            className="absolute flex items-center justify-center active:scale-90 transition"
            style={{ top: 3, right: 3, width: 16, height: 16, borderRadius: "50%", background: "rgba(0,0,0,0.5)" }}
          >
            <Icon name="heart" size={9} color="#e0567a" />
          </button>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {/* SEASON, not EPISODE — epTitle right below already says
            "Episode N" itself whenever TMDB has no real episode name yet
            (common for an unaired one), which read as the exact same
            "Episode 5" text appearing twice in a row. */}
        <div className="text-[10px] font-semibold tracking-[0.14em]" style={{ color: t.textDim }}>{item.show.title.toUpperCase()} · SEASON {item.season}</div>
        <div className="text-white text-[15px] font-bold leading-tight mt-0.5 truncate">{item.epTitle}</div>
        <div className="text-[12px] mt-0.5" style={{ color: t.textDim }}>{formatFullDate(item.airDate)}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-white font-bold leading-none" style={{ fontSize: secondary ? 22 : 15 }}>{primary}</div>
        {secondary && <div className="text-[10px] font-medium tracking-[0.14em] mt-1" style={{ color: t.textDim }}>{secondary}</div>}
      </div>
    </div>
  );
}

// Movie parallel to UpcomingRow above — no season/episode line (a movie
// has neither), same countdown treatment against its own release date
// instead of an episode's air date. No long-press quick-status menu here
// (UpcomingRow's is TV-only, fed by Home's own `longPress` state) — just
// navigate + favorite, matching what's actually requested.
function UpcomingMovieRow({ item }) {
  const router = useRouter();
  const { isFavorite, toggleFavorite } = useMovieFavorites();
  const { primary, secondary } = getCountdown(item.releaseDate);
  const favorited = isFavorite(item.id);
  return (
    <div
      onClick={() => router.push(`/movie/${item.id}`)}
      className="flex items-center gap-3 p-3 rounded-2xl active:scale-[0.98] transition cursor-pointer"
      style={{ background: t.cardFill, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(16px)" }}
    >
      <div className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
        <PosterArt posterPath={item.posterPath} alt={item.title} />
        {favorited && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleFavorite(item.id, "Home:upcomingMovieRow"); }}
            className="absolute flex items-center justify-center active:scale-90 transition"
            style={{ top: 3, right: 3, width: 16, height: 16, borderRadius: "50%", background: "rgba(0,0,0,0.5)" }}
          >
            <Icon name="heart" size={9} color="#e0567a" />
          </button>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white text-[15px] font-bold leading-tight truncate">{item.title}</div>
        {item.releaseDate ? (
          <div className="text-[12px] mt-0.5" style={{ color: t.textDim }}>{formatFullDate(item.releaseDate)}</div>
        ) : (
          <div className="text-[12px] mt-0.5" style={{ color: t.textDim }}>{item.tmdbStatus || "Release date TBA"}</div>
        )}
      </div>
      {item.releaseDate && (
        <div className="text-right flex-shrink-0">
          <div className="text-white font-bold leading-none" style={{ fontSize: secondary ? 22 : 15 }}>{primary}</div>
          {secondary && <div className="text-[10px] font-medium tracking-[0.14em] mt-1" style={{ color: t.textDim }}>{secondary}</div>}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const router = useRouter();
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { getCustomPoster } = useShowCustomizations();
  const readableLanguages = useReadableLanguages();
  const [view, setView] = useState("home"); // "home" | "inProgress"
  // See All → In Progress's own display mode — "grid" (the existing
  // poster-with-progress-bar layout) or "gallery" (large landscape
  // episode-still banners). Defaults to "grid" so nothing changes for
  // anyone who doesn't tap the new toggle. Persisted (see
  // IN_PROGRESS_VIEW_MODE_KEY above) — hydrated via effect, not
  // useState's initializer, to avoid touching localStorage during SSR,
  // same pattern as Library's own view-mode toggle.
  const [inProgressViewMode, setInProgressViewModeState] = useState("grid");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(IN_PROGRESS_VIEW_MODE_KEY);
      if (saved) setInProgressViewModeState(saved);
    } catch (err) { console.error("Failed to read In Progress view mode:", err); }
  }, []);
  const setInProgressViewMode = (mode) => {
    setInProgressViewModeState(mode);
    try { localStorage.setItem(IN_PROGRESS_VIEW_MODE_KEY, mode); } catch (err) { console.error("Failed to save In Progress view mode:", err); }
  };
  const [menuOpen, setMenuOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Header avatar — real avatar_url when the user has set one (same
  // source Profile/Edit Profile read), gradient placeholder otherwise;
  // never a fake stand-in photo.
  const [avatarUrl, setAvatarUrl] = useState(null);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getProfile(user.id).then((p) => { if (!cancelled) setAvatarUrl(p?.avatarUrl ?? null); }).catch(console.error);
    return () => { cancelled = true; };
  }, [user]);

  // getCountdown/formatFullDate read the current Bangkok calendar date at
  // render time, so they're already correct on every render — this just
  // forces one periodically, so the Upcoming countdown rolls from
  // "Tomorrow" to "Today" (etc.) if the page is simply left open across a
  // Bangkok midnight, instead of only updating on the next navigation.
  const [, forceRerender] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceRerender((v) => v + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // hero: the "watching" show with the most recent episode-watch activity
  //   (null if no "watching" show has ever actually been watched).
  // inProgress: every other "watching" show, sorted the same way.
  // upcoming: any library show with a real future TMDB next_episode_to_air.
  const [hero, setHero] = useState(null);
  const [inProgress, setInProgress] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  // Movies in the user's library (any status — same status-agnostic
  // scoping as `upcoming` above) whose real-world release hasn't
  // happened yet. Already shaped for UpcomingMovieRow directly (title/
  // posterPath/releaseDate/tmdbStatus), no separate derivation step
  // needed the way upcomingEpisodes exists for TV.
  const [upcomingMovies, setUpcomingMovies] = useState([]);
  // Bumped after the hero card's Watch button marks an episode watched —
  // that write happens without navigating away, so nothing else would
  // otherwise prompt this page's cached hero/progress data (fetched once
  // on mount) to catch up; the episode it just pointed at would keep
  // showing as "next up" indefinitely.
  const [refreshToken, setRefreshToken] = useState(0);
  // Backing refs for the visibility-triggered background refresh below —
  // not state, since neither should itself cause a render (same pattern
  // Highlights' own page already uses for this exact problem).
  const lastFetchAtRef = useRef(0);
  const silentRefetchRef = useRef(false);

  useEffect(() => {
    if (!user) { setHero(null); setInProgress([]); setUpcoming([]); setLoaded(true); return; }
    let cancelled = false;
    const silent = silentRefetchRef.current;
    silentRefetchRef.current = false;
    if (!silent) setLoaded(false);
    lastFetchAtRef.current = Date.now();
    (async () => {
      // repairContradictoryStatuses is intentionally NOT called here.
      // lib/userShows.js's resolveShowStatus already makes every section
      // below display the *correct* status live, computed fresh from real
      // watch data on every load — the repair function used to additionally
      // rewrite the stored value to match, but that's a status write
      // triggered by opening this page, not by a user action, which must
      // never happen. If a stored record needs correcting, that has to be
      // wired to an explicit action (e.g. a "Fix my library" button)
      // instead of running automatically on navigation.
      const byShow = await getUserShows(user.id);
      const allIds = Object.keys(byShow).map(Number);
      if (allIds.length === 0) return { hero: null, inProgress: [], upcoming: [] };

      // Every non-paused/dropped show needs real progress data — status
      // must be resolved the same way everywhere (lib/statusResolver.js),
      // and that requires knowing released/watched episode counts, not
      // just the stored label. Paused/dropped are exempt: the resolver
      // returns those unconditionally regardless of progress.
      const resolvableIds = allIds.filter((id) => byShow[id].status !== "paused" && byShow[id].status !== "drop");

      // Viewing activity (source of truth for "most recently watched")
      // — also doubles as the "watched" episode keys fed into
      // /api/shows/library-detail's progress resolution below.
      const summary = await getShowWatchSummary(user.id, resolvableIds);

      const res = await fetch("/api/shows/library-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shows: allIds.map((id) => ({
            id,
            needsProgress: resolvableIds.includes(id),
            watched: summary[id]?.watchedKeys ?? [],
          })),
        }),
      });
      const { results } = await res.json();
      const byId = Object.fromEntries(results.map((r) => [r.id, r]));

      // The single resolved status every section below buckets by — same
      // function, same inputs, as Show Detail/Profile/Explore.
      const resolvedStatusOf = (id) => resolveShowStatus({
        explicitStatus: byShow[id].status,
        watchedReleasedEpisodes: byId[id]?.watchedReleasedEpisodes ?? 0,
        releasedEpisodes: byId[id]?.releasedEpisodes ?? 0,
      });

      const watchingIds = allIds.filter((id) => byId[id] && resolvedStatusOf(id) === "watching");

      // Hero: only a "watching" show with at least one watched episode is
      // eligible — a show that was merely added or marked watching must
      // never win, no matter how recently its status changed.
      const heroCandidates = watchingIds.filter((id) => summary[id]?.lastWatchedAt != null);
      const heroId = heroCandidates.length === 0 ? null : heroCandidates.reduce((best, id) =>
        summary[id].lastWatchedAt > summary[best].lastWatchedAt ? id : best
      );

      // Every "watching" show, hero included — the hero card is a
      // separate, additional highlight of whichever one was watched most
      // recently, not a replacement for it in this list. Previously
      // excluded the hero (`id !== heroId`), which is exactly why it
      // could go missing from here entirely: with only two shows in
      // progress, one always became hero and the row showed just the
      // other one, reading as if it had been dropped.
      const inProgressIds = watchingIds
        .sort((a, b) => (summary[b]?.lastWatchedAt ?? 0) - (summary[a]?.lastWatchedAt ?? 0));

      const heroResult = heroId != null ? byId[heroId] : null;
      const inProgressResults = inProgressIds.map((id) => byId[id]).filter(Boolean);
      const upcomingResults = allIds
        // A show marked Completed must stay off this row even when TMDB
        // reports a future episode for it (a newly announced/renewed
        // season) — this filter was missing entirely, which is exactly
        // why a finished show could resurface here on its own once TMDB's
        // own data changed, despite the user never touching its status.
        .filter((id) => resolvedStatusOf(id) !== "completed")
        .map((id) => byId[id])
        .filter((r) => r && r.nextEpisodeToAir && !NOT_AIRING_STATUSES.has(r.tmdbStatus))
        // Plain string comparison, not Date subtraction — air_date is
        // always zero-padded ISO "YYYY-MM-DD", so lexicographic order is
        // already chronological order, with no timezone parsing involved.
        .sort((a, b) => a.nextEpisodeToAir.airDate.localeCompare(b.nextEpisodeToAir.airDate));

      return { hero: heroResult, inProgress: inProgressResults, upcoming: upcomingResults };
    })()
      .then((data) => {
        if (cancelled) return;
        setHero(data.hero);
        setInProgress(data.inProgress);
        setUpcoming(data.upcoming);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) { setHero(null); setInProgress([]); setUpcoming([]); }
      })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [user, refreshToken]);

  // Upcoming Movies — a separate effect, deliberately not folded into the
  // hero/inProgress/upcoming Promise chain above: that one is scoped to
  // TV progress-resolution movies don't have at all, and coupling them
  // would mean a TV-fetch failure could silently blank the movies row
  // too. Any library status (matches the TV Upcoming section's own
  // status-agnostic scoping) whose real-world release hasn't happened
  // yet — a future releaseDate, or no releaseDate at all with a TMDB
  // status that isn't Released/Canceled (a Planned/In Production/Post
  // Production movie with no confirmed date yet is still "upcoming").
  useEffect(() => {
    if (!user) { setUpcomingMovies([]); return; }
    let cancelled = false;
    getUserMovies(user.id).then((byMovie) => {
      const ids = Object.keys(byMovie);
      if (ids.length === 0) return { results: [] };
      return fetch(`/api/movies/batch?ids=${ids.join(",")}`).then((r) => r.json());
    }).then((data) => {
      if (cancelled || !data) return;
      const today = bangkokTodayParts();
      const upcomingList = (data.results ?? [])
        .filter((r) => r.releaseDate
          ? calendarDayDiff(today, parseAirDateParts(r.releaseDate)) >= 0
          : !["Released", "Canceled"].includes(r.tmdbStatus))
        .sort((a, b) => (a.releaseDate ?? "9999-99-99").localeCompare(b.releaseDate ?? "9999-99-99"));
      setUpcomingMovies(upcomingList);
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [user]);

  // Re-fetches when this tab/app becomes visible again — the effect above
  // only runs on mount (or when refreshToken is bumped by the hero card's
  // own inline watch action), so progress made elsewhere (Show Detail, a
  // different tab, the app backgrounded then resumed) while Home stayed
  // mounted in the background used to keep showing whatever it fetched
  // before that happened — a finished show could sit frozen on "Ep 1"
  // indefinitely. 20s (not Highlights' 60s) since Home's hero/progress
  // data changes on a much more real-time basis than Highlights' monthly
  // aggregates. silentRefetchRef skips resetting loaded/hero/inProgress to
  // their empty state first, so the screen doesn't blank into skeletons
  // while fresh data loads behind it — it just swaps in once ready.
  const STALE_AFTER_MS = 20_000;
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchAtRef.current < STALE_AFTER_MS) return;
      silentRefetchRef.current = true;
      setRefreshToken((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  // Separate from the visibility listener above, and for a different
  // reason: visibilitychange/focus only fire on an actual tab switch or
  // app backgrounding — plain in-app back-navigation (tapping back from
  // Show Detail, or a phone's native swipe-back gesture) never fires
  // either of those, the document stays "visible" the whole time. On
  // mobile browsers in particular, that kind of back-navigation is
  // exactly when the browser's own bfcache (back/forward cache) — a
  // mechanism entirely separate from and invisible to Next.js's client
  // Router Cache, not something next.config.mjs can touch — can restore
  // this whole page (JS state included) from a frozen snapshot without
  // re-running any code at all, meaning the mount effect above never
  // fires a second time. `pageshow`'s `persisted` flag is the standard,
  // documented way to detect exactly that and force a real refetch. No
  // staleness threshold here (unlike the visibility listener) — a
  // bfcache restore means nothing re-ran at all, regardless of how
  // little time has passed, so it always needs a fresh fetch.
  useEffect(() => {
    const onPageShow = (event) => {
      if (!event.persisted) return;
      silentRefetchRef.current = true;
      setRefreshToken((n) => n + 1);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const heroShow = hero ? {
    showId: hero.id,
    season: hero.season,
    episode: hero.episode,
    title: resolveTitle(hero, readableLanguages),
    // Episode still first, falling back to show backdrop, then poster,
    // then PosterArt's own decorative default if all three are null.
    // No user-facing toggle — just a fallback chain.
    posterPath: hero.epPosterPath || hero.backdropPath || hero.posterPath,
    accent,
    episodeLabel: hero.season != null && hero.episode != null
      ? `S${hero.season} E${hero.episode}${hero.epTitle ? ` · ${hero.epTitle}` : ""}`
      : "",
    progressPct: hero.progressPct,
    episodesLeft: hero.episodesLeft,
    // Feeds EpisodeRatingFlow's subject when the Watch button marks this
    // episode watched + opens rating in place (see markHeroWatchedAndRate
    // below) — runtimeMin for the "Watched · Xm" badge, episodeAirDate for
    // the Watch Date sheet's Release date/Release month options.
    epTitle: hero.epTitle,
    runtimeMin: hero.epRuntime,
    episodeAirDate: hero.epAirDate,
    // Guards markHeroWatchedAndRate below — see its own comment.
    caughtUp: hero.caughtUp,
  } : null;

  // Neutral near-black until (or unless) extraction resolves, matching
  // the fixed tone the overlay used before this was per-image.
  const [heroEdgeRGB, setHeroEdgeRGB] = useState([10, 10, 12]);
  useEffect(() => {
    if (!heroShow?.posterPath) return;
    let cancelled = false;
    extractEdgeColor(tmdbImage(heroShow.posterPath, "w200"))
      .then((rgb) => { if (!cancelled) setHeroEdgeRGB(rgb); })
      .catch(() => { if (!cancelled) setHeroEdgeRGB([10, 10, 12]); });
    return () => { cancelled = true; };
  }, [heroShow?.posterPath]);
  // A near-black, but still color-tinted, version for the header scrim —
  // "very dark version of the backdrop's dominant color, mixed with
  // near-black" rather than flat #0A0A0C, so the header reads as the top
  // of the same image deepening into shadow instead of a separate black
  // layer dropped on top of it.
  const heroEdgeDark = heroEdgeRGB.map((c) => Math.round(c * 0.22));

  // Page-wide atmosphere — 3-5 large, very-low-opacity radial gradients
  // sampled from this same backdrop (extractPalette above), sitting
  // behind the ENTIRE page (hero + In Progress + Upcoming), not just the
  // hero. The intent is diffusion, not blur: the whole page should feel
  // like it belongs to this show without anyone consciously noticing a
  // colored background. Empty until the async extraction resolves — the
  // atmosphere layer below just renders nothing (falls back to plain
  // black) until then, not a placeholder color.
  const [heroPalette, setHeroPalette] = useState([]);
  useEffect(() => {
    if (!heroShow?.posterPath) { setHeroPalette([]); return; }
    let cancelled = false;
    extractPalette(tmdbImage(heroShow.posterPath, "w300"))
      .then((palette) => { if (!cancelled) setHeroPalette(palette); })
      .catch(() => { if (!cancelled) setHeroPalette([]); });
    return () => { cancelled = true; };
  }, [heroShow?.posterPath]);

  const inProgressList = inProgress.map((s) => ({
    id: s.id,
    // id included here too (not just on the outer object above) — PosterCard
    // reads show.id to look up a custom poster pick from the shared
    // show-customizations context.
    show: { id: s.id, title: resolveTitle(s, readableLanguages), posterPath: s.posterPath, glow: accent },
    code: s.season != null && s.episode != null ? `S${s.season} E${s.episode}` : "",
    ep: s.epTitle,
    progress: s.progressPct,
    // Gallery view only (See All → In Progress) — a real landscape image
    // (episode still, falling back the same way heroShow does) for the
    // big banner card, plus the raw episode number for its "Episode N"
    // label, since `ep` above is the episode's own TMDB title text, not
    // that.
    landscapeImage: s.epPosterPath || s.backdropPath || s.posterPath,
    season: s.season,
    episode: s.episode,
    // episodesLeft counts every unwatched aired episode INCLUDING this
    // "next up" one itself — the gallery card's "+N" pill means "how many
    // MORE beyond the one already shown", so that's episodesLeft - 1.
    episodesLeft: s.episodesLeft,
  }));

  const upcomingEpisodes = upcoming.map((s) => ({
    id: s.id,
    show: { title: resolveTitle(s, readableLanguages), posterPath: s.posterPath, glow: accent },
    season: s.nextEpisodeToAir.season,
    episode: s.nextEpisodeToAir.episode,
    epTitle: s.nextEpisodeToAir.title || `Episode ${s.nextEpisodeToAir.episode}`,
    // Kept as the raw "YYYY-MM-DD" string, not a Date object — getCountdown/
    // formatFullDate parse it directly as a Bangkok calendar date instead
    // of going through `new Date(...)`'s UTC-midnight interpretation.
    airDate: s.nextEpisodeToAir.airDate,
  }));

  const goToHeroEpisode = () => {
    setMenuOpen(false);
    if (!heroShow?.showId || !heroShow.season || !heroShow.episode) return;
    router.push(`/show/${heroShow.showId}/episode/${heroShow.season}/${heroShow.episode}`);
  };

  // The hero card's Watch button — marks this exact episode watched right
  // away and opens the rating flow in place, rather than navigating to the
  // episode detail page and requiring a second tap there. Fire-and-forget
  // on the write (not awaited before opening the flow), matching
  // ShowDetailClient's own toggleEp/EpisodeDetailClient's markWatched —
  // EpisodeRatingFlow already retries its own row lookup a few times to
  // cover exactly this race.
  const [heroRatingOpen, setHeroRatingOpen] = useState(false);
  const markHeroWatchedAndRate = () => {
    if (!user) { router.push("/login"); return; }
    setMenuOpen(false);
    if (!heroShow?.showId || heroShow.season == null || heroShow.episode == null) return;
    // Safety net, not the primary fix — a caught-up show should never
    // reach the hero card at all (resolveShowStatus resolves it to
    // "completed", which excludes it from the watching/hero pool), so
    // this should be unreachable in normal operation. But this is exactly
    // the call that turned one real bug (Home showing stale progress data
    // after the Next.js client Router Cache served a cached instance
    // instead of refetching) into a second, worse one: silently inserting
    // a real watch row for an episode that was already fully watched,
    // logged as a genuine rewatch. addEpisodeWatches has no way to know
    // "this episode's already watched" — it just inserts — so the guard
    // has to live here, at the one call site that assumes heroShow always
    // points at a genuine next-unwatched episode.
    if (heroShow.caughtUp) { setHeroRatingOpen(true); return; }
    addEpisodeWatches(user.id, heroShow.showId, [{ seasonNumber: heroShow.season, episodeNumber: heroShow.episode }]).catch(console.error);
    setHeroRatingOpen(true);
  };

  const goToHeroShow = () => {
    setMenuOpen(false);
    if (!heroShow?.showId) return;
    router.push(`/show/${heroShow.showId}`);
  };

  // Cast for the hero's own "Who was your favorite?" voting UI — this
  // flow rates an episode without ever loading the rest of the show (no
  // reason to, normally), so unlike Show Detail/Episode Detail there's no
  // cast array already sitting in state to hand EpisodeRatingFlow. Only
  // fetched once the rating sheet actually opens, not on every hero
  // render.
  const [heroCast, setHeroCast] = useState([]);
  // Long-press "change status" quick menu — any poster on this page can
  // set this, opening the same PosterQuickStatusMenu popup regardless of
  // which section the press happened in. `rect` is the pressed
  // element's own getBoundingClientRect() at press time, so the popup can
  // anchor to it as a compact dropdown instead of a bottom sheet.
  const [longPress, setLongPress] = useState(null);
  const handleLongPress = (show, rect) => setLongPress({ show, rect });
  useEffect(() => {
    if (!heroRatingOpen || !heroShow?.showId) return;
    let cancelled = false;
    fetch(`/api/shows/${heroShow.showId}/cast`)
      .then((res) => res.json())
      .then(({ cast }) => { if (!cancelled) setHeroCast(cast ?? []); })
      .catch(() => { if (!cancelled) setHeroCast([]); });
    return () => { cancelled = true; };
  }, [heroRatingOpen, heroShow?.showId]);

  return (
    <>
      {view === "inProgress" && (
        <>
          <SeeAllHeader
            title="In Progress"
            count={inProgressList.length}
            onBack={() => setView("home")}
            right={
              // gallery/grid toggle — "list" reads as the gallery's
              // stacked full-width rows, "gridToggle" (2x2 squares) as
              // the existing multi-column poster grid.
              <div className="flex items-center rounded-full flex-shrink-0" style={{ padding: 3, background: "rgba(255,255,255,0.06)", border: `1px solid ${t.cardBorder}` }}>
                {/* Poster/grid view first (left), gallery second. */}
                <button onClick={() => setInProgressViewMode("grid")} className="flex items-center justify-center rounded-full transition" style={{ width: 34, height: 34, background: inProgressViewMode === "grid" ? "#fff" : "transparent" }}>
                  <Icon name="gridToggle" size={15} color={inProgressViewMode === "grid" ? "#111" : "rgba(255,255,255,0.6)"} />
                </button>
                <button onClick={() => setInProgressViewMode("gallery")} className="flex items-center justify-center rounded-full transition" style={{ width: 34, height: 34, background: inProgressViewMode === "gallery" ? "#fff" : "transparent" }}>
                  <Icon name="list" size={15} color={inProgressViewMode === "gallery" ? "#111" : "rgba(255,255,255,0.6)"} />
                </button>
              </div>
            }
          />
          {inProgressViewMode === "grid" ? (
            // fixed + width="100%" — cards grow evenly to fill each row
            // (auto-fit/1fr), min-width pinned near Home's own In Progress
            // row card size so they don't shrink smaller than that, just
            // wrapped into a grid instead of a horizontal scroll, so this
            // reads as an expanded version of that row, not a separate
            // larger gallery.
            <PosterGrid fixed minCardWidth={128} gap={16} className="mt-4 px-6">
              {inProgressList.map((item) => (
                <PosterCard
                  key={item.id}
                  show={item.show}
                  href={`/show/${item.id}`}
                  width="100%"
                  titlePlacement="overlay"
                  subtitle={`${item.code} · ${item.ep}`}
                  progress={item.progress}
                  favorite={isFavorite(item.id)}
                  onToggleFavorite={() => toggleFavorite(item.id, "Home:seeAllInProgress")}
                  onLongPress={handleLongPress}
                />
              ))}
            </PosterGrid>
          ) : (
            // Gallery — a large landscape episode-still banner per show,
            // artwork zone + its own separate dark title block below (see
            // InProgressGalleryCard). gap-6 (was gap-4) for more
            // separation between cards, per the reference layout's more
            // generous spacing throughout.
            <div className="px-6 flex flex-col gap-6" style={{ marginTop: 16 }}>
              {inProgressList.map((item) => (
                <InProgressGalleryCard key={item.id} item={item} onLongPress={handleLongPress} />
              ))}
            </div>
          )}
        </>
      )}

      {view === "home" && (
        <div className="relative" style={{ isolation: "isolate", background: "#000" }}>
          {/* Page-wide subtle noise — separate from the atmosphere's own
              Grain below (which is scoped to that box's own height and
              disappears with it) so the page keeps a faint texture all the
              way down, instead of the near-black background reading as a
              perfectly flat, dead color once the atmosphere itself has
              faded out. */}
          <div className="absolute inset-0" style={{ zIndex: 0, pointerEvents: "none" }}>
            <Grain />
          </div>
          {/* Page-wide atmosphere — sits behind the hero AND everything
              after it (In Progress, Upcoming). 3-5 large (700-1000px),
              very-low-opacity (4-10%) radial gradients sampled from this
              exact episode's own backdrop (heroPalette above), plus a
              plain neutral fade from near-black down to pure black, plus a
              subtle noise layer (Grain) for depth.
              zIndex:0, explicitly — a positioned element (position:
              absolute, like this one) always paints ABOVE plain, non-
              positioned flow content in the same stacking context
              regardless of DOM order, which is exactly what was making
              this block/dim the page: "In Progress"/"Upcoming" below are
              ordinary flow divs with no position of their own, so being
              first in the DOM wasn't enough to keep this behind them. The
              isolation:isolate + background:#000 on the wrapper above
              creates one local stacking context for this whole view, and
              giving the actual content its own explicit zIndex:1 (below)
              is what guarantees it always renders on top of this,
              regardless of any individual section's own positioning. */}
          {heroPalette.length > 0 && (
            <div
              className="absolute top-0 left-0 right-0"
              style={{
                // Reduced another 30% from 280.
                height: 196,
                zIndex: 0,
                pointerEvents: "none",
                userSelect: "none",
                // Slightly flattens the whole layer (color + base fade) —
                // deliberately brightness/contrast only, no added blur or
                // saturation, since the goal here is depth, not stronger
                // colour.
                filter: "brightness(0.92) contrast(0.94)",
                // Vignette — fades this entire layer toward transparent at
                // its own corners/edges (mostly the left/right sides and
                // bottom corners; the center column stays intact so the
                // base fade below can still do its job of reaching real
                // darkness before the hand-off). This is what stops it
                // reading as a coloured rectangle with a visible boundary
                // — the box itself now has no hard edge, just a soft area
                // that dissolves into the page's own near-black background.
                WebkitMaskImage: "radial-gradient(ellipse 92% 140% at 50% 30%, black 0%, black 58%, transparent 100%)",
                maskImage: "radial-gradient(ellipse 92% 140% at 50% 30%, black 0%, black 58%, transparent 100%)",
                background: [
                  ...heroPalette.map(({ rgb, x, y }, i) => {
                    const radius = [700, 620, 780, 580, 640][i] ?? 650;
                    // Roughly 35-40% less opaque than before — this was
                    // the main source of the "coloured rectangle" feel;
                    // the atmosphere should read as ambient light, not a
                    // visible tinted patch.
                    const opacity = [0.06, 0.05, 0.045, 0.03, 0.025][i] ?? 0.03;
                    return `radial-gradient(circle ${radius}px at ${x}% ${y}%, rgba(${rgb.join(",")},${opacity}), transparent 70%)`;
                  }),
                  // Base fade — tinted with this episode's own sampled
                  // color (heroEdgeDark), gradual across the whole 480px
                  // span, reaching solid black by the end so there's no
                  // seam against the page's own #000 once the vignette
                  // mask above has faded it out anyway.
                  `linear-gradient(180deg, rgba(${heroEdgeDark.join(",")},0.6) 0%, rgba(${heroEdgeDark.join(",")},0.75) 25%, rgba(${heroEdgeDark.join(",")},0.92) 50%, rgba(${heroEdgeDark.join(",")},0.99) 75%, #000 100%)`,
                ].join(", "),
              }}
            >
              <Grain />
            </div>
          )}

          {/* Everything real (hero, In Progress, Upcoming) lives in this
              explicitly-positioned, explicitly-z-indexed wrapper — this is
              what actually guarantees it always paints above the
              atmosphere above, rather than depending on each individual
              section happening to also be positioned. */}
          <div className="relative" style={{ zIndex: 1 }}>
          {!heroShow && (
            // Flat separate strip only for the no-continue-watching case —
            // there's no backdrop image underneath for it to blend with
            // there, so this stays exactly what it was before.
            // Same *1.2 treatment as the hero header below — this is the
            // OTHER copy of the CINEXT/avatar row (no-continue-watching
            // state), missed in the earlier pass, so it was still sitting
            // right at the safe-area edge with only a flat 12px buffer.
            <div className="flex items-center justify-between px-6" style={{ paddingTop: "calc(env(safe-area-inset-top) * 1.44 + 12px)", paddingBottom: 12, background: "#000" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- static wordmark asset, not a TMDB path */}
              <img src="/text/logo.png?v=2" alt="Cinext" style={{ width: "clamp(110px, 20.9vw, 147px)", height: "auto" }} />
              <button onClick={() => router.push("/profile")} className="rounded-full overflow-hidden flex-shrink-0 active:scale-95 transition" style={{ width: 34, height: 34, background: "linear-gradient(135deg,#e8a24c,#5a3420)" }}>
                {avatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- Storage URL, not a TMDB path
                  <img src={avatarUrl} alt="" className="w-full h-full" style={{ objectFit: "cover" }} />
                )}
              </button>
            </div>
          )}

          {heroShow ? (
            <>
              {/* Full-bleed cinematic backdrop, starting at the very top
                  of the screen (the logo/avatar row is now an overlay on
                  this same image, not a separate flat strip above it) and
                  ending only where In Progress begins — no side margins,
                  no border radius, no shadow, nothing that reads as a
                  card. A single object-fit: cover image, centered,
                  enlarging as needed to fill the box completely — no
                  letterboxing, a small amount of edge cropping is
                  expected and fine. The "Continue Watching" label,
                  title, episode line, and actions are all in normal
                  flow (not absolutely positioned) so this container's
                  actual height — and therefore the backdrop behind it —
                  always extends exactly to the bottom of the eps-left
                  row, however tall the content renders. */}
              <div
                className="relative overflow-hidden"
                style={{
                  "--header-height": "clamp(72px, 16vw, 96px)",
                  // Shortened ~80px (460→400 / 46→26) — this trims the
                  // wrapper's own visible height only. The background
                  // stack below stays at its own fixed 506px (unchanged),
                  // so the sharp/background image layers' percentage-based
                  // positioning is untouched (same crop, same vertical
                  // placement) — the extra ~80px of stack simply gets
                  // clipped off by this wrapper's own overflow:hidden,
                  // and that clipped region was already deep into the
                  // bottom fade's near-black stops anyway, so nothing
                  // visible is lost, just shortened. minHeight is kept at
                  // 400 (not lower) since that's this hero's own real
                  // content-driven height (title/buttons) — going below it
                  // would start clipping real content, not just tail space.
                  minHeight: 400,
                  background: "transparent",
                  // Reduced 42→36 (~15%) — previous small nudges to
                  // In Progress's own paddingTop weren't closing the gap
                  // visibly; this is the bigger lever (the wrapper's own
                  // tail space before the -24 overlap), reduced this time
                  // instead of nudging the smaller value again.
                  paddingBottom: 36,
                  marginBottom: -24,
                }}
              >
                {/* Hero background stack — ordered bottom to top. Absolutely
                    positioned as ONE unit (not normal flow) so it overlays
                    behind the header/content below exactly as before,
                    rather than pushing them down the page. overflow:hidden
                    here is what actually contains the glow layer's
                    oversized inset (-20%, well past this box's own bounds)
                    — that negative inset is the real fix: it gives
                    blur(60px) genuine room to feather out before anything
                    clips it. Height matches the wrapper's own floor
                    (400 + 40 padding = 440) so nothing gets clipped short.
                    No opaque base-fill layer — the sharp image's own mask
                    fades all the way to transparent at the bottom (see
                    below), and an opaque black rectangle underneath it
                    would defeat that, hiding the atmosphere layer behind
                    everything instead of letting it show through. */}
                {/* Stretched 506→580 — the hero content's own paddingTop
                    grew to 340 earlier this turn (to sit lower on
                    screen), which pushed the real content (title/button
                    row) taller than this stack, leaving the backdrop
                    ending noticeably above the Watch button instead of
                    reaching it. The foreground image layer below uses a
                    percentage `top` (not a fixed px position), so making
                    this box taller repositions it further down inside
                    the same taller box automatically — its own width/
                    aspect-ratio (i.e. its zoom/crop) is untouched, only
                    where it sits shifts. */}
                <div className="absolute top-0 left-0 right-0 overflow-hidden" style={{ height: 580, zIndex: 0 }}>
                  {heroShow.posterPath && (
                    <>
                      {/* Background layer — the same image, oversized
                          (inset:-8% / scale(1.06), room for the blur to
                          feather without a hard edge) and blurred, filling
                          the entire hero box. Less aggressively blurred
                          than before (22px, not 60px) and darkened mostly
                          via brightness/saturate in the filter rather than
                          a separate opacity knock-down — enough that it
                          still reads as atmosphere, not a second
                          recognizable copy of the scene, while carrying
                          more real detail into the newly-enlarged top area
                          than a heavier blur would. */}
                      <div
                        className="absolute"
                        style={{
                          inset: "-8%",
                          backgroundImage: `url(${tmdbImage(heroShow.posterPath, "w1280")})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center 28%",
                          backgroundRepeat: "no-repeat",
                          // Blur eased back ~10% (20→18px) at the top,
                          // per explicit request — same soft atmospheric
                          // band behind the logo/avatar, just a touch less
                          // foggy.
                          filter: "blur(18px) brightness(0.45) saturate(1.08)",
                          transform: "scale(1.06)",
                        }}
                      />
                      {/* Foreground layer — enlarged to 116% (from 112%)
                          and shifted up (top:45%, not 50%) so more real
                          image detail reaches into the upper part of the
                          hero instead of centering on empty headroom.
                          Mask now eases in a touch more gradually at the
                          very top (an extra 35%-opacity step at 7% before
                          reaching full at 18%) so the hand-off from the
                          background layer above it is softer. */}
                      <div
                        className="absolute"
                        style={{
                          // Shifted back down, from 37% to 48% — 37% left
                          // too much black void between the image's own
                          // bottom edge and the Watch button row. Since
                          // this box's height is fixed (locked to its
                          // width via aspectRatio), shifting the center
                          // down moves both edges down together: more
                          // blur-only space above the image, and the
                          // image's own bottom edge now reaches down
                          // toward/under the button row instead of ending
                          // well above it.
                          top: "48%",
                          left: "50%",
                          width: "148%",
                          aspectRatio: "16 / 9",
                          transform: "translate(-50%, -50%)",
                          backgroundImage: `url(${tmdbImage(heroShow.posterPath, "w1280")})`,
                          backgroundSize: "100% auto",
                          backgroundPosition: "center",
                          backgroundRepeat: "no-repeat",
                          WebkitMaskImage: "linear-gradient(180deg, transparent 0%, black 14%, black 82%, transparent 100%)",
                          maskImage: "linear-gradient(180deg, transparent 0%, black 14%, black 82%, transparent 100%)",
                        }}
                      />
                    </>
                  )}
                  {!heroShow.posterPath && <PosterArt posterPath={null} glow={heroShow.accent} alt={heroShow.title} />}
                  <Grain />
                </div>
                {/* Hero bottom fade — a SIBLING of the 580px background
                    stack above (not a child of it), positioned with
                    inset:0 against the OUTER wrapper instead, whose own
                    height is real/content-driven (title + episode label +
                    button row + paddingBottom:36 tail), not a guessed
                    fraction of that fixed 580px box — see the wrapper's
                    own comment above for why the inner box is
                    deliberately taller and gets clipped to this real
                    height by overflow:hidden. Stays essentially untouched
                    (flat transparent) all the way to 75% — i.e. the image
                    stays genuinely VISIBLE behind the title/Watch
                    button/•••/eps-left row, not already-darkened by the
                    time it reaches them — and only ramps to solid black
                    in the last stretch (75%→100%), which is real-height
                    math for "starts right at that row's own bottom edge,
                    finishes by the wrapper's own end" rather than a
                    fraction of the oversized inner box. No image
                    cropping/resizing involved, only this overlay's own
                    stops — holds regardless of viewport/PWA chrome. */}
                <div
                  className="absolute inset-0"
                  style={{
                    zIndex: 0,
                    pointerEvents: "none",
                    background: `linear-gradient(180deg, transparent 0%, transparent 75%, rgba(0,0,0,0.4) 88%, rgba(0,0,0,0.85) 96%, #000 100%)`,
                  }}
                />
                {/* Soft side vignette (left, where the text sits, darker
                    than the center/right image). */}
                <div className="absolute inset-0" style={{ zIndex: 1, pointerEvents: "none", background: "linear-gradient(90deg, rgba(0,0,0,0.4) 0%, transparent 55%, rgba(0,0,0,0.08) 100%)" }} />

                {/* Top darken scrim — a separate layer on top of the
                    already-blurred backdrop, not an adjustment to the
                    blur/brightness filter on the image layers themselves
                    (those stay as-is). Sits above the background stack and
                    the side vignette (zIndex:3) but below the header
                    (zIndex:10), so the logo/avatar stay fully legible while
                    everything behind them gets this extra pass of
                    darkening. Capped to a fixed 240px, not the whole hero —
                    strongest right behind the logo, fading out well before
                    the bottom so it doesn't read as a flat dark band or
                    encroach on the character art lower in the image.
                    Opacity eased back ~10% (0.68->0.61, 0.42->0.38,
                    0.16->0.14) per explicit request — same shape, just a
                    touch lighter behind the logo/avatar. */}
                <div
                  className="absolute top-0 left-0 right-0"
                  style={{
                    height: 240,
                    zIndex: 3,
                    pointerEvents: "none",
                    background: "linear-gradient(180deg, rgba(0,0,0,0.61) 0%, rgba(0,0,0,0.38) 45%, rgba(0,0,0,0.14) 75%, transparent 100%)",
                  }}
                />

                {/* Header — logo/avatar, transparent background so the
                    dark overlay/atmosphere underneath does all the
                    darkening. */}
                {/* paddingTop *1.2 (not the bare safe-area inset) — in
                    standalone PWA mode there's no Safari toolbar chrome
                    visually separating the status bar from the page, so
                    the header reads as sitting right against it; Safari
                    itself has that chrome as an illusion of extra space.
                    20% more breathing room here closes that gap in both
                    modes without needing to detect which one is active. */}
                {/* z-20, not z-10 — the "Continue Watching" content block
                    right below (its own z-10, paddingTop:340 pushing its
                    visible text down but its actual box starting at y:0)
                    is a LATER sibling at the same z-index, which wins the
                    stacking tie and sat on top of this header the whole
                    time. Invisible there (transparent padding), but its
                    box still swallowed every click meant for the
                    logo/avatar — the avatar's onClick never actually
                    fired. Higher z-index here settles the stacking order
                    unambiguously instead of depending on DOM order. */}
                <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6" style={{ height: "var(--header-height)", background: "transparent", paddingTop: "calc(env(safe-area-inset-top) * 1.44)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- static wordmark asset, not a TMDB path */}
                  <img src="/text/logo.png?v=2" alt="Cinext" style={{ width: "clamp(110px, 20.9vw, 147px)", height: "auto" }} />
                  <button onClick={() => router.push("/profile")} className="rounded-full overflow-hidden flex-shrink-0 active:scale-95 transition" style={{ width: 34, height: 34, background: "linear-gradient(135deg,#e8a24c,#5a3420)" }}>
                    {avatarUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- Storage URL, not a TMDB path
                      <img src={avatarUrl} alt="" className="w-full h-full" style={{ objectFit: "cover" }} />
                    )}
                  </button>
                </div>

                {/* paddingTop is the amount of pure backdrop reveal
                    above the "Continue Watching" label. Reverted back to
                    340 — the +10% (374) from last round is undone. */}
                <div className="relative z-10 px-6" style={{ paddingTop: 340, paddingBottom: 14 }}>
                      {/* Was a separate "Continue Watching" section
                          header sitting in the black nav area above the
                          image; now an overlay label on the artwork
                          itself, upper-left, directly above the title —
                          part of the artwork composition instead of a
                          separate section. */}
                      <div className="text-[13px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: accent, textShadow: "0 1px 8px rgba(0,0,0,0.6)" }}>Continue Watching</div>
                      <div className="text-white font-bold tracking-[0.1em]" style={{
                        fontSize: "clamp(1.78rem, 7.15vw, 2.83rem)", lineHeight: 1.08,
                        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                        overflow: "hidden", overflowWrap: "break-word", maxWidth: "100%",
                        // Legibility against a bright/busy backdrop
                        // (e.g. the light-blue shirt directly behind this
                        // title in some episodes) — a soft shadow, not a
                        // solid outline, so it stays subtle on darker
                        // frames too.
                        textShadow: "0 2px 14px rgba(0,0,0,0.65), 0 1px 3px rgba(0,0,0,0.5)",
                      }}>{heroShow.title}</div>
                      <div className="text-[13px] mt-1.5 mb-4" style={{ color: "rgba(255,255,255,0.72)" }}>{heroShow.episodeLabel}</div>

                      <div className="flex items-center gap-2.5 mb-3.5">
                        <GlassPill filled onClick={markHeroWatchedAndRate}><Icon name="play" size={13} color="#111" /> Watch</GlassPill>
                        <div className="relative">
                          <GlassPill round onClick={() => setMenuOpen((v) => !v)}><Icon name="more" size={17} /></GlassPill>

                          {menuOpen && (
                            <>
                              {/* click-outside catcher, scoped to the hero so it doesn't intercept the rest of the page */}
                              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                              <div className="absolute z-50 rounded-2xl overflow-hidden" style={{
                                bottom: 56, left: 0, width: 210,
                                background: "rgba(26,24,22,0.97)", border: `1px solid ${t.glassBorder}`,
                                backdropFilter: "blur(24px)", boxShadow: "0 24px 60px rgba(0,0,0,0.55)"
                              }}>
                                <button className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-white/5 transition"
                                  onClick={goToHeroEpisode}>
                                  <Icon name="info" size={17} />
                                  <span className="text-white text-[14px] font-medium">Episode Details</span>
                                </button>
                                <div style={{ height: 1, background: t.glassBorder }} />
                                <button className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-white/5 transition"
                                  onClick={goToHeroShow}>
                                  <Icon name="tv" size={17} />
                                  <span className="text-white text-[14px] font-medium">Go to Show</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                        <div className="ml-auto flex items-center gap-1.5">
                          <Ring pct={heroShow.progressPct} size={17} accent={heroShow.accent} />
                          <span className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.6)" }}>{heroShow.episodesLeft} eps left</span>
                        </div>
                      </div>
                    </div>
                  </div>
            </>
          ) : (
            // Explicit flat #000 here too — same reason as the nav
            // bar above (t.bg is a gradient that hasn't reached true
            // black yet this high up the page).
            <div className="px-6" style={{ marginTop: 8, background: "#000" }}>
              {loaded ? (
                <div className="mt-6 flex flex-col items-center text-center rounded-2xl" style={{ padding: "28px 20px", background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
                  <Icon name="tv" size={24} color={t.textDim} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginTop: 10 }}>Nothing in progress</div>
                  <div style={{ fontSize: 12.5, color: t.textDim, marginTop: 4 }}>Watch an episode of a show you're watching to see it here.</div>
                </div>
              ) : (
                // Loading skeleton — the fetch chain behind this page
                // (library rows -> watch summary -> per-show TMDB detail)
                // is a genuine multi-step waterfall, slower over a real
                // network (especially a cold PWA open) than it ever is
                // against localhost. Without this, the entire page below
                // the header was just blank empty space for however long
                // that took, reading as stuck/broken rather than loading.
                <div className="mt-6 rounded-2xl animate-pulse" style={{ height: 320, background: t.cardFill, border: `1px solid ${t.cardBorder}` }} />
              )}
            </div>
          )}

          {/* ---------- In Progress (loading skeleton) ---------- */}
          {!loaded && (
            <div style={{ position: "relative", zIndex: 3, paddingTop: 15 }}>
              <div className="px-6">
                <div className="animate-pulse" style={{ height: 20, width: 118, borderRadius: 6, background: t.cardFill }} />
              </div>
              <div className="mt-3 pl-6 flex items-start gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex-shrink-0 rounded-xl animate-pulse" style={{ width: 104, aspectRatio: "2 / 3", background: t.cardFill, border: `1px solid ${t.cardBorder}` }} />
                ))}
              </div>
            </div>
          )}

          {/* ---------- In Progress ---------- */}
          {inProgressList.length > 0 && (
            // paddingTop reduced another 15% (18→15), together with the
            // wrapper's own paddingBottom reduction above — moving this
            // whole section (and everything below it) up more decisively
            // this time.
            <div style={{ position: "relative", zIndex: 3, paddingTop: 15, background: "transparent" }}>
              <SectionHeader title="In Progress" onSeeAll={() => setView("inProgress")} />
              {/* Mirrors whichever display mode See All → In Progress is
                  set to (inProgressViewMode, persisted — see
                  IN_PROGRESS_VIEW_MODE_KEY above), instead of always the
                  poster layout regardless of what the user picked there. */}
              {inProgressViewMode === "gallery" ? (
                <div className="mt-3 pl-6 flex items-start gap-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                  {inProgressList.map((item) => (
                    <InProgressCompactCard key={item.id} item={item} onLongPress={handleLongPress} />
                  ))}
                  <div className="w-2 flex-shrink-0" />
                </div>
              ) : (
                // items-start — without it, flex's default align-items:
                // stretch makes every card's outer box (which has no
                // explicit height of its own) match the tallest sibling's
                // natural height, e.g. a two-line subtitle on one card
                // stretching the whole row. The poster itself already has
                // a fixed 2:3 aspect-ratio (PosterCard) and object-fit:
                // cover (PosterArt), but that outer stretch still made
                // cards read as uneven overall.
                <div className="mt-3 pl-6 flex items-start gap-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                  {inProgressList.map((item) => (
                    <PosterCard
                      key={item.id}
                      show={item.show}
                      href={`/show/${item.id}`}
                      titlePlacement="overlay"
                      subtitle={`${item.code} · ${item.ep}`}
                      progress={item.progress}
                      favorite={isFavorite(item.id)}
                      onToggleFavorite={() => toggleFavorite(item.id, "Home:inProgressRow")}
                      onLongPress={handleLongPress}
                    />
                  ))}
                  <div className="w-2 flex-shrink-0" />
                </div>
              )}
            </div>
          )}

          {/* ---------- Upcoming ---------- */}
          {upcomingEpisodes.length > 0 && (
            <>
              <div className="mt-8 px-6 text-white text-[19.55px] font-semibold">Upcoming</div>
              <div className="mt-3 px-6 flex flex-col gap-2.5">
                {upcomingEpisodes.map((item) => (
                  <UpcomingRow key={item.id} item={item} onLongPress={handleLongPress} />
                ))}
              </div>
            </>
          )}

          {/* ---------- Upcoming Movies ---------- */}
          {upcomingMovies.length > 0 && (
            <>
              <div className="mt-8 px-6 text-white text-[19.55px] font-semibold">Upcoming Movies</div>
              <div className="mt-3 px-6 flex flex-col gap-2.5">
                {upcomingMovies.map((item) => (
                  <UpcomingMovieRow key={item.id} item={item} />
                ))}
              </div>
            </>
          )}
          </div>
        </div>
      )}

      {/* Hero card's Watch button opens this in place — no navigation to
          the episode detail page first (see markHeroWatchedAndRate
          above). cast omitted, same reasoning as Highlights' own "Rate
          the Episode" flow: no reason to fetch a show's full cast list
          just for this. onSave/onClose both trigger a refreshToken bump
          so Home's cached hero/progress data re-derives afterward —
          otherwise this episode would keep showing as "next up"
          indefinitely, since nothing else here re-fetches on its own. */}
      {heroRatingOpen && heroShow && (
        <EpisodeRatingFlow
          subject={{
            eyebrow: heroShow.episodeLabel ? `S${heroShow.season} E${heroShow.episode}` : "",
            title: heroShow.epTitle || heroShow.title,
            posterPath: heroShow.posterPath,
            runtimeMin: heroShow.runtimeMin,
            episodeAirDate: heroShow.episodeAirDate,
            showId: heroShow.showId,
            season: heroShow.season,
            episode: heroShow.episode,
          }}
          cast={heroCast}
          onClose={() => { setHeroRatingOpen(false); setRefreshToken((n) => n + 1); }}
          onSave={({ stars }) => {
            if (user && stars) rateLatestWatch(user.id, heroShow.showId, heroShow.season, heroShow.episode, stars).catch(console.error);
            setRefreshToken((n) => n + 1);
          }}
        />
      )}

      {/* Long-press "change status" quick menu — bumps the same
          refreshToken every other mutation on this page already uses, so
          In Progress/Upcoming/hero naturally reflect the new status (e.g.
          a show marked Completed disappearing from Upcoming) via the
          existing refetch effect, instead of hand-rolling a bespoke
          optimistic update for each of this page's several lists. */}
      <PosterQuickStatusMenu
        show={longPress?.show ?? null}
        anchorRect={longPress?.rect ?? null}
        userId={user?.id}
        source="Home:posterLongPress"
        onClose={() => setLongPress(null)}
        onStatusChange={() => setRefreshToken((n) => n + 1)}
      />
    </>
  );
}
