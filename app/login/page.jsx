import { trendingShows } from "@/lib/tmdb";
import LoginClient from "./LoginClient";

// Server Component wrapper — trendingShows() needs the server-only
// TMDB_API_KEY (see lib/tmdb.js), so it can't be called from LoginClient
// directly now that this page needs real poster art for its background
// collage. Failure here degrades to an empty array rather than a broken
// page: LoginClient just renders its plain dark background if TMDB is
// unreachable, same as any other TMDB-fetch failure elsewhere in this
// app never blocks the surrounding UI.
export default async function LoginPage() {
  let posterPaths = [];
  try {
    const data = await trendingShows("week");
    posterPaths = (data.results ?? [])
      .filter((s) => s.poster_path)
      .slice(0, 16)
      .map((s) => s.poster_path);
  } catch (err) {
    console.error("Failed to fetch trending shows for login background:", err);
  }

  return <LoginClient posterPaths={posterPaths} />;
}
