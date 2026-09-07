"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/ui/Icon";
import { useAuth } from "@/lib/auth-context";
import { getProfile, upsertProfile } from "@/lib/profile";
import { LANGUAGES, DEFAULT_READABLE_LANGUAGES, DEFAULT_APP_LANGUAGE, languageLabel, getStoredAppLanguage, applyAppLanguage, useAppLanguage, languageListLabels } from "@/lib/languages";
import { DEFAULT_ACCENT } from "@/lib/theme";

const accent = DEFAULT_ACCENT;

function NestedModal({ title, subtitle, onClose, children, footer }) {
  return (
    <div
      className="settings-modal-nested-scrim"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="settings-modal-nested-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-modal-nested-head">
          <div>
            <div className="settings-modal-nested-title">{title}</div>
            {subtitle && <div className="settings-modal-nested-sub">{subtitle}</div>}
          </div>
          <button type="button" className="settings-modal-close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="settings-modal-nested-body">{children}</div>
        {footer && <div className="settings-modal-nested-footer">{footer}</div>}
      </div>
    </div>
  );
}

function LangListItem({ lang, selected, onClick, uiCode }) {
  const labels = languageListLabels(lang, uiCode);
  return (
    <button type="button" onClick={onClick} className="settings-modal-lang-item">
      <span className="settings-modal-lang-copy">
        <span className="settings-modal-lang-name">{labels.primary}</span>
        <span className="settings-modal-lang-native">{labels.secondary}</span>
      </span>
      <span
        className={`settings-modal-lang-check${selected ? " is-selected" : ""}`}
      >
        {selected && <Icon name="check" size={10} color="#fff" strokeWidth={3} />}
      </span>
    </button>
  );
}

/**
 * Desktop floating Language Settings — same mid-screen liquid-glass family
 * as Settings / Edit Profile. Mobile keeps /profile/settings/language.
 */
export default function LanguageSettingsModal({ open, onClose, onBack }) {
  const { user, loading: authLoading } = useAuth();
  const { t: tr } = useAppLanguage();
  const [status, setStatus] = useState("loading");
  const [retryToken, setRetryToken] = useState(0);
  const [readableLanguages, setReadableLanguages] = useState(DEFAULT_READABLE_LANGUAGES);
  const [appLanguage, setAppLanguage] = useState(DEFAULT_APP_LANGUAGE);
  const [appLanguageSheetOpen, setAppLanguageSheetOpen] = useState(false);
  const [readableSheetOpen, setReadableSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    setAppLanguage(getStoredAppLanguage());
  }, [open]);

  useEffect(() => {
    if (!open || !user) return undefined;
    let cancelled = false;
    setStatus("loading");
    setError("");
    getProfile(user.id)
      .then((profile) => {
        if (cancelled) return;
        setReadableLanguages(profile?.readableLanguages ?? DEFAULT_READABLE_LANGUAGES);
        if (profile?.appLanguage) {
          const next = applyAppLanguage(profile.appLanguage);
          setAppLanguage(next);
        }
        setStatus("ready");
      })
      .catch((err) => {
        console.error(err);
        if (cancelled) return;
        setError("Couldn't load your language settings. Try again.");
        setStatus("error");
      });
    return () => { cancelled = true; };
  }, [open, user, retryToken]);

  const toggleReadable = (code) => {
    setReadableLanguages((prev) => {
      if (prev.includes(code)) {
        if (prev.length === 1) return prev;
        return prev.filter((c) => c !== code);
      }
      return [...prev, code];
    });
  };

  const chooseAppLanguage = async (code) => {
    const prev = getStoredAppLanguage();
    const next = applyAppLanguage(code);
    setAppLanguage(next);
    setAppLanguageSheetOpen(false);
    setSaved(true);
    if (user) {
      try {
        await upsertProfile(user.id, { appLanguage: next });
      } catch (err) {
        console.error(err);
        // localStorage already applied — profile write is best-effort.
      }
    }
    if (prev !== next && typeof window !== "undefined") {
      window.location.reload();
    } else {
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const closeReadableSheet = async () => {
    setReadableSheetOpen(false);
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      await upsertProfile(user.id, { readableLanguages });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
      setError("Couldn't save your language settings. Try again.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (appLanguageSheetOpen) {
        setAppLanguageSheetOpen(false);
        return;
      }
      if (readableSheetOpen) {
        closeReadableSheet();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appLanguageSheetOpen, readableSheetOpen, onClose, readableLanguages, user]);

  if (!open || typeof document === "undefined") return null;

  const handleBack = () => {
    if (onBack) onBack();
    else onClose?.();
  };

  return createPortal(
    <div
      className="settings-modal-scrim"
      role="presentation"
      onClick={() => {
        if (appLanguageSheetOpen || readableSheetOpen) return;
        onClose?.();
      }}
    >
      <div
        className="settings-modal-card language-settings-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={tr("language")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-modal-head">
          <div className="settings-modal-head-with-back">
            <button type="button" className="settings-modal-back" onClick={handleBack} aria-label="Back to settings">
              <Icon name="back" size={15} />
            </button>
            <div>
              <div className="settings-modal-title">{tr("language")}</div>
              <div className="settings-modal-sub">{tr("languageSub")}</div>
            </div>
          </div>
          <button type="button" className="settings-modal-close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="settings-modal-body">
          <div className="settings-modal-section-label">App</div>
          <button
            type="button"
            className="settings-modal-row"
            onClick={() => setAppLanguageSheetOpen(true)}
          >
            <span className="settings-modal-row-main">
              <Icon name="globe" size={15} />
              {tr("selectAppLanguage")}
            </span>
            <span className="settings-modal-row-meta">
              {languageLabel(appLanguage)}
              <Icon name="chevronRight" size={14} color="rgba(255,255,255,0.45)" />
            </span>
          </button>
          <p className="settings-modal-helper">
            {tr("appLanguageHelper")}
          </p>

          <div className="settings-modal-section-label">{tr("readableSection")}</div>

          {!authLoading && !user && (
            <div className="edit-profile-modal-status">{tr("signInReadable")}</div>
          )}

          {user && status === "loading" && (
            <div className="edit-profile-modal-status">Loading your language settings…</div>
          )}

          {user && status === "error" && (
            <div className="edit-profile-modal-status">
              <div style={{ color: "#e0567a" }}>{error}</div>
              <button type="button" className="edit-profile-modal-retry" onClick={() => setRetryToken((n) => n + 1)}>
                Retry
              </button>
            </div>
          )}

          {user && status === "ready" && (
            <>
              <button
                type="button"
                className="settings-modal-row"
                onClick={() => {
                  setSaved(false);
                  setReadableSheetOpen(true);
                }}
              >
                <span className="settings-modal-row-main">
                  <Icon name="edit" size={15} />
                  {tr("readableLanguages")}
                </span>
                <span className="settings-modal-row-meta">
                  {readableLanguages.length}
                  <Icon name="chevronRight" size={14} color="rgba(255,255,255,0.45)" />
                </span>
              </button>
              <p className="settings-modal-helper">
                {tr("readableHelper")}
              </p>

              {error && <div className="edit-profile-msg is-error">{error}</div>}
              {saving && <div className="edit-profile-msg">{tr("saving")}</div>}
              {saved && !saving && !error && <div className="edit-profile-msg is-ok">{tr("saved")}</div>}
            </>
          )}
        </div>
      </div>

      {appLanguageSheetOpen && (
        <NestedModal
          title={tr("appLanguageTitle")}
          subtitle={tr("appLanguageSubtitle")}
          onClose={() => setAppLanguageSheetOpen(false)}
        >
          <div className="settings-modal-lang-list">
            {LANGUAGES.map((lang, i) => (
              <div key={lang.code} style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)" }}>
                <LangListItem
                  lang={lang}
                  uiCode={appLanguage}
                  selected={appLanguage === lang.code}
                  onClick={() => chooseAppLanguage(lang.code)}
                />
              </div>
            ))}
          </div>
        </NestedModal>
      )}

      {readableSheetOpen && (
        <NestedModal
          title={tr("readableLanguages")}
          subtitle={tr("readableSubtitle")}
          onClose={closeReadableSheet}
          footer={
            <button type="button" className="settings-modal-done" onClick={closeReadableSheet}>
              {tr("doneSelected", { n: readableLanguages.length })}
            </button>
          }
        >
          <div className="settings-modal-lang-list">
            {LANGUAGES.map((lang, i) => (
              <div key={lang.code} style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)" }}>
                <LangListItem
                  lang={lang}
                  uiCode={appLanguage}
                  selected={readableLanguages.includes(lang.code)}
                  onClick={() => toggleReadable(lang.code)}
                />
              </div>
            ))}
          </div>
        </NestedModal>
      )}
    </div>,
    document.body
  );
}
