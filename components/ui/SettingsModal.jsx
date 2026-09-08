"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { getProfile, upsertProfile } from "@/lib/profile";
import { accentPalette, contrastText, DEFAULT_ACCENT } from "@/lib/theme";
import { useAppLanguage } from "@/lib/languages";

// Account deletion is permanent — true red, not the shared pink danger token.
const TRUE_RED = "#ef4444";

/**
 * Desktop liquid-glass Settings panel — centered floating card matching
 * image picker / collection modals. Mobile keeps the full /profile/settings
 * page; this surface is opened from the desktop account menu (and the
 * settings route on ≥900px).
 */
export default function SettingsModal({ open, onClose, onEditProfile, onLanguageSettings }) {
  const router = useRouter();
  const { user } = useAuth();
  const { t: tr } = useAppLanguage();
  const [theme, setTheme] = useState("dark");
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const [signOutArmed, setSignOutArmed] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const armTimer = useRef(null);
  const activeText = contrastText(accent);

  useEffect(() => {
    if (!open || !user) return undefined;
    let cancelled = false;
    getProfile(user.id)
      .then((p) => {
        if (cancelled || !p) return;
        setTheme(p.themePreference);
        setAccent(p.accentColor);
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [open, user]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (deleteConfirmOpen) {
        setDeleteConfirmOpen(false);
        return;
      }
      onClose?.();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, deleteConfirmOpen, onClose]);

  useEffect(() => () => clearTimeout(armTimer.current), []);

  if (!open || typeof document === "undefined") return null;

  const chooseTheme = (id) => {
    setTheme(id);
    if (user) upsertProfile(user.id, { themePreference: id }).catch(console.error);
  };

  const openEdit = () => {
    if (onEditProfile) onEditProfile();
    else {
      onClose?.();
      router.push("/profile/edit");
    }
  };

  const openLanguage = () => {
    if (onLanguageSettings) onLanguageSettings();
    else {
      onClose?.();
      router.push("/profile/settings/language");
    }
  };

  const handleSignOutTap = () => {
    if (signOutArmed) {
      clearTimeout(armTimer.current);
      setSignOutArmed(false);
      onClose?.();
      supabase.auth.signOut().then(() => router.push("/login"));
      return;
    }
    setSignOutArmed(true);
    armTimer.current = setTimeout(() => setSignOutArmed(false), 3000);
  };

  const handleDeleteAccount = async () => {
    setDeleteError("");
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't delete your account. Try again.");
      await supabase.auth.signOut();
      router.push("/login");
    } catch (err) {
      console.error(err);
      setDeleteError(err.message || "Couldn't delete your account. Try again.");
      setDeleting(false);
    }
  };

  return createPortal(
    <div
      className="settings-modal-scrim"
      role="presentation"
      onClick={() => {
        if (deleteConfirmOpen) setDeleteConfirmOpen(false);
        else onClose?.();
      }}
    >
      <div
        className="settings-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-modal-head">
          <div>
            <div className="settings-modal-title">{tr("settings")}</div>
            <div className="settings-modal-sub">Account & preferences</div>
          </div>
          <button type="button" className="settings-modal-close" onClick={onClose} aria-label="Close settings">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="settings-modal-body">
          <div className="settings-modal-section-label">Profile</div>
          <button type="button" className="settings-modal-row" onClick={openEdit}>
            <span className="settings-modal-row-main">
              <Icon name="edit" size={15} />
              {tr("editProfile")}
            </span>
            <Icon name="chevronRight" size={14} color="rgba(255,255,255,0.45)" />
          </button>

          <div className="settings-modal-section-label">Preferences</div>
          <div className="settings-modal-block">
            <div className="settings-modal-block-label">Theme</div>
            <div className="settings-modal-theme-row">
              {[["dark", "moon"], ["light", "sun"], ["system", "auto"]].map(([id, icon]) => {
                const active = theme === id;
                const comingSoon = id === "light";
                // Dark active: charcoal + white focus (not amber accent).
                const activeStyle = active
                  ? id === "dark"
                    ? { background: "#2A2A2E", borderColor: "rgba(255,255,255,0.85)", color: "#fff", boxShadow: "0 0 0 1px rgba(255,255,255,0.35)" }
                    : { background: accent, borderColor: accent, color: activeText }
                  : undefined;
                const iconColor = active
                  ? (id === "dark" ? "#fff" : activeText)
                  : "#fff";
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={comingSoon}
                    onClick={() => !comingSoon && chooseTheme(id)}
                    className={`settings-modal-theme${active ? " is-active" : ""}${comingSoon ? " is-soon" : ""}${active && id === "dark" ? " is-dark-active" : ""}`}
                    style={activeStyle}
                  >
                    <Icon name={icon} size={15} color={iconColor} />
                    <span style={{ color: active ? (id === "dark" ? "#fff" : activeText) : undefined }}>{id}</span>
                    {comingSoon && <span className="settings-modal-soon">Soon</span>}
                  </button>
                );
              })}
            </div>

            <div className="settings-modal-block-divider" />

            <div className="settings-modal-block-label-row">
              <span className="settings-modal-block-label">Accent Color</span>
              <span className="settings-modal-soon-pill">Coming soon</span>
            </div>
            <div className="settings-modal-accents is-locked" aria-hidden="true">
              {accentPalette.map((c) => (
                <span
                  key={c.id}
                  className={`settings-modal-swatch${accent === c.hex ? " is-active" : ""}`}
                  style={{ background: c.hex }}
                />
              ))}
              <span
                className="settings-modal-swatch settings-modal-swatch-custom"
                style={{
                  background: !accentPalette.some((c) => c.hex.toLowerCase() === accent.toLowerCase())
                    ? accent
                    : "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)",
                }}
              />
            </div>
          </div>

          <button type="button" className="settings-modal-row" onClick={openLanguage}>
            <span className="settings-modal-row-main">
              <Icon name="globe" size={15} />
              {tr("language")}
            </span>
            <Icon name="chevronRight" size={14} color="rgba(255,255,255,0.45)" />
          </button>

          <div className="settings-modal-section-label">Data & Privacy</div>
          <button type="button" className="settings-modal-row" disabled>
            <span className="settings-modal-row-main">
              <Icon name="export" size={15} />
              Data Export
            </span>
            <span className="settings-modal-soon-pill">Soon</span>
          </button>

          <div className="settings-modal-section-label">Account</div>
          <button
            type="button"
            className={`settings-modal-row${signOutArmed ? " is-armed" : ""}`}
            onClick={handleSignOutTap}
            style={signOutArmed ? { borderColor: `${accent}55`, background: `${accent}14` } : undefined}
          >
            <span className="settings-modal-row-main" style={signOutArmed ? { color: accent } : undefined}>
              <Icon name="logout" size={15} color={signOutArmed ? accent : undefined} />
              {signOutArmed ? tr("tapAgainSignOut") : tr("signOut")}
            </span>
          </button>

          <div className="settings-modal-danger">
            <div className="settings-modal-danger-head">
              <Icon name="warning" size={14} color={TRUE_RED} />
              Danger Zone
            </div>
            <button
              type="button"
              className="settings-modal-danger-btn"
              onClick={() => {
                setDeleteError("");
                setDeleteConfirmOpen(true);
              }}
            >
              <Icon name="trash" size={14} color={TRUE_RED} />
              Delete Account
            </button>
          </div>
        </div>
      </div>

      {deleteConfirmOpen && (
        <div
          className="settings-modal-confirm"
          role="alertdialog"
          aria-label="Delete your account?"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="settings-modal-confirm-title">
            <Icon name="warning" size={16} color={TRUE_RED} />
            Delete your account?
          </div>
          <p>Are you sure? This is permanent.</p>
          {deleteError && <div className="settings-modal-confirm-error">{deleteError}</div>}
          <div className="settings-modal-confirm-actions">
            <button type="button" disabled={deleting} onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </button>
            <button type="button" disabled={deleting} className="is-delete" onClick={handleDeleteAccount}>
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

/** Hook: desktop viewport (≥900px). Used by the settings route. */
export function useIsDesktopSettings() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 900px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}
