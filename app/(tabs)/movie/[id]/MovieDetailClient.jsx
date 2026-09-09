"use client";

import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Icon from "@/components/ui/Icon";
import PosterArt from "@/components/ui/PosterArt";
import MediaStatusBadge from "@/components/ui/MediaStatusBadge";
import StatusMenu, { movieStatusMenuOptions } from "@/components/StatusMenu";
import MovieRatingBanner from "@/components/MovieRatingBanner";
import MovieRatingScreen from "@/components/MovieRatingScreen";
import MovieShareRatingCard from "@/components/MovieShareRatingCard";
import MovieImagePickerScreen from "@/components/MovieImagePickerScreen";
import CollectionPickerCard from "@/components/CollectionPickerCard";
import CollectionQuickRow from "@/components/CollectionQuickRow";
import { useAuth } from "@/lib/auth-context";
import { useMovieFavorites } from "@/lib/movie-favorites-context";
import { useMovieCustomizations } from "@/lib/movie-customizations-context";
import { getUserMovie, getUserMovies, setMovieStatus, removeUserMovie } from "@/lib/userMovies";
import { getMovieRating, saveMovieRating, deleteMovieRating } from "@/lib/movieRatings";
import { getCollections, createCollection, addMovieToCollection, removeMovieFromCollection } from "@/lib/collections";
import { hydrateCollectionPreviews } from "@/lib/collectionPreviews";
import { getProfile } from "@/lib/profile";
import { tmdbImage } from "@/lib/tmdb";
import { resolveTitle, resolvePersonName, useReadableLanguages } from "@/lib/languages";
import { themes, DEFAULT_ACCENT, tintColorForShow } from "@/lib/theme";
import { useNavTint } from "@/lib/nav-tint-context";
import { useNavVisibility } from "@/lib/nav-visibility-context";
import { useAmbientPalette } from "@/lib/ambientPalette";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// Movie Detail mirrors Show Detail's dual mobile/desktop layout (same
// show-* CSS classes), minus every season/episode surface. Status,
// favorite, collections, rating, trailers, and image pickers stay
// movie-scoped via userMovies / movieRatings / movie customizations.

const moreMenuItems = [
  { id: "tags", label: "Add to a Collection", icon: "collection" },
  { id: "covers", label: "Change covers", icon: "image", pickerType: "backdrop" },
  { id: "poster", label: "Change poster", icon: "image", pickerType: "poster" },
  { id: "logo", label: "Change logo", icon: "logo", pickerType: "logo" },
];

function GlassButton({ children, onClick, style, ...rest }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: t.cardFill, color: "#fff",
        border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", ...style,
      }}
      className="flex items-center justify-center gap-2 rounded-full active:scale-95 transition"
      {...rest}
    >
      {children}
    </button>
  );
}

function DetailRow({ icon, label, divider = true, children }) {
  return (
    <div className="flex items-start justify-between gap-4" style={{ padding: "13px 16px", borderTop: divider ? `1px solid ${t.cardBorder}` : "none" }}>
      <div className="flex items-center gap-2 flex-shrink-0" style={{ paddingTop: 1 }}>
        <Icon name={icon} size={14} color={t.textDim} />
        <span style={{ fontSize: 12.5, color: t.textDim, fontWeight: 500 }}>{label}</span>
      </div>
      <div className="text-right min-w-0">{children}</div>
    </div>
  );
}

function ProviderGroup({ label, items }) {
  return (
    <div className="mb-4 last:mb-0">
      <div style={{ fontSize: 10, color: t.textDim, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 9 }}>{label.toUpperCase()}</div>
      <div className="flex flex-wrap gap-4">
        {items.map((p) => (
          <div key={p.id} className="flex flex-col items-center flex-shrink-0" style={{ width: 56 }}>
            <div className="rounded-xl overflow-hidden flex-shrink-0" style={{ width: 48, height: 48, position: "relative", background: "rgba(255,255,255,0.1)" }}>
              {p.logoPath && <Image src={tmdbImage(p.logoPath, "w92")} alt="" fill sizes="48px" style={{ objectFit: "cover" }} />}
            </div>
            <span className="text-center" style={{ fontSize: 10.5, color: t.textDim, fontWeight: 500, marginTop: 6, lineHeight: 1.25 }}>{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CastGallery({ people, onSelect }) {
  const readableLanguages = useReadableLanguages();
  return (
    <div className="grid mt-4" style={{ gridTemplateColumns: "repeat(3, 1fr)", rowGap: 20, columnGap: 8 }}>
      {people.map((c) => {
        const displayName = resolvePersonName(c, readableLanguages);
        return (
        <button key={c.id} onClick={() => onSelect(c.id)} className="flex flex-col items-center text-center active:scale-95 transition">
          <div className="relative flex-shrink-0 rounded-full overflow-hidden flex items-center justify-center" style={{ width: 84, height: 84, background: c.grad }}>
            {c.profilePath ? (
              <Image src={tmdbImage(c.profilePath, "w185")} alt="" fill sizes="84px" style={{ objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{c.initials}</span>
            )}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#fff", marginTop: 8, lineHeight: 1.25 }}>{displayName}</div>
          <div style={{ fontSize: 11, color: t.textDim, marginTop: 2, lineHeight: 1.25 }}>{c.role}</div>
        </button>
        );
      })}
    </div>
  );
}

export default function MovieDetailClient({ movieId, movie, cast, videos, similar, watchProviders }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useMovieFavorites();
  const { getCustomBackdrop, getCustomPoster, getCustomLogo, setCustomImage } = useMovieCustomizations();
  const readableLanguages = useReadableLanguages();
  const displayTitle = resolveTitle(movie, readableLanguages);
  const resolvedSimilar = similar.map((s) => ({ ...s, title: resolveTitle(s, readableLanguages) }));

  const [similarStatusMap, setSimilarStatusMap] = useState({});
  useEffect(() => {
    if (!user) { setSimilarStatusMap({}); return; }
    let cancelled = false;
    getUserMovies(user.id)
      .then((byMovie) => {
        if (cancelled) return;
        setSimilarStatusMap(Object.fromEntries(Object.entries(byMovie).map(([id, s]) => [id, s.status])));
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [user]);

  const imagePickerType = searchParams.get("picker");
  const customBackdropUrl = getCustomBackdrop(movieId);
  const customPosterUrl = getCustomPoster(movieId);
  const customLogoUrl = getCustomLogo(movieId);
  const ambientArtUrl = customBackdropUrl
    || (movie?.backdropPath ? tmdbImage(movie.backdropPath, "w780") : null)
    || (movie?.posterPath ? tmdbImage(movie.posterPath, "w500") : null);
  const ambient = useAmbientPalette(ambientArtUrl);

  const [moreOpen, setMoreOpen] = useState(false);
  const [desktopMoreOpen, setDesktopMoreOpen] = useState(false);
  const [desktopMorePos, setDesktopMorePos] = useState(null);
  const moreMenuRef = useRef(null);
  const moreMenuBtnRef = useRef(null);
  const moreMenuPanelRef = useRef(null);
  const [collectionSheetOpen, setCollectionSheetOpen] = useState(false);
  const [collectionAllOpen, setCollectionAllOpen] = useState(false);
  const [collections, setCollections] = useState([]);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getCollections(user.id).then(async (rows) => {
      if (cancelled) return;
      const mapped = rows.map((c) => ({
        id: c.id,
        name: c.name,
        count: c.showIds.length + (c.movieIds?.length ?? 0),
        inShow: c.movieIds.includes(movieId),
        showIds: c.showIds,
        movieIds: c.movieIds ?? [],
        covers: [],
      }));
      setCollections(mapped);
      const hydrated = await hydrateCollectionPreviews(mapped, 9);
      if (cancelled) return;
      const coversById = new Map(hydrated.map((c) => [c.id, c.covers]));
      setCollections((prev) => prev.map((c) => ({ ...c, covers: coversById.get(c.id) ?? c.covers })));
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [user, movieId]);

  const toggleCollection = (id) => {
    if (!user) { router.push("/login"); return; }
    const target = collections.find((c) => c.id === id);
    if (!target) return;
    const adding = !target.inShow;
    setCollections((cs) => {
      const updated = cs.map((c) => {
        if (c.id !== id) return c;
        const covers = c.inShow
          ? (c.covers ?? []).filter((item) => !(item.mediaType === "movie" && item.id === movieId))
          : [{ id: movieId, title: movie.title, posterPath: movie.posterPath, backdropPath: movie.backdropPath, mediaType: "movie" }, ...(c.covers ?? [])].slice(0, 9);
        return { ...c, covers, inShow: !c.inShow, count: c.inShow ? Math.max(0, c.count - 1) : c.count + 1 };
      });
      if (!adding) return updated;
      const bumped = updated.find((c) => c.id === id);
      return bumped ? [bumped, ...updated.filter((c) => c.id !== id)] : updated;
    });
    if (target.inShow) removeMovieFromCollection(id, movieId).catch(console.error);
    else addMovieToCollection(id, movieId).catch(console.error);
  };

  const createCollectionAndAdd = () => {
    if (!user) { router.push("/login"); return; }
    const name = newCollectionName.trim();
    if (!name) return;
    setNewCollectionName("");
    setNewCollectionOpen(false);
    createCollection(user.id, name)
      .then((row) => {
        setCollections((cs) => [{
          id: row.id,
          name: row.name,
          count: 1,
          inShow: true,
          showIds: [],
          movieIds: [movieId],
          covers: [{ id: movieId, title: movie.title, posterPath: movie.posterPath, backdropPath: movie.backdropPath, mediaType: "movie" }],
        }, ...cs]);
        return addMovieToCollection(row.id, movieId);
      })
      .catch(console.error);
  };

  const collectionConfirmActive = collections.some((c) => c.inShow);

  const [autoLogoPath, setAutoLogoPath] = useState(null);
  const [autoLogoFailed, setAutoLogoFailed] = useState(false);
  useEffect(() => {
    setAutoLogoFailed(false);
    let cancelled = false;
    fetch("/api/movies/logos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [movieId], readableLanguages }),
    })
      .then((res) => res.json())
      .then(({ results }) => { if (!cancelled) setAutoLogoPath(results?.[0]?.logoPath ?? null); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [movieId, readableLanguages]);
  const autoLogoUrl = !autoLogoFailed && autoLogoPath ? tmdbImage(autoLogoPath, "w500") : null;

  const [, setNavTint] = useNavTint();
  useEffect(() => {
    setNavTint(tintColorForShow(movieId));
    return () => setNavTint(null);
  }, [movieId, setNavTint]);

  const favorite = isFavorite(movieId);
  const [inLibrary, setInLibrary] = useState(false);
  const [status, setStatus] = useState(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [tab, setTab] = useState("details");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getUserMovie(user.id, movieId).then((row) => {
      if (cancelled || !row) return;
      setInLibrary(true);
      setStatus(row.status);
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [user, movieId]);

  const selectStatus = (id) => {
    if (!user) { router.push("/login"); return; }
    if (id === "remove") {
      removeUserMovie(user.id, movieId, "MovieDetailClient:selectStatus:remove")
        .then(() => { setInLibrary(false); setStatus(null); })
        .catch((err) => {
          console.error(err);
          window.alert("Couldn't remove this movie — please try again.");
        });
      setStatusOpen(false);
      return;
    }
    setInLibrary(true);
    setStatus(id);
    setMovieStatus(user.id, movieId, id, "MovieDetailClient:selectStatus").catch(console.error);
    setStatusOpen(false);
  };

  const addToLibrary = () => {
    if (!user) { router.push("/login"); return; }
    setInLibrary(true);
    setStatusOpen(true);
  };

  const statusLabel = status == null
    ? "Add to List"
    : movieStatusMenuOptions.find((s) => s.id === status)?.label ?? "Add to List";
  const statusIcon = status == null
    ? "plus"
    : status === "watchlist"
      ? "bookmarkFilled"
      : movieStatusMenuOptions.find((s) => s.id === status)?.icon ?? "plus";

  const [rating, setRatingValue] = useState(null);
  const [ratingLoaded, setRatingLoaded] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingInitialEditing, setRatingInitialEditing] = useState(false);
  const [username, setUsername] = useState("you");
  const [shareCardOpen, setShareCardOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMovieRating(user.id, movieId)
      .then((data) => { if (!cancelled) setRatingValue(data); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setRatingLoaded(true); });
    getProfile(user.id).then((p) => { if (!cancelled) setUsername(p?.handle || p?.displayName || "you"); }).catch(console.error);
    return () => { cancelled = true; };
  }, [user, movieId]);

  const saveRating = async (payload) => {
    await saveMovieRating(user.id, movieId, payload);
    setRatingValue({ ...payload, savedAt: new Date() });
  };
  const deleteRating = async () => {
    await deleteMovieRating(user.id, movieId);
    setRatingValue(null);
  };
  const openRating = () => {
    if (!ratingLoaded) return;
    setRatingInitialEditing(!rating);
    setRatingOpen(true);
  };

  const [ratingOpenedFromProfile, setRatingOpenedFromProfile] = useState(false);
  const [deepLinkPending, setDeepLinkPending] = useState(() => searchParams.get("tab") === "reviews");
  const deepLinkConsumedRef = useRef(false);
  useEffect(() => {
    if (deepLinkConsumedRef.current) return;
    if (searchParams.get("tab") !== "reviews") return;
    setTab("reviews");
    if (!ratingLoaded) return;
    setRatingInitialEditing(!rating);
    setRatingOpen(true);
    setRatingOpenedFromProfile(true);
    deepLinkConsumedRef.current = true;
    setDeepLinkPending(false);
  }, [searchParams, ratingLoaded, rating]);

  const [openVideo, setOpenVideo] = useState(null);
  const openTrailer = () => {
    if (videos[0]) setOpenVideo(videos[0]);
  };

  const primaryProvider =
    watchProviders?.flatrate?.[0]
    || watchProviders?.rent?.[0]
    || watchProviders?.buy?.[0]
    || null;

  // Static objective facts only — never the user's personal score.
  // Personal rating lives exclusively on the Rate action button below.
  const desktopMetaParts = [
    movie.year || null,
    movie.contentRating || null,
    movie.runtimeLabel || null,
    movie.rating ? `★ ${movie.rating} (TMDB)` : null,
  ].filter(Boolean);

  const userRatingScore = rating?.rating != null
    ? (Number.isInteger(Number(rating.rating))
      ? String(Number(rating.rating))
      : Number(rating.rating).toFixed(1))
    : null;

  const [, setNavHidden] = useNavVisibility();
  useEffect(() => {
    const hidden = collectionSheetOpen || collectionAllOpen || newCollectionOpen || !!openVideo;
    setNavHidden(hidden);
    return () => setNavHidden(false);
  }, [collectionSheetOpen, collectionAllOpen, newCollectionOpen, openVideo, setNavHidden]);

  useEffect(() => {
    if (!desktopMoreOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setDesktopMoreOpen(false);
    };
    const onPointer = (event) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) setDesktopMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [desktopMoreOpen]);

  useLayoutEffect(() => {
    if (!desktopMoreOpen) {
      setDesktopMorePos(null);
      return undefined;
    }

    const MENU_W = 236;
    const GAP = 10;
    const EDGE = 16;

    const place = () => {
      const btn = moreMenuBtnRef.current;
      const panel = moreMenuPanelRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const menuH = panel?.offsetHeight || 168;

      const spaceRight = vw - rect.right - GAP - EDGE;
      const spaceLeft = rect.left - GAP - EDGE;
      const side = spaceRight >= MENU_W || spaceRight >= spaceLeft ? "right" : "left";

      let left = side === "right"
        ? rect.right + GAP
        : rect.left - GAP - MENU_W;
      let top = rect.top + rect.height / 2 - menuH / 2;

      top = Math.min(top, vh - menuH - EDGE);
      top = Math.max(EDGE, top);
      left = Math.min(left, vw - MENU_W - EDGE);
      left = Math.max(EDGE, left);

      setDesktopMorePos({ top, left, side });
    };

    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [desktopMoreOpen]);

  useEffect(() => {
    if (!collectionAllOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setCollectionAllOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collectionAllOpen]);

  const logoNode = (customLogoUrl || autoLogoUrl) ? (
    // eslint-disable-next-line @next/next/no-img-element -- resolved TMDB CDN URL
    <img
      src={customLogoUrl || autoLogoUrl}
      alt={displayTitle}
      onError={() => { if (!customLogoUrl) setAutoLogoFailed(true); }}
      style={{ maxWidth: "80%", maxHeight: 72, objectFit: "contain" }}
    />
  ) : null;

  const renderRatingBanner = () => (
    <MovieRatingBanner
      movie={movie}
      manual={rating}
      backdropPath={movie.backdropPath}
      logoUrl={autoLogoUrl}
      onClick={openRating}
    />
  );

  return (
    <div
      className="min-h-dvh"
      style={{
        background: t.bg,
        ["--show-ambient-primary"]: ambient.primary,
        ["--show-ambient-secondary"]: ambient.secondary,
      }}
    >
      <div className="show-desktop-page-wash" aria-hidden="true" />
      <div className="pb-8" style={{ position: "relative", zIndex: 1 }}>

        {/* ---------- Mobile / tablet hero + intro ---------- */}
        <div className="show-mobile-layout">
          <div className="relative w-full" style={{ height: 415 }}>
            <PosterArt posterPath={movie.backdropPath} overrideSrc={customBackdropUrl} alt={displayTitle} tmdbSize="original" sizes="100vw" />
            <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, #0A0A0C 0%, rgba(10,10,12,0.2) 60%, transparent 100%)" }} />
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 z-10" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
              <GlassButton onClick={() => router.back()} style={{ width: 38, height: 38 }}><Icon name="back" size={16} color={t.text} /></GlassButton>
              <div className="relative">
                <GlassButton onClick={() => setMoreOpen((v) => !v)} style={{ width: 38, height: 38 }}><Icon name="more" size={16} color={t.text} /></GlassButton>
                {moreOpen && (
                  <div className="absolute z-20 rounded-2xl" style={{ right: 0, top: "calc(100% + 8px)", width: 200, padding: "6px", background: "rgba(38,38,42,0.93)", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(24px)", boxShadow: "0 20px 44px rgba(0,0,0,0.55)" }}>
                    {moreMenuItems.map((m) => (
                      <button key={m.id} onClick={() => { setMoreOpen(false); if (m.id === "tags") setCollectionSheetOpen(true); else if (m.pickerType) router.push(`/movie/${movieId}?picker=${m.pickerType}`); }} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "10px 12px" }}>
                        <Icon name={m.icon} size={16} color="#fff" />
                        <span style={{ fontSize: 13.5, color: "#fff", fontWeight: 500 }}>{m.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="absolute left-1/2" style={{ top: 195, transform: "translateX(-50%)", width: 140, height: 200 }}>
              <div className="relative w-full h-full rounded-2xl overflow-hidden" style={{ boxShadow: "0 16px 40px rgba(0,0,0,0.6)" }}>
                <PosterArt posterPath={movie.posterPath} overrideSrc={customPosterUrl} alt={displayTitle} />
                {!movie.posterPath && !customPosterUrl && (
                  <div className="absolute inset-0 flex items-end justify-center" style={{ paddingBottom: 12 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: "#f4ead9", letterSpacing: "0.25em" }}>{displayTitle.toUpperCase()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="px-6" style={{ marginTop: 8, position: "relative", zIndex: 20 }}>
            {movie.tagline && (
              <div className="text-center" style={{ fontSize: 13, fontStyle: "italic", color: t.textDim, marginBottom: 18 }}>
                {movie.tagline}
              </div>
            )}
            {logoNode ? (
              <div className="flex justify-center">{logoNode}</div>
            ) : (
              <div className="text-center" style={{ fontSize: 30, fontWeight: 800, color: "#fff", letterSpacing: "0.01em" }}>{displayTitle}</div>
            )}
            <div className="text-center" style={{ fontSize: 12, color: t.textDim, marginTop: 9 }}>
              {[movie.year, movie.genres, movie.rating ? `★ ${movie.rating}` : null].filter(Boolean).join(" · ")}
            </div>

            <div className="flex items-center justify-center gap-2.5" style={{ marginTop: 17 }}>
              {!inLibrary ? (
                <button onClick={addToLibrary} className="flex items-center gap-2 rounded-full active:scale-95 transition" style={{ padding: "10px 20px", background: "#fff", color: "#111" }}>
                  <Icon name="plus" size={14} color="#111" />
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>Add to List</span>
                </button>
              ) : (
                <>
                  <div className="relative">
                    {statusOpen && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setStatusOpen(false)} />
                        <StatusMenu status={status} onSelect={selectStatus} align="center" options={movieStatusMenuOptions} />
                      </>
                    )}
                    <button onClick={() => setStatusOpen((v) => !v)} className="flex items-center gap-2 rounded-full active:scale-95 transition" style={{ padding: "10px 18px", background: "#fff", color: "#111" }}>
                      <Icon name={statusIcon} size={15} color="#111" />
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{statusLabel}</span>
                    </button>
                  </div>
                  <GlassButton onClick={() => {
                    if (!user) { router.push("/login"); return; }
                    toggleFavorite(movieId, "MovieDetailClient:toggleFavorite");
                  }} style={{ width: 40, height: 40 }}>
                    <Icon name={favorite ? "heart" : "heartOutline"} size={16} color={favorite ? "#e0567a" : "#fff"} />
                  </GlassButton>
                </>
              )}
            </div>

            <div className="mt-4" style={{ fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.72)" }}>
              {movie.descriptionFull}
            </div>
          </div>
        </div>

        {/* ---------- Desktop hero + info strip ---------- */}
        <div className="show-desktop-layout">
          <section className="show-desktop-hero">
            <div className="show-desktop-hero-wrapper">
              <div className="show-desktop-backdrop">
                <PosterArt posterPath={movie.backdropPath} overrideSrc={customBackdropUrl} alt="" tmdbSize="original" sizes="100vw" />
                <div className="show-desktop-backdrop-scrim" />
              </div>
            </div>

            <div className="show-desktop-hero-main">
              <div className="show-desktop-poster">
                <PosterArt posterPath={movie.posterPath} overrideSrc={customPosterUrl} alt={displayTitle} />
              </div>

              <div className="show-desktop-copy">
                {customLogoUrl || autoLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- resolved TMDB CDN URL
                  <img
                    className="show-desktop-logo"
                    src={customLogoUrl || autoLogoUrl}
                    alt={displayTitle}
                    onError={() => { if (!customLogoUrl) setAutoLogoFailed(true); }}
                  />
                ) : (
                  <h1>{displayTitle}</h1>
                )}

                <div className="show-desktop-meta">
                  {desktopMetaParts.map((part, i) => (
                    <span key={`${part}-${i}`}>{i > 0 ? `• ${part}` : part}</span>
                  ))}
                  {movie.statusLabel && movie.status !== "Released" ? (
                    <span className="is-status">• {movie.statusLabel}</span>
                  ) : null}
                </div>

                {movie.genresList?.length > 0 && (
                  <div className="show-desktop-genres">
                    {movie.genresList.map((g) => (
                      <span key={g} className="show-desktop-genre">{g}</span>
                    ))}
                  </div>
                )}

                <div className="show-desktop-actions">
                  <div className={`relative show-desktop-status-wrap${statusOpen ? " is-open" : ""}`}>
                    {statusOpen && (
                      <>
                        <div className="show-desktop-status-scrim" onClick={() => setStatusOpen(false)} />
                        <StatusMenu status={status} onSelect={selectStatus} align="left" options={movieStatusMenuOptions} style={{ zIndex: 110 }} />
                      </>
                    )}
                    {!inLibrary ? (
                      <button type="button" className="show-desktop-action is-light" onClick={addToLibrary}>
                        <Icon name="plus" size={15} color="#111" />
                        Add to List
                      </button>
                    ) : (
                      <button type="button" className="show-desktop-action is-light" onClick={() => setStatusOpen((v) => !v)}>
                        <Icon name={statusIcon} size={15} color="#111" />
                        {statusLabel}
                      </button>
                    )}
                  </div>

                  <GlassButton
                    onClick={() => {
                      if (!user) { router.push("/login"); return; }
                      if (!inLibrary) {
                        addToLibrary();
                        return;
                      }
                      toggleFavorite(movieId, "MovieDetailClient:desktopFavorite");
                    }}
                    style={{ width: 42, height: 42 }}
                    aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Icon name={favorite ? "heart" : "heartOutline"} size={16} color={favorite ? "#e0567a" : "#fff"} />
                  </GlassButton>

                  {videos[0] && (
                    <button type="button" className="show-desktop-action is-secondary" onClick={openTrailer}>
                      <Icon name="clapperboard" size={16} color="#fff" strokeWidth={1.7} />
                      Trailer
                    </button>
                  )}

                  <button
                    type="button"
                    className={`show-desktop-action is-secondary${rating ? " is-rated" : ""}`}
                    onClick={() => {
                      if (!user) { router.push("/login"); return; }
                      openRating();
                    }}
                    aria-label={userRatingScore ? `Your rating ${userRatingScore}` : "Rate"}
                  >
                    <Icon
                      name={rating ? "star" : "starOutline"}
                      size={16}
                      color={rating ? accent : "#fff"}
                    />
                    {userRatingScore ?? "Rate"}
                  </button>

                  <GlassButton
                    onClick={() => {
                      if (!user) { router.push("/login"); return; }
                      setStatusOpen(false);
                      setDesktopMoreOpen(false);
                      setCollectionAllOpen(true);
                    }}
                    style={{ width: 42, height: 42 }}
                    aria-label="Add to a Collection"
                    aria-haspopup="dialog"
                    aria-expanded={collectionAllOpen}
                  >
                    <Icon name="collection" size={16} color="#fff" />
                  </GlassButton>

                  <div className="relative" ref={moreMenuRef}>
                    <button
                      type="button"
                      ref={moreMenuBtnRef}
                      className="show-desktop-more"
                      aria-label="More options"
                      aria-haspopup="menu"
                      aria-expanded={desktopMoreOpen}
                      onClick={() => { setStatusOpen(false); setDesktopMoreOpen((v) => !v); }}
                    >
                      <Icon name="more" size={16} color="#fff" />
                    </button>
                    {desktopMoreOpen && (
                      <div
                        ref={moreMenuPanelRef}
                        className={`show-desktop-more-menu${desktopMorePos ? " is-placed" : ""}${desktopMorePos?.side ? ` is-${desktopMorePos.side}` : ""}`}
                        role="menu"
                        style={desktopMorePos ? {
                          top: desktopMorePos.top,
                          left: desktopMorePos.left,
                          background: "rgba(48,50,54,0.96)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          backdropFilter: "blur(28px) saturate(140%)",
                          WebkitBackdropFilter: "blur(28px) saturate(140%)",
                        } : undefined}
                      >
                        {moreMenuItems.filter((m) => m.id !== "tags").map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            role="menuitem"
                            className="show-desktop-more-item"
                            onClick={() => {
                              setDesktopMoreOpen(false);
                              if (m.pickerType) router.push(`/movie/${movieId}?picker=${m.pickerType}`);
                            }}
                          >
                            <Icon name={m.icon} size={16} color="#fff" />
                            <span>{m.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {movie.descriptionFull ? <p className="show-desktop-overview">{movie.descriptionFull}</p> : null}
              </div>
            </div>
          </section>

          <section className="show-desktop-strip" aria-label="Movie details">
            {primaryProvider ? (
              watchProviders?.link ? (
                <a
                  className="show-desktop-strip-item is-watch"
                  href={watchProviders.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className="show-desktop-strip-logo">
                    {primaryProvider.logoPath && (
                      <Image src={tmdbImage(primaryProvider.logoPath, "w92")} alt="" fill sizes="36px" style={{ objectFit: "cover" }} />
                    )}
                  </div>
                  <div>
                    <span className="show-desktop-strip-kicker">WATCH ON</span>
                    <strong>
                      {primaryProvider.name}
                      <Icon name="chevronRight" size={14} color="rgba(255,255,255,0.55)" />
                    </strong>
                  </div>
                </a>
              ) : (
                <div className="show-desktop-strip-item is-watch">
                  <div className="show-desktop-strip-logo">
                    {primaryProvider.logoPath && (
                      <Image src={tmdbImage(primaryProvider.logoPath, "w92")} alt="" fill sizes="36px" style={{ objectFit: "cover" }} />
                    )}
                  </div>
                  <div>
                    <span className="show-desktop-strip-kicker">WATCH ON</span>
                    <strong>{primaryProvider.name}</strong>
                  </div>
                </div>
              )
            ) : (
              <div className="show-desktop-strip-item is-watch">
                <div className="show-desktop-strip-logo is-empty"><Icon name="tv" size={16} color="rgba(255,255,255,0.45)" /></div>
                <div>
                  <span className="show-desktop-strip-kicker">WATCH ON</span>
                  <strong>Unavailable</strong>
                </div>
              </div>
            )}

            <div className="show-desktop-strip-item">
              <Icon name="clock" size={15} color="rgba(255,255,255,0.45)" />
              <div>
                <span className="show-desktop-strip-kicker">RUNTIME</span>
                <strong>{movie.runtimeLabel || "—"}</strong>
              </div>
            </div>

            <div className="show-desktop-strip-item">
              <Icon name="star" size={15} color="rgba(255,255,255,0.45)" />
              <div>
                <span className="show-desktop-strip-kicker">RATING</span>
                <strong>{movie.rating || "—"}</strong>
              </div>
            </div>

            <div className="show-desktop-strip-item">
              <Icon name="calendar" size={15} color="rgba(255,255,255,0.45)" />
              <div>
                <span className="show-desktop-strip-kicker">RELEASE DATE</span>
                <strong>{movie.releaseDate || "—"}</strong>
              </div>
            </div>

            <div className="show-desktop-strip-item">
              <Icon name="globe" size={15} color="rgba(255,255,255,0.45)" />
              <div>
                <span className="show-desktop-strip-kicker">COUNTRY</span>
                <strong>{movie.originCountry || "—"}</strong>
              </div>
            </div>

            <div className="show-desktop-strip-item">
              <Icon name="user" size={15} color="rgba(255,255,255,0.45)" />
              <div>
                <span className="show-desktop-strip-kicker">DIRECTOR</span>
                <strong>{movie.director !== "—" ? movie.director : "—"}</strong>
              </div>
            </div>
          </section>
        </div>

        <div className="show-detail-body px-6" style={{ marginTop: 8, position: "relative", zIndex: 20 }}>
          <div
            className="mt-5 flex gap-5 show-detail-tabs"
            style={{ borderBottom: `1px solid ${t.cardBorder}` }}
          >
            {[
              { id: "details", label: "Details" },
              { id: "cast", label: "Cast & Crew" },
              { id: "reviews", label: "My Rating" },
            ].map((tb) => (
              <button
                key={tb.id}
                onClick={() => setTab(tb.id)}
                className="show-detail-tab-btn show-detail-tab-mobile-only pb-2.5"
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: tab === tb.id ? "#fff" : t.textDim,
                  borderBottom: tab === tb.id ? `2px solid ${accent}` : "2px solid transparent",
                }}
              >
                {tb.label}
              </button>
            ))}
          </div>

          {tab === "cast" && (
            <div className="show-detail-panel-mobile-only">
              {cast.length === 0 ? (
                <div className="mt-4" style={{ padding: "24px 0", textAlign: "center", fontSize: 12.5, color: t.textDim }}>No cast or crew listed yet.</div>
              ) : (
                <>
                  <CastGallery people={cast.filter((c) => c.isCast)} onSelect={(id) => router.push(`/person/${id}`)} />
                  {(() => {
                    const crew = cast.filter((c) => !c.isCast);
                    return crew.length > 0 ? (
                      <div className="mt-6">
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Crew</div>
                        <CastGallery people={crew} onSelect={(id) => router.push(`/person/${id}`)} />
                      </div>
                    ) : null;
                  })()}
                </>
              )}
            </div>
          )}

          {tab === "details" && (
            <div className="mt-4 rounded-2xl overflow-hidden show-detail-panel-mobile-only" style={{ background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
              <DetailRow icon="clock" label="Runtime" divider={false}>
                <span style={{ fontSize: 12.5, color: "#fff", fontWeight: 500 }}>
                  {movie.runtimeLabel || "—"}
                  {movie.status !== "Released" && movie.statusLabel && <> · {movie.statusLabel}</>}
                </span>
              </DetailRow>

              <DetailRow icon="star" label="Ratings">
                {movie.rating ? (
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                    <span style={{ color: accent }}>★ {movie.rating}</span>
                    <span style={{ color: t.textDim, fontWeight: 500 }}> · {Number(movie.voteCount).toLocaleString()} votes</span>
                  </span>
                ) : (
                  <span style={{ fontSize: 12.5, color: t.textDim }}>—</span>
                )}
              </DetailRow>

              {movie.genresList.length > 0 && (
                <DetailRow icon="layers" label="Genres">
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {movie.genresList.map((g) => (
                      <span key={g} className="rounded-full" style={{ padding: "3px 10px", fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.85)", background: "rgba(255,255,255,0.08)" }}>{g}</span>
                    ))}
                  </div>
                </DetailRow>
              )}

              {movie.releaseDate && (
                <DetailRow icon="calendar" label="Release Date">
                  <span style={{ fontSize: 12.5, color: "#fff", fontWeight: 500 }}>{movie.releaseDate}</span>
                </DetailRow>
              )}

              {movie.director !== "—" && (
                <DetailRow icon="user" label="Director">
                  <span style={{ fontSize: 12.5, color: "#fff", fontWeight: 500 }}>{movie.director}</span>
                </DetailRow>
              )}

              {movie.productionCompany !== "—" && (
                <DetailRow icon="collection" label="Production Company">
                  <span style={{ fontSize: 12.5, color: "#fff", fontWeight: 500 }}>{movie.productionCompany}</span>
                </DetailRow>
              )}

              <div style={{ padding: "13px 16px", borderTop: `1px solid ${t.cardBorder}` }}>
                <div className="flex items-center gap-2" style={{ marginBottom: watchProviders ? 12 : 0 }}>
                  <Icon name="globe" size={14} color={t.textDim} />
                  <span style={{ fontSize: 12.5, color: t.textDim, fontWeight: 500 }}>Where to Watch</span>
                </div>
                {!watchProviders ? (
                  <span style={{ fontSize: 12, color: t.textDim }}>Not available in Thailand yet.</span>
                ) : (
                  <>
                    {watchProviders.flatrate.length > 0 && <ProviderGroup label="Stream" items={watchProviders.flatrate} />}
                    {watchProviders.rent.length > 0 && <ProviderGroup label="Rent" items={watchProviders.rent} />}
                    {watchProviders.buy.length > 0 && <ProviderGroup label="Buy" items={watchProviders.buy} />}
                    {watchProviders.link && (
                      <a href={watchProviders.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: t.textDim, textDecoration: "underline", textUnderlineOffset: 2 }}>
                        Streaming data provided by JustWatch
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {tab === "reviews" && (
            <div className="mt-4 show-detail-panel-mobile-only">
              {renderRatingBanner()}
            </div>
          )}

          {/* Full-bleed like You May Also Like so portraits aren't clipped
              by the 1320 content column. */}
          <section className="show-desktop-cast">
            <div className="show-desktop-cast-bleed">
              <div className="show-desktop-cast-head">
                <h2>Cast & Crew</h2>
              </div>
              {cast.length === 0 ? (
                <div className="show-desktop-ep-empty">No cast or crew listed yet.</div>
              ) : (
                <div className="show-desktop-cast-row">
                  {cast.map((c) => (
                    <button
                      key={`${c.isCast ? "cast" : "crew"}-${c.id}`}
                      type="button"
                      className="show-desktop-cast-card"
                      onClick={() => router.push(`/person/${c.id}`)}
                    >
                      <div className="show-desktop-cast-avatar" style={{ background: c.grad }}>
                        {c.profilePath ? (
                          <Image src={tmdbImage(c.profilePath, "w185")} alt="" fill sizes="88px" style={{ objectFit: "cover" }} />
                        ) : (
                          <span>{c.initials}</span>
                        )}
                      </div>
                      <div className="show-desktop-cast-name">{resolvePersonName(c, readableLanguages)}</div>
                      <div className="show-desktop-cast-role">{c.role}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <div className="mt-7">
            <div className="show-detail-section-title">Trailer & More</div>
            {videos.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {videos.map((v) => (
                  <button
                    key={v.key}
                    onClick={() => setOpenVideo(v)}
                    className="relative flex-shrink-0 rounded-2xl overflow-hidden block active:scale-[0.98] transition"
                    style={{ width: 242, height: 143 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail CDN */}
                    <img src={`https://i.ytimg.com/vi/${v.key}/hqdefault.jpg`} alt={v.name || v.type} className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div style={{ width: 42, height: 42, borderRadius: "50%", background: "rgba(255,255,255,0.085)", border: "1px solid rgba(255,255,255,0.19)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="play" size={15} color="#fff" />
                      </div>
                    </div>
                    <div className="absolute left-0 right-0 bottom-0 px-3 pb-2.5" style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.75), transparent)" }}>
                      <span style={{ fontSize: 12, color: "#fff", fontWeight: 600, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{v.name || v.type}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="w-full rounded-2xl flex items-center justify-center" style={{ height: 150, background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
                <span style={{ fontSize: 12.5, color: t.textDim }}>No videos available yet.</span>
              </div>
            )}
          </div>

          <div className="mt-7 mb-2 show-similar">
            <div className="show-similar-bleed">
              <div className="show-similar-title">You May Also Like</div>
              {resolvedSimilar.length === 0 ? (
                <span className="show-similar-empty" style={{ fontSize: 12.5, color: t.textDim }}>No recommendations yet.</span>
              ) : (
                <div className="show-similar-row">
                  {resolvedSimilar.map((s) => (
                    <Link key={s.id} href={`/movie/${s.id}`} className="show-similar-card">
                      <div className="show-similar-poster">
                        <div className="show-similar-poster-art">
                          <PosterArt posterPath={s.posterPath} alt={s.title} />
                        </div>
                        <MediaStatusBadge status={similarStatusMap[s.id]} />
                      </div>
                      <div className="show-similar-name">{s.title}</div>
                      {s.year ? <div className="show-similar-year">{s.year}</div> : null}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {deepLinkPending && <div className="fixed inset-0 z-40" style={{ background: "#0A0A0C" }} />}

      {ratingOpen && (
        <MovieRatingScreen
          movieTitle={displayTitle}
          movie={movie}
          manual={rating}
          cast={cast.filter((c) => c.isCast)}
          backdropPath={movie.backdropPath}
          logoUrl={autoLogoUrl}
          movieGenre={movie.genres}
          initialEditing={ratingInitialEditing}
          onClose={() => {
            if (ratingOpenedFromProfile) { router.back(); return; }
            setRatingOpen(false);
          }}
          onSave={saveRating}
          onDelete={deleteRating}
          onShare={() => setShareCardOpen(true)}
        />
      )}

      {shareCardOpen && rating && (
        <MovieShareRatingCard
          userId={user.id}
          movieId={movieId}
          movieTitle={displayTitle}
          originalTitle={movie.originalTitle}
          originalLanguage={movie.originalLanguage}
          movie={movie}
          manual={rating}
          backdropPath={movie.backdropPath}
          username={username}
          onClose={() => setShareCardOpen(false)}
          onEdit={() => { setShareCardOpen(false); setRatingInitialEditing(false); setRatingOpen(true); }}
        />
      )}

      {collectionSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center show-collection-sheet" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setCollectionSheetOpen(false)}>
          <div className="w-full rounded-t-3xl flex flex-col relative" style={{ maxHeight: "76%", background: "#161210", border: `1px solid ${t.glassBorder}`, borderBottom: "none", boxShadow: "0 -20px 60px rgba(0,0,0,0.6)" }} onClick={(ev) => ev.stopPropagation()}>
            <div className="flex justify-center flex-shrink-0" style={{ paddingTop: 10 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.25)" }} />
            </div>
            <div className="flex items-center justify-between px-5 flex-shrink-0" style={{ paddingTop: 14, paddingBottom: 4 }}>
              <button onClick={() => setCollectionSheetOpen(false)} className="rounded-full flex items-center justify-center active:scale-90 transition" style={{ width: 36, height: 36, background: "rgba(255,255,255,0.1)" }}>
                <Icon name="x" size={16} color="#fff" strokeWidth={2.6} />
              </button>
              <span style={{ fontSize: 19, fontWeight: 800, color: "#fff" }}>Collections</span>
              <div style={{ width: 36 }} />
            </div>

            <div className="overflow-y-auto" style={{ padding: "16px 20px", scrollbarWidth: "none" }}>
              <div className="flex flex-col gap-3">
                {collections.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: t.textDim, textAlign: "center", padding: "24px 0" }}>No collections yet.</div>
                ) : collections.map((c) => (
                  <CollectionPickerCard key={c.id} collection={c} accent={accent} onClick={() => toggleCollection(c.id)} />
                ))}
              </div>
              <div style={{ height: 20 }} />
            </div>

            <div className="flex items-center justify-between gap-3 flex-shrink-0" style={{ padding: "12px 20px calc(16px + env(safe-area-inset-bottom))", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <button
                type="button"
                onClick={() => setNewCollectionOpen(true)}
                className="flex items-center gap-2 active:opacity-70 transition"
                style={{ padding: "10px 4px", color: "#fff", fontSize: 14, fontWeight: 600 }}
              >
                <Icon name="plus" size={15} color="#fff" strokeWidth={2.2} />
                Create new
              </button>
              <button
                type="button"
                disabled={!collectionConfirmActive}
                onClick={() => setCollectionSheetOpen(false)}
                className="rounded-full active:scale-95 transition"
                style={{
                  minWidth: 108,
                  padding: "11px 18px",
                  background: collectionConfirmActive ? "#fff" : "rgba(255,255,255,0.1)",
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 700, color: collectionConfirmActive ? "#111" : "rgba(255,255,255,0.42)" }}>Confirm</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {collectionAllOpen && (
        <div className="show-collection-all-scrim" onClick={() => setCollectionAllOpen(false)}>
          <div className="show-collection-all-modal" role="dialog" aria-label="Add to a collection" onClick={(ev) => ev.stopPropagation()}>
            <div className="show-collection-all-head">
              <div>
                <div className="show-collection-all-title">Collections</div>
                <div className="show-collection-all-sub">Add this movie to one or more collections</div>
              </div>
              <button type="button" className="show-collection-all-close" aria-label="Close" onClick={() => setCollectionAllOpen(false)}>
                <Icon name="x" size={16} color="#fff" strokeWidth={2.2} />
              </button>
            </div>
            <div className="show-collection-all-list">
              {collections.length === 0 ? (
                <div className="show-collection-empty">No collections yet.</div>
              ) : (
                collections.map((c) => (
                  <CollectionQuickRow key={c.id} collection={c} onClick={() => toggleCollection(c.id)} />
                ))
              )}
            </div>
            <div className="show-collection-all-footer">
              <button
                type="button"
                className="show-collection-create-new"
                onClick={() => setNewCollectionOpen(true)}
              >
                <Icon name="plus" size={14} color="#fff" strokeWidth={2.2} />
                Create new
              </button>
              <button
                type="button"
                className={`show-collection-confirm${collectionConfirmActive ? " is-active" : ""}`}
                disabled={!collectionConfirmActive}
                onClick={() => setCollectionAllOpen(false)}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {newCollectionOpen && (
        <div className="fixed inset-0 flex items-center justify-center px-8 show-collection-create-scrim" style={{ background: "rgba(0,0,0,0.45)", zIndex: 100 }} onClick={() => { setNewCollectionOpen(false); setNewCollectionName(""); }}>
          <div className="w-full rounded-3xl show-collection-create-modal" style={{ padding: 22, background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.16)", backdropFilter: "blur(40px) saturate(140%)", WebkitBackdropFilter: "blur(40px) saturate(140%)", boxShadow: "0 30px 60px rgba(0,0,0,0.55)", maxWidth: 420, position: "relative", zIndex: 110 }} onClick={(ev) => ev.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 14 }}>New Collection</div>
            <input autoFocus value={newCollectionName} onChange={(ev) => setNewCollectionName(ev.target.value)} placeholder="Collection name" className="w-full rounded-2xl outline-none" style={{ padding: "13px 16px", background: t.cardFill, border: `1px solid ${t.cardBorder}`, fontSize: 14.5, color: "#fff" }} />
            <div className="flex gap-2.5" style={{ marginTop: 18 }}>
              <button onClick={() => { setNewCollectionOpen(false); setNewCollectionName(""); }} className="flex-1 rounded-full active:scale-95 transition" style={{ padding: 12, background: t.cardFill, border: `1px solid ${t.glassBorder}` }}><span style={{ fontSize: 13.5, fontWeight: 600, color: "#fff" }}>Cancel</span></button>
              <button
                onClick={createCollectionAndAdd}
                disabled={!newCollectionName.trim()}
                className="flex-1 rounded-full active:scale-95 transition"
                style={{ padding: 12, background: newCollectionName.trim() ? "#fff" : "rgba(255,255,255,0.1)" }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 700, color: newCollectionName.trim() ? "#111" : "rgba(255,255,255,0.42)" }}>Create & Add</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {imagePickerType && (
        <MovieImagePickerScreen
          type={imagePickerType}
          movieId={movieId}
          currentUrl={imagePickerType === "backdrop" ? customBackdropUrl : imagePickerType === "poster" ? customPosterUrl : customLogoUrl}
          onSelect={(url) => setCustomImage(movieId, imagePickerType, url)}
          onClose={() => router.replace(`/movie/${movieId}`)}
        />
      )}

      {openVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.92)" }} onClick={() => setOpenVideo(null)}>
          <div className="absolute" style={{ top: "calc(env(safe-area-inset-top) + 12px)", right: 20, zIndex: 10 }} onClick={(e) => e.stopPropagation()}>
            <GlassButton onClick={() => setOpenVideo(null)} style={{ width: 38, height: 38 }}><Icon name="x" size={16} color={t.text} /></GlassButton>
          </div>
          <div className="w-full" style={{ aspectRatio: "16 / 9" }} onClick={(e) => e.stopPropagation()}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${openVideo.key}?autoplay=1&rel=0`}
              title={openVideo.name || openVideo.type}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
