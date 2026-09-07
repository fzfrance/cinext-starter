"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import SettingsModal from "@/components/ui/SettingsModal";
import EditProfileModal from "@/components/ui/EditProfileModal";
import LanguageSettingsModal from "@/components/ui/LanguageSettingsModal";

const DesktopModalsContext = createContext({
  openSettings: () => {},
  openEditProfile: () => {},
  openLanguageSettings: () => {},
  closeAll: () => {},
});

export function useDesktopModals() {
  return useContext(DesktopModalsContext);
}

/**
 * Hosts desktop floating overlays (Settings / Edit Profile / Language)
 * so they can open over the current page without navigating away and
 * blanking the screen behind.
 */
export function DesktopModalsProvider({ children }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);

  const openSettings = useCallback(() => {
    setEditOpen(false);
    setLanguageOpen(false);
    setSettingsOpen(true);
  }, []);

  const openEditProfile = useCallback(() => {
    setSettingsOpen(false);
    setLanguageOpen(false);
    setEditOpen(true);
  }, []);

  const openLanguageSettings = useCallback(() => {
    setSettingsOpen(false);
    setEditOpen(false);
    setLanguageOpen(true);
  }, []);

  const closeAll = useCallback(() => {
    setSettingsOpen(false);
    setEditOpen(false);
    setLanguageOpen(false);
  }, []);

  const value = useMemo(
    () => ({ openSettings, openEditProfile, openLanguageSettings, closeAll }),
    [openSettings, openEditProfile, openLanguageSettings, closeAll]
  );

  return (
    <DesktopModalsContext.Provider value={value}>
      {children}
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
