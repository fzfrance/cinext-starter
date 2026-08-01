import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Deletes the calling user's own account — supabase.auth.admin.deleteUser()
// is a service-role-only API (the service role key can bypass RLS
// entirely), so it can never run in the browser: any client holding that
// key could delete *any* account, not just its own. This route is the only
// place that key is used, and it only ever deletes the account matching
// the caller's own access token — never a client-supplied id, so a request
// can't be forged to target a different user.
//
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (Supabase Dashboard ->
// Project Settings -> API -> service_role secret) — server-only, must
// NOT be prefixed NEXT_PUBLIC_ or it would ship to the browser bundle.
// Every profiles/collections/user_shows/episode_watches row already
// references auth.users(id) on delete cascade (see supabase/schema.sql),
// so deleting the auth user cleans up the rest automatically.
export async function POST(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY — account deletion is not configured.");
    return NextResponse.json({ error: "Account deletion isn't available right now." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // anon-key client just to resolve the token -> user id; never used to
  // perform the delete itself.
  const anonClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data: { user }, error: userError } = await anonClient.auth.getUser(accessToken);
  if (userError || !user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("Failed to delete user:", deleteError);
    return NextResponse.json({ error: "Couldn't delete your account. Try again." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
