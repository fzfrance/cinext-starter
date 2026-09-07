"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import Grain from "@/components/ui/Grain";
import PosterCard from "@/components/ui/PosterCard";
import PosterArt from "@/components/ui/PosterArt";
import StarInput from "@/components/ui/StarInput";
import TimeMachineSection from "@/components/profile/TimeMachineSection";
import CollectionBoxSet from "@/components/CollectionBoxSet";
import { useDesktopModals } from "@/lib/desktop-modals-context";
import { fallbackPalette, seasonLabel } from "@/lib/library";
import { resolveTitle } from "@/lib/languages";
import { DEFAULT_ACCENT, initialsOf } from "@/lib/theme";

const accent = DEFAULT_ACCENT;

function CoverBackdrop({ imageUrl }) {
  return (
    <div className="profile-desktop-cover-art" aria-hidden="true">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Storage URL
        <img src={imageUrl} alt="" className="profile-desktop-cover-img" />
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

function SectionHead({ title, href, onNavigate }) {
  return (
    <div className="profile-desktop-section-head">
      <h2>{title}</h2>
      {href ? (
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

/**
 * Desktop Profile content for the mid-screen floating card.
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
}) {
  const router = useRouter();
  const { openEditProfile, markReopenProfile } = useDesktopModals();

  const handle = profile?.handle ? `@${profile.handle}` : null;
  const initials = initialsOf(displayName || user?.email || "?") || "?";

  const go = (href) => {
    onClose?.();
    router.push(href);
  };

  const openRating = (href) => {
    markReopenProfile?.();
    onClose?.();
    router.push(href);
  };

  return (
    <div className="profile-desktop">
      {onClose ? (
        <button type="button" className="profile-desktop-close" onClick={onClose} aria-label="Close profile">
          <Icon name="x" size={16} />
        </button>
      ) : null}

      <div className="profile-desktop-scroll">
        <header className="profile-desktop-cover">
          <CoverBackdrop imageUrl={profile?.backgroundUrl} />
          <div className="profile-desktop-cover-actions">
            <button type="button" className="profile-desktop-cover-edit" onClick={openEditProfile}>
              <Icon name="camera" size={14} color="#fff" />
              <span>Edit cover</span>
            </button>
          </div>
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
              <button type="button" className="profile-desktop-edit-profile" onClick={openEditProfile}>
                <Icon name="edit" size={12} color="#fff" />
                <span>Edit profile</span>
              </button>
              <div className="profile-desktop-identity-copy">
                <h1 className="profile-desktop-name">{displayName || "Your profile"}</h1>
                {handle ? <div className="profile-desktop-handle">{handle}</div> : null}
                {bio ? <p className="profile-desktop-bio">{bio}</p> : null}

                {monthStats && (
                  <div className="profile-desktop-month-stats" aria-label="This month">
                    {[
                      [monthStats.shows, "Shows"],
                      [monthStats.movies, "Movies"],
                      [monthStats.activeDays, "Active days"],
                      [monthStats.rewatched, "Rewatched"],
                    ].map(([n, label]) => (
                      <div key={label} className="profile-desktop-month-stat">
                        <strong>{n}</strong>
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="profile-desktop-body">
            <section className="profile-desktop-section">
              <SectionHead title="Favorite Shows" href="/profile/favorites" onNavigate={onClose} />
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
                      href={`/show/${s.id}`}
                      width={100}
                      titlePlacement="overlay"
                      favorite={isFavorite(s.id)}
                      onToggleFavorite={() => toggleFavorite(s.id, "ProfileDesktop:favoritesRow")}
                    />
                  ))
                )}
              </div>
            </section>

            <section className="profile-desktop-section">
              <SectionHead title="Favorite Movies" href="/profile/favorites/movies" onNavigate={onClose} />
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
                      href={`/movie/${m.id}`}
                      width={100}
                      titlePlacement="overlay"
                      favorite={isMovieFavorite(m.id)}
                      onToggleFavorite={() => toggleMovieFavorite(m.id, "ProfileDesktop:movieFavoritesRow")}
                    />
                  ))
                )}
              </div>
            </section>

            <section className="profile-desktop-section">
              <SectionHead title="Collections" href="/profile/collections" onNavigate={onClose} />
              <div className="profile-desktop-collection-row">
                {collections.length === 0 ? (
                  <p className="profile-desktop-empty">No collections yet.</p>
                ) : (
                  collections.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className="profile-desktop-collection-card"
                      onClick={() => go(`/profile/collections/${l.id}`)}
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
                <SectionHead title="My Ratings" href="/profile/ratings" onNavigate={onClose} />
                <div className="profile-desktop-rating-row">
                  {myRatings.map((r) => {
                    const isMovie = r.mediaType === "movie";
                    const displayTitle = r.title ? resolveTitle(r, readableLanguages) : null;
                    const key = isMovie ? `movie-${r.movieId}` : `tv-${r.showId}-${r.seasonNumber}`;
                    const ratingPath = isMovie
                      ? `/movie/${r.movieId}?tab=reviews`
                      : `/show/${r.showId}?tab=reviews&reviewSeason=${r.seasonNumber}`;
                    const palette = fallbackPalette(isMovie ? r.movieId : r.showId);
                    return (
                      <button
                        key={key}
                        type="button"
                        className="profile-desktop-rating-card"
                        onClick={() => openRating(ratingPath)}
                      >
                        <div className="profile-desktop-rating-poster">
                          <PosterArt posterPath={r.posterPath} base={palette.base} glow={palette.glow} alt={displayTitle ?? ""} />
                        </div>
                        <div className="profile-desktop-rating-copy">
                          <div className="profile-desktop-rating-title">{displayTitle ?? "…"}</div>
                          {!isMovie && (
                            <div className="profile-desktop-rating-season">{seasonLabel(r.seasonNumber)}</div>
                          )}
                          <div className="profile-desktop-rating-stars">
                            <StarInput value={r.rating / 2} onChange={() => {}} size={12} gap={2} readOnly />
                          </div>
                          <div className="profile-desktop-rating-score">{r.rating.toFixed(1)}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="profile-desktop-time-machine">
              <TimeMachineSection
                years={timeMachineYears}
                loading={timeMachineLoading}
                onYearSelect={(year) => go(`/profile/time-machine/${year}`)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
