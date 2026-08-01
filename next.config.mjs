/** @type {import('next').NextConfig} */
const nextConfig = {
  // Every screen in this app shows live, frequently-changing personal data
  // (watch progress, show status, favorites) fetched client-side on
  // mount — there's no page here that benefits from Next's client Router
  // Cache at all. Without this, navigating away (e.g. Home -> Show
  // Detail) and back within the cache window reuses the previously-
  // mounted page instance instead of a fresh one, so its data-fetching
  // effect never re-runs and the screen keeps showing whatever it
  // fetched before you left — the "I finished the show in Show Detail
  // but Home still shows Ep 1" bug.
  // Both buckets, not just `dynamic`: a page with no server-side dynamic
  // API (cookies/headers/searchParams) — which is every page in this
  // app, since all of them are "use client" fetching their own data via
  // useEffect — gets classified as the *static* segment type, not
  // dynamic, and only fell under the `dynamic: 0` set here before. That
  // left the `static` bucket at Next's default 300s (5 minutes), long
  // enough to survive a full sign-out/sign-in round trip and still serve
  // a stale cached instance.
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
  },
};

export default nextConfig;
