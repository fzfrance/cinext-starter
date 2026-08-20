// ---------------------------------------------------------------------------
// User profile (Supabase `profiles` table + `profile-media` Storage bucket)
// ---------------------------------------------------------------------------
// One row per user (unique(user_id) is the primary key), created on first
// save — there's nothing to hydrate before that, so getProfile returning
// null is the normal "hasn't edited their profile yet" case, not an error.
//
// RLS requires auth.uid() = user_id, so callers pass the signed-in user's
// id explicitly rather than these helpers re-deriving it.

import { supabase } from "@/lib/supabase";
import { DEFAULT_ACCENT } from "@/lib/theme";

const BUCKET = "profile-media";
export const MAX_DISPLAY_NAME_LENGTH = 50;
export const MAX_BIO_LENGTH = 200;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MIN_HANDLE_LENGTH = 3;
export const MAX_HANDLE_LENGTH = 20;
const HANDLE_PATTERN = /^[a-z0-9_]+$/;

// Returns an error message string, or null if valid.
export function validateDisplayName(name) {
  if ((name ?? "").trim().length > MAX_DISPLAY_NAME_LENGTH) {
    return `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`;
  }
  return null;
}

// Optional — an empty handle is valid (not every account has picked one).
// Format is enforced here so a bad value never even reaches the DB's
// unique constraint; that constraint is only the last-resort guarantee
// against a genuine collision between two accounts choosing the same one.
export function validateHandle(handle) {
  if (!handle) return null;
  if (handle.length < MIN_HANDLE_LENGTH || handle.length > MAX_HANDLE_LENGTH) {
    return `Handle must be ${MIN_HANDLE_LENGTH}-${MAX_HANDLE_LENGTH} characters.`;
  }
  if (!HANDLE_PATTERN.test(handle)) {
    return "Handle can only contain lowercase letters, numbers, and underscores.";
  }
  return null;
}

export function validateBio(bio) {
  if ((bio ?? "").length > MAX_BIO_LENGTH) {
    return `Bio must be ${MAX_BIO_LENGTH} characters or fewer.`;
  }
  return null;
}

// Readable Languages must never end up empty — an empty set has no
// sensible fallback for "original vs translated title" logic (every show
// would fall back to English, silently, with no way for the user to tell
// that's not actually their preference).
export function validateReadableLanguages(codes) {
  if (!Array.isArray(codes) || codes.length === 0) return "Select at least one readable language.";
  return null;
}

// Returns an error message string, or null if valid. Checked before
// upload, not after — a bad file should never reach the network.
export function validateImageFile(file) {
  if (!file.type.startsWith("image/")) return "Please choose an image file.";
  if (file.size > MAX_IMAGE_BYTES) return "Image must be 5MB or smaller.";
  return null;
}

// Returns { displayName, bio, avatarUrl, backgroundUrl, readableLanguages,
// themePreference, accentColor } or null if this user has never saved a
// profile yet. readableLanguages defaults to ["en"] even for an existing
// row — the column itself defaults to array['en'] at the DB level, but
// this covers a row saved before that column existed too. Same reasoning
// for themePreference/accentColor defaulting to 'dark'/DEFAULT_ACCENT.
const profilesInFlight = new Map();

async function loadProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, bio, avatar_url, background_url, readable_languages, theme_preference, accent_color, handle")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data
    ? {
        displayName: data.display_name ?? "",
        bio: data.bio ?? "",
        avatarUrl: data.avatar_url,
        backgroundUrl: data.background_url,
        readableLanguages: data.readable_languages?.length ? data.readable_languages : ["en"],
        themePreference: data.theme_preference || "dark",
        accentColor: data.accent_color || DEFAULT_ACCENT,
        handle: data.handle ?? "",
      }
    : null;
}

// Header/avatar and language consumers commonly mount together. Coalesce
// that one concurrent read, but discard it immediately after settlement so
// a later profile edit or navigation still gets fresh data.
export function getProfile(userId) {
  const existing = profilesInFlight.get(userId);
  if (existing) return existing;

  const request = loadProfile(userId);
  profilesInFlight.set(userId, request);
  request.then(
    () => { if (profilesInFlight.get(userId) === request) profilesInFlight.delete(userId); },
    () => { if (profilesInFlight.get(userId) === request) profilesInFlight.delete(userId); }
  );
  return request;
}

// Upsert against the user_id primary key covers both the first-ever save
// (insert) and every edit after (update) with one call. Fields left
// undefined are omitted from the payload entirely — PostgREST's upsert
// only generates DO UPDATE SET for columns actually present, so omitting
// avatarUrl/backgroundUrl when no new image was picked preserves whatever
// was already saved instead of clobbering it back to null (same pattern
// lib/userShows.js's setShowStatus relies on for `favorite`).
export async function upsertProfile(userId, { displayName, bio, avatarUrl, backgroundUrl, readableLanguages, themePreference, accentColor, handle }) {
  const payload = { user_id: userId, updated_at: new Date().toISOString() };
  if (displayName !== undefined) payload.display_name = displayName;
  if (bio !== undefined) payload.bio = bio;
  if (avatarUrl !== undefined) payload.avatar_url = avatarUrl;
  if (backgroundUrl !== undefined) payload.background_url = backgroundUrl;
  if (readableLanguages !== undefined) payload.readable_languages = readableLanguages;
  if (themePreference !== undefined) payload.theme_preference = themePreference;
  if (accentColor !== undefined) payload.accent_color = accentColor;
  // Empty string -> null, not "" — the unique constraint would otherwise
  // treat every account with an unset handle as colliding on the same ""
  // value the moment a second one tried to save (NULL, unlike '', is never
  // considered equal to another NULL under a unique constraint).
  if (handle !== undefined) payload.handle = handle || null;

  const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" });
  if (error) {
    if (error.code === "23505" && error.message?.includes("handle")) {
      throw new Error("That handle is already taken.");
    }
    throw error;
  }
}

// Uploads to profile-media/{userId}/{kind}-{timestamp}.{ext} — kind is
// "avatar" | "background" — and returns the public URL. A fresh path per
// upload (not a fixed filename) rather than upsert-in-place, so the new
// image is never served stale from a CDN/browser cache still keyed to the
// old file at the same URL.
export async function uploadProfileImage(userId, file, kind) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Cleans up the file a new upload just replaced, so a user re-uploading
// their avatar/background repeatedly doesn't silently accumulate orphaned
// blobs in Storage forever (uploadProfileImage above deliberately uses a
// fresh timestamped path per upload rather than overwriting in place, so
// nothing removes the old one automatically). Takes the *old* public URL
// (from before the replace) and best-effort deletes it — callers should
// not fail the whole save over this, a stray orphaned file is harmless
// where a failed save is not.
export async function deleteProfileImage(publicUrl) {
  if (!publicUrl) return;
  const marker = `/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;
  const path = publicUrl.slice(idx + marker.length);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
