import Image from "next/image";
import Grain from "./Grain";
import { tmdbImage } from "@/lib/tmdb";

// In the prototype, every poster/backdrop was a generated gradient (`base`
// + `glow` colors) since there was no real artwork. Once TMDB is wired up,
// pass `posterPath` (from TMDB's `poster_path` / `still_path` fields) and
// this renders the real image instead, with the gradient kept as a loading
// state / fallback for shows TMDB has no art for.
//
// overrideSrc: a fully-resolved URL that takes priority over posterPath —
// backs user-picked custom covers/posters (show_customizations' custom_*_url
// columns are already-resolved TMDB CDN URLs, not bare paths, so they can't
// go through tmdbImage(posterPath, tmdbSize) like every other caller here).
export default function PosterArt({ posterPath, overrideSrc, base = "#221a14", glow = "#E8A24C", alt = "", tmdbSize = "w500", sizes = "500px" }) {
  const src = overrideSrc || tmdbImage(posterPath, tmdbSize);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: `linear-gradient(160deg, ${glow}55 0%, ${base} 55%, #060504 100%)`,
      }}
    >
      {src ? (
        // draggable=false — decorative artwork, no legitimate drag use
        // case anywhere it's used, and native image drag-ghosting is one
        // of the interactions that makes a press-and-hold gesture (e.g.
        // Watch History's long-press menu) feel broken/web-like instead
        // of like a native app.
        <Image src={src} alt={alt} fill sizes={sizes} draggable={false} style={{ objectFit: "cover" }} />
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(circle at 30% 20%, ${glow}33, transparent 55%)`,
          }}
        />
      )}
      <Grain />
    </div>
  );
}
