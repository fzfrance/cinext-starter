"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import PageHeader from "@/components/ui/PageHeader";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { getProfile, upsertProfile } from "@/lib/profile";
import { accentPalette, contrastText, resolveTheme, DEFAULT_ACCENT } from "@/lib/theme";

// A true red, deliberately not lib/theme.js's shared `danger` token
// (#e0567a, actually a pink/rose used for errors/remove actions
// elsewhere) — account deletion is permanent in a way those aren't, so it
// gets its own clearer red instead of reusing that pink.
const TRUE_RED = "#ef4444";

function SectionLabel({ children, t }) {
  return <div style={{ fontSize: 14.5, color: t.textDim, fontWeight: 500, marginTop: 22, marginBottom: 8 }}>{children}</div>;
}

function Row({ label, value, icon, onClick, danger, armed, external, chevron = true, t, accent }) {
  // `armed` = a soft "confirm to continue" visual state (used for Sign Out),
  // distinct from `danger` (permanent destructive red, used for account deletion).
  const tone = danger ? "#e0567a" : armed ? accent : null;
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between rounded-2xl active:scale-[0.99] transition"
      style={{
        padding: "15px 16px",
        background: armed ? `${accent}14` : t.cardFill,
        border: `1px solid ${danger ? "rgba(224,86,122,0.35)" : armed ? `${accent}55` : t.cardBorder}`,
      }}
    >
      <div className="flex items-center gap-3">
        {icon && <Icon name={icon} size={16} color={tone || t.textDim} />}
        <span style={{ fontSize: 14.5, color: tone || t.text, fontWeight: 500 }}>{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {value && <span style={{ fontSize: 14, color: accent, fontWeight: 500 }}>{value}</span>}
        {external ? <Icon name="external" size={15} color={t.textDim} /> : chevron ? <Icon name="chevronRight" size={15} color={t.textDim} /> : null}
      </div>
    </button>
  );
}

export default function Page() {
  const router = useRouter();
  const { user } = useAuth();
  const [theme, setTheme] = useState("dark"); // "dark" | "light" | "system"
  const [systemPrefersDark, setSystemPrefersDark] = useState(true);
  // TODO: once a global ThemeProvider exists (per app/(tabs)/layout.jsx's
  // note), this selection should propagate app-wide instead of only
  // repainting this page — it's persisted (below) so it survives reload,
  // but every other screen still hardcodes themes.dark/DEFAULT_ACCENT
  // directly, so the picked theme/accent only ever repaints this page.
  const t = resolveTheme(theme, systemPrefersDark);
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const activeText = contrastText(accent);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Track the OS color-scheme preference so "System" actually follows it.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemPrefersDark(mq.matches);
    const handler = (e) => setSystemPrefersDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Load the saved theme/accent once on mount — same "column may not
  // exist on an older row yet" fallback getProfile already applies
  // (theme_preference/accent_color default to 'dark'/DEFAULT_ACCENT).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getProfile(user.id).then((p) => {
      if (cancelled || !p) return;
      setTheme(p.themePreference);
      setAccent(p.accentColor);
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [user]);

  // Saves immediately on tap — a single theme/accent pick is a complete
  // action on its own (unlike Readable Languages' multi-select, which
  // batches several toggles behind one Done tap), so there's no reason to
  // wait for a separate save step.
  const chooseTheme = (id) => {
    setTheme(id);
    if (user) upsertProfile(user.id, { themePreference: id }).catch(console.error);
  };
  const chooseAccent = (hex) => {
    setAccent(hex);
    if (user) upsertProfile(user.id, { accentColor: hex }).catch(console.error);
  };

  // The custom color <input type="color">'s onChange fires continuously
  // while the picker is being dragged, not just on commit — debounced
  // separately from chooseAccent (used by the discrete palette swatches,
  // which should still save the instant they're tapped) so dragging
  // through the picker doesn't fire a Supabase write per pixel of
  // movement, only once dragging settles.
  const customColorSaveTimer = useRef(null);
  const chooseCustomAccent = (hex) => {
    setAccent(hex);
    clearTimeout(customColorSaveTimer.current);
    if (!user) return;
    customColorSaveTimer.current = setTimeout(() => {
      upsertProfile(user.id, { accentColor: hex }).catch(console.error);
    }, 400);
  };
  useEffect(() => () => clearTimeout(customColorSaveTimer.current), []);

  // Sign Out uses a two-tap "arm then confirm" pattern instead of a full
  // dialog — enough friction to prevent an accidental session-ending tap,
  // without interrupting flow the way a modal would for a reversible action.
  const [signOutArmed, setSignOutArmed] = useState(false);
  const armTimer = useRef(null);
  const handleSignOutTap = () => {
    if (signOutArmed) {
      clearTimeout(armTimer.current);
      setSignOutArmed(false);
      supabase.auth.signOut().then(() => router.push("/login"));
      return;
    }
    setSignOutArmed(true);
    armTimer.current = setTimeout(() => setSignOutArmed(false), 3000);
  };
  useEffect(() => () => clearTimeout(armTimer.current), []);

  // supabase.auth.admin.deleteUser() is a service-role-only call — it can
  // never run in the browser (the service role key bypasses RLS
  // entirely), so this goes through /api/account/delete, which verifies
  // the caller's own access token server-side before deleting anything.
  // Every profiles/collections/user_shows/etc. row already references
  // auth.users(id) on delete cascade, so this one call cleans up
  // everything else too. signOut() first — the admin API deleting the
  // account server-side doesn't invalidate this browser's already-issued
  // session token by itself, so without this the client would still look
  // signed in (and any subsequent request would just fail against
  // now-nonexistent rows) until it happened to refresh.
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

  return (
    <>
      <PageHeader title="Settings" onBack={() => router.back()} t={t} />
      <div className="px-6">
        <SectionLabel t={t}>Profile</SectionLabel>
        <div className="flex flex-col gap-2">
          <Row label="Edit Profile" icon="edit" onClick={() => router.push("/profile/edit")} t={t} accent={accent} />
        </div>

        <SectionLabel t={t}>Preferences</SectionLabel>
        <div className="rounded-2xl" style={{ padding: "14px", background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
          <div style={{ fontSize: 13, color: t.textDim, marginBottom: 10 }}>Theme</div>
          <div className="flex gap-2">
            {[["dark", "moon"], ["light", "sun"], ["system", "auto"]].map(([id, icon]) => {
              const active = theme === id;
              const comingSoon = id === "light";
              return (
                <button
                  key={id}
                  onClick={() => !comingSoon && chooseTheme(id)}
                  disabled={comingSoon}
                  className="relative flex-1 flex flex-col items-center gap-1.5 rounded-xl active:scale-95 transition"
                  style={{ padding: "10px 4px", background: active ? accent : t.inputBg, border: `1px solid ${active ? accent : t.cardBorder}`, opacity: comingSoon ? 0.45 : 1 }}
                >
                  <Icon name={icon} size={16} color={active ? activeText : t.text} />
                  <span style={{ fontSize: 11, fontWeight: 500, color: active ? activeText : t.textDim, textTransform: "capitalize" }}>{id}</span>
                  {comingSoon && (
                    <span style={{ position: "absolute", top: -7, right: -4, fontSize: 8, fontWeight: 700, color: t.textDim, background: t.bg, border: `1px solid ${t.cardBorder}`, borderRadius: 999, padding: "2px 5px", letterSpacing: "0.02em" }}>SOON</span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ height: 1, background: t.cardBorder, margin: "16px 0" }} />

          <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: t.textDim }}>Accent Color</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: t.textDim, background: t.inputBg, border: `1px solid ${t.cardBorder}`, borderRadius: 999, padding: "2px 7px", letterSpacing: "0.02em" }}>COMING SOON</span>
          </div>
          <div className="flex items-center gap-3" style={{ opacity: 0.45, pointerEvents: "none" }}>
            {accentPalette.map((c) => <button key={c.id} onClick={() => chooseAccent(c.hex)} className="active:scale-90 transition flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: "50%" }}><div style={{ width: accent === c.hex ? 26 : 22, height: accent === c.hex ? 26 : 22, borderRadius: "50%", background: c.hex, border: accent === c.hex ? "2.5px solid #fff" : "none", boxShadow: accent === c.hex ? `0 0 0 2px ${c.hex}55` : "none" }} /></button>)}
            <label className="active:scale-90 transition flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: "50%", position: "relative", cursor: "pointer" }}>
              <input type="color" value={accent} onChange={(e) => chooseCustomAccent(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: !accentPalette.some((c) => c.hex.toLowerCase() === accent.toLowerCase()) ? accent : "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)", border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{accentPalette.some((c) => c.hex.toLowerCase() === accent.toLowerCase()) && <Icon name="plus" size={11} color="#fff" strokeWidth={2.6} />}</div>
            </label>
          </div>
        </div>

        {/* Still under Preferences — no separate SectionLabel here, same
            grouping as Appearance right above it. */}
        <div className="flex flex-col gap-2" style={{ marginTop: 10 }}>
          <Row label="Language Settings" icon="globe" onClick={() => router.push("/profile/settings/language")} t={t} accent={accent} />
        </div>

        <SectionLabel t={t}>Data &amp; Privacy</SectionLabel>
        <Row label="Data Export" icon="export" t={t} accent={accent} />

        <SectionLabel t={t}>Account</SectionLabel>
        <div className="flex flex-col gap-2">
          <Row
            label={signOutArmed ? "Tap again to sign out" : "Sign Out"}
            icon="logout"
            armed={signOutArmed}
            onClick={handleSignOutTap}
            chevron={!signOutArmed}
            t={t}
            accent={accent}
          />
        </div>

        {/* Back to the original full-width bordered block per feedback
            ("original design is better") — only the color changed, from
            the app's shared pink/rose "danger" token (#e0567a, used
            elsewhere for errors/remove actions) to a true red, since
            deletion is permanent in a way those aren't. */}
        <div className="rounded-2xl" style={{ marginTop: 22, padding: "14px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.28)" }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 12 }}><Icon name="warning" size={15} color={TRUE_RED} /><span style={{ fontSize: 13.5, fontWeight: 600, color: TRUE_RED }}>Danger Zone</span></div>
          <button onClick={() => { setDeleteError(""); setDeleteConfirmOpen(true); }} className="w-full flex items-center justify-center gap-2 rounded-xl active:scale-95 transition" style={{ padding: "12px", background: "transparent", border: `1.5px solid ${TRUE_RED}` }}><Icon name="trash" size={14} color={TRUE_RED} /><span style={{ fontSize: 13.5, fontWeight: 600, color: TRUE_RED }}>Delete Account</span></button>
        </div>
        <div style={{ height: 30 }} />
      </div>

      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-8" style={{ background: "rgba(0,0,0,0.6)" }}>
          {/* maxWidth (was w-full, stretching almost edge-to-edge inside
              the px-8 overlay) + centered icon/title/body — the box was
              reading as mostly dead space because compact, left-aligned
              text sat inside a much wider box than it needed. */}
          <div className="w-full rounded-3xl flex flex-col items-center text-center" style={{ maxWidth: 300, padding: 22, background: t.dialogBg, border: `1px solid ${t.glassBorder}`, boxShadow: "0 30px 60px rgba(0,0,0,0.6)" }}>
            <div className="flex items-center justify-center gap-2" style={{ marginBottom: 10 }}><Icon name="warning" size={17} color={TRUE_RED} /><span style={{ fontSize: 16, fontWeight: 700, color: t.text }}>Delete your account?</span></div>
            <div style={{ fontSize: 13, color: t.textDim, lineHeight: 1.5 }}>Are you sure? This is permanent.</div>
            {deleteError && <div style={{ fontSize: 12.5, color: TRUE_RED, marginTop: 10 }}>{deleteError}</div>}
            {/* Small, centered pills (not the old full-width flex-1 pair)
                — liquid-glass gray surface on both (t.cardFill/blur,
                matching the trigger button's own glass tokens), red
                reserved for the Delete label's text only, not a solid
                red fill. */}
            <div className="flex gap-2.5 justify-center" style={{ marginTop: 20 }}>
              <button onClick={() => setDeleteConfirmOpen(false)} disabled={deleting} className="rounded-full active:scale-95 transition" style={{ padding: "8px 18px", background: t.inputBg, border: `1px solid ${t.glassBorder}`, opacity: deleting ? 0.5 : 1 }}><span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>Cancel</span></button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="rounded-full active:scale-95 transition"
                style={{ padding: "8px 18px", background: t.cardFill, border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", opacity: deleting ? 0.6 : 1 }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: TRUE_RED }}>{deleting ? "Deleting…" : "Delete"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
