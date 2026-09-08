"use client";

// ---------------------------------------------------------------------------
// Language preferences (Language Settings)
// ---------------------------------------------------------------------------
// Readable Languages → original vs translated titles (resolveTitle).
// App Language → TMDB content language + UI chrome (cookie + localStorage).

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { getProfile } from "@/lib/profile";
import { translate } from "@/lib/i18n";
import {
  LANGUAGES,
  DEFAULT_READABLE_LANGUAGES,
  DEFAULT_APP_LANGUAGE,
  APP_LANGUAGE_STORAGE_KEY,
  languageLabel,
  normalizeAppLanguage,
  resolveTitle,
  resolvePersonName,
  languageListLabels,
} from "@/lib/languageCodes";

export {
  LANGUAGES,
  DEFAULT_READABLE_LANGUAGES,
  DEFAULT_APP_LANGUAGE,
  APP_LANGUAGE_STORAGE_KEY,
  languageLabel,
  normalizeAppLanguage,
  resolveTitle,
  resolvePersonName,
  languageListLabels,
};

function writeAppLanguageCookie(code) {
  if (typeof document === "undefined") return;
  document.cookie = `${APP_LANGUAGE_STORAGE_KEY}=${encodeURIComponent(code)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function getStoredAppLanguage() {
  if (typeof window === "undefined") return DEFAULT_APP_LANGUAGE;
  return normalizeAppLanguage(localStorage.getItem(APP_LANGUAGE_STORAGE_KEY) || DEFAULT_APP_LANGUAGE);
}

/**
 * Persist App Language to localStorage + cookie + <html lang>.
 * Pass { reload: true } after a user pick so server TMDB fetches refresh.
 */
export function applyAppLanguage(code, { reload = false } = {}) {
  const next = normalizeAppLanguage(code);
  const prev = typeof window !== "undefined" ? getStoredAppLanguage() : DEFAULT_APP_LANGUAGE;
  if (typeof window !== "undefined") {
    localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, next);
  }
  writeAppLanguageCookie(next);
  if (typeof document !== "undefined") {
    document.documentElement.lang = next;
  }
  if (reload && typeof window !== "undefined" && prev !== next) {
    window.location.reload();
  }
  return next;
}

/** Applies stored app language on boot; prefers profiles.app_language when signed in. */
export function useAppLanguageBoot() {
  const { user } = useAuth();

  useEffect(() => {
    applyAppLanguage(getStoredAppLanguage());
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    getProfile(user.id)
      .then((profile) => {
        if (cancelled || !profile?.appLanguage) return;
        applyAppLanguage(profile.appLanguage);
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [user]);
}

/** Live App Language + t(key, vars) for UI chrome. */
export function useAppLanguage() {
  const [code, setCode] = useState(DEFAULT_APP_LANGUAGE);

  useEffect(() => {
    setCode(getStoredAppLanguage());
    const onStorage = (event) => {
      if (event.key === APP_LANGUAGE_STORAGE_KEY) {
        setCode(normalizeAppLanguage(event.newValue || DEFAULT_APP_LANGUAGE));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const t = useCallback((key, vars) => translate(code, key, vars), [code]);

  return { code, t, label: languageLabel(code) };
}

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
