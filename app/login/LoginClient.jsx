"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";
import Icon from "@/components/ui/Icon";
import GoogleGIcon from "@/components/ui/GoogleGIcon";
import AuthPosterBackground from "@/components/ui/AuthPosterBackground";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// Left icon needs room (44px) on both fields; the password field also
// needs right-side room (44px) for the show/hide toggle.
const inputStyle = {
  padding: "13px 16px 13px 44px",
  background: t.inputBg,
  border: `1px solid ${t.cardBorder}`,
  fontSize: 14.5,
  color: "#fff",
};

// Shared glass-circle look for the Apple/Google icon buttons — same
// cardFill/backdrop-blur tokens as the rest of the app's glass surfaces,
// amber-tinted border as the one accent touch.
const socialButtonStyle = {
  width: 52,
  height: 52,
  background: t.cardFill,
  border: `1px solid ${accent}40`,
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
};

export default function LoginClient({ posterPaths = [], backdropPath = null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState("");
  const [resetMessage, setResetMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.push("/home");
  };

  // Not a separate page/route — Supabase's own resetPasswordForEmail
  // needs nothing else (it emails a real reset link), so this stays a
  // single inline action instead of a whole forgot-password flow.
  const handleForgotPassword = async () => {
    setError("");
    if (!email) { setResetMessage("Enter your email above first."); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    setResetMessage(error ? error.message : "Password reset link sent — check your email.");
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setSocialLoading("google");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/home` },
    });
    // OAuth normally leaves the page immediately. If Supabase rejects the
    // request (provider not configured, blocked redirect, etc.), keep the
    // user on the form and show the actionable error instead of silently
    // leaving the button stuck in a loading state.
    if (error) {
      setSocialLoading("");
      setError(error.message);
    }
  };

  const handleAppleSignIn = async () => {
    setError("");
    setSocialLoading("apple");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: `${window.location.origin}/home` },
    });
    if (error) {
      setSocialLoading("");
      setError(error.message);
    }
  };

  return (
    <div className="auth-page min-h-dvh flex flex-col justify-center px-8 relative" style={{ zIndex: 1, paddingTop: 72 }}>
      <AuthPosterBackground posterPaths={posterPaths} backdropPath={backdropPath} />

      <div className="auth-web-nav" aria-label="Cinext navigation">
        <span className="auth-web-nav-item" aria-hidden="true"><Image src="/cinext-launch-mark.png" alt="Cinext" width={32} height={33} style={{ objectFit: "contain" }} /></span>
        <span className="auth-web-nav-divider" />
        <span className="auth-web-nav-item"><Icon name="playSquare" size={15} />See Next</span>
        <span className="auth-web-nav-item"><Icon name="sparkle" size={15} />Explore</span>
        <span className="auth-web-nav-item"><Icon name="collection" size={15} />Library</span>
        <span className="auth-web-nav-item"><Icon name="sparkle" size={15} />Highlights</span>
        <span className="auth-web-nav-item"><Icon name="user" size={15} />Profile</span>
        <span className="auth-web-nav-item auth-web-nav-search"><Icon name="search" size={17} />Search</span>
      </div>

      <div className="auth-hero">
        <div className="auth-web-copy">
          <div className="auth-web-kicker">CINEXT</div>
          <div className="auth-web-headline">See what&apos;s next.<br />Save what matters.</div>
          <div className="auth-web-subtitle">Your shows, movies, ratings, collections, and watch history — all in one place.</div>
          <div className="auth-web-features">
            <span><Icon name="history" size={15} />Watch history</span>
            <span><Icon name="collection" size={15} />Collections</span>
            <span><Icon name="star" size={15} />Ratings &amp; reviews</span>
          </div>
        </div>

        <div className="auth-form-surface">

      {/* Logo file (public/text/logo.png) is a wide wordmark, 681x85 —
          the requested 60-80px width was sized for a squarer mark and
          would render this one at ~9px tall, unreadable. Widened to
          160px, then +10% to 176px per request (height auto-follows at
          ~22px) so it's actually legible while still reading as a small
          mark above the heading, not a competing headline. */}
      <div className="flex justify-center" style={{ marginBottom: 65 }}>
        <Image src="/text/logo.png" alt="Cinext" width={176} height={22} style={{ width: 176, height: "auto", opacity: 0.92 }} priority />
      </div>

      <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", marginBottom: 4 }}>Sign in</div>
      <div style={{ fontSize: 13.5, color: t.textDim, marginBottom: 28 }}>Welcome back. Continue your journey.</div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="relative flex items-center">
          <div className="absolute" style={{ left: 15, pointerEvents: "none" }}>
            <Icon name="mail" size={16} color={t.textDim} />
          </div>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl outline-none"
            style={inputStyle}
          />
        </div>

        <div className="relative flex items-center">
          <div className="absolute" style={{ left: 15, pointerEvents: "none" }}>
            <Icon name="lock" size={16} color={t.textDim} />
          </div>
          <input
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl outline-none"
            style={{ ...inputStyle, paddingRight: 44 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute active:opacity-60 transition"
            style={{ right: 14 }}
          >
            <Icon name={showPassword ? "eye" : "eyeOff"} size={16} color={t.textDim} />
          </button>
        </div>

        {error && <div style={{ fontSize: 12.5, color: "#e0567a" }}>{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full active:scale-95 transition"
          style={{ marginTop: 8, padding: 13, background: "#fff", opacity: loading ? 0.6 : 1 }}
        >
          <span style={{ fontSize: 14.5, fontWeight: 700, color: "#111" }}>{loading ? "Signing in…" : "Continue"}</span>
        </button>
      </form>

      <div className="text-center" style={{ marginTop: 14 }}>
        <button onClick={handleForgotPassword} style={{ fontSize: 13, color: accent, fontWeight: 600 }}>Forgot password?</button>
        {resetMessage && <div style={{ fontSize: 12, color: t.textDim, marginTop: 6 }}>{resetMessage}</div>}
      </div>

      <div className="flex items-center gap-3" style={{ marginTop: 24 }}>
        <div style={{ flex: 1, height: 1, background: t.cardBorder }} />
        <span style={{ fontSize: 12, color: t.textDim }}>or</span>
        <div style={{ flex: 1, height: 1, background: t.cardBorder }} />
      </div>

      <div className="flex items-center justify-center gap-4" style={{ marginTop: 18 }}>
        <button
          type="button"
          disabled={Boolean(socialLoading) || loading}
          onClick={handleAppleSignIn}
          aria-label="Continue with Apple"
          className="flex items-center justify-center rounded-full active:scale-95 transition"
          style={socialButtonStyle}
        >
          <Icon name="apple" size={20} color="#fff" />
        </button>
        <button
          type="button"
          disabled={Boolean(socialLoading) || loading}
          onClick={handleGoogleSignIn}
          aria-label="Continue with Google"
          className="flex items-center justify-center rounded-full active:scale-95 transition"
          style={socialButtonStyle}
        >
          <GoogleGIcon size={20} />
        </button>
      </div>

      <div className="text-center" style={{ marginTop: 24, fontSize: 13, color: t.textDim }}>
        Don&apos;t have an account? <Link href="/signup" style={{ color: accent, fontWeight: 600 }}>Sign Up</Link>
      </div>
        </div>
      </div>
    </div>
  );
}
