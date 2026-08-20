/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
  },
  // Personal Supabase reads remain explicitly no-store in lib/supabase.js.
  // Keep API responses live too, but let Next cache the user-independent
  // page/RSC shells and the explicitly revalidated TMDB fetches they use.
  // A new deployment replaces the Full Route Cache, while content-hashed
  // static assets continue to cache safely in the browser/PWA.
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
