"use client";

import Link from "next/link";
import PosterArt from "@/components/ui/PosterArt";

export default function LibraryDesktopGridCard({ item, mediaType }) {
  const href = mediaType === "movie" ? `/movie/${item.id}` : `/show/${item.id}`;
  const year = item.year || null;
  const rating = item.tmdbRating != null ? Number(item.tmdbRating).toFixed(1) : null;
  const meta = [year, rating != null ? `★ ${rating}` : null].filter(Boolean).join(" · ");

  return (
    <Link href={href} className="library-desktop-grid-card">
      <div className="library-desktop-grid-art">
        <PosterArt posterPath={item.posterPath} alt={item.title} tmdbSize="w500" sizes="(min-width: 900px) 18vw, 40vw" />
        <div className="library-desktop-grid-scrim">
          <div className="library-desktop-grid-title">{item.title}</div>
          {meta ? <div className="library-desktop-grid-meta">{meta}</div> : null}
        </div>
      </div>
    </Link>
  );
}
