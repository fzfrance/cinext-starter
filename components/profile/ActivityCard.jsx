"use client";

import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import PosterArt from "@/components/ui/PosterArt";
import { formatActivityTime } from "@/lib/activity";
import { seasonLabel } from "@/lib/library";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

const ACTION_LABEL = {
  added: "added to Library",
  completed: "completed",
  rated: "rated",
  watched: "watched",
  rewatched: "rewatched",
  favorited: "favorited",
  addedToCollection: (event) => `added to ${event.collectionName}`,
};

const AVATAR_SIZE = 26;
const AVATAR_GAP = 10; // matches gap-2.5
const POSTER_WIDTH = 87; // 76 * 1.15

// Row order, top to bottom: 1) avatar + "Name action" (plain, no show name
// on this line), 2) show title + episode/season context right under it
// (only "rated" events carry a Season line, only "watched"/"rewatched"
// carry an Episode one — "added to Library"/"completed"/"favorited"/
// "added to collection" aren't tied to any specific season or episode,
// so they show neither), 3) poster (fixed thumbnail size, nudged right so
// its left edge lines up with the name text, not flush under the avatar)
// — rating badge in its bottom-LEFT corner, 4) timestamp. Every event is
// currently the signed-in user's own (no friends/following system exists
// yet — see lib/activity.js's header comment), so avatar/name are always
// the real signed-in profile, not a stand-in "You".
export default function ActivityCard({ event, show, avatarUrl, displayName, now }) {
  const router = useRouter();
  if (!show) return null;
  const isMovie = event.mediaType === "movie";

  const rating = (event.type === "watched" || event.type === "rewatched" || event.type === "rated") ? event.rating : null;
  const label = ACTION_LABEL[event.type];
  const actionText = typeof label === "function" ? label(event) : label;

  return (
    <button
      onClick={() => router.push(isMovie ? `/movie/${show.id}` : `/show/${show.id}`)}
      className="w-full flex flex-col active:opacity-80 transition"
      // paddingLeft bumped ~10% over the standard 24px (px-6) — the
      // avatar/name row was reading as too close to the screen edge.
      // paddingRight stays the app's usual 24px.
      style={{ padding: "18px 24px 22px 26.4px", textAlign: "left" }}
    >
      <div className="flex items-center gap-2.5">
        <div className="overflow-hidden flex-shrink-0" style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: "50%", background: "linear-gradient(135deg,#e8a24c,#5a3420)" }}>
          {avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- Storage URL, not a TMDB path
            <img src={avatarUrl} alt="" className="w-full h-full" style={{ objectFit: "cover" }} />
          )}
        </div>
        <div style={{ fontSize: 13.5 }}>
          <span style={{ color: "#fff", fontWeight: 600 }}>{displayName} </span>
          <span style={{ color: accent, fontWeight: 600 }}>{actionText}</span>
        </div>
      </div>

      {/* marginLeft = avatar width + its gap, so the title/poster's own
          left edge lines up with where the name text starts, not the
          avatar. */}
      <div style={{ marginTop: 8, marginLeft: AVATAR_SIZE + AVATAR_GAP }}>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: "#fff" }}>{show.title}</div>
        {(event.type === "watched" || event.type === "rewatched") && (
          <div style={{ fontSize: 12.5, color: t.textDim, marginTop: 2 }}>Episode {event.episodeNumber}</div>
        )}
        {event.type === "rated" && !isMovie && (
          <div style={{ fontSize: 12.5, color: t.textDim, marginTop: 2 }}>{seasonLabel(event.seasonNumber)}</div>
        )}
      </div>

      <div className="relative rounded-2xl overflow-hidden flex-shrink-0" style={{ marginTop: 8, marginLeft: AVATAR_SIZE + AVATAR_GAP, width: POSTER_WIDTH, aspectRatio: "2 / 3" }}>
        <PosterArt posterPath={show.posterPath} base={show.base} glow={show.glow} alt={show.title} tmdbSize="w342" />
        {rating != null && (
          <div className="absolute flex items-center gap-1 rounded-lg" style={{ bottom: 8, left: 8, padding: "3px 6px", background: "rgba(0,0,0,0.6)" }}>
            <Icon name="star" size={10} color={accent} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{event.type === "rated" ? Number(rating).toFixed(1) : rating}</span>
          </div>
        )}
      </div>

      <div style={{ marginTop: 8, marginLeft: AVATAR_SIZE + AVATAR_GAP, fontSize: 11.5, color: "rgba(255,255,255,0.4)" }}>{formatActivityTime(event.timestamp, now)}</div>
    </button>
  );
}
