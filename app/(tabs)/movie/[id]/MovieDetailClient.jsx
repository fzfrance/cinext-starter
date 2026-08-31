"use client";

import React, { useState, useEffect, useRef } from "react";
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
import { useAuth } from "@/lib/auth-context";
import { useMovieFavorites } from "@/lib/movie-favorites-context";
import { useMovieCustomizations } from "@/lib/movie-customizations-context";
import { getUserMovie, getUserMovies, setMovieStatus, removeUserMovie } from "@/lib/userMovies";
import { getMovieRating, saveMovieRating, deleteMovieRating } from "@/lib/movieRatings";
import { getCollections, createCollection, addMovieToCollection, removeMovieFromCollection } from "@/lib/collections";
import { hydrateCollectionPreviews } from "@/lib/collectionPreviews";
import { getProfile } from "@/lib/profile";
import { tmdbImage } from "@/lib/tmdb";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { themes, DEFAULT_ACCENT, tintColorForShow } from "@/lib/theme";
import { useNavTint } from "@/lib/nav-tint-context";
import { useNavVisibility } from "@/lib/nav-visibility-context";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// Trimmed port of app/(tabs)/show/[id]/ShowDetailClient.jsx for movies —
// see the approved plan (movies-as-content-type) for the full mapping.
// Kept verbatim: hero pattern, StatusMenu/favorite wiring, DetailRow/
// ProviderGroup/CastGallery, trailer + similar rows, video player modal,
// and now (movies-parity pass 3) the "..." menu (Collections + cover/
// poster/logo customization), mirroring ShowDetailClient's own
// moreMenuItems/collection-sheet/?picker= wiring exactly.
// Dropped entirely: Episodes tab and all season/episode machinery (a
// movie has none), resolveShowStatus (no watch-progress to reconcile — a
// movie's status is exactly what the user picked, no live derivation).

// id maps 1:1 to MovieImagePickerScreen's `type` prop except "tags"
// (opens the collection sheet, not a picker) and "covers" (labeled
// "covers" but maps to the "backdrop" TMDB image category) — identical
// shape to ShowDetailClient's own moreMenuItems, duplicated per the fork
// convention rather than imported/shared.
const moreMenuItems = [
  { id: "tags", label: "Add to a Collection", icon: "collection" },
  { id: "covers", label: "Change covers", icon: "image", pickerType: "backdrop" },
  { id: "poster", label: "Change poster", icon: "image", pickerType: "poster" },
  { id: "logo", label: "Change logo", icon: "logo", pickerType: "logo" },
];

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
  return (
    <div className="grid mt-4" style={{ gridTemplateColumns: "repeat(3, 1fr)", rowGap: 20, columnGap: 8 }}>
      {people.map((c) => (
        <button key={c.id} onClick={() => onSelect(c.id)} className="flex flex-col items-center text-center active:scale-95 transition">
          <div className="relative flex-shrink-0 rounded-full overflow-hidden flex items-center justify-center" style={{ width: 84, height: 84, background: c.grad }}>
            {c.profilePath ? (
              <Image src={tmdbImage(c.profilePath, "w185")} alt="" fill sizes="84px" style={{ objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{c.initials}</span>
            )}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#fff", marginTop: 8, lineHeight: 1.25 }}>{c.name}</div>
          <div style={{ fontSize: 11, color: t.textDim, marginTop: 2, lineHeight: 1.25 }}>{c.role}</div>
        </button>
      ))}
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

  // Status badges for "You May Also Like" — mirrors ShowDetailClient's
  // own identical addition, one media type over. Raw stored status, not
  // a live-resolved one (movies have no progress-vs-explicit distinction
  // to resolve anyway — see lib/userMovies.js).
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

  // "backdrop" | "poster" | "logo" | null — driven by a `?picker=` query
  // param, same reasoning as ShowDetailClient's own imagePickerType (see
  // that file's comment): the device/browser back button should close
  // just the picker, not leave Movie Detail entirely.
  const imagePickerType = searchParams.get("picker");
  const customBackdropUrl = getCustomBackdrop(movieId);
  const customPosterUrl = getCustomPoster(movieId);
  const customLogoUrl = getCustomLogo(movieId);

  const [moreOpen, setMoreOpen] = useState(false);
  const [collectionSheetOpen, setCollectionSheetOpen] = useState(false);
  const [collections, setCollections] = useState([]);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");

  // Collections sheet — which of the user's collections this movie is
  // already in, mirrors ShowDetailClient's identical effect.
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
      const hydrated = await hydrateCollectionPreviews(mapped, 5);
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
    setCollections((cs) => cs.map((c) => {
      if (c.id !== id) return c;
      const covers = c.inShow
        ? (c.covers ?? []).filter((item) => !(item.mediaType === "movie" && item.id === movieId))
        : [{ id: movieId, title: movie.title, posterPath: movie.posterPath, backdropPath: movie.backdropPath, mediaType: "movie" }, ...(c.covers ?? [])].slice(0, 5);
      return { ...c, covers, inShow: !c.inShow, count: c.inShow ? Math.max(0, c.count - 1) : c.count + 1 };
    }));
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

  // Auto title logo — same pattern as Show Detail, hitting the movie-scoped
  // sibling route (app/api/movies/logos) since a movie's images live under
  // TMDB's /movie/{id}/images, not /tv/{id}/images.
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
  // A movie's status is always exactly what the user picked — no
  // resolveShowStatus-style live derivation from watch progress, since a
  // movie has no episodes to derive progress from. null = nothing chosen
  // yet (same "Choose Status" fallback Show Detail uses).
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
    setStatus(id);
    setMovieStatus(user.id, movieId, id, "MovieDetailClient:selectStatus").catch(console.error);
    setStatusOpen(false);
  };

  const addToLibrary = () => {
    if (!user) { router.push("/login"); return; }
    setInLibrary(true);
    setStatusOpen(true);
  };

  // My Rating — one rating per movie (not per-season), see
  // lib/movieRatings.js. ratingLoaded gates opening the editor the same
  // way Show Detail's seasonRatingsLoaded does, so it never mounts with a
  // stale/undefined `manual`.
  const [rating, setRatingValue] = useState(null);
  const [ratingLoaded, setRatingLoaded] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingInitialEditing, setRatingInitialEditing] = useState(false);
  // MovieShareRatingCard's ticket-stub username — same getProfile lookup
  // ShowDetailClient's own ShareRatingCard wiring uses.
  const [username, setUsername] = useState("you");
  // No season id to key off (a movie has one rating, period) — just
  // whether the share card is open at all.
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

  // Profile's My Ratings row deep-links here as /movie/[id]?tab=reviews,
  // landing straight in the rating editor/saved-card instead of just the
  // Details tab — same pattern as ShowDetailClient's own reviewOpenedFromProfile/
  // deepLinkPending, simplified since a movie has no seasons array to
  // validate a param against (there's only ever the one rating).
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

  // See ShowDetailClient.jsx's identical effect — the shared bottom nav
  // floats above these full-screen overlays and stays clickable on top
  // of them otherwise.
  const [, setNavHidden] = useNavVisibility();
  useEffect(() => {
    const hidden = collectionSheetOpen || newCollectionOpen || !!openVideo;
    setNavHidden(hidden);
    return () => setNavHidden(false);
  }, [collectionSheetOpen, newCollectionOpen, openVideo, setNavHidden]);

  return (
    <div className="min-h-dvh" style={{ background: t.bg }}>
      <div className="pb-8">

        {/* hero — same 415px height / floating-poster offset as Show
            Detail's own hero, verbatim. */}
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
              {!movie.posterPath && (
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
          {customLogoUrl || autoLogoUrl ? (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- resolved TMDB CDN URL, not a next/image-managed path */}
              <img
                src={customLogoUrl || autoLogoUrl}
                alt={displayTitle}
                onError={() => { if (!customLogoUrl) setAutoLogoFailed(true); }}
                style={{ maxWidth: "80%", maxHeight: 72, objectFit: "contain" }}
              />
            </div>
          ) : (
            <div className="text-center" style={{ fontSize: 30, fontWeight: 800, color: "#fff", letterSpacing: "0.01em" }}>{displayTitle}</div>
          )}
          <div className="text-center" style={{ fontSize: 12, color: t.textDim, marginTop: 9 }}>{movie.year} · {movie.genres} · ★ {movie.rating}</div>

          <div className="flex items-center justify-center gap-2.5" style={{ marginTop: 17 }}>
            {!inLibrary ? (
              <button onClick={addToLibrary} className="flex items-center gap-2 rounded-full active:scale-95 transition" style={{ padding: "10px 20px", background: "#fff", color: "#111" }}>
                <Icon name="plus" size={14} color="#111" />
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>Add to Library</span>
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
                  {/* Stays "Add to Library" (not a "Choose Status"
                      placeholder) for as long as nothing's actually been
                      picked yet — the button's copy only changes once
                      selectStatus sets a real status, not the instant the
                      menu opens. Deliberately diverges from Show Detail's
                      own "Choose Status" default (not changed there). */}
                  <button onClick={() => setStatusOpen((v) => !v)} className="flex items-center gap-2 rounded-full active:scale-95 transition" style={{ padding: "10px 18px", background: "#fff", color: "#111" }}>
                    <Icon name={status == null ? "plus" : status === "watchlist" ? "bookmarkFilled" : movieStatusMenuOptions.find((s) => s.id === status)?.icon ?? "plus"} size={15} color="#111" />
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{status == null ? "Add to Library" : movieStatusMenuOptions.find((s) => s.id === status)?.label ?? "Add to Library"}</span>
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

          {/* tabs — Details / Cast & Crew / My Rating only, no Episodes */}
          <div className="mt-5 flex gap-5" style={{ borderBottom: `1px solid ${t.cardBorder}` }}>
            {[{ id: "details", label: "Details" }, { id: "cast", label: "Cast & Crew" }, { id: "reviews", label: "My Rating" }].map((tb) => (
              <button key={tb.id} onClick={() => setTab(tb.id)} className="pb-2.5" style={{
                fontSize: 13.5, fontWeight: 600, color: tab === tb.id ? "#fff" : t.textDim,
                borderBottom: tab === tb.id ? `2px solid ${accent}` : "2px solid transparent",
              }}>{tb.label}</button>
            ))}
          </div>

          {/* ---------- Cast tab ---------- */}
          {tab === "cast" && (
            cast.length === 0 ? (
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
            )
          )}

          {/* ---------- Details tab ---------- */}
          {tab === "details" && (
            <div className="mt-4 rounded-2xl overflow-hidden" style={{ background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
              <DetailRow icon="clock" label="Runtime" divider={false}>
                <span style={{ fontSize: 12.5, color: "#fff", fontWeight: 500 }}>
                  {movie.runtime ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` : "—"}
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

          {/* ---------- My Rating tab — one rating per movie ---------- */}
          {tab === "reviews" && (
            <div className="mt-4">
              <MovieRatingBanner
                movie={movie}
                manual={rating}
                backdropPath={movie.backdropPath}
                logoUrl={autoLogoUrl}
                onClick={openRating}
              />
            </div>
          )}

          {/* trailer & more — verbatim from Show Detail */}
          <div className="mt-7">
            <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 10 }}>Trailer & More</div>
            {videos.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {videos.map((v) => (
                  <button
                    key={v.key}
                    onClick={() => setOpenVideo(v)}
                    className="relative flex-shrink-0 rounded-2xl overflow-hidden block active:scale-[0.98] transition"
                    style={{ width: 242, height: 143 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail CDN, not TMDB */}
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

          {/* similar */}
          <div className="mt-7 mb-2">
            <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 10 }}>You May Also Like</div>
            {resolvedSimilar.length === 0 ? (
              <span style={{ fontSize: 12.5, color: t.textDim }}>No recommendations yet.</span>
            ) : (
              <div className="flex gap-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {resolvedSimilar.map((s) => (
                  <Link key={s.id} href={`/movie/${s.id}`} className="flex-shrink-0 block" style={{ width: 100 }}>
                    <div className="relative rounded-2xl overflow-hidden" style={{ width: 100, height: 140 }}>
                      <PosterArt posterPath={s.posterPath} alt={s.title} />
                      <MediaStatusBadge status={similarStatusMap[s.id]} />
                    </div>
                    <div style={{ fontSize: 11.5, color: "#fff", marginTop: 6, fontWeight: 500 }}>{s.title}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Deep-link cover — hides this page's own hero/details content while
          a ?tab=reviews visitor's rating data is still loading, same
          reasoning/z-40 as ShowDetailClient's own cover. */}
      {deepLinkPending && <div className="fixed inset-0 z-40" style={{ background: "#0A0A0C" }} />}

      {/* ---------- Movie rating screen ---------- */}
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

      {/* ---------- Shareable rating card ---------- */}
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

      {/* ---------- Add to a Collection — bottom sheet ---------- */}
      {collectionSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setCollectionSheetOpen(false)}>
          <div className="w-full rounded-t-3xl flex flex-col" style={{ maxHeight: "76%", background: "#161210", border: `1px solid ${t.glassBorder}`, borderBottom: "none", boxShadow: "0 -20px 60px rgba(0,0,0,0.6)" }} onClick={(ev) => ev.stopPropagation()}>
            <div className="flex justify-center flex-shrink-0" style={{ paddingTop: 10 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.25)" }} />
            </div>
            <div className="flex items-center justify-between px-5 flex-shrink-0" style={{ paddingTop: 14, paddingBottom: 4 }}>
              <button onClick={() => setCollectionSheetOpen(false)} className="rounded-full flex items-center justify-center active:scale-90 transition" style={{ width: 36, height: 36, background: accent }}>
                <Icon name="x" size={16} color="#1a1108" strokeWidth={2.6} />
              </button>
              <span style={{ fontSize: 19, fontWeight: 800, color: "#fff" }}>Collections</span>
              <button onClick={() => setCollectionSheetOpen(false)} className="rounded-full flex items-center justify-center active:scale-90 transition" style={{ width: 36, height: 36, background: accent }}>
                <Icon name="check" size={17} color="#1a1108" strokeWidth={2.8} />
              </button>
            </div>

            <div className="overflow-y-auto" style={{ padding: "16px 20px", scrollbarWidth: "none" }}>
              <div className="flex flex-col gap-3">
                {collections.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: t.textDim, textAlign: "center", padding: "24px 0" }}>No collections yet.</div>
                ) : collections.map((c) => (
                  <CollectionPickerCard key={c.id} collection={c} accent={accent} onClick={() => toggleCollection(c.id)} />
                ))}
              </div>
              <div style={{ height: 76 }} />
            </div>

            <button onClick={() => setNewCollectionOpen(true)} className="absolute rounded-full flex items-center justify-center active:scale-90 transition" style={{ bottom: 20, right: 20, width: 52, height: 52, background: accent, boxShadow: "0 10px 24px rgba(232,162,76,0.4)" }}>
              <Icon name="plus" size={22} color="#1a1108" strokeWidth={2.4} />
            </button>
          </div>
        </div>
      )}

      {/* create a new collection, adds the movie to it immediately */}
      {newCollectionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-8" style={{ background: "rgba(0,0,0,0.65)" }} onClick={() => setNewCollectionOpen(false)}>
          <div className="w-full rounded-3xl" style={{ padding: 22, background: "#1a1512", border: `1px solid ${t.glassBorder}`, boxShadow: "0 30px 60px rgba(0,0,0,0.6)" }} onClick={(ev) => ev.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 14 }}>New Collection</div>
            <input autoFocus value={newCollectionName} onChange={(ev) => setNewCollectionName(ev.target.value)} placeholder="Collection name" className="w-full rounded-2xl outline-none" style={{ padding: "13px 16px", background: t.cardFill, border: `1px solid ${t.cardBorder}`, fontSize: 14.5, color: "#fff" }} />
            <div className="flex gap-2.5" style={{ marginTop: 18 }}>
              <button onClick={() => { setNewCollectionOpen(false); setNewCollectionName(""); }} className="flex-1 rounded-full active:scale-95 transition" style={{ padding: 12, background: t.cardFill, border: `1px solid ${t.glassBorder}` }}><span style={{ fontSize: 13.5, fontWeight: 600, color: "#fff" }}>Cancel</span></button>
              <button onClick={createCollectionAndAdd} disabled={!newCollectionName.trim()} className="flex-1 rounded-full active:scale-95 transition" style={{ padding: 12, background: newCollectionName.trim() ? accent : t.cardFill }}><span style={{ fontSize: 13.5, fontWeight: 700, color: newCollectionName.trim() ? "#1a1108" : t.textDim }}>Create & Add</span></button>
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

      {/* Plays in-app instead of opening YouTube — same as Show Detail. */}
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
