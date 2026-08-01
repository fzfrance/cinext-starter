"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";
import GoogleGIcon from "@/components/ui/GoogleGIcon";
import AuthPosterBackground from "@/components/ui/AuthPosterBackground";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

const inputStyle = {
  padding: "13px 16px",
  background: t.inputBg,
  border: `1px solid ${t.cardBorder}`,
  fontSize: 14.5,
  color: "#fff",
};

export default function SignupClient({ posterPaths = [] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    // If the Supabase project requires email confirmation, signUp succeeds
    // but returns no session yet — nothing more to do until they click the
    // confirmation link.
    if (!data.session) { setConfirmSent(true); return; }
    router.push("/home");
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

  if (confirmSent) {
    return (
      <div className="min-h-dvh flex flex-col justify-center items-center px-8 text-center" style={{ background: t.bg }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 8 }}>Check your email</div>
        <div style={{ fontSize: 13.5, color: t.textDim, lineHeight: 1.5 }}>
          We sent a confirmation link to <span style={{ color: "#fff", fontWeight: 600 }}>{email}</span>. Confirm your address, then sign in.
        </div>
        <Link href="/login" style={{ marginTop: 20, fontSize: 13, color: accent, fontWeight: 600 }}>Back to Sign In</Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col justify-center px-8 relative" style={{ zIndex: 1 }}>
      <AuthPosterBackground posterPaths={posterPaths} />

      {/* Same logo treatment as /login — see LoginClient.jsx's comment on
          why 160px (not the suggested 60-80px): the source file is a wide
          681x85 wordmark, not a square mark. */}
      <div className="flex justify-center" style={{ marginBottom: 20 }}>
        <Image src="/text/logo.png" alt="Cinext" width={160} height={20} style={{ width: 160, height: "auto", opacity: 0.92 }} priority />
      </div>

      <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", marginBottom: 4 }}>Create an account</div>
      <div style={{ fontSize: 13.5, color: t.textDim, marginBottom: 28 }}>Track episodes, rate seasons, build your library.</div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
        <input
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          placeholder="Password (min. 6 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-2xl outline-none"
          style={inputStyle}
        />

        {error && <div style={{ fontSize: 12.5, color: "#e0567a" }}>{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full active:scale-95 transition"
          style={{ marginTop: 8, padding: 13, background: "#fff", opacity: loading ? 0.6 : 1 }}
        >
          <span style={{ fontSize: 14.5, fontWeight: 700, color: "#111" }}>{loading ? "Creating account…" : "Sign Up"}</span>
        </button>
      </form>

      <div className="flex items-center gap-3" style={{ marginTop: 20 }}>
        <div style={{ flex: 1, height: 1, background: t.cardBorder }} />
        <span style={{ fontSize: 12, color: t.textDim }}>or</span>
        <div style={{ flex: 1, height: 1, background: t.cardBorder }} />
      </div>

      <button
        onClick={handleGoogleSignIn}
        className="w-full flex items-center justify-center gap-2.5 rounded-full active:scale-95 transition"
        style={{
          marginTop: 16,
          padding: 13,
          background: t.cardFill,
          border: `1px solid ${accent}40`,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <GoogleGIcon size={17} />
        <span style={{ fontSize: 14.5, fontWeight: 600, color: "#fff" }}>Continue with Google</span>
      </button>

      <div className="text-center" style={{ marginTop: 20, fontSize: 13, color: t.textDim }}>
        Already have an account? <Link href="/login" style={{ color: accent, fontWeight: 600 }}>Sign In</Link>
      </div>
    </div>
  );
}
