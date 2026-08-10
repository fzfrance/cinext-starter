"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Icon from "@/components/ui/Icon";
import Grain from "@/components/ui/Grain";
import PosterArt from "@/components/ui/PosterArt";
import { ensureMovieShareId, getAllMovieRatingsForUser } from "@/lib/movieRatings";
import { tmdbImage } from "@/lib/tmdb";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";
import { useNavVisibility } from "@/lib/nav-visibility-context";
import { useAuth } from "@/lib/auth-context";
import { useReadableLanguages } from "@/lib/languages";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// Fork of components/ShareRatingCard.jsx, not a parameterized version of
// it — same fork convention as every other movie/show pair this whole
// effort. Every layout constant/export-canvas geometry below is copied
// VERBATIM (deliberately not re-tuned) — this is the same physical
// "collectible ticket" card, just fed movie data instead of season data,
// so it should look identical in every way that isn't content-specific.
// Only real differences: no season/auto concept (a movie has one rating,
// always manual — see lib/movieRatings.js), the "SEASON 1" text row
// becomes the movie's own year + runtime line, and the review-number
// sequence is scoped to the user's movie ratings only (not merged with
// their show ratings) — same "own media type only" scoping the show
// card's sequence already uses (shows only, never movies).
const EXPORT_W = 1080;
const CARD_MARGIN = 70;
const CARD_RADIUS = 94;
const STUB_H = 326;
const NOTCH_W = 116;
const NOTCH_H = 133;
const NOTCH_SHIFT = -44;
const PAD_X = 72;

const TYPE = {
  primaryTitle: { size: 108, weight: 700 },
  englishTitle: { size: 44, weight: 500 },
  season: { size: 33, weight: 600, tracking: "0.22em" },
  ratingNumber: { size: 75, weight: 800 },
  ratingSuffix: { size: 38, weight: 400 },
  username: { size: 36, weight: 800 },
  profileSubtitle: { size: 33, weight: 500 },
  reviewNoLabel: { size: 28, weight: 500 },
  reviewNoValue: { size: 38, weight: 800 },
  quote: { size: 30, weight: 500 },
};

const TITLE_TOP = 847;
const PRIMARY_TITLE_H = 143;
const ENGLISH_TITLE_H = 62;
const SEASON_H = 50;
// Two fixed row heights, not a per-quote measured one — matching this
// file's own "known layout, content never shifts anything downstream"
// convention. Compact when there's no review text to pull a quote from;
// tall enough for up to 4 clamped quote lines when there is one.
const RATING_ROW_H_COMPACT = 86;
const RATING_ROW_H_QUOTE = 210;

const ENGLISH_TOP = TITLE_TOP + PRIMARY_TITLE_H + 28;
const SEASON_TOP = ENGLISH_TOP + ENGLISH_TITLE_H + 22;
const TITLE_BLOCK_H = ENGLISH_TOP + ENGLISH_TITLE_H - TITLE_TOP;
const RATING_TOP = SEASON_TOP + SEASON_H + 20;
const CARD_W = EXPORT_W - CARD_MARGIN * 2;

const PERFORATION_DOT = 7;
const PERFORATION_DOTS = Array.from({ length: 32 });

const CLAMP_1_LINE = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

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
        const stripY = Math.floor(h * 0.5);
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

function Segmented({ value, onChange, options }) {
  return (
    <div className="flex items-center rounded-full" style={{ padding: 3, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 6px 16px -6px rgba(0,0,0,0.5)" }}>
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className="flex items-center justify-center rounded-full transition"
            style={{ minWidth: 76, minHeight: 40, padding: "8px 16px", background: active ? "#fff" : "transparent", boxShadow: active ? "0 2px 6px rgba(0,0,0,0.25)" : "none" }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 700, color: active ? "#111" : "rgba(255,255,255,0.6)" }}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function MovieShareRatingCard({ userId, movieId, movieTitle, originalTitle, originalLanguage, movie, manual, backdropPath, username, onClose, onEdit }) {
  const [, setNavHidden] = useNavVisibility();
  useEffect(() => {
    setNavHidden(true);
    return () => setNavHidden(false);
  }, [setNavHidden]);

  const { user } = useAuth();
  const memberSinceYear = user?.created_at ? new Date(user.created_at).getFullYear() : null;

  const cardRef = useRef(null);
  const [imageType, setImageType] = useState(backdropPath ? "backdrop" : "poster");
  const [atmoRGB, setAtmoRGB] = useState([26, 22, 16]);
  const [reviewNumber, setReviewNumber] = useState(null);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState("");
  const [vw, setVw] = useState(390);
  const [vh, setVh] = useState(844);

  useEffect(() => {
    setVw(window.innerWidth);
    setVh(window.innerHeight);
    const onResize = () => { setVw(window.innerWidth); setVh(window.innerHeight); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const controlsRef = useRef(null);
  const [controlsH, setControlsH] = useState(300);
  useEffect(() => {
    if (!controlsRef.current) return;
    const measure = () => setControlsH(controlsRef.current.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(controlsRef.current);
    return () => ro.disconnect();
  }, []);

  // Movies have no "auto" concept — this card is only ever opened when a
  // real manual rating exists (see MovieRatingScreen's Share button,
  // gated on `manual`), so score reads straight off it.
  const score = manual.rating;
  const activeImagePath = imageType === "backdrop" ? (backdropPath ?? movie.posterPath) : movie.posterPath;
  // "SEASON 1"'s slot, repurposed for a movie's own year + runtime — same
  // fixed row, same styling, just a different single fact since a movie
  // has no season to name.
  const yearRuntimeLabel = `${movie.year ?? ""}${movie.runtime ? ` · ${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` : ""}`.trim();

  // Pulled straight from the user's own written review — never a
  // generated blurb. The length cap is just a safety net against an
  // oversized DOM text node; WebkitLineClamp below does the actual
  // visual truncation to 4 lines.
  const reviewQuote = (() => {
    const raw = (manual?.text || "").trim();
    if (!raw) return null;
    return raw.length > 240 ? `${raw.slice(0, 240).trim()}…` : raw;
  })();
  const RATING_ROW_H = reviewQuote ? RATING_ROW_H_QUOTE : RATING_ROW_H_COMPACT;
  const SEAM_Y = RATING_TOP + RATING_ROW_H + 90;
  const CARD_H = SEAM_Y + STUB_H;
  const EXPORT_H = CARD_H + CARD_MARGIN * 2;

  useEffect(() => {
    if (!activeImagePath) { setAtmoRGB([26, 22, 16]); return; }
    let cancelled = false;
    extractEdgeColor(tmdbImage(activeImagePath, "w300"))
      .then((rgb) => { if (!cancelled) setAtmoRGB(rgb); })
      .catch(() => { if (!cancelled) setAtmoRGB([26, 22, 16]); });
    return () => { cancelled = true; };
  }, [activeImagePath]);

  // Review number — this rating's position in the user's full MOVIE
  // rating history, oldest first (all manual, no auto-eligible concept to
  // merge in — unlike the show card's sequence, which merges manual +
  // auto-eligible seasons). Scoped to movies only, mirroring the show
  // card's own scoping (shows only, never movies) rather than the app's
  // separate unified "My Ratings" list.
  useEffect(() => {
    let cancelled = false;
    getAllMovieRatingsForUser(userId)
      .then((rows) => {
        if (cancelled) return;
        const sequence = [...rows].sort((a, b) => a.createdAt - b.createdAt);
        const idx = sequence.findIndex((r) => r.movieId === movieId);
        setReviewNumber(idx >= 0 ? idx + 1 : null);
      })
      .catch(() => { if (!cancelled) setReviewNumber(null); });
    return () => { cancelled = true; };
  }, [userId, movieId]);

  const flashToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 1800); };

  const waitForImages = async (root) => {
    const imgs = [...root.querySelectorAll("img")];
    await Promise.all(
      imgs.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve) => {
          const done = () => { img.removeEventListener("load", done); img.removeEventListener("error", done); resolve(); };
          img.addEventListener("load", done);
          img.addEventListener("error", done);
          setTimeout(done, 8000);
        });
      })
    );
  };

  const inlineImagesAsDataUrls = async (root) => {
    const imgs = [...root.querySelectorAll("img")];
    const restores = [];
    await Promise.all(
      imgs.map(async (img) => {
        const effectiveSrc = img.currentSrc || img.src;
        if (!effectiveSrc || effectiveSrc.startsWith("data:")) return;
        try {
          const blob = await fetch(effectiveSrc).then((r) => r.blob());
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          restores.push([img, img.getAttribute("src"), img.getAttribute("srcset")]);
          img.removeAttribute("srcset");
          img.src = dataUrl;
        } catch (err) {
          console.error("Couldn't inline image for export:", err);
        }
      })
    );
    return () => {
      restores.forEach(([img, src, srcset]) => {
        if (srcset != null) img.setAttribute("srcset", srcset);
        if (src != null) img.setAttribute("src", src);
      });
    };
  };

  const renderCardPng = async () => {
    const { toPng } = await import("html-to-image");
    if (document.fonts?.ready) await document.fonts.ready;
    await waitForImages(cardRef.current);
    const restoreImages = await inlineImagesAsDataUrls(cardRef.current);
    try {
      return await toPng(cardRef.current, { width: EXPORT_W, height: EXPORT_H, pixelRatio: 1, backgroundColor: "#000" });
    } finally {
      restoreImages();
    }
  };

  const handleNativeShare = async () => {
    setBusy("native");
    try {
      const dataUrl = await renderCardPng();
      const shareText = `${movieTitle}: ${score.toFixed(1)}/10 on Cinext`;
      if (navigator.canShare) {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], "cinext-rating.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: movieTitle, text: shareText });
          return;
        }
      }
      if (navigator.share) {
        const shareId = await ensureMovieShareId(userId, movieId);
        await navigator.share({ title: movieTitle, text: shareText, url: `${window.location.origin}/s/${shareId}` });
      } else {
        await handleSaveImage();
      }
    } catch (err) {
      if (err?.name !== "AbortError") { console.error(err); flashToast("Couldn't share — try Save Image instead."); }
    } finally {
      setBusy(null);
    }
  };

  const handleSaveImage = async () => {
    setBusy("save");
    try {
      const dataUrl = await renderCardPng();
      if (navigator.canShare) {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], "cinext-rating.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          return;
        }
      }
      const link = document.createElement("a");
      link.download = `cinext-${movieTitle.replace(/\s+/g, "-").toLowerCase()}-movie.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      if (err?.name !== "AbortError") { console.error(err); flashToast("Couldn't save the image."); }
    } finally {
      setBusy(null);
    }
  };

  const showOriginal = !!(
    originalTitle &&
    originalLanguage &&
    originalLanguage !== "en" &&
    originalTitle.trim().toLowerCase() !== (movieTitle || "").trim().toLowerCase()
  );

  const readableLanguages = useReadableLanguages();
  const [titleLogoPath, setTitleLogoPath] = useState(null);
  const [titleLogoFailed, setTitleLogoFailed] = useState(false);
  useEffect(() => {
    setTitleLogoFailed(false);
    let cancelled = false;
    fetch("/api/movies/logos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [movieId], readableLanguages }),
    })
      .then((res) => res.json())
      .then(({ results }) => { if (!cancelled) setTitleLogoPath(results?.[0]?.logoPath ?? null); })
      .catch(() => { if (!cancelled) setTitleLogoPath(null); });
    return () => { cancelled = true; };
  }, [movieId, readableLanguages]);
  const titleLogoUrl = !titleLogoFailed && titleLogoPath ? tmdbImage(titleLogoPath, "w500") : null;

  // Redesigned preview hierarchy — card first, everything else lightweight
  // and secondary. Same values as ShareRatingCard.jsx's own identical
  // constants, kept in sync since these two are meant to look like the
  // same physical card — see that file's own comment for the full
  // reasoning (Edit moved to a header corner icon, "Back" text button
  // removed, both previously ate into controlsH and silently capped the
  // card's real on-screen size via heightScale even though modalW's own
  // width target was already close to 80vw).
  const WIDTH_FRACTION = 0.84;
  const MODAL_MAX_W = 480;
  const modalW = Math.min(vw * WIDTH_FRACTION, MODAL_MAX_W);
  const HEADER_H = 74;
  const GROUP_GAP = 14;
  const MODAL_VPAD = 24;
  const widthScale = modalW / EXPORT_W;
  const availableH = vh - HEADER_H - MODAL_VPAD - GROUP_GAP - controlsH;
  const heightScale = availableH > 0 ? availableH / EXPORT_H : widthScale;
  const previewScale = Math.max(0.15, Math.min(1, widthScale, heightScale));
  const controlsW = EXPORT_W * previewScale;
  const shareW = Math.min(vw * 0.58, 280);
  const reviewNumberLabel = reviewNumber != null ? String(reviewNumber).padStart(5, "0") : null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center"
      style={{
        background: "rgba(0,0,0,0.92)",
        minHeight: "100dvh",
        overflowY: "auto",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 62px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
      }}
      onClick={onClose}
    >
      {/* Header — X close (left) / Edit pencil (right), fixed to the
          screen's own top corners rather than living in the button stack
          below the card. */}
      <div
        className="fixed left-0 right-0 flex items-center justify-between"
        style={{ top: 0, padding: "calc(env(safe-area-inset-top, 0px) + 12px) 20px 0", zIndex: 2 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="flex items-center justify-center rounded-full active:scale-95 transition" style={{ width: 38, height: 38, background: t.cardFill, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
          <Icon name="x" size={16} color="#fff" />
        </button>
        <button onClick={onEdit} className="flex items-center justify-center rounded-full active:scale-95 transition" style={{ width: 38, height: 38, background: t.cardFill, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
          <Icon name="edit" size={15} color="#fff" />
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }} onClick={(e) => e.stopPropagation()}>
      <div style={{ width: EXPORT_W * previewScale, height: EXPORT_H * previewScale }}>
        <div style={{ width: EXPORT_W, height: EXPORT_H, transform: `scale(${previewScale})`, transformOrigin: "top left" }}>
          <div ref={cardRef} style={{ position: "relative", width: EXPORT_W, height: EXPORT_H, background: "#000" }}>
            <div
              className="absolute overflow-hidden"
              style={{
                left: CARD_MARGIN, top: CARD_MARGIN, width: CARD_W, height: CARD_H, borderRadius: CARD_RADIUS,
                boxShadow: `0 40px 90px rgba(0,0,0,0.55), 0 0 84px 6px rgba(${atmoRGB.join(",")},0.22), inset 0 0 0 1px rgba(232,162,76,0.26), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 40px rgba(232,162,76,0.12)`,
              }}
            >
              <div className="absolute inset-0" style={{ height: SEAM_Y }}>
                <div className="absolute inset-0" style={{ filter: "saturate(1.18) contrast(1.06) brightness(0.98)" }}>
                  <PosterArt posterPath={activeImagePath} base={movie.base} glow={movie.glow} alt={movieTitle} tmdbSize="w780" />
                </div>
                <Grain />

                <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 70% 36% at 50% 0%, rgba(${atmoRGB.join(",")},0.38), transparent 62%)` }} />
                <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 85% 55% at 28% 86%, rgba(232,162,76,0.38), transparent 62%)" }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 0%, transparent 34%, rgba(0,0,0,0.10) 50%, rgba(0,0,0,0.22) 62%, rgba(0,0,0,0.42) 76%, rgba(0,0,0,0.68) 90%, rgba(0,0,0,0.86) 100%)" }} />
                <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 130% 95% at 50% 46%, transparent 55%, rgba(0,0,0,0.34) 100%)" }} />
                <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 100% 46% at 50% 100%, rgba(232,162,76,0.30), rgba(180,110,50,0.16) 55%, transparent 80%)" }} />
                <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 30% at 30% 82%, rgba(255,196,120,0.20), transparent 70%)" }} />

                <div className="absolute top-0 left-0 right-0 flex items-center justify-between" style={{ padding: `52px ${PAD_X}px 0` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local static asset */}
                  <img src="/text/logo.png" alt="CINEXT" style={{ height: 38, width: "auto", objectFit: "contain" }} />
                  {/* eslint-disable-next-line @next/next/no-img-element -- local static asset */}
                  <img src="/cinext-mark.png" alt="" style={{ width: 77, height: 77, objectFit: "contain", marginRight: -8 }} />
                </div>

                {titleLogoUrl ? (
                  <div className="absolute flex items-end" style={{ top: TITLE_TOP, left: PAD_X, right: PAD_X, height: TITLE_BLOCK_H }}>
                    <div className="relative" style={{ width: "100%", height: "100%" }}>
                      <Image
                        src={titleLogoUrl}
                        alt={showOriginal ? originalTitle : movieTitle}
                        fill
                        sizes="500px"
                        onError={() => setTitleLogoFailed(true)}
                        style={{ objectFit: "contain", objectPosition: "left bottom", maxWidth: "50%", filter: "drop-shadow(0 2px 12px rgba(0,0,0,0.65))" }}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="absolute" style={{ top: TITLE_TOP, left: PAD_X, right: PAD_X, height: PRIMARY_TITLE_H, ...CLAMP_1_LINE }}>
                      <span style={{ fontSize: TYPE.primaryTitle.size, fontWeight: TYPE.primaryTitle.weight, color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,0.65)" }}>{showOriginal ? originalTitle : movieTitle}</span>
                    </div>
                    <div className="absolute" style={{ top: ENGLISH_TOP, left: PAD_X, right: PAD_X, height: ENGLISH_TITLE_H, ...CLAMP_1_LINE }}>
                      {showOriginal && (
                        <span style={{ fontSize: TYPE.englishTitle.size, fontWeight: TYPE.englishTitle.weight, color: "rgba(255,255,255,0.85)", textShadow: "0 2px 10px rgba(0,0,0,0.6)" }}>{movieTitle}</span>
                      )}
                    </div>
                  </>
                )}
                <div className="absolute" style={{ top: SEASON_TOP, left: PAD_X, right: PAD_X, height: SEASON_H, ...CLAMP_1_LINE }}>
                  {yearRuntimeLabel && (
                    <span style={{ fontSize: TYPE.season.size, fontWeight: TYPE.season.weight, letterSpacing: TYPE.season.tracking, color: "rgba(255,255,255,0.88)", textShadow: "0 1px 8px rgba(0,0,0,0.75)" }}>{yearRuntimeLabel.toUpperCase()}</span>
                  )}
                </div>
                <div className="absolute flex" style={{ top: RATING_TOP, left: PAD_X, right: PAD_X, height: RATING_ROW_H, alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div className="flex items-end flex-shrink-0" style={{ gap: 10 }}>
                    <Icon name="star" size={49} color={accent} />
                    <span style={{ fontSize: TYPE.ratingNumber.size, fontWeight: TYPE.ratingNumber.weight, color: "#fff", lineHeight: 1, textShadow: "0 2px 10px rgba(0,0,0,0.6)" }}>{score.toFixed(1)}</span>
                    <span style={{ fontSize: TYPE.ratingSuffix.size, fontWeight: TYPE.ratingSuffix.weight, color: "rgba(255,255,255,0.6)", marginBottom: 8, textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>/10</span>
                  </div>

                  {reviewQuote && (
                    <div style={{ flex: 1, maxWidth: 430, marginLeft: 40, paddingLeft: 28, borderLeft: "1.5px solid rgba(255,255,255,0.16)" }}>
                      <Icon name="quote" size={22} color={accent} />
                      <div
                        style={{
                          marginTop: 10,
                          fontSize: TYPE.quote.size,
                          fontWeight: TYPE.quote.weight,
                          lineHeight: 1.42,
                          color: "rgba(255,255,255,0.76)",
                          textShadow: "0 1px 6px rgba(0,0,0,0.5)",
                          display: "-webkit-box",
                          WebkitLineClamp: 4,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {reviewQuote}
                      </div>
                    </div>
                  )}
                </div>

              </div>

              <div className="absolute left-0 right-0" style={{ top: SEAM_Y, height: STUB_H, background: "#D4BC99" }}>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(165deg, rgba(255,255,255,0.25) 0%, transparent 40%, rgba(0,0,0,0.05) 100%)" }} />
                <Grain />
                <div className="absolute flex items-center" style={{ inset: 0, padding: `0 ${PAD_X}px` }}>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: TYPE.username.size, fontWeight: TYPE.username.weight, color: "#1a1512" }}>@{username}</div>
                    <div style={{ fontSize: TYPE.profileSubtitle.size, fontWeight: TYPE.profileSubtitle.weight, color: "rgba(26,21,18,0.55)", marginTop: 5 }}>
                      {memberSinceYear != null ? `Tracking since ${memberSinceYear}` : ""}
                    </div>
                  </div>
                  <div style={{ width: 1.5, height: 88, background: "rgba(26,21,18,0.22)" }} />
                  <div style={{ paddingLeft: 32 }}>
                    <div style={{ fontSize: TYPE.reviewNoLabel.size, fontWeight: TYPE.reviewNoLabel.weight, letterSpacing: "0.12em", color: "rgba(26,21,18,0.55)" }}>REVIEW NO.</div>
                    <div style={{ fontSize: TYPE.reviewNoValue.size, fontWeight: TYPE.reviewNoValue.weight, color: "#1a1512", marginTop: 4, minHeight: TYPE.reviewNoValue.size * 1.2 }}>{reviewNumberLabel}</div>
                  </div>
                </div>
              </div>

              <div className="absolute flex justify-between" style={{ top: SEAM_Y - PERFORATION_DOT / 2, left: 83, right: 83 }}>
                {PERFORATION_DOTS.map((_, i) => (
                  <span key={i} style={{ width: PERFORATION_DOT, height: PERFORATION_DOT, borderRadius: "50%", background: "rgba(120,100,70,0.55)" }} />
                ))}
              </div>

              <div className="absolute rounded-full" style={{ left: NOTCH_SHIFT, top: SEAM_Y - NOTCH_H / 2, width: NOTCH_W, height: NOTCH_H, background: "#000", boxShadow: "inset 0 3px 8px rgba(0,0,0,0.55)" }} />
              <div className="absolute rounded-full" style={{ right: NOTCH_SHIFT, top: SEAM_Y - NOTCH_H / 2, width: NOTCH_W, height: NOTCH_H, background: "#000", boxShadow: "inset 0 3px 8px rgba(0,0,0,0.55)" }} />
            </div>
          </div>
        </div>
      </div>

      <div ref={controlsRef} style={{ width: controlsW, marginTop: GROUP_GAP }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center">
          <Segmented
            value={imageType}
            onChange={setImageType}
            options={[{ id: "poster", label: "Poster" }, { id: "backdrop", label: "Backdrop" }]}
          />
        </div>

        <div className="flex items-center justify-center" style={{ marginTop: 16 }}>
          <button onClick={handleNativeShare} disabled={busy != null} className="flex items-center justify-center rounded-full active:scale-95 transition" style={{ width: shareW, minHeight: 56, gap: 10, whiteSpace: "nowrap", background: `${accent}14`, border: `1.5px solid ${accent}`, boxShadow: `0 0 16px ${accent}1f`, opacity: busy ? 0.7 : 1 }}>
            <Icon name="share" size={14} color={accent} />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: accent }}>{busy === "native" ? "Sharing…" : "Share"}</span>
          </button>
        </div>
      </div>
      </div>

      {toast && (
        <div className="fixed flex items-center justify-center rounded-full" style={{ bottom: 100, left: "50%", transform: "translateX(-50%)", padding: "10px 18px", background: "rgba(28,22,16,0.95)", border: `1px solid ${t.glassBorder}`, zIndex: 60 }} onClick={(e) => e.stopPropagation()}>
          <span style={{ fontSize: 12.5, color: "#fff", fontWeight: 600 }}>{toast}</span>
        </div>
      )}
    </div>
  );
}
