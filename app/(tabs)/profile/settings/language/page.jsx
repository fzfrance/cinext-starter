"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import PageHeader from "@/components/ui/PageHeader";
import { useIsDesktopSettings } from "@/components/ui/SettingsModal";
import { useDesktopModals } from "@/lib/desktop-modals-context";
import { useAuth } from "@/lib/auth-context";
import { getProfile, upsertProfile } from "@/lib/profile";
import { LANGUAGES, DEFAULT_READABLE_LANGUAGES, DEFAULT_APP_LANGUAGE, languageLabel, getStoredAppLanguage, applyAppLanguage, languageListLabels, useAppLanguage } from "@/lib/languages";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

function PillRow({ label, valueLabel, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between active:scale-[0.99] transition" style={{ padding: "15px 18px", borderRadius: 20, background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
      <span style={{ fontSize: 14.5, color: t.text, fontWeight: 500 }}>{label}</span>
      <div className="flex items-center gap-1.5">
        {valueLabel && <span style={{ fontSize: 14, color: accent, fontWeight: 500 }}>{valueLabel}</span>}
        <Icon name="chevronRight" size={15} color={t.textDim} />
      </div>
    </button>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 14, color: t.textDim, fontWeight: 600, marginTop: 20, marginBottom: 8 }}>{children}</div>;
}

function HelperText({ children }) {
  return <div style={{ fontSize: 12, color: t.textDim, lineHeight: 1.5, marginTop: 9, padding: "0 2px" }}>{children}</div>;
}

function Modal({ title, subtitle, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)", padding: "24px" }} onClick={onClose}>
      <div className="w-full" style={{ maxWidth: 360, maxHeight: "72%", borderRadius: 24, background: "rgba(40,40,44,0.72)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)", boxShadow: "0 24px 60px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "16px 16px 10px" }}>
          <div className="flex items-center justify-between">
            <div style={{ fontSize: 14.5, fontWeight: 700, color: "#fff" }}>{title}</div>
            <button onClick={onClose} className="active:scale-90 transition flex items-center justify-center" style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,0.1)" }}>
              <Icon name="x" size={11} color={t.textDim} />
            </button>
          </div>
          {subtitle && <div style={{ fontSize: 11.5, color: t.textDim, marginTop: 3 }}>{subtitle}</div>}
        </div>
        <div className="overflow-y-auto" style={{ padding: "2px 10px 10px", scrollbarWidth: "none" }}>{children}</div>
        {footer && <div style={{ padding: "10px 10px 12px" }}>{footer}</div>}
      </div>
    </div>
  );
}

function LangListItem({ lang, selected, onClick, uiCode }) {
  const labels = languageListLabels(lang, uiCode);
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between active:scale-[0.98] transition" style={{ padding: "11px 8px" }}>
      <div className="flex flex-col items-start">
        <span style={{ fontSize: 13.5, color: "#fff", fontWeight: 700 }}>{labels.primary}</span>
        <span style={{ fontSize: 11, color: t.textDim, marginTop: 1 }}>{labels.secondary}</span>
      </div>
      <div className="flex items-center justify-center flex-shrink-0 transition" style={{ width: 18, height: 18, borderRadius: "50%", border: `1.5px solid ${selected ? "rgba(255,255,255,0.85)" : t.cardBorder}`, background: selected ? "rgba(255,255,255,0.12)" : "transparent" }}>
        {selected && <Icon name="check" size={10} color="#fff" strokeWidth={3} />}
      </div>
    </button>
  );
}

export default function Page() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t: tr } = useAppLanguage();
  const isDesktop = useIsDesktopSettings();
  const { openLanguageSettings } = useDesktopModals();

  useEffect(() => {
    if (!isDesktop) return;
    openLanguageSettings();
    router.replace("/home");
  }, [isDesktop, openLanguageSettings, router]);

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
    setAppLanguage(getStoredAppLanguage());
  }, []);

  useEffect(() => {
    if (!user || isDesktop) return;
    let cancelled = false;
    setStatus("loading");
    setError("");
    getProfile(user.id).then((profile) => {
      if (cancelled) return;
      setReadableLanguages(profile?.readableLanguages ?? DEFAULT_READABLE_LANGUAGES);
      if (profile?.appLanguage) {
        const next = applyAppLanguage(profile.appLanguage);
        setAppLanguage(next);
      }
      setStatus("ready");
    }).catch((err) => {
      console.error(err);
      if (cancelled) return;
      setError("Couldn't load your language settings. Try again.");
      setStatus("error");
    });
    return () => { cancelled = true; };
  }, [user, retryToken, isDesktop]);

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

  if (isDesktop) return null;

  if (authLoading) {
    return (
      <>
        <PageHeader title={tr("languageSettings")} onBack={() => router.back()} t={t} />
        <div className="px-6 flex flex-col items-center text-center" style={{ marginTop: 60 }}>
          <div style={{ fontSize: 13.5, color: t.textDim }}>Loading your language settings…</div>
        </div>
      </>
    );
  }

  // Guests can still pick App Language (localStorage). Readable Languages need an account.
  if (!user) {
    return (
      <>
        <PageHeader title={tr("languageSettings")} onBack={() => router.back()} t={t} />
        <div className="px-6">
          <PillRow label={tr("selectAppLanguage")} valueLabel={languageLabel(appLanguage)} onClick={() => setAppLanguageSheetOpen(true)} />
          <HelperText>{tr("appLanguageHelper")}</HelperText>

          <SectionLabel>{tr("readableSection")}</SectionLabel>
          <div className="flex flex-col items-center text-center" style={{ marginTop: 24, marginBottom: 8 }}>
            <Icon name="user" size={26} color={t.textDim} />
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginTop: 12 }}>{tr("signInReadable")}</div>
            <button onClick={() => router.push("/login")} className="rounded-full active:scale-95 transition" style={{ marginTop: 16, padding: "11px 24px", background: accent }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1a1108" }}>Sign In</span>
            </button>
          </div>
          {saved && <div style={{ fontSize: 12.5, color: accent, marginTop: 14 }}>{tr("saved")}</div>}
        </div>

        {appLanguageSheetOpen && (
          <Modal title={tr("appLanguageTitle")} subtitle={tr("appLanguageSubtitle")} onClose={() => setAppLanguageSheetOpen(false)}>
            <div className="flex flex-col">
              {LANGUAGES.map((lang, i) => (
                <div key={lang.code} style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)" }}>
                  <LangListItem lang={lang} uiCode={appLanguage} selected={appLanguage === lang.code} onClick={() => chooseAppLanguage(lang.code)} />
                </div>
              ))}
            </div>
          </Modal>
        )}
      </>
    );
  }

  if (user && status === "loading") {
    return (
      <>
        <PageHeader title={tr("languageSettings")} onBack={() => router.back()} t={t} />
        <div className="px-6 flex flex-col items-center text-center" style={{ marginTop: 60 }}>
          <div style={{ fontSize: 13.5, color: t.textDim }}>Loading your language settings…</div>
        </div>
      </>
    );
  }

  if (user && status === "error") {
    return (
      <>
        <PageHeader title={tr("languageSettings")} onBack={() => router.back()} t={t} />
        <div className="px-6 flex flex-col items-center text-center" style={{ marginTop: 60 }}>
          <div style={{ fontSize: 14, color: "#e0567a" }}>{error}</div>
          <button onClick={() => setRetryToken((n) => n + 1)} className="rounded-full active:scale-95 transition" style={{ marginTop: 16, padding: "11px 24px", background: "rgba(255,255,255,0.1)" }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "#fff" }}>Retry</span>
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={tr("languageSettings")} onBack={() => router.back()} t={t} />
      <div className="px-6">
        <PillRow label={tr("selectAppLanguage")} valueLabel={languageLabel(appLanguage)} onClick={() => setAppLanguageSheetOpen(true)} />
        <HelperText>{tr("appLanguageHelper")}</HelperText>

        <SectionLabel>{tr("readableSection")}</SectionLabel>
        <PillRow label={tr("readableLanguages")} valueLabel={String(readableLanguages.length)} onClick={() => { setSaved(false); setReadableSheetOpen(true); }} />
        <HelperText>{tr("readableHelper")}</HelperText>

        {error && <div style={{ fontSize: 12.5, color: "#e0567a", marginTop: 14 }}>{error}</div>}
        {saving && <div style={{ fontSize: 12.5, color: t.textDim, marginTop: 14 }}>{tr("saving")}</div>}
        {saved && !saving && !error && <div style={{ fontSize: 12.5, color: accent, marginTop: 14 }}>{tr("saved")}</div>}

        <div style={{ height: 30 }} />
      </div>

      {appLanguageSheetOpen && (
        <Modal title={tr("appLanguageTitle")} subtitle={tr("appLanguageSubtitle")} onClose={() => setAppLanguageSheetOpen(false)}>
          <div className="flex flex-col">
            {LANGUAGES.map((lang, i) => (
              <div key={lang.code} style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)" }}>
                <LangListItem lang={lang} uiCode={appLanguage} selected={appLanguage === lang.code} onClick={() => chooseAppLanguage(lang.code)} />
              </div>
            ))}
          </div>
        </Modal>
      )}

      {readableSheetOpen && (
        <Modal
          title={tr("readableLanguages")}
          subtitle={tr("readableSubtitle")}
          onClose={closeReadableSheet}
          footer={
            <button onClick={closeReadableSheet} className="w-full active:scale-95 transition" style={{ padding: 12, borderRadius: 16, background: `${accent}1a`, border: `1px solid ${accent}55` }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: accent }}>{tr("doneSelected", { n: readableLanguages.length })}</span>
            </button>
          }
        >
          <div className="flex flex-col">
            {LANGUAGES.map((lang, i) => (
              <div key={lang.code} style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)" }}>
                <LangListItem lang={lang} uiCode={appLanguage} selected={readableLanguages.includes(lang.code)} onClick={() => toggleReadable(lang.code)} />
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
