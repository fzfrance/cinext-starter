import { trendingShows } from "@/lib/tmdb";
import SignupClient from "./SignupClient";

// Server Component wrapper — same split as app/login/page.jsx, and for the
// same reason: trendingShows() needs the server-only TMDB_API_KEY, so it
// can't be called from SignupClient directly now that this page shares
// login's floating-poster background. Failure here degrades to an empty
// array rather than a broken page: SignupClient just renders its plain
// dark background if TMDB is unreachable.
export default async function SignupPage() {
  let posterPaths = [];
  try {
    const data = await trendingShows("week");
    posterPaths = (data.results ?? [])
      .filter((s) => s.poster_path)
      .slice(0, 16)
      .map((s) => s.poster_path);
  } catch (err) {
    console.error("Failed to fetch trending shows for signup background:", err);
  }

  return <SignupClient posterPaths={posterPaths} />;
}
