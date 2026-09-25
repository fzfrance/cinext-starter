import { trendingShows, trendingMovies } from "@/lib/tmdb";
import LoginClient from "./LoginClient";

const LOST_BACKDROP_PATH = "/yUOFocKDW7MCC5isx4FK8A68QFp.jpg";
const MAX_BACKDROPS = 12;

// Server Component wrapper — trendingShows() needs the server-only
// TMDB_API_KEY (see lib/tmdb.js), so it can't be called from LoginClient
// directly now that this page needs real poster art for its background
// collage. Failure here degrades to an empty array rather than a broken
// page: LoginClient just renders its plain dark background if TMDB is
// unreachable, same as any other TMDB-fetch failure elsewhere in this
// app never blocks the surrounding UI.
export default async function LoginPage() {
  let posterPaths = [];
  // Desktop sign-in hero rotates through trending movie + show backdrops.
  // Lost stays as the last-resort fallback when TMDB returns nothing usable.
  let backdropPaths = [LOST_BACKDROP_PATH];
  try {
    const [shows, movies] = await Promise.all([
      trendingShows("week").catch(() => ({ results: [] })),
      trendingMovies("week").catch(() => ({ results: [] })),
    ]);
    const showItems = (shows.results ?? []).filter((item) => item.poster_path);
    const movieItems = (movies.results ?? []).filter((item) => item.poster_path);
    const showPaths = showItems.map((item) => item.poster_path);
    const moviePaths = movieItems.map((item) => item.poster_path);
    const mixed = [];
    for (let i = 0; i < Math.max(showPaths.length, moviePaths.length) && mixed.length < 16; i += 1) {
      if (showPaths[i]) mixed.push(showPaths[i]);
      if (moviePaths[i] && mixed.length < 16) mixed.push(moviePaths[i]);
    }
    posterPaths = mixed;

    const showBackdrops = (shows.results ?? []).map((item) => item.backdrop_path).filter(Boolean);
    const movieBackdrops = (movies.results ?? []).map((item) => item.backdrop_path).filter(Boolean);
    const mixedBackdrops = [];
    const seen = new Set();
    for (let i = 0; i < Math.max(showBackdrops.length, movieBackdrops.length) && mixedBackdrops.length < MAX_BACKDROPS; i += 1) {
      for (const path of [showBackdrops[i], movieBackdrops[i]]) {
        if (!path || seen.has(path) || mixedBackdrops.length >= MAX_BACKDROPS) continue;
        seen.add(path);
        mixedBackdrops.push(path);
      }
    }
    if (mixedBackdrops.length > 0) backdropPaths = mixedBackdrops;
  } catch (err) {
    console.error("Failed to fetch trending shows for login background:", err);
  }

  return <LoginClient posterPaths={posterPaths} backdropPaths={backdropPaths} />;
}
