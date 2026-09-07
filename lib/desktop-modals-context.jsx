"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import SettingsModal from "@/components/ui/SettingsModal";
import EditProfileModal from "@/components/ui/EditProfileModal";
import LanguageSettingsModal from "@/components/ui/LanguageSettingsModal";
import ProfileModal from "@/components/profile/ProfileModal";

/** Set before navigating to a rating deep-link from Profile; restored on back. */
export const REOPEN_PROFILE_KEY = "cinext.reopen-profile";

const DesktopModalsContext = createContext({
  openProfile: () => {},
  openSettings: () => {},
  openEditProfile: () => {},
  openLanguageSettings: () => {},
  closeAll: () => {},
  markReopenProfile: () => {},
});

export function useDesktopModals() {
  return useContext(DesktopModalsContext);
}

/**
 * Hosts desktop floating overlays (Profile / Settings / Edit Profile / Language)
 * so they can open over the current page without navigating away and
 * blanking the screen behind.
 */
export function DesktopModalsProvider({ children }) {
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);

  const openProfile = useCallback(() => {
    setSettingsOpen(false);
    setEditOpen(false);
    setLanguageOpen(false);
    setProfileOpen(true);
  }, []);

  const openSettings = useCallback(() => {
    setProfileOpen(false);
    setEditOpen(false);
    setLanguageOpen(false);
    setSettingsOpen(true);
  }, []);

  const openEditProfile = useCallback(() => {
    setSettingsOpen(false);
    setLanguageOpen(false);
    // Keep profile open behind edit when launched from the profile card.
    setEditOpen(true);
  }, []);

  const openLanguageSettings = useCallback(() => {
    setProfileOpen(false);
    setSettingsOpen(false);
    setEditOpen(false);
    setLanguageOpen(true);
  }, []);

  const closeAll = useCallback(() => {
    setProfileOpen(false);
    setSettingsOpen(false);
    setEditOpen(false);
    setLanguageOpen(false);
  }, []);

  const markReopenProfile = useCallback(() => {
    try {
      sessionStorage.setItem(REOPEN_PROFILE_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  // After closing a rating opened from Profile (router.back), restore the card.
  useEffect(() => {
    let flag = null;
    try {
      flag = sessionStorage.getItem(REOPEN_PROFILE_KEY);
    } catch {
      return undefined;
    }
    if (flag !== "1") return undefined;
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "reviews") return undefined;
    }
    try {
      sessionStorage.removeItem(REOPEN_PROFILE_KEY);
    } catch {
      /* ignore */
    }
    setSettingsOpen(false);
    setEditOpen(false);
    setLanguageOpen(false);
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
    }),
    [openProfile, openSettings, openEditProfile, openLanguageSettings, closeAll, markReopenProfile]
  );

  return (
    <DesktopModalsContext.Provider value={value}>
      {children}
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onEditProfile={openEditProfile}
        onLanguageSettings={openLanguageSettings}
      />
      <EditProfileModal open={editOpen} onClose={() => setEditOpen(false)} />
      <LanguageSettingsModal
        open={languageOpen}
        onClose={() => setLanguageOpen(false)}
        onBack={() => {
          setLanguageOpen(false);
          setSettingsOpen(true);
        }}
      />
    </DesktopModalsContext.Provider>
  );
}
