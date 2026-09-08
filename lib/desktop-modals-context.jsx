"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import SettingsModal from "@/components/ui/SettingsModal";
import EditProfileModal from "@/components/ui/EditProfileModal";
import LanguageSettingsModal from "@/components/ui/LanguageSettingsModal";
import ProfileModal from "@/components/profile/ProfileModal";

/** Set before navigating away from Profile; restored when that destination is left. */
export const REOPEN_PROFILE_KEY = "cinext.reopen-profile";
/** Path prefix to keep the flag armed (don't reopen while still on this dest). */
export const REOPEN_PROFILE_SKIP_KEY = "cinext.reopen-profile-skip";
export const REOPEN_PROFILE_EXPANDED_KEY = "cinext.reopen-profile-expanded";
/** Persist floating profile across refresh on the underlying page. */
export const PROFILE_OPEN_KEY = "cinext.profile-open";
export const PROFILE_EXPANDED_KEY = "cinext.profile-expanded";

const DesktopModalsContext = createContext({
  openProfile: () => {},
  openSettings: () => {},
  openEditProfile: () => {},
  openLanguageSettings: () => {},
  closeAll: () => {},
  markReopenProfile: () => {},
  profileOpen: false,
  profileExpanded: false,
});

export function useDesktopModals() {
  return useContext(DesktopModalsContext);
}

function readProfileSession() {
  if (typeof window === "undefined") return { open: false, expanded: false };
  try {
    return {
      open: sessionStorage.getItem(PROFILE_OPEN_KEY) === "1",
      expanded: sessionStorage.getItem(PROFILE_EXPANDED_KEY) === "1",
    };
  } catch {
    return { open: false, expanded: false };
  }
}

function writeProfileSession(open, expanded) {
  try {
    if (open) {
      sessionStorage.setItem(PROFILE_OPEN_KEY, "1");
      sessionStorage.setItem(PROFILE_EXPANDED_KEY, expanded ? "1" : "0");
    } else {
      sessionStorage.removeItem(PROFILE_OPEN_KEY);
      sessionStorage.removeItem(PROFILE_EXPANDED_KEY);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Hosts desktop floating overlays (Profile / Settings / Edit Profile / Language)
 * so they can open over the current page without navigating away and
 * blanking the screen behind.
 */
export function DesktopModalsProvider({ children }) {
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileExpanded, setProfileExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editFocusCover, setEditFocusCover] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [profileSessionReady, setProfileSessionReady] = useState(false);
  // Profile → Settings (or Language) should return to Profile, not leave the
  // underlying page (e.g. /library?tab=collections) exposed after close.
  const returnToProfileRef = useRef({ active: false, expanded: false });

  // Restore profile overlay after refresh (modal state isn't in the URL).
  useLayoutEffect(() => {
    const saved = readProfileSession();
    if (saved.open) {
      setProfileOpen(true);
      setProfileExpanded(saved.expanded);
    }
    setProfileSessionReady(true);
  }, []);

  useEffect(() => {
    if (!profileSessionReady) return;
    writeProfileSession(profileOpen, profileExpanded);
  }, [profileOpen, profileExpanded, profileSessionReady]);

  const restoreProfileIfNeeded = useCallback(() => {
    if (!returnToProfileRef.current.active) return;
    const expanded = returnToProfileRef.current.expanded;
    returnToProfileRef.current = { active: false, expanded: false };
    setProfileExpanded(expanded);
    setProfileOpen(true);
  }, []);

  const openProfile = useCallback(() => {
    returnToProfileRef.current = { active: false, expanded: false };
    setSettingsOpen(false);
    setEditOpen(false);
    setLanguageOpen(false);
    setProfileExpanded(false);
    setProfileOpen(true);
  }, []);

  const openSettings = useCallback(() => {
    if (profileOpen) {
      returnToProfileRef.current = { active: true, expanded: profileExpanded };
    }
    setProfileOpen(false);
    setProfileExpanded(false);
    setEditOpen(false);
    setLanguageOpen(false);
    setSettingsOpen(true);
  }, [profileOpen, profileExpanded]);

  const openEditProfile = useCallback((opts = {}) => {
    setSettingsOpen(false);
    setLanguageOpen(false);
    setEditFocusCover(Boolean(opts?.focusCover));
    // Keep profile mounted underneath so the blurred scrim stays put.
    setEditOpen(true);
  }, []);

  const closeEditProfile = useCallback(() => {
    setEditOpen(false);
    setEditFocusCover(false);
  }, []);

  const openLanguageSettings = useCallback(() => {
    if (profileOpen) {
      returnToProfileRef.current = { active: true, expanded: profileExpanded };
    }
    setProfileOpen(false);
    setProfileExpanded(false);
    setSettingsOpen(false);
    setEditOpen(false);
    setLanguageOpen(true);
  }, [profileOpen, profileExpanded]);

  const closeAll = useCallback(() => {
    returnToProfileRef.current = { active: false, expanded: false };
    setProfileOpen(false);
    setProfileExpanded(false);
    setSettingsOpen(false);
    setEditOpen(false);
    setEditFocusCover(false);
    setLanguageOpen(false);
  }, []);

  const markReopenProfile = useCallback((destHref) => {
    try {
      sessionStorage.setItem(REOPEN_PROFILE_KEY, "1");
      sessionStorage.setItem(REOPEN_PROFILE_EXPANDED_KEY, profileExpanded ? "1" : "0");
      const raw = typeof destHref === "string" ? destHref : "";
      const skipPath = raw.split("?")[0] || "";
      if (skipPath) sessionStorage.setItem(REOPEN_PROFILE_SKIP_KEY, skipPath);
      else sessionStorage.removeItem(REOPEN_PROFILE_SKIP_KEY);
    } catch {
      /* ignore */
    }
  }, [profileExpanded]);

  // After leaving a Profile destination (library collections, show/movie,
  // collection detail, rating edit, …), restore the floating profile.
  // Stay armed while still on the skip path so mark→navigate doesn't reopen
  // on the outbound change; refresh on that page also keeps the user there.
  useEffect(() => {
    let flag = null;
    let skipPath = null;
    let expandedFlag = null;
    try {
      flag = sessionStorage.getItem(REOPEN_PROFILE_KEY);
      skipPath = sessionStorage.getItem(REOPEN_PROFILE_SKIP_KEY);
      expandedFlag = sessionStorage.getItem(REOPEN_PROFILE_EXPANDED_KEY);
    } catch {
      return undefined;
    }
    if (flag !== "1") return undefined;
    if (skipPath && pathname?.startsWith(skipPath)) {
      return undefined;
    }
    if (pathname?.startsWith("/profile/") && pathname !== "/profile") {
      return undefined;
    }
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "reviews") return undefined;
    }
    try {
      sessionStorage.removeItem(REOPEN_PROFILE_KEY);
      sessionStorage.removeItem(REOPEN_PROFILE_SKIP_KEY);
      sessionStorage.removeItem(REOPEN_PROFILE_EXPANDED_KEY);
    } catch {
      /* ignore */
    }
    setSettingsOpen(false);
    setEditOpen(false);
    setLanguageOpen(false);
    setProfileExpanded(expandedFlag === "1");
    setProfileOpen(true);
    return undefined;
  }, [pathname]);

  const value = useMemo(
    () => ({
      openProfile,
      openSettings,
      openEditProfile,
      openLanguageSettings,
      closeAll,
      markReopenProfile,
      profileOpen,
      profileExpanded,
    }),
    [
      openProfile,
      openSettings,
      openEditProfile,
      openLanguageSettings,
      closeAll,
      markReopenProfile,
      profileOpen,
      profileExpanded,
    ]
  );

  return (
    <DesktopModalsContext.Provider value={value}>
      {children}
      <ProfileModal
        open={profileOpen}
        expanded={profileExpanded}
        onExpandedChange={setProfileExpanded}
        onClose={() => {
          setProfileOpen(false);
          setProfileExpanded(false);
        }}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          restoreProfileIfNeeded();
        }}
        onEditProfile={openEditProfile}
        onLanguageSettings={openLanguageSettings}
      />
      <EditProfileModal
        open={editOpen}
        focusCover={editFocusCover}
        onClose={closeEditProfile}
      />
      <LanguageSettingsModal
        open={languageOpen}
        onClose={() => {
          setLanguageOpen(false);
          restoreProfileIfNeeded();
        }}
        onBack={() => {
          setLanguageOpen(false);
          setSettingsOpen(true);
        }}
      />
    </DesktopModalsContext.Provider>
  );
}
