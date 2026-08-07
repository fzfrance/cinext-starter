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
  // staleTimes above only governs Next's in-memory client Router Cache
  // (reused page instances during client-side navigation) — it says
  // nothing about the actual HTTP response Vercel's CDN and the browser
  // itself are allowed to cache. That second layer is what was making a
  // "hard refresh" not show a new deploy, especially in an installed PWA:
  // iOS's standalone WKWebView caches its own document/API responses far
  // more aggressively than a regular Safari tab and has no true
  // force-reload gesture to bust it. Forcing no-store on every page and
  // API response means each request always hits the server fresh —
  // matching this app's own "every screen is live personal data" model
  // (see staleTimes' comment above) instead of the framework's default
  // caching heuristics. /_next/static is deliberately excluded: those
  // filenames are content-hashed per build, so they're safe (and
  // valuable, for load speed) to keep cached indefinitely — a new deploy
  // ships new hashes, not new content at the same old URL.
  async headers() {
    return [
      {
        // Named-param regex (Next's supported way to negate a prefix in a
        // headers() source, since a bare unanchored regex here — tried
        // first — matched every path including /_next/static itself).
        source: "/:path((?!_next/static|_next/image).*)",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
