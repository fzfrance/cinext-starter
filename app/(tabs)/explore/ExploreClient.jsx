"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import PosterArt from "@/components/ui/PosterArt";
import PosterFanStack from "@/components/PosterFanStack";
import MediaFavoriteBadge from "@/components/ui/MediaFavoriteBadge";
import MediaStatusBadge from "@/components/ui/MediaStatusBadge";
import MediaTypeLabel from "@/components/ui/MediaTypeLabel";
import { useAuth } from "@/lib/auth-context";
import { useShowCustomizations } from "@/lib/show-customizations-context";
import { getUserShows, removeUserShow, setWatchlistAndClearProgress } from "@/lib/userShows";
import { getUserMovies, setMovieStatus, removeUserMovie } from "@/lib/userMovies";
import { getEpisodeWatches, getShowWatchSummary } from "@/lib/episodeWatches";
import { resolveShowStatus } from "@/lib/statusResolver";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { hrefForMedia, mediaKey } from "@/lib/media";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";
import { tmdbImage } from "@/lib/tmdb";
import { collectRecommendSignals } from "@/lib/recommend/collectSignals";
import { loadImpressions, recordImpressions, recordHeroImpression } from "@/lib/recommend/impressions";
import { interleaveExploreRows } from "@/lib/recommend/assemble";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

function shuffled(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---------- Placeholder data ----------

// TODO: replace with TMDB's real genre list (tmdb.getGenres())
const genres = [];


// ---------- Small building blocks ----------
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

function GenreChip({ label, active, onClick }) {
  return (
    <button onClick={onClick} className="flex-shrink-0 rounded-full active:scale-95 transition" style={{
      padding: "8px 16px", background: active ? "#fff" : t.cardFill,
      border: `1px solid ${active ? "transparent" : t.cardBorder}`,
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: active ? "#111" : "#fff" }}>{label}</span>
    </button>
  );
}

function TrendingCard({ item, rank, status }) {
  const { getCustomPoster } = useShowCustomizations();
  return (
    <Link href={hrefForMedia(item)} className="block flex-shrink-0 active:scale-95 transition cursor-pointer" style={{ width: 116 }}>
      <div className="relative rounded-2xl overflow-hidden" style={{ width: 116, height: 164, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
        <PosterArt posterPath={item.posterPath} overrideSrc={item.mediaType === "movie" ? undefined : getCustomPoster(item.id)} base={item.base} glow={item.glow} alt={item.title} />
        {rank != null && <div style={{ position: "absolute", top: 8, left: 10, fontSize: 26, fontWeight: 800, color: "rgba(255,255,255,0.88)", textShadow: "0 2px 10px rgba(0,0,0,0.7)" }}>{rank}</div>}
        {status ? <MediaStatusBadge status={status} /> : <MediaFavoriteBadge item={item} source="Explore:favoriteBadge" />}
      </div>
      {/* Fixed 2-line height (not just line-clamp) — same reasoning as
          PosterCard's title/subtitle (components/ui/PosterCard.jsx): a
          1-line title and a 2-line title need to leave every card in the
          row the same overall height, not just each clip past 2 lines. */}
      <div className="mt-2 text-[12.5px] font-semibold text-white" style={{ lineHeight: 1.25, height: "2.5em", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</div>
      <div className="text-[11px] mt-0.5" style={{ color: t.textDim }}>{item.genre}</div>
    </Link>
  );
}

function RecommendedCard({ item, status }) {
  const { getCustomPoster } = useShowCustomizations();
  return (
    <Link href={hrefForMedia(item)} className="block flex-shrink-0 active:scale-95 transition cursor-pointer" style={{ width: 116 }}>
      <div className="relative rounded-2xl overflow-hidden" style={{ width: 116, height: 164, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
        <PosterArt posterPath={item.posterPath} overrideSrc={item.mediaType === "movie" ? undefined : getCustomPoster(item.id)} base={item.base} glow={item.glow} alt={item.title} />
        <MediaTypeLabel mediaType={item.mediaType} />
        {status ? <MediaStatusBadge status={status} /> : <MediaFavoriteBadge item={item} source="Explore:favoriteBadge" />}
      </div>
      {/* Fixed 2-line height (not just line-clamp) — same reasoning as
          PosterCard's title/subtitle (components/ui/PosterCard.jsx): a
          1-line title and a 2-line title need to leave every card in the
          row the same overall height, not just each clip past 2 lines. */}
      <div className="mt-2 text-[12.5px] font-semibold text-white" style={{ lineHeight: 1.25, height: "2.5em", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</div>
      <div className="text-[11px] mt-0.5" style={{ color: t.textDim }}>{item.genre}</div>
    </Link>
  );
}

// Horizontal list card — the single entry point into Explore's "Full
// Library" browser, replacing the old 4-tile "Browse by ..." grid (Year/
// Genre/Platform/Language, now combined into one filterable page instead
// of four separate destinations). Leading icon, primary label, trailing
// fanned poster stack, entire row is one tap target.
function LibraryEntryCard({ posters }) {
  return (
    <Link
      href="/explore/library"
      className="flex items-center justify-between rounded-2xl active:scale-[0.98] transition"
      style={{ padding: "14px 16px", background: t.cardFill, border: `1px solid ${t.cardBorder}` }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center justify-center rounded-2xl flex-shrink-0" style={{ width: 46, height: 46, background: `${accent}22` }}>
          <Icon name="layers" size={21} color={accent} strokeWidth={1.7} />
        </div>
        <div className="min-w-0">
          <div className="text-white font-semibold truncate" style={{ fontSize: 17 }}>Browse All</div>
        </div>
      </div>
      <PosterFanStack shows={posters} />
    </Link>
  );
}

// ---------- Hero ----------
function ExploreHero({ heroSlides, watchlist, libraryKeys, onToggleWatchlist, onOpenSlide }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef(null);

  // Depends on heroSlides.length (previously `[]`, a stale-closure bug —
  // the "Recommended for You" slides arrive asynchronously after this
  // hero has already mounted with just the server-provided slides, so an
  // interval whose closure captured the original, smaller length would
  // keep cycling through only the first few slides forever and never
  // reach the ones appended later).
  useEffect(() => {
    if (heroSlides.length === 0) return;
    timerRef.current = setInterval(() => {
      setIndex((curr) => {
        const next = (curr + 1) % heroSlides.length;
        setVisible(false);
        setTimeout(() => setVisible(true), 260);
        return next;
      });
    }, 5000);
    return () => clearInterval(timerRef.current);
  }, [heroSlides.length]);

  // heroSlides can now shrink at runtime (a slide leaves the moment its
  // item gets added to the library — see visibleHeroSlides below), so a
  // stale index left over from a larger array is wrapped back in range
  // instead of pointing past the end.
  const slide = heroSlides.length > 0 ? heroSlides[index % heroSlides.length] : undefined;

  if (!slide) {
    return <div className="relative w-full" style={{ height: 500 }} />;
  }

  // slide.mode now reflects which pool actually produced this slide
  // (lib/exploreData.js tags each item with its real tier before
  // merging) — only ever "trending" | "new" | "recommended" now (no
  // top-rated fallback source, and no per-genre "BECAUSE YOU WATCH X"
  // attribution — both dropped per explicit request). The final branch
  // is only a defensive fallback for an unrecognized mode, never
  // actually reachable for a real hero slide today.
  const badge =
    slide.mode === "trending" ? { icon: "flame", color: "#fff", label: "TRENDING NOW" } :
    slide.mode === "new" ? { icon: "calendar", color: "#6fb4ee", label: "NEW RELEASE" } :
    slide.mode === "recommended" ? { icon: "thumbsUp", color: accent, label: "RECOMMENDED FOR YOU" } :
    { icon: "thumbsUp", color: accent, label: "RECOMMENDED FOR YOU" };
  // Any library status counts as "saved" for the checkmark — previously
  // this only checked status === "watchlist" specifically, so an item
  // already Watching/Paused/Completed still showed the unsaved "+" icon
  // here even though it's clearly already in the user's library. Keyed
  // by the composite mediaType-id string (movie and TV ids aren't
  // globally unique — see lib/media.js's mediaKey).
  const key = mediaKey(slide);
  const isSaved = libraryKeys.has(key);
  const isWatchlistStatus = watchlist.has(key);

  const advance = (next) => {
    setVisible(false);
    setTimeout(() => {
      setIndex(next);
      setVisible(true);
    }, 260);
  };

  return (
    <div className="relative w-full" style={{ height: 500, cursor: "pointer" }} onClick={() => router.push(hrefForMedia(slide))}>
      <style>{`@keyframes heroFill { from { width: 0% } to { width: 100% } }`}</style>

      <div style={{ opacity: visible ? 1 : 0, transition: "opacity 260ms ease" }} className="absolute inset-0">
        <PosterArt posterPath={slide.posterPath} base={slide.base} glow={slide.glow} alt={slide.title} tmdbSize="w1280" sizes="100vw" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, #0A0A0C 4%, transparent 46%, rgba(0,0,0,0.2) 100%)" }} />
      </div>

      {/* Preloads the *next* slide's image during the ~5s this one is
          showing, so its pixels are already decoded/cached by the time it
          becomes active — without this, the text (plain DOM content,
          available instantly) faded in immediately while the backdrop
          photo (a real network fetch) visibly popped in a beat later,
          since both were driven by the same `visible` opacity toggle but
          only one of them actually has to wait on a network round trip.
          tmdbSize must match the real slide's above exactly, or this
          warms a different cached resource than the one actually used.
          1x1 + opacity:0 rather than display:none — the image still
          fetches either way, but `sizes="100vw"` (matching above) is what
          actually decides which resolution gets requested, regardless of
          this element's own tiny rendered size. */}
      {heroSlides.length > 1 && (() => {
        const nextSlide = heroSlides[(index + 1) % heroSlides.length];
        return nextSlide && mediaKey(nextSlide) !== key ? (
          <div style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }}>
            <PosterArt posterPath={nextSlide.posterPath} base={nextSlide.base} glow={nextSlide.glow} alt="" tmdbSize="w1280" sizes="100vw" />
          </div>
        ) : null;
      })()}

      <div className="relative z-10 px-8 flex flex-col items-center text-center" style={{ position: "absolute", left: 0, right: 0, bottom: 24, opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(6px)", transition: "opacity 260ms ease, transform 260ms ease" }}>
        {/* Scrim sized to this text block specifically (not the whole
            hero) — the hero-wide gradient above already fades to
            transparent right around where this block's top edge sits,
            so bright backdrops were bleeding through behind the title.
            zIndex: -1 is load-bearing here: an absolutely-positioned
            child otherwise paints *after* (on top of) its non-positioned
            flex-item siblings regardless of DOM order, which was
            covering the text instead of sitting behind it. */}
        <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ top: -60, zIndex: -1, background: "linear-gradient(0deg, rgba(6,5,4,0.72) 0%, rgba(6,5,4,0.5) 55%, rgba(6,5,4,0) 100%)" }} />

        <div className="flex items-center gap-1.5 mb-2">
          <Icon name={badge.icon} size={12} color={badge.color} />
          <span className="text-[11px] font-semibold tracking-[0.18em]" style={{ color: badge.color }}>
            {badge.label}
          </span>
        </div>

        <div className="text-white font-bold tracking-[0.1em]" style={{ fontSize: 38, lineHeight: 1.05 }}>{slide.title}</div>

        <div className="flex items-center justify-center gap-1.5 mt-2.5">
          <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.75)" }}>{slide.meta}</span>
          <span style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
          <Icon name="star" size={11} color={accent} />
          <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.75)" }}>{slide.rating}</span>
        </div>

        <div className="flex items-center justify-center gap-2.5 mt-4">
          <GlassPill filled onClick={(e) => {
            e.stopPropagation();
            // Already saved under some OTHER status (Watching/Paused/
            // Completed/Dropped) — this pill is only a Watchlist
            // add/remove shortcut, so silently removing here would
            // delete real watch progress the user never asked to remove.
            // Send them to the real status menu on the detail page instead.
            if (isSaved && !isWatchlistStatus) { router.push(hrefForMedia(slide)); return; }
            onToggleWatchlist(slide);
          }}>
            <Icon name={isSaved ? "check" : "plus"} size={13} color="#111" /> Watchlist
          </GlassPill>
          {/* No stopPropagation here on purpose — this button had no
              handler of its own (dead click), so letting it bubble up to
              the card's navigation is strictly an improvement. */}
          <GlassPill round><Icon name="info" size={17} /></GlassPill>
        </div>

        <div className="flex items-center justify-center gap-1.5 mt-5">
          {heroSlides.map((s, i) => (
            <button key={mediaKey(s)} onClick={(e) => { e.stopPropagation(); clearInterval(timerRef.current); advance(i); }}
              className="relative rounded-full overflow-hidden" style={{ height: 3, width: i === index ? 22 : 12, background: "rgba(255,255,255,0.25)", transition: "width 260ms ease" }}>
              {i === index && (
                <div key={index} style={{ height: "100%", background: "#fff", animation: "heroFill 5000ms linear forwards" }} />
              )}
              {i < index && <div style={{ height: "100%", width: "100%", background: "#fff" }} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, onOpen }) {
  return (
    <div className="px-6">
      <button onClick={onOpen} className="flex items-center gap-0.5 active:opacity-70 transition">
        <span className="text-white text-[17px] font-semibold">{title}</span>
        <Icon name="chevronRight" size={17} color={t.textDim} />
      </button>
    </div>
  );
}

// ---------- Section detail (grid) overlay — reused for Trending Shows / Trending Movies / For You ----------
function GridPosterCard({ item, showMediaLabel = false }) {
  const { getCustomPoster } = useShowCustomizations();
  return (
    <Link href={hrefForMedia(item)} className="block active:scale-95 transition cursor-pointer">
      <div className="relative rounded-xl overflow-hidden" style={{ aspectRatio: "2 / 3", boxShadow: "0 6px 16px rgba(0,0,0,0.45)" }}>
        <PosterArt posterPath={item.posterPath} overrideSrc={item.mediaType === "movie" ? undefined : getCustomPoster(item.id)} base={item.base} glow={item.glow} alt={item.title} />
        {showMediaLabel ? <MediaTypeLabel mediaType={item.mediaType} /> : null}
        {item.status ? <MediaStatusBadge status={item.status} /> : <MediaFavoriteBadge item={item} source="Explore:favoriteBadge" />}
      </div>
      <div className="mt-1.5 text-[11.5px] font-semibold text-white leading-tight">{item.title}</div>
      {item.meta && <div className="text-[10px] mt-0.5" style={{ color: t.textDim }}>{item.meta}</div>}
    </Link>
  );
}

function SectionGridPage({ title, subtitle, items, onBack, showMediaLabel = false }) {
  return (
    <div className="fixed inset-0 z-40" style={{ background: t.bg }}>
      <div className="h-full overflow-y-auto pb-24" style={{ scrollbarWidth: "none" }}>
        <div className="flex items-center justify-between px-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
          <GlassPill round onClick={onBack}><Icon name="back" size={16} /></GlassPill>
          <GlassPill round><Icon name="gridToggle" size={15} /></GlassPill>
        </div>

        <div className="px-6" style={{ marginTop: 28 }}>
          <div className="text-white font-bold tracking-tight" style={{ fontSize: 32, lineHeight: 1.08 }}>{title}</div>
          {subtitle && <div className="text-[13px] mt-2" style={{ color: t.textDim }}>{subtitle}</div>}
        </div>

        <div className="px-6 grid grid-cols-3 gap-x-3 gap-y-5" style={{ marginTop: 22 }}>
          {items.map((item) => <GridPosterCard key={mediaKey(item)} item={item} showMediaLabel={showMediaLabel} />)}
        </div>
      </div>
    </div>
  );
}

function loadYouTubeIframeApi() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (window.__cinextYtApiPromise) return window.__cinextYtApiPromise;
  window.__cinextYtApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try { prev?.(); } catch { /* ignore prior hook errors */ }
      resolve(window.YT);
    };
    if (!document.getElementById("cinext-yt-iframe-api")) {
      const script = document.createElement("script");
      script.id = "cinext-yt-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    } else if (window.YT?.Player) {
      resolve(window.YT);
    }
  });
  return window.__cinextYtApiPromise;
}

const EXPLORE_HERO_STILL_MS = 5000;
const EXPLORE_HERO_YT_CHROME_S = 1.15;

function ExploreDesktopHeroTrailer({ item }) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const stillStartedAtRef = useRef(0);
  const [trailerKey, setTrailerKey] = useState(null);
  const [visible, setVisible] = useState(false);
  const [muted, setMuted] = useState(true);
  const [desktopReady, setDesktopReady] = useState(false);
  const [heroRoot, setHeroRoot] = useState(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const sync = () => setDesktopReady(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setVisible(false);
    setMuted(true);
    stillStartedAtRef.current = 0;
    if (!desktopReady || !item?.id || !item?.mediaType) {
      setTrailerKey(null);
      return undefined;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTrailerKey(null);
      return undefined;
    }
    // Still countdown starts with the hero; trailer loads/plays under it immediately.
    stillStartedAtRef.current = Date.now();
    let cancelled = false;
    const controller = new AbortController();
    fetch(`/api/media/trailer?mediaType=${encodeURIComponent(item.mediaType)}&id=${item.id}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setTrailerKey(data?.key || null);
      })
      .catch(() => {
        if (!cancelled) setTrailerKey(null);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [desktopReady, item?.id, item?.mediaType]);

  useEffect(() => {
    if (!desktopReady || !trailerKey || !hostRef.current) return undefined;
    let cancelled = false;
    let player = null;
    let revealTimer = null;
    let timePoll = null;

    const msUntilStillDone = () => {
      const started = stillStartedAtRef.current || Date.now();
      return Math.max(0, EXPLORE_HERO_STILL_MS - (Date.now() - started));
    };

    const tryReveal = (eventTarget) => {
      if (cancelled || document.hidden) return;
      let t = 0;
      try { t = eventTarget.getCurrentTime?.() ?? 0; } catch { t = 0; }
      // Keep the still up for the full 5s and until YT chrome has settled.
      if (msUntilStillDone() > 0 || t < EXPLORE_HERO_YT_CHROME_S) return;
      window.clearInterval(timePoll);
      timePoll = null;
      window.clearTimeout(revealTimer);
      revealTimer = null;
      setVisible(true);
    };

    const armRevealPolling = (eventTarget) => {
      window.clearInterval(timePoll);
      const wait = msUntilStillDone();
      const kick = () => {
        if (cancelled) return;
        tryReveal(eventTarget);
        if (!cancelled && !document.hidden) {
          timePoll = window.setInterval(() => tryReveal(eventTarget), 120);
        }
      };
      if (wait > 0) {
        revealTimer = window.setTimeout(kick, wait);
      } else {
        kick();
      }
    };

    const onVis = () => {
      if (document.hidden) {
        setVisible(false);
        try { playerRef.current?.pauseVideo?.(); } catch { /* player may be gone */ }
        return;
      }
      // Resume under the still; restart the 5s cover so chrome never flashes.
      stillStartedAtRef.current = Date.now();
      setVisible(false);
      try {
        playerRef.current?.mute?.();
        playerRef.current?.playVideo?.();
      } catch { /* ignore */ }
    };
    document.addEventListener("visibilitychange", onVis);

    loadYouTubeIframeApi().then((YT) => {
      if (cancelled || !YT?.Player || !hostRef.current) return;
      hostRef.current.replaceChildren();
      const mount = document.createElement("div");
      hostRef.current.appendChild(mount);
      player = new YT.Player(mount, {
        videoId: trailerKey,
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          loop: 1,
          playlist: trailerKey,
          cc_load_policy: 0,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            try {
              event.target.mute();
              event.target.playVideo();
            } catch { /* autoplay may still be blocked */ }
          },
          onStateChange: (event) => {
            if (cancelled) return;
            if (event.data === YT.PlayerState.PLAYING) {
              armRevealPolling(event.target);
            } else if (event.data === YT.PlayerState.ENDED) {
              try { event.target.playVideo(); } catch { /* ignore */ }
            }
          },
          onError: () => {
            if (cancelled) return;
            setVisible(false);
            setTrailerKey(null);
          },
        },
      });
      playerRef.current = player;
    });

    return () => {
      cancelled = true;
      setVisible(false);
      document.removeEventListener("visibilitychange", onVis);
      window.clearTimeout(revealTimer);
      window.clearInterval(timePoll);
      try { player?.destroy?.(); } catch { /* ignore */ }
      if (playerRef.current === player) playerRef.current = null;
      if (hostRef.current) hostRef.current.replaceChildren();
    };
  }, [desktopReady, trailerKey]);

  useEffect(() => {
    setHeroRoot(hostRef.current?.closest(".explore-desktop-hero") ?? null);
  }, [visible, trailerKey, desktopReady]);

  useEffect(() => {
    const art = hostRef.current?.closest(".explore-desktop-hero-art");
    if (!art) return undefined;
    art.classList.toggle("is-trailer-live", visible);
    return () => art.classList.remove("is-trailer-live");
  }, [visible]);

  const toggleMute = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const player = playerRef.current;
    if (!player) return;
    try {
      if (muted) {
        player.unMute();
        player.setVolume?.(100);
        setMuted(false);
      } else {
        player.mute();
        setMuted(true);
      }
    } catch { /* ignore */ }
  };

  if (!desktopReady || !trailerKey) return null;

  const muteButton = visible ? (
    <button
      type="button"
      className="explore-desktop-hero-mute"
      onClick={toggleMute}
      aria-label={muted ? "Unmute trailer" : "Mute trailer"}
    >
      <Icon name={muted ? "volumeMute" : "volume"} size={18} color="#fff" strokeWidth={1.9} />
    </button>
  ) : null;

  return (
    <>
      <div
        ref={hostRef}
        className="explore-desktop-hero-trailer-host"
        aria-hidden="true"
      />
      {muteButton && heroRoot ? createPortal(muteButton, heroRoot) : null}
    </>
  );
}

function ExploreDesktopLayout({ heroSlides, trendingShows, trendingMovies, genreRails = [], providers, resolvedStatusMap, recommended, recommendedLoading, onToggleWatchlist, readableLanguages = [], personalSections = [] }) {
  const router = useRouter();
  const hero = heroSlides[0];
  const showItems = trendingShows.slice(0, 10);
  const movieItems = trendingMovies.slice(0, 10);
  const heroKey = hero ? mediaKey(hero) : null;
  const heroStatus = heroKey ? resolvedStatusMap[heroKey] : undefined;
  const heroSaved = Boolean(heroStatus);
  const heroWatchlisted = heroStatus === "watchlist";
  const resolveItemTitle = (item) => ({ ...item, title: resolveTitle(item, readableLanguages) });
  const exploreTail = useMemo(
    () => interleaveExploreRows(genreRails, personalSections),
    [genreRails, personalSections]
  );
  return (
    <div className="explore-desktop-layout">
      {hero && (
        <section className="explore-desktop-hero">
          <div className="explore-desktop-hero-art">
            <PosterArt posterPath={hero.posterPath} alt="" tmdbSize="w1280" sizes="100vw" />
            <ExploreDesktopHeroTrailer item={hero} />
          </div>
          <div className="explore-desktop-hero-scrim" aria-hidden="true" />
          <Link href={hrefForMedia(hero)} className="explore-desktop-hero-hit" aria-label={hero.title} />
          <div className="explore-desktop-hero-copy">
            <HeroTitleLogo item={hero} />
            {hero.overview ? <p className="explore-desktop-hero-overview">{hero.overview}</p> : null}
            <div className="explore-desktop-hero-actions">
              <button
                type="button"
                className="explore-desktop-hero-button"
                onClick={() => {
                  if (heroSaved && !heroWatchlisted) { router.push(hrefForMedia(hero)); return; }
                  onToggleWatchlist?.(hero);
                }}
              >
                <Icon name={heroSaved ? "check" : "plus"} size={16} color="#111" strokeWidth={2.2} />
                Watchlist
              </button>
              <Link href={hrefForMedia(hero)} className="explore-desktop-hero-info">
                <Icon name="info" size={17} /> View details
              </Link>
            </div>
          </div>
        </section>
      )}

      {recommendedLoading ? (
        <section className="explore-desktop-section explore-desktop-shelf">
          <h2>For You</h2>
          <div className="explore-desktop-poster-row" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div className="explore-desktop-poster-card explore-desktop-poster-skeleton" key={i}>
                <div className="explore-desktop-poster-wrap"><div className="explore-desktop-poster-art" /></div>
              </div>
            ))}
          </div>
        </section>
      ) : recommended.length > 0 ? (
        <DesktopShelf title="For You" items={recommended} resolvedStatusMap={resolvedStatusMap} showRank={false} showMediaLabel />
      ) : (
        <section className="explore-desktop-section explore-desktop-shelf">
          <h2>For You</h2>
          <div className="explore-desktop-empty">Your personalized movie and show picks will appear here.</div>
        </section>
      )}

      <DesktopShelf title="Top 10 TV Shows" items={showItems} resolvedStatusMap={resolvedStatusMap} />
      <DesktopShelf title="Top 10 Movies" items={movieItems} resolvedStatusMap={resolvedStatusMap} />

      <section className="explore-desktop-section explore-desktop-providers">
        <h2>Streaming Services</h2>
        {providers.length > 0 ? (
          <div className="explore-provider-row">
            {providers.map((provider) => (
              <ProviderMark key={provider.provider_id} provider={provider} />
            ))}
          </div>
        ) : (
          <div className="explore-desktop-empty">Streaming services will appear here.</div>
        )}
      </section>

      {exploreTail.map((row) => {
        if (row.type === "personal") {
          const section = row.section;
          return (
            <DesktopShelf
              key={section.id}
              title={section.title}
              items={(section.items ?? []).map(resolveItemTitle)}
              resolvedStatusMap={resolvedStatusMap}
              showRank={false}
              showMediaLabel
            />
          );
        }
        return (
          <DesktopGenreShelf
            key={row.rail.name}
            rail={row.rail}
            resolvedStatusMap={resolvedStatusMap}
            resolveItemTitle={resolveItemTitle}
          />
        );
      })}
    </div>
  );
}

function ProviderMark({ provider }) {
  const src = tmdbImage(provider.logo_path, "original");
  const [shape, setShape] = useState(src ? "pending" : "missing");
  const imgRef = useRef(null);

  const classify = (img) => {
    const width = img?.naturalWidth;
    const height = img?.naturalHeight;
    if (!width || !height) {
      setShape("missing");
      return;
    }
    // TMDB/JustWatch often ships 1:1 brand tiles. Wide wordmarks stay
    // uncropped as marks; square tiles render as the tile itself.
    setShape(width / height >= 1.35 ? "wordmark" : "tile");
  };

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth) classify(imgRef.current);
  }, [src]);

  const href = `/explore/provider/${provider.provider_id}`;

  if (!src || shape === "missing") {
    return (
      <Link href={href} className="explore-provider-name">
        {provider.provider_name}
      </Link>
    );
  }

  return (
    <Link href={href} className={`explore-provider-card is-${shape}`} title={provider.provider_name}>
      <img
        ref={imgRef}
        src={src}
        alt={provider.provider_name}
        onLoad={(event) => classify(event.currentTarget)}
        onError={() => setShape("missing")}
      />
    </Link>
  );
}

function HeroTitleLogo({ item }) {
  const readableLanguages = useReadableLanguages();
  const [logoPath, setLogoPath] = useState(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setLoaded(false);
    setLogoPath(null);
    const url = item.mediaType === "movie" ? "/api/movies/logos" : "/api/shows/logos";
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [item.id], readableLanguages }),
    })
      .then((r) => r.json())
      .then(({ results }) => { if (!cancelled) { setLogoPath(results?.[0]?.logoPath ?? null); setLoaded(true); } })
      .catch(() => { if (!cancelled) { setLogoPath(null); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [item.id, item.mediaType, readableLanguages]);
  const src = !failed && logoPath ? tmdbImage(logoPath, "w500") : null;
  if (src) return <img className="explore-desktop-hero-logo" src={src} alt={item.title} onError={() => setFailed(true)} />;
  // Hold the title slot while the logo request is in flight so a wordmark
  // doesn't flash in after plain text. Fall back to the title only when
  // TMDB has no usable logo for this item.
  if (!loaded) return <div className="explore-desktop-hero-logo-slot" aria-hidden="true" />;
  return <h1>{item.title}</h1>;
}

function desktopItemYear(item) {
  if (item.year) return String(item.year);
  if (item.date) return String(item.date).slice(0, 4);
  if (item.meta) {
    const match = String(item.meta).match(/\b(19|20)\d{2}\b/);
    if (match) return match[0];
  }
  return "";
}

function DesktopShelf({ title, items, resolvedStatusMap, showRank = true, showMediaLabel = false, onLoadMore = null, hasMore = false, loadingMore = false }) {
  const rowRef = useRef(null);
  const sentinelRef = useRef(null);
  const loadLock = useRef(false);

  useEffect(() => {
    if (!onLoadMore || !hasMore) return undefined;
    const root = rowRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (loadLock.current || loadingMore || !hasMore) return;
        loadLock.current = true;
        Promise.resolve(onLoadMore())
          .catch(() => {})
          .finally(() => { loadLock.current = false; });
      },
      { root, rootMargin: "0px 480px 0px 0px", threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, loadingMore, items.length]);

  return (
    <section className="explore-desktop-section explore-desktop-shelf">
      <h2>{title}</h2>
      <div className="explore-desktop-poster-row" ref={rowRef}>
        {items.map((item, index) => {
          const year = desktopItemYear(item);
          const status = resolvedStatusMap[mediaKey(item)];
          return (
            <Link href={hrefForMedia(item)} className="explore-desktop-poster-card" key={mediaKey(item)}>
              <div className="explore-desktop-poster-wrap">
                <div className="explore-desktop-poster-art">
                  <PosterArt posterPath={item.posterPath} alt={item.title} />
                  {showMediaLabel ? <MediaTypeLabel mediaType={item.mediaType} /> : null}
                  {status
                    ? <MediaStatusBadge status={status} />
                    : <MediaFavoriteBadge item={item} source="Explore:desktopBadge" />}
                </div>
                {showRank && <div className="explore-desktop-rank">{index + 1}</div>}
              </div>
              <div className="explore-desktop-poster-title">{item.title}</div>
              {year ? <div className="explore-desktop-poster-year">{year}</div> : null}
            </Link>
          );
        })}
        {onLoadMore && hasMore ? (
          <div ref={sentinelRef} className="explore-desktop-poster-sentinel" aria-hidden="true">
            {loadingMore ? <div className="explore-desktop-poster-card explore-desktop-poster-skeleton"><div className="explore-desktop-poster-wrap"><div className="explore-desktop-poster-art" /></div></div> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function DesktopGenreShelf({ rail, resolvedStatusMap, resolveItemTitle }) {
  const [items, setItems] = useState(() => rail.items ?? []);
  const [nextPage, setNextPage] = useState(() => rail.nextPage ?? 3);
  const [hasMore, setHasMore] = useState(() => rail.hasMore !== false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setItems(rail.items ?? []);
    setNextPage(rail.nextPage ?? 3);
    setHasMore(rail.hasMore !== false);
  }, [rail.name, rail.items, rail.nextPage, rail.hasMore]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/explore/genre-rail?name=${encodeURIComponent(rail.name)}&page=${nextPage}`);
      if (!res.ok) throw new Error("genre-rail failed");
      const data = await res.json();
      const incoming = (data.items ?? []).map((item) => resolveItemTitle(item));
      const seen = new Set(items.map((item) => mediaKey(item)));
      const unique = incoming.filter((item) => !seen.has(mediaKey(item)));
      if (unique.length === 0) {
        setHasMore(false);
      } else {
        setItems((prev) => [...prev, ...unique]);
        setHasMore(Boolean(data.hasMore));
      }
      setNextPage((data.page ?? nextPage) + 1);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  if (items.length === 0) return null;

  return (
    <DesktopShelf
      title={rail.name}
      items={items}
      resolvedStatusMap={resolvedStatusMap}
      showRank={false}
      showMediaLabel
      onLoadMore={loadMore}
      hasMore={hasMore}
      loadingMore={loadingMore}
    />
  );
}

export default function ExploreClient({ trendingShows: trendingShowsRaw, trendingMovies: trendingMoviesRaw, heroSlides: heroSlidesRaw, genreRails: genreRailsRaw = [], providers = [] }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const readableLanguages = useReadableLanguages();
  // Resolved once here, per the signed-in user's Readable Languages —
  // every downstream reference just reads `.title` normally after this.
  // Trending renders as two separate rows (Shows/Movies, per explicit
  // request — tried mixed into one row first, reverted); trendingAll is
  // kept only for the sites that legitimately still want mixed data (the
  // recommended-seed exclusion effect below, and the cosmetic poster fan
  // on the Browse All entry card).
  const trendingShows = trendingShowsRaw.map((item) => ({ ...item, title: resolveTitle(item, readableLanguages) }));
  const trendingMovies = trendingMoviesRaw.map((item) => ({ ...item, title: resolveTitle(item, readableLanguages) }));
  const genreRails = useMemo(
    () => genreRailsRaw.map((rail) => ({
      ...rail,
      items: (rail.items ?? []).map((item) => ({ ...item, title: resolveTitle(item, readableLanguages) })),
    })),
    [genreRailsRaw, readableLanguages]
  );
  const trendingAll = useMemo(() => [...trendingShows, ...trendingMovies], [trendingShows, trendingMovies]);

  // Real per-user "Shows For You"/"Movies For You" (app/api/shows/
  // recommended-for-you, which now returns {tvItems, movieItems}
  // separately), a few of each mixed into the hero — see the effect below
  // for how these get populated, and combinedHeroSlides for the mix.
  const [recommendedShows, setRecommendedShows] = useState([]);
  const [recommendedMovies, setRecommendedMovies] = useState([]);
  const [recommendedItems, setRecommendedItems] = useState([]);
  const [recommendedHero, setRecommendedHero] = useState([]);
  const [personalSections, setPersonalSections] = useState([]);
  const [recommendedReady, setRecommendedReady] = useState(false);
  // Prefer engine hero (taste + backdrop + freshness) when ready; otherwise
  // keep the server editorial hero so first paint isn't empty.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `shuffled` is a pure module-level helper, stable across renders
  const combinedHeroSlides = useMemo(() => {
    const fromEngine = (recommendedHero.length > 0 ? recommendedHero : [])
      .filter((item) => item.backdropPath || item.posterPath)
      .slice(0, 5)
      .map((item) => ({
        ...item,
        mode: "recommended",
        posterPath: item.backdropPath || item.posterPath,
      }));

    if (fromEngine.length >= 2) {
      const seen = new Set(fromEngine.map((item) => mediaKey(item)));
      const fillers = heroSlidesRaw.filter((item) => !seen.has(mediaKey(item))).slice(0, Math.max(0, 5 - fromEngine.length));
      return [...fromEngine, ...fillers].slice(0, 5);
    }

    const recommendedForHero = shuffled([...recommendedShows, ...recommendedMovies])
      .filter((item) => item.backdropPath || item.posterPath)
      .slice(0, 5)
      .map((item) => ({
        ...item,
        mode: "recommended",
        posterPath: item.backdropPath || item.posterPath,
      }));

    if (recommendedForHero.length >= 2) {
      const seen = new Set(recommendedForHero.map((item) => mediaKey(item)));
      const fillers = heroSlidesRaw.filter((item) => !seen.has(mediaKey(item))).slice(0, Math.max(0, 5 - recommendedForHero.length));
      return [...recommendedForHero, ...fillers].slice(0, 5);
    }

    return [...heroSlidesRaw, ...recommendedForHero].slice(0, 5);
  }, [heroSlidesRaw, recommendedShows, recommendedMovies, recommendedHero]);
  const heroSlides = combinedHeroSlides.map((item) => ({ ...item, title: resolveTitle(item, readableLanguages) }));
  // Engine already diversifies For You — prefer its mixed list; fall back to tv+movie merge.
  const combinedRecommended = useMemo(() => {
    if (recommendedItems.length > 0) return recommendedItems;
    return shuffled([...recommendedShows, ...recommendedMovies]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shuffled helper is stable
  }, [recommendedItems, recommendedShows, recommendedMovies]);
  const recommendedAllResolved = combinedRecommended.map((item) => ({ ...item, title: resolveTitle(item, readableLanguages) }));
  const personalSectionsResolved = useMemo(
    () => personalSections.map((section) => ({
      ...section,
      items: (section.items ?? []).map((item) => ({ ...item, title: resolveTitle(item, readableLanguages) })),
    })),
    [personalSections, readableLanguages]
  );
  const [activeGenre, setActiveGenre] = useState("All");
  const [sectionView, setSectionView] = useState(null); // { title, subtitle, items }
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef(null);
  // What's actually displayed everywhere (status icon, hero's "already
  // saved" check) — resolved from real released/watched episode counts
  // via lib/statusResolver.js for shows (movies have no progress to
  // resolve, their status is exactly what was picked). Keyed by the
  // composite mediaType-id string (mediaKey) — movie and TV ids aren't
  // globally unique, so a flat numeric-id map could stomp one media
  // type's status with the other's.
  const [resolvedStatusMap, setResolvedStatusMap] = useState({});

  // Library status for every item touched on this page (the hero's
  // Watchlist shortcut reads/writes this map — see toggleWatchlist below)
  // — user_shows + user_movies, same tables the two detail pages' status
  // menus use.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      // repairContradictoryStatuses is intentionally NOT called here — see
      // app/(tabs)/home/page.jsx's identical note. Status is already
      // resolved live below (resolveShowStatus), so this page displays
      // correctly without needing to rewrite the stored value, and a
      // page-load effect must never write to user_shows/user_movies.
      // getUserMovies gets its own catch — a movie-side failure (e.g.
      // user_movies not existing yet) must degrade to "no movies" instead
      // of rejecting this whole Promise.all and blanking the show side's
      // status map too (the exact bug this comment is fixing).
      const [byShow, byMovie] = await Promise.all([
        getUserShows(user.id),
        getUserMovies(user.id).catch((err) => { console.error(err); return {}; }),
      ]);
      if (cancelled) return;

      const map = {};
      for (const [id, s] of Object.entries(byShow)) map[`tv-${id}`] = s.status;
      // Movies have no live progress to resolve — their stored status IS
      // the displayed one, unlike shows below.
      for (const [id, s] of Object.entries(byMovie)) map[`movie-${id}`] = s.status;
      setResolvedStatusMap(map); // first pass — shows corrected below once progress data resolves

      const ids = Object.keys(byShow).map(Number);
      const resolvableIds = ids.filter((id) => byShow[id].status !== "paused" && byShow[id].status !== "drop");
      if (resolvableIds.length === 0) return;

      const summary = await getShowWatchSummary(user.id, resolvableIds);
      const res = await fetch("/api/shows/library-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shows: resolvableIds.map((id) => ({ id, needsProgress: true, watched: summary[id]?.watchedKeys ?? [] })),
        }),
      });
      const { results } = await res.json();
      if (cancelled) return;
      const byId = Object.fromEntries(results.map((r) => [r.id, r]));
      setResolvedStatusMap((prev) => {
        const next = { ...prev };
        for (const id of resolvableIds) {
          const result = byId[id];
          if (!result) continue;
          next[`tv-${id}`] = resolveShowStatus({
            explicitStatus: byShow[id].status,
            watchedReleasedEpisodes: result.watchedReleasedEpisodes ?? 0,
            releasedEpisodes: result.releasedEpisodes ?? 0,
          });
        }
        return next;
      });
    })().catch(console.error);
    return () => { cancelled = true; };
  }, [user]);

  // Rule-based recommendation engine — taste profile from watch/rate/
  // favorite/drop signals, scored candidates, diversified For You + hero
  // + personalized Explore sections. Impressions live in localStorage.
  const authSettled = !authLoading || Boolean(user);
  useEffect(() => {
    if (!authSettled) {
      setRecommendedReady(false);
      return;
    }
    if (!user) {
      setRecommendedShows([]);
      setRecommendedMovies([]);
      setRecommendedItems([]);
      setRecommendedHero([]);
      setPersonalSections([]);
      setRecommendedReady(true);
      return;
    }
    setRecommendedReady(false);
    let cancelled = false;
    const safety = setTimeout(() => {
      if (!cancelled) setRecommendedReady(true);
    }, 20000);

    (async () => {
      try {
        const titles = await collectRecommendSignals(user.id);
        if (cancelled) return;
        if (titles.length === 0) {
          setRecommendedShows([]);
          setRecommendedMovies([]);
          setRecommendedItems([]);
          setRecommendedHero([]);
          setPersonalSections([]);
          return;
        }
        const impressions = loadImpressions(user.id);
        const res = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ titles, impressions }),
        });
        if (!res.ok) throw new Error(`recommend failed (${res.status})`);
        const data = await res.json();
        if (cancelled) return;

        const withYear = (item) => ({
          ...item,
          mode: item.mode || "recommended",
          year: item.date ? String(item.date).slice(0, 4) : (item.year ?? ""),
        });
        const fyItems = (data.forYou?.items ?? []).map(withYear);
        const tvItems = (data.forYou?.tvItems ?? []).map(withYear);
        const movieItems = (data.forYou?.movieItems ?? []).map(withYear);
        setRecommendedItems(fyItems);
        setRecommendedShows(tvItems);
        setRecommendedMovies(movieItems);
        setRecommendedHero((data.hero ?? []).map(withYear));
        setPersonalSections(data.sections ?? []);

        const impressionRows = [
          ...fyItems.slice(0, 24).map((item) => ({ key: mediaKey(item), surface: "foryou" })),
          ...(data.sections ?? []).flatMap((section) =>
            (section.items ?? []).slice(0, 8).map((item) => ({ key: mediaKey(item), surface: section.kind || "section" }))
          ),
        ];
        recordImpressions(user.id, impressionRows);
        if (data.hero?.[0]) recordHeroImpression(user.id, data.hero[0]);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setRecommendedShows([]);
          setRecommendedMovies([]);
          setRecommendedItems([]);
          setRecommendedHero([]);
          setPersonalSections([]);
        }
      } finally {
        clearTimeout(safety);
        if (!cancelled) setRecommendedReady(true);
      }
    })();

    return () => { cancelled = true; clearTimeout(safety); };
  }, [user, authSettled]);

  // Watchlist is definitionally zero watched episodes (lib/statusResolver.js)
  // — landing there while progress already exists would recreate the exact
  // contradiction this whole status system exists to prevent. Checks live
  // (not resolvedStatusMap, which could be stale by the time the user taps
  // an option) whether the show has any watched episodes, and if so,
  // confirms before clearing them. Movies have no watch-progress concept at
  // all, so this is never called for a movie slide (see toggleWatchlist).
  const confirmClearIfWatched = async (id, title) => {
    const watches = await getEpisodeWatches(user.id, id).catch(() => ({}));
    if (Object.keys(watches).length === 0) return true; // nothing to confirm, proceed
    return window.confirm(`${title} has watched episodes. Moving it to Watchlist will clear its watch history — this can't be undone. Continue?`);
  };

  // The hero's quick-save shortcut — equivalent to picking "Watchlist"
  // from the full status menu, just a single tap. Derives its "already
  // saved" state from resolvedStatusMap (see the watchlist Set below).
  // Branches on the slide's own mediaType: movies skip
  // confirmClearIfWatched entirely (nothing to clear — see lib/userMovies.js,
  // movies have no episode-progress concept) and write through
  // setMovieStatus/removeUserMovie instead of the show equivalents.
  const toggleWatchlist = async (slide) => {
    if (!user) { router.push("/login"); return; }
    const key = mediaKey(slide);
    const isSaved = resolvedStatusMap[key] === "watchlist";
    const isMovie = slide.mediaType === "movie";

    if (isSaved) {
      // Not optimistic, deliberately: removeUserShow now cascades through
      // episode_watches/season_reviews too (Remove is a full reset, not
      // just the library row), so resolvedStatusMap must only drop this
      // item once that delete has actually succeeded, not before.
      const removeFn = isMovie ? removeUserMovie : removeUserShow;
      removeFn(user.id, slide.id, "ExploreClient:toggleWatchlist:unsave")
        .then(() => {
          setResolvedStatusMap((prev) => { const next = { ...prev }; delete next[key]; return next; });
        })
        .catch((err) => {
          console.error(err);
          window.alert("Couldn't remove this — please try again.");
        });
      return;
    }

    if (!isMovie) {
      const proceed = await confirmClearIfWatched(slide.id, slide.title);
      if (!proceed) return;
    }
    setResolvedStatusMap((prev) => ({ ...prev, [key]: "watchlist" }));
    const writePromise = isMovie
      ? setMovieStatus(user.id, slide.id, "watchlist", "ExploreClient:toggleWatchlist")
      : setWatchlistAndClearProgress(user.id, slide.id, "ExploreClient:toggleWatchlist");
    writePromise.catch(console.error);
    setToastVisible(true);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 2000);
  };

  // Genre filter is shared across both Trending rows (one filter row,
  // both rows react) — same GENRES list used to double as the filter for
  // a single mixed row before this split; now applied to each type's own
  // trending list independently.
  const filteredTrendingShows = activeGenre === "All" ? trendingShows : trendingShows.filter((t) => t.genre === activeGenre);
  const filteredTrendingMovies = activeGenre === "All" ? trendingMovies : trendingMovies.filter((t) => t.genre === activeGenre);

  const openTrendingShows = () => setSectionView({
    title: "Trending Shows",
    subtitle: "The most-watched shows this week.",
    items: trendingShows.map((t) => ({ ...t, meta: t.genre, status: resolvedStatusMap[mediaKey(t)] ?? null })),
  });
  const openTrendingMovies = () => setSectionView({
    title: "Trending Movies",
    subtitle: "The most-watched movies this week.",
    items: trendingMovies.map((t) => ({ ...t, meta: t.genre, status: resolvedStatusMap[mediaKey(t)] ?? null })),
  });
  const openRecommendedAll = () => setSectionView({
    title: "For You",
    subtitle: "Based on what you watch.",
    items: recommendedAllResolved.map((t) => ({ ...t, meta: t.genre, status: resolvedStatusMap[mediaKey(t)] ?? null })),
    showMediaLabel: true,
  });

  const watchlist = new Set(Object.entries(resolvedStatusMap).filter(([, s]) => s === "watchlist").map(([key]) => key));
  const libraryKeys = new Set(Object.keys(resolvedStatusMap));
  // Do not remove slides when the async library map arrives. That response
  // previously changed the array under ExploreHero and could replace its
  // first poster immediately on open. Saved items remain stable and simply
  // render the existing saved/checkmark state.
  // Never promote something the user has already watched or started into the
  // cinematic hero. Watchlist-only entries remain eligible, since they have
  // no viewing progress yet. The map is keyed by media type + ID so a movie
  // and TV title sharing a numeric TMDB ID cannot exclude each other.
  const watchedHeroStatuses = new Set(["watching", "completed", "paused", "drop", "dropped"]);
  const visibleHeroSlides = heroSlides.filter((slide) => !watchedHeroStatuses.has(resolvedStatusMap[mediaKey(slide)]));

  return (
    <>
      <ExploreDesktopLayout heroSlides={visibleHeroSlides} trendingShows={trendingShows} trendingMovies={trendingMovies} genreRails={genreRails} providers={providers} resolvedStatusMap={resolvedStatusMap} recommended={recommendedAllResolved} recommendedLoading={!recommendedReady && (authLoading || Boolean(user))} onToggleWatchlist={toggleWatchlist} readableLanguages={readableLanguages} personalSections={personalSectionsResolved} />
      <div className="explore-mobile-layout">
      {/* ---------- Hero (stays mixed-type) ---------- */}
      <ExploreHero heroSlides={visibleHeroSlides} watchlist={watchlist} libraryKeys={libraryKeys} onToggleWatchlist={toggleWatchlist} onOpenSlide={(slide) => router.push(hrefForMedia(slide))} />

      {/* ---------- Genre filter (shared by both Trending rows) ---------- */}
      <div className="mt-5 pl-6 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {genres.map((g) => (
          <GenreChip key={g} label={g} active={activeGenre === g} onClick={() => setActiveGenre(g)} />
        ))}
        <div className="w-2 flex-shrink-0" />
      </div>

      {/* ---------- For You (mixed shows+movies) ---------- */}
      {/* Only rendered once real picks exist — no signed-in user (or a
          brand-new account with nothing in their library yet) means
          there's no genre signal to recommend from, so there's nothing
          honest to show here rather than an empty/generic row. */}
      {recommendedAllResolved.length > 0 && (
        <>
          <div className="mt-7">
            <SectionHeader title="For You" onOpen={openRecommendedAll} />
          </div>
          <div className="mt-3 pl-6 flex gap-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {recommendedAllResolved.map((item) => <RecommendedCard key={mediaKey(item)} item={item} status={resolvedStatusMap[mediaKey(item)]} />)}
            <div className="w-2 flex-shrink-0" />
          </div>
        </>
      )}

      {/* ---------- Trending Shows ---------- */}
      <div className={recommendedAllResolved.length > 0 ? "mt-8" : "mt-7"}>
        <SectionHeader title="Trending Shows" onOpen={openTrendingShows} />
      </div>
      <div className="mt-3 pl-6 flex gap-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {filteredTrendingShows.map((item, i) => (
          <TrendingCard key={mediaKey(item)} item={item} rank={i + 1} status={resolvedStatusMap[mediaKey(item)]} />
        ))}
        <div className="w-2 flex-shrink-0" />
      </div>
      {filteredTrendingShows.length === 0 && (
        <div className="px-6 mt-2 text-[13px]" style={{ color: t.textDim }}>No shows trending in {activeGenre} right now.</div>
      )}

      {/* ---------- Trending Movies ---------- */}
      <div className="mt-8">
        <SectionHeader title="Trending Movies" onOpen={openTrendingMovies} />
      </div>
      <div className="mt-3 pl-6 flex gap-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {filteredTrendingMovies.map((item, i) => (
          <TrendingCard key={mediaKey(item)} item={item} rank={i + 1} status={resolvedStatusMap[mediaKey(item)]} />
        ))}
        <div className="w-2 flex-shrink-0" />
      </div>
      {filteredTrendingMovies.length === 0 && (
        <div className="px-6 mt-2 text-[13px]" style={{ color: t.textDim }}>No movies trending in {activeGenre} right now.</div>
      )}

      {/* ---------- Full Library entry point ---------- */}
      <div className="mt-8 px-6">
        <LibraryEntryCard posters={trendingAll} />
      </div>

      {/* ---------- Toast ---------- */}
      <div className="fixed left-0 right-0 z-40 flex justify-center" style={{
        bottom: 150, opacity: toastVisible ? 1 : 0,
        transform: toastVisible ? "translateY(0)" : "translateY(6px)",
        transition: "opacity 300ms ease, transform 300ms ease",
        pointerEvents: "none",
      }}>
        <div className="rounded-full" style={{ padding: "9px 18px", background: "rgba(30,28,26,0.92)", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)" }}>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>Added to Watchlist</span>
        </div>
      </div>

      {/* ---------- Section detail overlay (Trending Shows/Movies, For You) ---------- */}
      {sectionView && (
        <SectionGridPage
          title={sectionView.title}
          subtitle={sectionView.subtitle}
          items={sectionView.items}
          showMediaLabel={Boolean(sectionView.showMediaLabel)}
          onBack={() => setSectionView(null)}
        />
      )}

      </div>

    </>
  );
}
