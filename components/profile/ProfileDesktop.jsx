"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import Grain from "@/components/ui/Grain";
import PosterCard from "@/components/ui/PosterCard";
import PosterArt from "@/components/ui/PosterArt";
import StarInput from "@/components/ui/StarInput";
import FavoritesAllModal from "@/components/ui/FavoritesAllModal";
import RatingsAllModal from "@/components/ui/RatingsAllModal";
import TimeMachineYearModal from "@/components/ui/TimeMachineYearModal";
import ShareRatingCard from "@/components/ShareRatingCard";
import MovieShareRatingCard from "@/components/MovieShareRatingCard";
import TimeMachineSection from "@/components/profile/TimeMachineSection";
import CollectionBoxSet from "@/components/CollectionBoxSet";
import { useDesktopModals } from "@/lib/desktop-modals-context";
import { useAmbientPalette } from "@/lib/ambientPalette";
import { fallbackPalette, seasonLabel } from "@/lib/library";
import { resolveTitle } from "@/lib/languages";
import { DEFAULT_ACCENT, initialsOf } from "@/lib/theme";
import { tmdbImage } from "@/lib/tmdb";
import {
  FAVORITE_SHOWS_ORDER_KEY,
  FAVORITE_SHOWS_SORT_KEY,
  FAVORITE_MOVIES_ORDER_KEY,
  FAVORITE_MOVIES_SORT_KEY,
} from "@/lib/favoritesOrder";

const accent = DEFAULT_ACCENT;

/** Explore-matching poster width on the full-page profile. */
const PAGE_POSTER_WIDTH = 152;
const CARD_POSTER_WIDTH = 100;

function CoverBackdrop({ imageUrl, fullBleed = false }) {
  return (
    <div className="profile-desktop-cover-art" aria-hidden="true">
      {imageUrl ? (
        fullBleed ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- Storage URL */}
            <img src={imageUrl} alt="" className="profile-desktop-cover-blur" />
            <div className="profile-desktop-cover-focus">
              {/* eslint-disable-next-line @next/next/no-img-element -- Storage URL */}
              <img src={imageUrl} alt="" />
            </div>
          </>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- Storage URL
          <img src={imageUrl} alt="" className="profile-desktop-cover-img" />
        )
      ) : (
        <div className="profile-desktop-cover-fallback" />
      )}
      <div className="profile-desktop-cover-veil" />
      <Grain />
    </div>
  );
}

function CollectionBackdrop({ covers }) {
  const c1 = covers[0] || { base: "#221a14", glow: accent };
  const c2 = covers[1] || c1;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: `linear-gradient(120deg, ${c1.glow}40 0%, ${c1.base} 45%, ${c2.base} 100%)` }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 25% 30%, ${c1.glow}45, transparent 60%)` }} />
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 80% 70%, ${c2.glow}30, transparent 55%)` }} />
      <Grain />
    </div>
  );
}

function SectionHead({ title, href, onNavigate, onSeeAll }) {
  return (
    <div className="profile-desktop-section-head">
      <h2>{title}</h2>
      {onSeeAll ? (
        <button
          type="button"
          className="profile-desktop-section-more"
          aria-label={`See all ${title}`}
          onClick={onSeeAll}
        >
          <Icon name="chevronRight" size={16} color="rgba(255,255,255,0.55)" />
        </button>
      ) : href ? (
        <Link
          href={href}
          className="profile-desktop-section-more"
          aria-label={`See all ${title}`}
          onClick={() => onNavigate?.()}
        >
          <Icon name="chevronRight" size={16} color="rgba(255,255,255,0.55)" />
        </Link>
      ) : null}
    </div>
  );
}

function MonthStats({ monthStats }) {
  if (!monthStats) return null;
  return (
    <div className="profile-desktop-month-stats" aria-label="This month">
      {[
        ["tv", monthStats.shows, "Shows"],
        ["clapperboard", monthStats.movies, "Movies"],
        ["calendar", monthStats.activeDays, "Active days"],
        ["refresh", monthStats.rewatched, "Rewatched"],
      ].map(([icon, n, label]) => (
        <div key={label} className="profile-desktop-month-stat">
          <div className="profile-desktop-month-stat-icon" aria-hidden="true">
            <Icon name={icon} size={15} color="rgba(255,255,255,0.78)" strokeWidth={1.5} />
          </div>
          <strong>{n}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function RatingPreviewCard({ rating, readableLanguages, onOpen }) {
  const isMovie = rating.mediaType === "movie";
  const displayTitle = rating.title ? resolveTitle(rating, readableLanguages) : null;
  const posterUrl = rating.posterPath ? tmdbImage(rating.posterPath, "w342") : null;
  const ambient = useAmbientPalette(posterUrl);
  const palette = fallbackPalette(isMovie ? rating.movieId : rating.showId);

  return (
    <button
      type="button"
      className="profile-desktop-rating-card"
      style={{
        "--rating-ambient-primary": ambient.primary,
        "--rating-ambient-secondary": ambient.secondary,
        "--rating-ambient-surface": ambient.surface,
      }}
      onClick={onOpen}
    >
      <div className="profile-desktop-rating-wash" aria-hidden="true">
        {posterUrl ? (
          <div
            className="profile-desktop-rating-wash-art"
            style={{ backgroundImage: `url(${posterUrl})` }}
          />
        ) : null}
        <div className="profile-desktop-rating-wash-veil" />
      </div>
      <div className="profile-desktop-rating-poster">
        <PosterArt
          posterPath={rating.posterPath}
          base={palette.base}
          glow={palette.glow}
          alt={displayTitle ?? ""}
        />
      </div>
      <div className="profile-desktop-rating-copy">
        <div className="profile-desktop-rating-title">{displayTitle ?? "…"}</div>
        {!isMovie && (
          <div className="profile-desktop-rating-season">{seasonLabel(rating.seasonNumber)}</div>
        )}
        <div className="profile-desktop-rating-stars">
          <StarInput value={rating.rating / 2} onChange={() => {}} size={14} gap={2} readOnly />
        </div>
        <div className="profile-desktop-rating-score">{rating.rating.toFixed(1)}</div>
      </div>
    </button>
  );
}

/**
 * Desktop Profile content for the mid-screen floating card / full page.
 */
export default function ProfileDesktop({
  profile,
  user,
  displayName,
  bio,
  monthStats,
  collections,
  displayedFavorites,
  displayedMovieFavorites,
  favoritesRowLoading,
  movieFavoritesRowLoading,
  myRatings,
  timeMachineYears,
  timeMachineLoading,
  isFavorite,
  isMovieFavorite,
  toggleFavorite,
  toggleMovieFavorite,
  readableLanguages,
  onClose,
  expanded = false,
  onToggleExpand,
  onShowFavSortChange,
  onMovieFavSortChange,
  onShowFavOrderChange,
  onMovieFavOrderChange,
}) {
  const router = useRouter();
  const { openEditProfile, markReopenProfile } = useDesktopModals();
  const ambient = useAmbientPalette(profile?.backgroundUrl || null);
  const [favoritesModal, setFavoritesModal] = useState(null); // "shows" | "movies" | null
  const [ratingsModalOpen, setRatingsModalOpen] = useState(false);
  const [timeMachineYear, setTimeMachineYear] = useState(null);
  const [shareRating, setShareRating] = useState(null);

  useEffect(() => {
    if (!shareRating) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      setShareRating(null);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [shareRating]);

  const handle = profile?.handle ? `@${profile.handle}` : null;
  const initials = initialsOf(displayName || user?.email || "?") || "?";
  const posterWidth = expanded ? PAGE_POSTER_WIDTH : CARD_POSTER_WIDTH;
  const shareUsername = profile?.handle || displayName || "Cinext";

  const go = (href, { reopenProfile = false } = {}) => {
    if (reopenProfile) markReopenProfile?.(href);
    onClose?.();
    router.push(href);
  };

  const openShareRating = (rating) => {
    setShareRating(rating);
  };

  const editShareRating = (rating) => {
    setShareRating(null);
    const isMovie = rating.mediaType === "movie";
    const href = isMovie
      ? `/movie/${rating.movieId}?tab=reviews&edit=1`
      : `/show/${rating.showId}?tab=reviews&reviewSeason=${rating.seasonNumber}&edit=1`;
    markReopenProfile?.(href);
    onClose?.();
    router.push(href);
  };

  return (
    <div
      className={`profile-desktop${expanded ? " is-page" : " is-card"}`}
      style={{
        "--profile-ambient-primary": ambient.primary,
        "--profile-ambient-secondary": ambient.secondary,
        "--profile-ambient-surface": ambient.surface,
      }}
    >
      <div className="profile-desktop-ambient" aria-hidden="true">
        {profile?.backgroundUrl ? (
          <div
            className="profile-desktop-ambient-art"
            style={{ backgroundImage: `url(${profile.backgroundUrl})` }}
          />
        ) : null}
        <div className="profile-desktop-ambient-veil" />
      </div>

      {onToggleExpand ? (
        <button
          type="button"
          className="profile-desktop-close"
          onClick={onToggleExpand}
          aria-label={expanded ? "Collapse profile" : "Expand profile"}
        >
          <Icon name={expanded ? "collapse" : "expand"} size={15} />
        </button>
      ) : onClose ? (
        <button type="button" className="profile-desktop-close" onClick={onClose} aria-label="Close profile">
          <Icon name="x" size={16} />
        </button>
      ) : null}

      <div className="profile-desktop-scroll">
        <header className="profile-desktop-cover">
          <CoverBackdrop imageUrl={profile?.backgroundUrl} fullBleed={expanded} />
        </header>

        <div className="profile-desktop-shell">
          <section className="profile-desktop-identity">
            <div className="profile-desktop-avatar-wrap">
              <div className="profile-desktop-avatar">
                {profile?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Storage URL
                  <img src={profile.avatarUrl} alt="" />
                ) : (
                  <span>{initials.slice(0, 1)}</span>
                )}
              </div>
            </div>

            <div className="profile-desktop-identity-main">
              <div className="profile-desktop-identity-copy">
                <h1 className="profile-desktop-name">{displayName || "Your profile"}</h1>
                {handle ? <div className="profile-desktop-handle">{handle}</div> : null}
                {bio ? <p className="profile-desktop-bio">{bio}</p> : null}
              </div>

              <MonthStats monthStats={monthStats} />

              <button
                type="button"
                className="profile-desktop-edit-profile"
                onClick={() => openEditProfile()}
              >
                <Icon name="edit" size={11} color="#fff" />
                <span>Edit profile</span>
              </button>
            </div>
          </section>

          <div className="profile-desktop-body">
            <section className="profile-desktop-section">
              <SectionHead
                title="Favorite Shows"
                onSeeAll={() => setFavoritesModal("shows")}
              />
              <div className="profile-desktop-poster-row">
                {favoritesRowLoading ? (
                  [0, 1, 2, 3].map((i) => <div key={i} className="profile-desktop-poster-skeleton" />)
                ) : displayedFavorites.length === 0 ? (
                  <p className="profile-desktop-empty">No favorite shows yet.</p>
                ) : (
                  displayedFavorites.map((s) => (
                    <PosterCard
                      key={s.id}
                      show={s}
                      width={posterWidth}
                      titlePlacement="below"
                      favorite={isFavorite(s.id)}
                      onToggleFavorite={() => toggleFavorite(s.id, "ProfileDesktop:favoritesRow")}
                      onClick={() => go(`/show/${s.id}`, { reopenProfile: true })}
                    />
                  ))
                )}
              </div>
            </section>

            <section className="profile-desktop-section">
              <SectionHead
                title="Favorite Movies"
                onSeeAll={() => setFavoritesModal("movies")}
              />
              <div className="profile-desktop-poster-row">
                {movieFavoritesRowLoading ? (
                  [0, 1, 2, 3].map((i) => <div key={i} className="profile-desktop-poster-skeleton" />)
                ) : displayedMovieFavorites.length === 0 ? (
                  <p className="profile-desktop-empty">No favorite movies yet.</p>
                ) : (
                  displayedMovieFavorites.map((m) => (
                    <PosterCard
                      key={m.id}
                      show={m}
                      width={posterWidth}
                      titlePlacement="below"
                      favorite={isMovieFavorite(m.id)}
                      onToggleFavorite={() => toggleMovieFavorite(m.id, "ProfileDesktop:movieFavoritesRow")}
                      onClick={() => go(`/movie/${m.id}`, { reopenProfile: true })}
                    />
                  ))
                )}
              </div>
            </section>

            <section className="profile-desktop-section">
              <SectionHead
                title="Collections"
                onSeeAll={() => go("/library?tab=collections", { reopenProfile: true })}
              />
              <div className="profile-desktop-collection-row">
                {collections.length === 0 ? (
                  <p className="profile-desktop-empty">No collections yet.</p>
                ) : (
                  collections.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className="profile-desktop-collection-card"
                      onClick={() => go(`/profile/collections/${l.id}`, { reopenProfile: true })}
                    >
                      {l.coverStyle === "boxset" ? (
                        <CollectionBoxSet shows={l.covers} compact />
                      ) : (
                        <CollectionBackdrop covers={l.covers} />
                      )}
                      <div className="profile-desktop-collection-scrim">
                        <div className="profile-desktop-collection-name">{l.name}</div>
                        <div className="profile-desktop-collection-count">
                          {l.count} title{l.count === 1 ? "" : "s"}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>

            {myRatings.length > 0 && (
              <section className="profile-desktop-section">
                <SectionHead
                  title="My Ratings"
                  onSeeAll={() => setRatingsModalOpen(true)}
                />
                <div className="profile-desktop-rating-row">
                  {myRatings.map((r) => {
                    const isMovie = r.mediaType === "movie";
                    const key = isMovie ? `movie-${r.movieId}` : `tv-${r.showId}-${r.seasonNumber}`;
                    return (
                      <RatingPreviewCard
                        key={key}
                        rating={r}
                        readableLanguages={readableLanguages}
                        onOpen={() => openShareRating(r)}
                      />
                    );
                  })}
                </div>
              </section>
            )}

            <div className="profile-desktop-time-machine">
              <TimeMachineSection
                years={timeMachineYears}
                loading={timeMachineLoading}
                onYearSelect={(year) => setTimeMachineYear(year)}
              />
            </div>
          </div>
        </div>
      </div>

      <FavoritesAllModal
        open={favoritesModal === "shows"}
        mediaType="show"
        items={displayedFavorites}
        sortKey={FAVORITE_SHOWS_SORT_KEY}
        orderKey={FAVORITE_SHOWS_ORDER_KEY}
        loading={favoritesRowLoading}
        isFavorite={isFavorite}
        onToggleFavorite={(id) => toggleFavorite(id, "FavoritesAllModal:shows")}
        onSortChange={onShowFavSortChange}
        onOrderChange={onShowFavOrderChange}
        onClose={() => setFavoritesModal(null)}
        onNavigate={(href) => {
          setFavoritesModal(null);
          go(href, { reopenProfile: true });
        }}
      />
      <FavoritesAllModal
        open={favoritesModal === "movies"}
        mediaType="movie"
        items={displayedMovieFavorites}
        sortKey={FAVORITE_MOVIES_SORT_KEY}
        orderKey={FAVORITE_MOVIES_ORDER_KEY}
        loading={movieFavoritesRowLoading}
        isFavorite={isMovieFavorite}
        onToggleFavorite={(id) => toggleMovieFavorite(id, "FavoritesAllModal:movies")}
        onSortChange={onMovieFavSortChange}
        onOrderChange={onMovieFavOrderChange}
        onClose={() => setFavoritesModal(null)}
        onNavigate={(href) => {
          setFavoritesModal(null);
          go(href, { reopenProfile: true });
        }}
      />
      <RatingsAllModal
        open={ratingsModalOpen}
        onClose={() => setRatingsModalOpen(false)}
        onOpenRating={(rating) => {
          setRatingsModalOpen(false);
          openShareRating(rating);
        }}
      />
      <TimeMachineYearModal
        open={timeMachineYear != null}
        year={timeMachineYear}
        onClose={() => setTimeMachineYear(null)}
        onNavigate={(href) => {
          setTimeMachineYear(null);
          go(href);
        }}
      />

      {shareRating && user?.id && shareRating.mediaType === "movie" ? (
        <MovieShareRatingCard
          elevated
          userId={user.id}
          movieId={shareRating.movieId}
          movieTitle={shareRating.title}
          originalTitle={shareRating.originalTitle}
          originalLanguage={shareRating.originalLanguage}
          movie={{
            posterPath: shareRating.posterPath,
            year: shareRating.year,
            runtime: shareRating.runtime,
          }}
          manual={{
            rating: shareRating.rating,
            text: shareRating.text,
            mood: shareRating.mood,
            characterName: shareRating.characterName,
          }}
          backdropPath={shareRating.backdropPath}
          username={shareUsername}
          onClose={() => setShareRating(null)}
          onEdit={() => editShareRating(shareRating)}
        />
      ) : null}
      {shareRating && user?.id && shareRating.mediaType !== "movie" ? (
        <ShareRatingCard
          elevated
          userId={user.id}
          showId={shareRating.showId}
          showTitle={shareRating.title}
          originalTitle={shareRating.originalTitle}
          originalLanguage={shareRating.originalLanguage}
          season={{
            seasonNumber: shareRating.seasonNumber,
            posterPath: shareRating.posterPath,
          }}
          manual={
            shareRating.isAuto
              ? null
              : {
                  rating: shareRating.rating,
                  text: shareRating.text,
                  mood: shareRating.mood,
                  characterName: shareRating.characterName,
                }
          }
          auto={shareRating.isAuto ? { avg10: shareRating.rating } : null}
          backdropPath={shareRating.backdropPath}
          username={shareUsername}
          onClose={() => setShareRating(null)}
          onEdit={() => editShareRating(shareRating)}
        />
      ) : null}
    </div>
  );
}
