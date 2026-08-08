"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Icon from "@/components/ui/Icon";
import Grain from "@/components/ui/Grain";
import PosterArt from "@/components/ui/PosterArt";
import { ensureShareId, getAllSeasonRatingsForUser } from "@/lib/seasonRatings";
import { getRatedEpisodesAcrossShows } from "@/lib/episodeWatches";
import { tmdbImage } from "@/lib/tmdb";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";
import { useNavVisibility } from "@/lib/nav-visibility-context";
import { useAuth } from "@/lib/auth-context";
import { useReadableLanguages } from "@/lib/languages";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// ---------------------------------------------------------------------------
// Fixed export canvas — a real "collectible ticket" size (Instagram's own
// 4:5 portrait feed ratio, which Stories/X/messaging all accept fine too),
// not the viewport's own width. The on-screen preview scales this DOWN via
// a wrapper transform (see previewScale below); cardRef itself always
// keeps its native 1080x1350 layout box, so html-to-image always captures
// full, sharp resolution regardless of what the preview looks like.
// ---------------------------------------------------------------------------
const EXPORT_W = 1080;
const CARD_MARGIN = 70;
// Latest design pass (cinext_share_season_rating_card_mockup.html) — its
// own values are drawn at a 340px-wide mockup card; scaled by
// CARD_W(940)/340 = 2.7647 to land at the same proportions on our actual
// 1080-wide export canvas rather than copying its raw px values verbatim.
const CARD_RADIUS = 94; // mockup: 34px
const STUB_H = 326; // mockup: 118px — shortened, artwork now dominates the card
const NOTCH_W = 116; // mockup: 42px — an oval, not a circle
const NOTCH_H = 133; // mockup: 48px
const NOTCH_SHIFT = -44; // mockup: -16px — biting deeper into the card than a simple half-hidden circle
const PAD_X = 72; // mockup: .card-copy's 26px left/right (was 66)

// ---------------------------------------------------------------------------
// Fixed typography scale + vertical rhythm — the whole point of this pass:
// every exported card uses the SAME sizes and the SAME absolute Y position
// for every element, regardless of the show. A longer title clamps
// (nowrap + ellipsis), it never shrinks the font or shifts anything below
// it; a missing piece of content (no original-language title, no review,
// no review number) leaves its own slot blank rather than collapsing the
// space, so nothing downstream ever moves. Only the artwork itself and the
// actual text VALUES change between cards — never the layout.
//
// wordmark/primaryTitle/englishTitle/season/ratingNumber are ported
// directly from the mockup's own .brand-word/.title-kr/.title-en/.season/
// .rating .score font-sizes (16/34/16/11/27px), scaled by the same
// 2.7647 (CARD_W/340) factor as every other mockup value in this file —
// they'd previously been tuned by hand to smaller values across earlier
// rounds, which is why text read smaller than the mockup even once the
// preview's own scale was fixed (see modalW below): the canvas-space
// font sizes themselves weren't proportioned to the mockup to begin with.
// Everything not listed in the mockup's CSS (ratingSuffix/review/
// username/reviewNo*) is unchanged from prior rounds.
const TYPE = {
  primaryTitle: { size: 108, weight: 700 }, // was 94 (+15%)
  englishTitle: { size: 44, weight: 500 }, // mockup: 16px
  season: { size: 33, weight: 600, tracking: "0.22em" }, // was 30 (+10%)
  ratingNumber: { size: 75, weight: 800 }, // mockup: 27px
  // "/10" — matched to ratingNumber's own 75 first, then immediately
  // called too big and cut in half (38, ~half of 75).
  ratingSuffix: { size: 38, weight: 400 },
  // Stub text (username/"Tracking since"/REVIEW NO. label+value) — grown
  // across three rounds of "still too small" feedback: username +20%
  // again (25->30->36), "Tracking since" +25% more (26->33). "REVIEW NO."
  // label switches from bold to a lighter/medium weight this round rather
  // than growing further (500, was 700) — reviewNoValue (the "00042"
  // itself) wasn't called out and stays put.
  username: { size: 36, weight: 800 },
  profileSubtitle: { size: 33, weight: 500 },
  reviewNoLabel: { size: 28, weight: 500 }, // was 23 (+20%)
  reviewNoValue: { size: 38, weight: 800 },
};

// Fixed row heights + the exact gaps from the spec's own "Consistent
// spacing" list — every row's top is computed once from these, never from
// how tall the row above it actually rendered. TITLE_TOP moved down (more
// breathing room above the title, taller artwork section overall) and the
// row heights grew to match the larger typography above.
//
// The three title-block gaps below (28/22/50) are ported from the mockup's
// own .title-kr/.title-en/.season margin-bottom (10px/8px/18px), scaled by
// the same 2.7647 factor as everything else in this pass — they replace
// the previous 8/16/20 values, which read as cramped against the mockup's
// vertical rhythm. The rating→review gap (20) is unrelated to this pass
// and stays as-is.
//
// Row heights grew again to match the bigger mockup-ported font sizes
// above (same height/font-size ratio each row already used). TITLE_TOP
// moved down across earlier rounds of "still too high" feedback —
// 741 -> 852 (+15%) -> 997 — then back up 15% to 847 per explicit "move
// the whole title/season/rating block up" feedback. SEAM_Y (below) is
// still directly derived from this cascade, not held fixed separately,
// so the card gets correspondingly shorter along with it rather than
// leaving dead space behind.
const TITLE_TOP = 847;
const PRIMARY_TITLE_H = 143; // was 124, grown to match primaryTitle's own +15%
const ENGLISH_TITLE_H = 62;
const SEASON_H = 50; // was 45, grown to match season's own +10%
const RATING_ROW_H = 86;

const ENGLISH_TOP = TITLE_TOP + PRIMARY_TITLE_H + 28; // mockup .title-kr margin-bottom: 10px
const SEASON_TOP = ENGLISH_TOP + ENGLISH_TITLE_H + 22; // mockup .title-en margin-bottom: 8px
// Combined footprint of both title lines together — the title-logo image
// (when one exists) fills this whole box instead of the two separate
// text slots, so it can be one taller image rather than two cramped rows.
const TITLE_BLOCK_H = ENGLISH_TOP + ENGLISH_TITLE_H - TITLE_TOP;
const RATING_TOP = SEASON_TOP + SEASON_H + 20; // was +50 — sat too far below "SEASON 1", tightened per explicit feedback
// SEAM_Y (artwork height) — the gap between the rating row's own bottom
// edge and the seam was 40, but the ticket notch (NOTCH_H=133) is
// VERTICALLY CENTERED on the seam, so its own top edge actually reaches
// NOTCH_H/2 (~66.5) above the seam line — a 40px gap left the notch
// visually overlapping into the rating row's own space, reported as "the
// rating shouldn't sit between the notch area." 90 clears that (66.5)
// with real breathing room on top of it, not just barely.
const SEAM_Y = RATING_TOP + RATING_ROW_H + 90;
const CARD_H = SEAM_Y + STUB_H;
const EXPORT_H = CARD_H + CARD_MARGIN * 2;
const CARD_W = EXPORT_W - CARD_MARGIN * 2;

// Perforation dots — mockup: 2.5px circles, 32 of them spread via
// space-between across a fixed inset. PERFORATION_DOTS is just a
// fixed-length array to map over; its own values are unused.
const PERFORATION_DOT = 7; // mockup: 2.5px
const PERFORATION_DOTS = Array.from({ length: 32 });

// Clamps a single line to a fixed box instead of ever shrinking/wrapping —
// "do not shrink fonts because a title is longer, clamp instead."
const CLAMP_1_LINE = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

// Same canvas-sampling technique already established in Home/
// SeasonRatingScreen — flat dominant-color average, not a literal
// mirrored copy of the artwork (which reads as a visible "blob" on
// graphically bold posters). Used here for the subtle glow + the bottom
// stub's own tint, per the brief's "extract or approximate a dominant
// colour... use it subtly in the glow, gradient, and bottom stub."
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
    // Compact: less horizontal padding per segment than before (20 -> 16),
    // and every segment shares one minWidth (sized to the longest label,
    // "Backdrop") so "Poster"/"Backdrop" read as equal-width tabs instead
    // of each hugging its own shorter/longer text — the container itself
    // still only auto-sizes to that shared width, not stretched wider.
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

// The shareable ticket card (opened from Profile's "My Ratings" row or
// Show Detail's share button) + real share sheet: native share with the
// rendered card image where supported, and an always-visible Save Image
// button. The dedicated "Copy Link" button was removed per explicit
// request; the public /s/[shareId] page it used to front-door still
// exists and is still reachable via handleNativeShare's own URL fallback
// (browsers whose Web Share API can't take files but can take a URL),
// so ensureShareId is still needed here even without that button.
export default function ShareRatingCard({ userId, showId, showTitle, originalTitle, originalLanguage, season, manual, auto, backdropPath, username, onClose, onEdit }) {
  const [, setNavHidden] = useNavVisibility();
  useEffect(() => {
    setNavHidden(true);
    return () => setNavHidden(false);
  }, [setNavHidden]);

  // Footer subtitle ("Tracking since {year}") — the signed-in user's real
  // account creation year (Supabase Auth's own created_at on the session
  // user, not a hardcoded/placeholder value like the mockup's "2016").
  // This card is always opened by the account it belongs to, so useAuth()
  // here always resolves to the same person `userId` refers to.
  const { user } = useAuth();
  const memberSinceYear = user?.created_at ? new Date(user.created_at).getFullYear() : null;

  const cardRef = useRef(null);
  const [imageType, setImageType] = useState(backdropPath ? "backdrop" : "poster"); // "poster" | "backdrop" — backdrop preferred, per the brief, when one exists
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

  // Real measured height of the controls block (Poster/Backdrop + Edit +
  // Save Image/Share + Back) — it renders at a fixed, unscaled
  // size regardless of the card's own previewScale, so "does the whole
  // group fit on screen" has to account for its actual height rather than
  // a guessed constant. Falls back to a reasonable estimate before the
  // first real measurement lands.
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

  const score = manual ? manual.rating : auto?.avg10 ?? 0;
  const activeImagePath = imageType === "backdrop" ? (backdropPath ?? season.posterPath) : season.posterPath;

  useEffect(() => {
    if (!activeImagePath) { setAtmoRGB([26, 22, 16]); return; }
    let cancelled = false;
    extractEdgeColor(tmdbImage(activeImagePath, "w300"))
      .then((rgb) => { if (!cancelled) setAtmoRGB(rgb); })
      .catch(() => { if (!cancelled) setAtmoRGB([26, 22, 16]); });
    return () => { cancelled = true; };
  }, [activeImagePath]);

  // Review number is this rating's position in the user's FULL rating
  // history, oldest first — every manual season_ratings row plus every
  // auto-eligible season (fully watched+rated, not just partially — same
  // rule Profile's My Ratings row uses), merged into one chronological
  // sequence. Previously this only counted manual rows, so any
  // auto-computed card (no season_ratings row of its own) permanently
  // showed a blank REVIEW NO. — not a rendering bug, but not what a
  // "collector ticket" number should do either: every card that's
  // actually eligible to be shared gets a real position in the sequence.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [manualRows, autoRows] = await Promise.all([
        getAllSeasonRatingsForUser(userId),
        getRatedEpisodesAcrossShows(userId),
      ]);
      if (cancelled) return;

      const manualKeys = new Set(manualRows.map((r) => `${r.showId}-${r.seasonNumber}`));
      const autoCandidates = autoRows.filter((r) => !manualKeys.has(`${r.showId}-${r.seasonNumber}`));

      let autoEligible = [];
      if (autoCandidates.length > 0) {
        const res = await fetch("/api/shows/season-episode-counts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seasons: autoCandidates.map((r) => ({ showId: r.showId, seasonNumber: r.seasonNumber })) }),
        });
        const { results } = await res.json();
        if (cancelled) return;
        const totalByKey = Object.fromEntries(results.map((x) => [`${x.showId}-${x.seasonNumber}`, x.totalEpisodes]));
        autoEligible = autoCandidates.filter((r) => {
          const total = totalByKey[`${r.showId}-${r.seasonNumber}`];
          return total != null && r.ratedCount === total;
        });
      }

      const sequence = [
        ...manualRows.map((r) => ({ showId: r.showId, seasonNumber: r.seasonNumber, at: r.createdAt })),
        ...autoEligible.map((r) => ({ showId: r.showId, seasonNumber: r.seasonNumber, at: r.lastRatedAt })),
      ].sort((a, b) => a.at - b.at);

      const idx = sequence.findIndex((r) => r.showId === showId && r.seasonNumber === season.seasonNumber);
      setReviewNumber(idx >= 0 ? idx + 1 : null);
    })().catch(() => { if (!cancelled) setReviewNumber(null); });
    return () => { cancelled = true; };
  }, [userId, showId, season.seasonNumber]);

  const flashToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 1800); };

  // Vercel's image optimizer (/_next/image, which PosterArt/the title logo
  // route through) is cold-started per unique image — the first request for
  // a given poster/backdrop can take several real seconds, not the
  // near-instant response local dev always has. Waits for every <img>
  // inside the card to actually finish decoding (or its own onerror, or an
  // 8s safety timeout so one stuck image can't hang the export forever)
  // before capturing.
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

  // Waiting for the browser's own <img> to load (above) turned out not to
  // be enough on its own: next/image renders BOTH `src` and a `srcset`,
  // and the browser picks whichever srcset candidate it actually needs —
  // which is very often a DIFFERENT URL than the plain `src` attribute.
  // html-to-image's own embedder only ever looks at `.src` (see
  // node_modules/html-to-image/lib/embed-images.js), so it was issuing
  // its OWN separate fetch for a URL the browser may never have actually
  // requested — a second cold Vercel image-optimizer hit, independent of
  // the one waitForImages above already warmed up. Worse, that embedder
  // swallows any fetch failure and silently substitutes a blank
  // placeholder (html-to-image/lib/dataurl.js's resourceToDataURL catch
  // block) — no error, no exception, just an empty image baked into the
  // export. Pre-resolving each <img>'s actual `currentSrc` (the real,
  // browser-chosen URL, already warm in cache from waitForImages above)
  // to a data: URL ourselves and swapping it in sidesteps html-to-image's
  // embedder entirely: it explicitly skips re-fetching anything whose
  // `src` is already a data: URL. Restored after capture so the live
  // on-screen card (and a second Share/Save in the same session) keeps
  // using the real next/image element, not a frozen snapshot.
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
          // Leave this one img alone — toPng will fall through to
          // html-to-image's own (best-effort) fetch for it.
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
    // Waiting for fonts before capturing — without this, the export could
    // grab a frame with a system-font fallback instead of the real one.
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
      const shareText = `${showTitle} — ${season.title}: ${score.toFixed(1)}/10 on Cinext`;
      if (navigator.canShare) {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], "cinext-rating.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: showTitle, text: shareText });
          return;
        }
      }
      if (navigator.share) {
        const shareId = await ensureShareId(userId, showId, season.seasonNumber);
        await navigator.share({ title: showTitle, text: shareText, url: `${window.location.origin}/s/${shareId}` });
      } else {
        // Web Share API unsupported — fall back to a direct download,
        // per the brief ("Otherwise, download the generated PNG").
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
      link.download = `cinext-${showTitle.replace(/\s+/g, "-").toLowerCase()}-${season.seasonNumber}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      if (err?.name !== "AbortError") { console.error(err); flashToast("Couldn't save the image."); }
    } finally {
      setBusy(null);
    }
  };

  // Show the original-language title above the English one only when
  // they're genuinely different (a real international show) — not for
  // shows whose "original" title already IS the English one.
  const showOriginal = !!(
    originalTitle &&
    originalLanguage &&
    originalLanguage !== "en" &&
    originalTitle.trim().toLowerCase() !== (showTitle || "").trim().toLowerCase()
  );

  // Title logo art — the two plain-text title lines are replaced by the
  // show's real TMDB logo wordmark when one exists, same /api/shows/logos
  // + pickBestLogo pattern (matched to Readable Languages) Show Detail's
  // own auto title logo already uses. Plain text is only the fallback for
  // shows TMDB has no logo art for, or where the image fails to load —
  // never removed outright, just no longer the default.
  const readableLanguages = useReadableLanguages();
  const [titleLogoPath, setTitleLogoPath] = useState(null);
  const [titleLogoFailed, setTitleLogoFailed] = useState(false);
  useEffect(() => {
    setTitleLogoFailed(false);
    let cancelled = false;
    fetch("/api/shows/logos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [showId], readableLanguages }),
    })
      .then((res) => res.json())
      .then(({ results }) => { if (!cancelled) setTitleLogoPath(results?.[0]?.logoPath ?? null); })
      .catch(() => { if (!cancelled) setTitleLogoPath(null); });
    return () => { cancelled = true; };
  }, [showId, readableLanguages]);
  const titleLogoUrl = !titleLogoFailed && titleLogoPath ? tmdbImage(titleLogoPath, "w500") : null;

  // ---------------------------------------------------------------------
  // Redesigned preview hierarchy — card first, everything else lightweight
  // and secondary (per explicit "make the card the main focus" request).
  // Edit moved out of the button stack entirely (now a compact corner
  // icon, see the header row below) and the "Back" text button removed
  // (the new X close icon replaces it) — both were previously counted in
  // controlsH, silently shrinking the card via heightScale below even
  // though modalW's own width target was already close to 80vw. Removing
  // them is what actually lets the card reach its full targeted width on
  // a normal phone screen, not just a bigger width fraction on paper.
  // ---------------------------------------------------------------------
  const WIDTH_FRACTION = 0.84; // 80-85% of screen width, per explicit spec
  const MODAL_MAX_W = 480; // sensible desktop/tablet cap — irrelevant on a real phone, where WIDTH_FRACTION * vw is always the binding constraint
  const modalW = Math.min(vw * WIDTH_FRACTION, MODAL_MAX_W);
  // HEADER_H clears the fixed X/Edit corner row (see the header row
  // below) out of the available vertical space, same reasoning MODAL_VPAD
  // already applied to bottom safe-area clearance.
  const HEADER_H = 74;
  const GROUP_GAP = 14; // card -> controls (Segmented + Share) — controls are lightweight now, this can breathe a little more than the old 5px squeeze
  const MODAL_VPAD = 24;
  const widthScale = modalW / EXPORT_W;
  const availableH = vh - HEADER_H - MODAL_VPAD - GROUP_GAP - controlsH;
  const heightScale = availableH > 0 ? availableH / EXPORT_H : widthScale;
  const previewScale = Math.max(0.15, Math.min(1, widthScale, heightScale));
  // Controls render at exactly the card's own final on-screen width
  // (EXPORT_W * previewScale — already <= modalW by construction, since
  // previewScale itself is capped by widthScale = modalW / EXPORT_W) even
  // though the controls themselves are never inside the scaled card
  // wrapper. This is what actually keeps them visually locked to the
  // card instead of an independent fixed-width cap.
  const controlsW = EXPORT_W * previewScale;
  // Share's own width is a SCREEN-width fraction (55-60vw), not a
  // controlsW fraction — controlsW now tracks the card's own ~80-85vw
  // width, and Share reading at "55-60% of THAT" would land well past the
  // spec's actual intent (55-60% of the SCREEN). Capped so it never
  // balloons on a wide viewport.
  const shareW = Math.min(vw * 0.58, 280);
  const reviewNumberLabel = reviewNumber != null ? String(reviewNumber).padStart(5, "0") : null;

  return (
    // Top-aligned (not centered) — align-items:center handles the
    // horizontal axis only, so with no justify-content the flex column
    // starts right at paddingTop instead of splitting leftover space
    // above and below the group. That's what actually fixes "sits too
    // low" — the old approach centered the group first and then applied
    // an extra downward translateY on top of that, which read as "too
    // low, touching the top edge" once the group itself got taller.
    // min-height:100dvh (not 100vh) + env(safe-area-inset-*) so this
    // still clears the notch/home-indicator/status-bar on a real device
    // instead of a bare fixed-inset-0 box that doesn't know about them.
    // overflowY:auto stays only as a last-resort safety net for extreme
    // viewports where even previewScale's 0.15 floor can't make
    // everything fit — it should never actually engage on a normal phone.
    <div
      className="fixed inset-0 z-50 flex flex-col items-center"
      style={{
        background: "rgba(0,0,0,0.92)",
        minHeight: "100dvh",
        overflowY: "auto",
        // Real layout clearance includes the actual safe-area-inset-top;
        // HEADER_H above is a plain JS constant used only to approximate
        // this same space for the previewScale math (no way to read a CSS
        // env() value from JS) — same "safe-area is bonus slack on top of
        // the JS estimate" reasoning MODAL_VPAD already relies on.
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 62px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
      }}
      onClick={onClose}
    >
      {/* Header — X close (left) / Edit pencil (right), fixed to the
          screen's own top corners rather than living in the button stack
          below the card. Same glass-circle treatment used everywhere else
          in this app (Show/Movie Detail's own back/more buttons). */}
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

      {/* Card + controls live inside one wrapper so they stay a single
          visual group. width:100% (matching the outer fixed container)
          keeps the controls' own sizing decoupled from the card's width
          — without it, this div shrink-wraps to its widest child (the
          card), which quietly resizes the button row too whenever the
          card's own width changed. */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }} onClick={(e) => e.stopPropagation()}>
      {/* Outer wrapper is sized to the SHRUNK preview footprint so it
          doesn't reserve the full 1080x1350 of empty layout space; the
          scale transform lives on the child, leaving cardRef's own box
          untouched at native size for export. */}
      <div style={{ width: EXPORT_W * previewScale, height: EXPORT_H * previewScale }}>
        <div style={{ width: EXPORT_W, height: EXPORT_H, transform: `scale(${previewScale})`, transformOrigin: "top left" }}>
          <div ref={cardRef} style={{ position: "relative", width: EXPORT_W, height: EXPORT_H, background: "#000" }}>
            {/* ---------------- The ticket card itself ---------------- */}
            {/* Outer ticket glow: a soft warm drop-shadow well outside the
                card (reads as ambient light bouncing off it) plus an inset
                warm hairline + a faint white inset highlight along the top
                edge — restrained, not neon. */}
            <div
              className="absolute overflow-hidden"
              style={{
                left: CARD_MARGIN, top: CARD_MARGIN, width: CARD_W, height: CARD_H, borderRadius: CARD_RADIUS,
                // Premium edge lighting pass: the warm hairline + amber rim
                // glow both nudged up slightly, plus a soft wide inset bloom
                // (the 40px blur term) so the border reads as gently lit
                // rather than a flat outline — still restrained, no neon.
                // Outer ambient glow + inset bloom both boosted a bit more
                // per explicit "add more glow" feedback (16% -> 22% opacity,
                // 70px -> 84px spread; inset bloom 8% -> 12%).
                boxShadow: `0 40px 90px rgba(0,0,0,0.55), 0 0 84px 6px rgba(${atmoRGB.join(",")},0.22), inset 0 0 0 1px rgba(232,162,76,0.26), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 40px rgba(232,162,76,0.12)`,
              }}
            >
              {/* Main image section */}
              <div className="absolute inset-0" style={{ height: SEAM_Y }}>
                {/* Photo layer isolated from the overlays below so only
                    the artwork itself gets the richer color grade —
                    slightly more saturated/contrasty, not the scrims on
                    top of it. */}
                <div className="absolute inset-0" style={{ filter: "saturate(1.18) contrast(1.06) brightness(0.98)" }}>
                  <PosterArt posterPath={activeImagePath} base={season.base} glow={season.glow} alt={season.title} tmdbSize="w780" />
                </div>
                <Grain />

                {/* Soft top highlight — a light wash behind the header,
                    tinted with the artwork's own dominant color. Opacity
                    bumped (0.30 -> 0.38) per explicit "more glow" feedback. */}
                <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 70% 36% at 50% 0%, rgba(${atmoRGB.join(",")},0.38), transparent 62%)` }} />

                {/* Warm amber glow — reflected cinematic light, strongest
                    lower-left/center-left near the title+rating block, not
                    a bright spotlight. Doubles as the "text area glow"
                    (same region), rather than stacking a second redundant
                    radial layer on top of it. Opacity bumped (0.30 -> 0.38)
                    per explicit "more glow" feedback. */}
                <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 85% 55% at 28% 86%, rgba(232,162,76,0.38), transparent 62%)` }} />

                {/* Base readability gradient — softened to a gradual curve
                    (more stops, smaller jumps between them) instead of a
                    few widely-spaced steps, so it reads as a smooth fade
                    rather than a visible band. */}
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 0%, transparent 34%, rgba(0,0,0,0.10) 50%, rgba(0,0,0,0.22) 62%, rgba(0,0,0,0.42) 76%, rgba(0,0,0,0.68) 90%, rgba(0,0,0,0.86) 100%)" }} />

                {/* Soft vignette — darkens the outer edges/corners only,
                    keeping focus toward the center. */}
                <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 130% 95% at 50% 46%, transparent 55%, rgba(0,0,0,0.34) 100%)" }} />

                {/* Amber bloom into the stub — a wide, soft RADIAL glow
                    (not a flat bottom-anchored rectangle) so the handoff
                    into the cream stub reads as warm light falling off
                    rather than a solid brown band; the black readability
                    gradient above still carries the actual darkening, this
                    layer only adds warmth on top of it. */}
                <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 100% 46% at 50% 100%, rgba(232,162,76,0.30), rgba(180,110,50,0.16) 55%, transparent 80%)" }} />

                {/* Golden bloom, lower third — the "premium lighting"
                    pass's third layer, a faint wide glow low in the frame,
                    independent of the amber bloom above (smaller radius,
                    positioned higher) so the two read as one soft light
                    source rather than a hard edge between them. Opacity
                    bumped (0.14 -> 0.20) per explicit "more glow" feedback. */}
                <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 30% at 30% 82%, rgba(255,196,120,0.20), transparent 70%)" }} />

                {/* Header — CINEXT now uses the actual wordmark asset
                    (public/text/logo.png) instead of styled text, per
                    explicit request. Height-based sizing (not the old
                    fixed-typography-scale span) since it's a real image
                    with its own intrinsic aspect ratio now. */}
                <div className="absolute top-0 left-0 right-0 flex items-center justify-between" style={{ padding: `52px ${PAD_X}px 0` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local static asset */}
                  <img src="/text/logo.png" alt="CINEXT" style={{ height: 38, width: "auto", objectFit: "contain" }} />
                  {/* eslint-disable-next-line @next/next/no-img-element -- local static asset, +15% over the previous pass (67 -> 77); marginRight nudges it ~10% further right per explicit feedback */}
                  <img src="/cinext-mark.png" alt="" style={{ width: 77, height: 77, objectFit: "contain", marginRight: -8 }} />
                </div>

                {/* Fixed content stack — every row's `top` comes straight
                    from the constants above, never from how tall the row
                    before it happened to render. The FIRST title line
                    always sits at TITLE_TOP: when there's a genuine
                    original-language title it goes there (primaryTitle
                    style) with the English title in its own slot right
                    below; when there isn't, the show's own title takes
                    that same first slot instead and the English-title
                    slot is simply left blank — so the season/rating/
                    review rows never shift regardless of which case this
                    show falls into. */}
                {/* Title logo art replaces the two plain-text title lines
                    when TMDB has one (matched to Readable Languages, same
                    as Show Detail's own auto title logo) — plain text
                    only as the fallback for shows with no logo art, or
                    where the image itself fails to load.
                    next/image, not a raw <img> — a raw <img> pointed
                    straight at TMDB's CDN loaded fine on screen, but broke
                    the actual PNG export: html-to-image embeds external
                    images by fetch()-ing them itself, and that fetch hit
                    a CORS wall against TMDB's servers regardless of any
                    crossOrigin attribute (tried that too — it only
                    stopped the image from loading at all, since TMDB
                    doesn't answer anonymous-mode CORS requests either).
                    next/image routes through our own /_next/image proxy
                    (same-origin from the browser's POV), exactly like
                    PosterArt's poster/backdrop art already does elsewhere
                    in this same exported card without issue. */}
                {titleLogoUrl ? (
                  <div className="absolute flex items-end" style={{ top: TITLE_TOP, left: PAD_X, right: PAD_X, height: TITLE_BLOCK_H }}>
                    {/* maxWidth:50% — TMDB's title-logo assets vary wildly in
                        their own intrinsic aspect ratio: a wide/landscape
                        logo naturally fills this box's full width under
                        objectFit:contain (it's the binding constraint),
                        while a taller/more compact logo (like a vertical
                        brush-script wordmark) ends up height-constrained
                        and reads noticeably smaller in the same box —
                        exactly the "this one's title is way bigger than
                        that one" mismatch reported. Capping width caps
                        only the wide-and-therefore-oversized case; a logo
                        already narrower than the cap (already
                        height-constrained) is untouched by it. */}
                    <div className="relative" style={{ width: "100%", height: "100%" }}>
                      <Image
                        src={titleLogoUrl}
                        alt={showOriginal ? originalTitle : showTitle}
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
                      <span style={{ fontSize: TYPE.primaryTitle.size, fontWeight: TYPE.primaryTitle.weight, color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,0.65)" }}>{showOriginal ? originalTitle : showTitle}</span>
                    </div>
                    <div className="absolute" style={{ top: ENGLISH_TOP, left: PAD_X, right: PAD_X, height: ENGLISH_TITLE_H, ...CLAMP_1_LINE }}>
                      {showOriginal && (
                        <span style={{ fontSize: TYPE.englishTitle.size, fontWeight: TYPE.englishTitle.weight, color: "rgba(255,255,255,0.85)", textShadow: "0 2px 10px rgba(0,0,0,0.6)" }}>{showTitle}</span>
                      )}
                    </div>
                  </>
                )}
                <div className="absolute" style={{ top: SEASON_TOP, left: PAD_X, right: PAD_X, height: SEASON_H, ...CLAMP_1_LINE }}>
                  {season.title && (
                    <span style={{ fontSize: TYPE.season.size, fontWeight: TYPE.season.weight, letterSpacing: TYPE.season.tracking, color: "rgba(255,255,255,0.88)", textShadow: "0 1px 8px rgba(0,0,0,0.75)" }}>{season.title.toUpperCase()}</span>
                  )}
                </div>
                {/* Rating hierarchy: the star pulled down a size, the
                    number itself the loudest thing in the row, "/10" light
                    and small — the eye should land on the number, not read
                    the row as one flat line. */}
                <div className="absolute flex items-end" style={{ top: RATING_TOP, left: PAD_X, right: PAD_X, height: RATING_ROW_H, gap: 10 }}>
                  <Icon name="star" size={49} color={accent} />
                  <span style={{ fontSize: TYPE.ratingNumber.size, fontWeight: TYPE.ratingNumber.weight, color: "#fff", lineHeight: 1, textShadow: "0 2px 10px rgba(0,0,0,0.6)" }}>{score.toFixed(1)}</span>
                  <span style={{ fontSize: TYPE.ratingSuffix.size, fontWeight: TYPE.ratingSuffix.weight, color: "rgba(255,255,255,0.6)", marginBottom: 8, textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>/10</span>
                </div>

              </div>

              {/* Bottom ticket stub — always renders both the username
                  (left) and the REVIEW NO. block (right, divider
                  included); if there's no real review number for this
                  rating, only the numeric VALUE is swapped for a dash —
                  the label, divider, and alignment never disappear or
                  shift. Flat #D4BC99 (was tinted per-show off the
                  artwork's own dominant color) per explicit request. */}
              <div className="absolute left-0 right-0" style={{ top: SEAM_Y, height: STUB_H, background: "#D4BC99" }}>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(165deg, rgba(255,255,255,0.25) 0%, transparent 40%, rgba(0,0,0,0.05) 100%)" }} />
                <Grain />
                <div className="absolute flex items-center" style={{ inset: 0, padding: `0 ${PAD_X}px` }}>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: TYPE.username.size, fontWeight: TYPE.username.weight, color: "#1a1512" }}>@{username}</div>
                    {/* "Tracking since {year}" — latest design pass; replaces
                        the mockup's own hardcoded "Tracking since 2016"
                        with the real signed-in user's account year. Left
                        blank (not a fallback string) on the rare chance
                        created_at isn't available yet, same "hide the
                        value, keep the space" rule as everything else
                        here — it never shifts the row's own height. */}
                    <div style={{ fontSize: TYPE.profileSubtitle.size, fontWeight: TYPE.profileSubtitle.weight, color: "rgba(26,21,18,0.55)", marginTop: 5 }}>
                      {memberSinceYear != null ? `Tracking since ${memberSinceYear}` : ""}
                    </div>
                  </div>
                  <div style={{ width: 1.5, height: 88, background: "rgba(26,21,18,0.22)" }} />
                  <div style={{ paddingLeft: 32 }}>
                    <div style={{ fontSize: TYPE.reviewNoLabel.size, fontWeight: TYPE.reviewNoLabel.weight, letterSpacing: "0.12em", color: "rgba(26,21,18,0.55)" }}>REVIEW NO.</div>
                    {/* No real review number for this rating (auto-computed
                        score, or the lookup came back empty) — only the
                        VALUE text is hidden; the label, divider, and this
                        row's own height/alignment stay exactly as they are
                        for every other card, so the stub never visibly
                        shrinks or re-centers around a missing number. */}
                    <div style={{ fontSize: TYPE.reviewNoValue.size, fontWeight: TYPE.reviewNoValue.weight, color: "#1a1512", marginTop: 4, minHeight: TYPE.reviewNoValue.size * 1.2 }}>{reviewNumberLabel}</div>
                  </div>
                </div>
              </div>

              {/* Perforated seam line — individual small dot circles spaced
                  by justify-content:space-between (latest design pass),
                  not the previous repeating-background-image dash trick. */}
              <div className="absolute flex justify-between" style={{ top: SEAM_Y - PERFORATION_DOT / 2, left: 83, right: 83 }}>
                {PERFORATION_DOTS.map((_, i) => (
                  <span key={i} style={{ width: PERFORATION_DOT, height: PERFORATION_DOT, borderRadius: "50%", background: "rgba(120,100,70,0.55)" }} />
                ))}
              </div>

              {/* Ticket notches — clean oval bites at the seam, not
                  decorative scalloping around the whole card. Colored
                  solid black to match the outer export canvas, which is
                  the ONLY thing ever behind them (both on-screen and in
                  the exported PNG), so this reads as a true cutout rather
                  than a color-matching trick against an unknown
                  background — deliberately NOT the mockup's own
                  full-oval-sitting-on-top approach (no separate ring/
                  border here either). NOTCH_SHIFT (-44, not -width/2)
                  bites deeper into the card than a simple half-hidden
                  shape would, clipped by the card's own overflow:hidden.
                  The inset shadow is the only depth cue — no outline. */}
              <div className="absolute rounded-full" style={{ left: NOTCH_SHIFT, top: SEAM_Y - NOTCH_H / 2, width: NOTCH_W, height: NOTCH_H, background: "#000", boxShadow: "inset 0 3px 8px rgba(0,0,0,0.55)" }} />
              <div className="absolute rounded-full" style={{ right: NOTCH_SHIFT, top: SEAM_Y - NOTCH_H / 2, width: NOTCH_W, height: NOTCH_H, background: "#000", boxShadow: "inset 0 3px 8px rgba(0,0,0,0.55)" }} />
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- Controls (outside the exported card) ---------------- */}
      {/* Just two lightweight things now: the Poster/Backdrop segmented
          toggle, and Share. Edit moved to the header's corner pencil icon;
          the old "Back" text button is gone (the header's X covers that
          job now, plus tapping the backdrop already closes this screen).
          width: controlsW locks the Segmented control to the card's own
          on-screen width for visual alignment; Share below it uses its
          own screen-width-relative sizing instead (see shareW above) so
          it doesn't stretch to match the card's much wider footprint. */}
      <div ref={controlsRef} style={{ width: controlsW, marginTop: GROUP_GAP }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center">
          {/* Username/review number are always shown now — no toggle,
              per explicit request ("these two are default"). */}
          <Segmented
            value={imageType}
            onChange={setImageType}
            options={[{ id: "poster", label: "Poster" }, { id: "backdrop", label: "Backdrop" }]}
          />
        </div>

        {/* Share — the only export action now (Save Image removed per
            explicit request: its direct-download path was the one most
            exposed to the artwork-not-loaded-yet export bug renderCardPng
            now guards against, and Share alone covers the same "get this
            card out of the app" need). 55-60vw wide, 54-58px tall, kept
            visually secondary to the card (same orange accent/outline,
            just no longer the loudest thing on screen once the card grew). */}
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
