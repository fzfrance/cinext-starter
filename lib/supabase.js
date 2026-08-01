// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------
// 1. Create a free project at https://supabase.com
// 2. Project Settings > API — copy the Project URL and anon/public key
// 3. Put them in .env.local (see .env.local.example)
// 4. Run the schema in supabase/schema.sql (see README) via the SQL editor

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Thrown at import time so a missing .env.local fails loudly in dev
  // instead of silently returning empty data everywhere.
  throw new Error(
    "Missing Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local — see .env.local.example."
  );
}

// global.fetch override: every read in this app is live, per-user data
// (watch progress, statuses, favorites) that must never be served from a
// cache — but supabase-js's underlying .select() calls are plain HTTP GET
// requests, and neither the client nor (by default) PostgREST's response
// headers rule out the *browser's own* HTTP cache reusing a prior
// response for an identical GET URL. That cache sits below the JS layer
// entirely, so it survives even a full hard reload of the page (a reload
// force-revalidates the page's own HTML/scripts, not fetch() calls made
// later by code running on it) — the mechanism behind Home showing stale
// progress/status even after every client-side cache (Next's Router
// Cache, the browser's bfcache) had already been ruled out. Forcing
// `cache: "no-store"` on every request this client makes closes that off
// at the source, for every table this app reads, everywhere.
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
  },
});

export { supabase };
