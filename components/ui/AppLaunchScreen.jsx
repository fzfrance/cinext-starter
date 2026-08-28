"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { tmdbImage } from "@/lib/tmdb";
import styles from "./AppLaunchScreen.module.css";

// A hand-picked mixed movie/TV wall from TMDB. Fixed paths make the launch
// screen available immediately instead of delaying first paint on another API
// round trip, while the artwork itself remains sourced from TMDB's image CDN.
const POSTERS = [
  { title: "Shōgun", path: "/7O4iVfOMQmdCSxhOg1WnzG1AgYT.jpg" },
  { title: "Weak Hero", path: "/5Sd01WeraL2oA3Vv6O4rcRxockn.jpg" },
  { title: "Moon Knight", path: "/x6FsYvt33846IQnDSFxla9j0RX8.jpg" },
  { title: "Moving", path: "/vf9SNXNAFqzKBGksFwrXhkg9cb7.jpg" },
  { title: "A Shop for Killers", path: "/7yUY1HUyQuybbvkAAhLzQ7x1l9g.jpg" },
  { title: "The Last of Us", path: "/dmo6TYuuJgaYinXBPjrgG9mB5od.jpg" },
  { title: "Severance", path: "/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg" },
  { title: "Slow Horses", path: "/w2jauz2PeSjFQifDObI3qDen4f7.jpg" },
  { title: "The Penguin", path: "/vOWcqC4oDQws1doDWLO7d3dh5qc.jpg" },
  { title: "Squid Game", path: "/1QdXdRYfktUSONkl1oD5gc6Be0s.jpg" },
  { title: "The Bear", path: "/eKfVzzEazSIjJMrw9ADa2x8ksLz.jpg" },
  { title: "Dune: Part Two", path: "/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg" },
  { title: "Fallout", path: "/c15BtJxCXMrISLVmysdsnZUPQft.jpg" },
  { title: "House of the Dragon", path: "/7V0Ebks0GgpKvQ7QbLAIdX5dos4.jpg" },
  { title: "RIPLEY", path: "/rpSo8z9alultGVTqQ3dkLEyU8xx.jpg" },
  { title: "The Gentlemen", path: "/tw3tzfXaSpmUZIB8ZNqNEGzMBCy.jpg" },
];

const MINIMUM_DISPLAY_MS = 1750;
const EXIT_DURATION_MS = 520;
const FAILSAFE_MS = 6000;

export default function AppLaunchScreen() {
  const { loading: authLoading } = useAuth();
  const [phase, setPhase] = useState("visible");

  useEffect(() => {
    const startedAt = performance.now();
    let exitTimer;
    let removeTimer;

    const beginExit = () => {
      setPhase((current) => {
        if (current !== "visible") return current;
        removeTimer = window.setTimeout(() => setPhase("hidden"), EXIT_DURATION_MS);
        return "exiting";
      });
    };

    if (!authLoading) {
      exitTimer = window.setTimeout(beginExit, Math.max(0, MINIMUM_DISPLAY_MS - (performance.now() - startedAt)));
    }
    const failsafeTimer = window.setTimeout(beginExit, FAILSAFE_MS);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(removeTimer);
      window.clearTimeout(failsafeTimer);
    };
  }, [authLoading]);

  if (phase === "hidden") return null;

  return (
    <div className={`${styles.launch} ${phase === "exiting" ? styles.exiting : ""}`} aria-label="Loading Cinext" aria-live="polite">
      <div className={styles.posterCanvas} aria-hidden="true">
        {POSTERS.map((poster, index) => (
          <div className={styles.posterTile} key={poster.path}>
            <Image
              src={tmdbImage(poster.path, "w500")}
              alt=""
              fill
              sizes="(max-width: 699px) 58vw, 28vw"
              priority={index < 8}
              draggable={false}
              style={{ objectFit: "cover" }}
            />
          </div>
        ))}
      </div>

      <div className={styles.colorGrade} aria-hidden="true" />
      <div className={styles.centerShade} aria-hidden="true" />

      <div className={styles.brand}>
        <div className={styles.markWrap}>
          <Image
            src="/cinext-launch-mark.png"
            alt=""
            fill
            priority
            sizes="240px"
            className={styles.mark}
          />
        </div>
        <Image src="/text/logo.png" alt="Cinext" width={681} height={85} priority className={styles.wordmark} />
        <div className={styles.tagline}>WATCH WHAT&apos;S NEXT</div>
        <div className={styles.loadingLine} aria-hidden="true"><span /></div>
      </div>
    </div>
  );
}
