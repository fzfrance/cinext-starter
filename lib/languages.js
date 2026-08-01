"use client";

// ---------------------------------------------------------------------------
// Language preferences (Language Settings' "Readable Languages")
// ---------------------------------------------------------------------------
// Real logic, backed by profiles.readable_languages (lib/profile.js):
// a show's original title (TMDB's original_name/original_title) displays
// instead of its English one when its original_language is a language the
// user has marked as readable. Everywhere else in the app just needs
// resolveTitle() + this hook — none of it re-implements the rule.
//
// (Language Settings' other section, "App Language", is informational
// only — this app has no i18n system to actually switch its own interface
// language, so there's nothing to persist for it.)

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { getProfile } from "@/lib/profile";

// Codes are TMDB's own ISO 639-1 original_language values — resolveTitle
// below compares a show's originalLanguage against these verbatim, so
// each code here must match what TMDB actually returns, not an arbitrary
// locale tag.
export const LANGUAGES = [
  { code: "en", name: "English", native: "English" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "zh", name: "Mandarin Chinese", native: "中文" },
  { code: "th", name: "Thai", native: "ไทย" },
];

export const DEFAULT_READABLE_LANGUAGES = ["en"];

// item: { title, originalTitle, originalLanguage } — every show-shaped
// object in this app carries `title` (TMDB's name/English title) already;
// server-side data producers additionally attach originalTitle (TMDB's
// original_name for TV / original_title for movies) and originalLanguage
// (TMDB's original_language) so this can decide between them. Missing
// original fields (some TMDB responses genuinely lack them) just fall
// through to the English title, same as a language the user can't read.
export function resolveTitle(item, readableLanguages) {
  if (item?.originalLanguage && item.originalTitle && readableLanguages?.includes(item.originalLanguage)) {
    return item.originalTitle;
  }
  return item?.title ?? item?.originalTitle ?? "";
}

// Reads the signed-in user's Readable Languages preference. Defaults to
// English-only for signed-out visitors and while the real value is still
// loading — the safe default this whole feature falls back to anyway.
export function useReadableLanguages() {
  const { user } = useAuth();
  const [readableLanguages, setReadableLanguages] = useState(DEFAULT_READABLE_LANGUAGES);

  useEffect(() => {
    if (!user) { setReadableLanguages(DEFAULT_READABLE_LANGUAGES); return; }
    let cancelled = false;
    getProfile(user.id)
      .then((p) => { if (!cancelled) setReadableLanguages(p?.readableLanguages ?? DEFAULT_READABLE_LANGUAGES); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [user]);

  return readableLanguages;
}
