import Image from "next/image";
import { tmdbImage } from "@/lib/tmdb";

// Fanned/cascading poster stack — the trailing artwork on Explore's
// "Explore Full Library" list card. Up to 5 posters, increasing rotation
// and horizontal offset outward from center, increasing z-index left to
// right (so the rightmost, most-rotated poster sits on top), a slight
// perspective tilt, and a soft shadow per poster. Values match the exact
// rotate()/translateX() progression requested: -14/-8/-2/6/12deg and
// -48/-24/0/24/48px.
const SLOTS = [
  { rotate: -14, translateX: -48, z: 1, scale: 0.94 },
  { rotate: -8, translateX: -24, z: 2, scale: 0.97 },
  { rotate: -2, translateX: 0, z: 3, scale: 1 },
  { rotate: 6, translateX: 24, z: 4, scale: 0.97 },
  { rotate: 12, translateX: 48, z: 5, scale: 0.94 },
];

export default function PosterFanStack({ shows = [], posterWidth = 46, posterHeight = 69 }) {
  const posters = shows.filter((s) => s?.posterPath).slice(0, 5);

  return (
    <div
      className="relative flex-shrink-0"
      style={{ width: posterWidth + 96, height: posterHeight + 16, perspective: 600 }}
    >
      {posters.map((show, i) => {
        const slot = SLOTS[i];
        return (
          <div
            key={show.id}
            className="absolute overflow-hidden rounded-md"
            style={{
              left: "50%",
              top: "50%",
              width: posterWidth,
              height: posterHeight,
              transform: `translate(-50%, -50%) translateX(${slot.translateX}px) rotate(${slot.rotate}deg) scale(${slot.scale})`,
              zIndex: slot.z,
              boxShadow: "0 6px 14px rgba(0,0,0,0.5)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <Image src={tmdbImage(show.posterPath, "w200")} alt="" fill sizes="80px" style={{ objectFit: "cover" }} />
          </div>
        );
      })}
    </div>
  );
}
