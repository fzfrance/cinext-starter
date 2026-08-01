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

export default function LoginClient({ posterPaths = [] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/home`,
      },
    });
    if (error) console.error("Google sign-in error:", error);
  };

  const handleAppleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: {
        redirectTo: `${window.location.origin}/home`,
      },
    });
    if (error) console.error("Apple sign-in error:", error);
  };

  return (
    <div className="min-h-dvh flex flex-col justify-center px-8 relative" style={{ zIndex: 1, paddingTop: 72 }}>
      <AuthPosterBackground posterPaths={posterPaths} />

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
          onClick={handleAppleSignIn}
          aria-label="Continue with Apple"
          className="flex items-center justify-center rounded-full active:scale-95 transition"
          style={socialButtonStyle}
        >
          <Icon name="apple" size={20} color="#fff" />
        </button>
        <button
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
  );
}
