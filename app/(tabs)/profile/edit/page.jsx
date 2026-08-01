"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import Grain from "@/components/ui/Grain";
import GlassCircle from "@/components/ui/GlassCircle";
import { useAuth } from "@/lib/auth-context";
import { getProfile, upsertProfile, uploadProfileImage, deleteProfileImage, validateDisplayName, validateBio, validateHandle, validateImageFile, MAX_DISPLAY_NAME_LENGTH, MAX_BIO_LENGTH, MAX_HANDLE_LENGTH } from "@/lib/profile";
import { getUserShows } from "@/lib/userShows";
import { tmdbImage } from "@/lib/tmdb";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";
import ImageCropper from "@/components/ImageCropper";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// Neutral radial-glow backdrop for the background-image picker — smaller
// and tuned differently than Profile's header version, no shared
// equivalent. imageUrl (a Storage public URL, or a local object URL for an
// unsaved pick) renders on top when present; the gradient underneath is
// what's visible before any background has ever been set. Base gradient
// and ambient glow are both neutral gray/white now (were warm brown +
// amber) — amber is reserved for functional accents (buttons/progress/
// ratings/active states), not a decorative background wash.
function AtmosBackdrop({ imageUrl }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "linear-gradient(160deg, #232323 0%, #17171a 55%, #0a0a0c 100%)" }}>
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- an arbitrary Storage URL, not a TMDB path PosterArt/next-image is built for
        <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} />
      )}
      <div style={{ position: "absolute", right: -60, top: "10%", width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)", filter: "blur(20px)" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(0,0,0,0.35) 0%, transparent 60%)" }} />
      <Grain />
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 14.5, color: t.textDim, fontWeight: 500, marginTop: 22, marginBottom: 8 }}>{children}</div>;
}

// Small "pick a source" dropdown anchored right under whichever button
// opened it — e.g. "Choose Character" vs "Upload Your Own Photo" — rather
// than a full-width bottom sheet. Matches ShowDetailClient's own "..."
// menu (absolute, top: calc(100% + 8px), inside a position:relative
// wrapper around the trigger button); the invisible full-screen backdrop
// is just there to close it on an outside tap, sitting one z-level below.
function AnchoredMenu({ align = "center", options, onClose }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute z-50 rounded-2xl"
        style={{
          top: "calc(100% + 8px)",
          ...(align === "center" ? { left: "50%", transform: "translateX(-50%)" } : align === "left" ? { left: 0 } : { right: 0 }),
          width: 230,
          padding: 6,
          background: "rgba(28,22,16,0.95)",
          border: `1px solid ${t.glassBorder}`,
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 20px 44px rgba(0,0,0,0.55)",
        }}
      >
        {options.map((opt) => (
          <button key={opt.label} onClick={opt.onClick} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition text-left" style={{ padding: "10px 12px" }}>
            <Icon name={opt.icon} size={16} color="#fff" />
            <span style={{ fontSize: 13.5, color: "#fff", fontWeight: 500 }}>{opt.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

// Full-screen gallery for picking real backdrop stills or cast headshots
// pooled from the caller's own library shows (app/api/profile/library-media) —
// the "Choose Artwork" / "Choose Character" flows. Plain local state, not a
// URL-param overlay (ShowDetailClient's picker learned that lesson the hard
// way — see components/ImagePickerScreen.jsx): this is reached from a
// simple tap, not deep-linkable, so there's nothing history needs to know.
function LibraryMediaPicker({ type, title, items, loading, onSelect, onClose }) {
  const isCharacter = type === "character";
  return (
    <div className="fixed inset-0 z-50" style={{ background: t.bg }}>
      <div className="h-full overflow-y-auto pb-24" style={{ scrollbarWidth: "none" }}>
        <div className="flex items-center px-6" style={{ paddingTop: "env(safe-area-inset-top)", position: "relative" }}>
          <GlassCircle onClick={onClose} t={t}><Icon name="back" size={16} color={t.text} /></GlassCircle>
          <div style={{ position: "absolute", left: 0, right: 0, textAlign: "center", fontSize: 19, fontWeight: 700, color: "#fff", pointerEvents: "none" }}>
            {title}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "60px 0", textAlign: "center", fontSize: 13, color: t.textDim }}>Loading your library's art…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: "60px 24px", textAlign: "center", fontSize: 13, color: t.textDim }}>
            {isCharacter
              ? "No characters found for the shows in your library yet."
              : "No artwork found for the shows in your library yet."}
          </div>
        ) : isCharacter ? (
          <div className="px-6 grid grid-cols-3 gap-x-3 gap-y-6" style={{ marginTop: 22 }}>
            {/* Captioned by character, not actor — c.character (e.g.
                "Oliver Queen"), never c.name (the real person). The photo
                itself is still TMDB's cast headshot (there's no separate
                stylized character-art asset in its API), but the label is
                what actually says "this is a character pick." */}
            {items.map((c, i) => (
              <button key={`${c.personId}-${i}`} onClick={() => onSelect(tmdbImage(c.profilePath, "w500"))} className="flex flex-col items-center text-center active:scale-95 transition">
                <div className="rounded-full overflow-hidden" style={{ width: 76, height: 76, boxShadow: "0 6px 16px rgba(0,0,0,0.45)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- TMDB path, not a Storage URL */}
                  <img src={tmdbImage(c.profilePath, "w300")} alt="" className="w-full h-full" style={{ objectFit: "cover" }} />
                </div>
                <div className="mt-2 leading-tight" style={{ fontSize: 11.5, fontWeight: 600, color: "#fff" }}>{c.character}</div>
                <div className="leading-tight" style={{ fontSize: 10, color: t.textDim, marginTop: 1 }}>{c.showTitle}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-6 grid grid-cols-2 gap-3" style={{ marginTop: 22 }}>
            {items.map((b, i) => (
              <button key={`${b.showId}-${i}`} onClick={() => onSelect(tmdbImage(b.filePath, "w780"))} className="relative rounded-xl overflow-hidden active:scale-95 transition text-left" style={{ aspectRatio: "16 / 9", boxShadow: "0 6px 16px rgba(0,0,0,0.45)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- TMDB path, not a Storage URL */}
                <img src={tmdbImage(b.filePath, "w500")} alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} />
                <div className="absolute inset-0 flex items-end p-2" style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.65) 0%, transparent 55%)" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "#fff" }}>{b.showTitle}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef(null);
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  // Each of these is either the saved Storage URL, or a local object URL
  // while a newly-picked file hasn't been uploaded yet (only happens on Save).
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [backgroundUrl, setBackgroundUrl] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [backgroundFile, setBackgroundFile] = useState(null);
  // Raw picked file awaiting the crop step — set by pickAvatar/
  // pickBackground, cleared by ImageCropper's confirm/cancel. Only
  // avatarFile/avatarUrl or backgroundFile/backgroundUrl (the actual
  // cropped result) ever gets uploaded/saved. cropTarget picks which of
  // those the single shared ImageCropper instance below is currently
  // cropping for — avatar (square/circle) or background (wide banner).
  const [cropperFile, setCropperFile] = useState(null);
  const [cropTarget, setCropTarget] = useState("avatar"); // "avatar" | "background"
  // What's actually saved in Supabase right now (not the local preview
  // object URL above) — kept separately so a successful save knows which
  // old Storage file it just replaced and can clean it up.
  const [savedAvatarUrl, setSavedAvatarUrl] = useState(null);
  const [savedBackgroundUrl, setSavedBackgroundUrl] = useState(null);

  // 'loading' | 'ready' | 'error' — the profile fetch's real outcome, not
  // just "has it finished." A failed fetch must never quietly resolve
  // into the same enabled, blank-field state as a legitimate first-time
  // user with no profile row yet: those are different situations (one is
  // "nothing to load", the other is "something is wrong"), and only the
  // first should let editing proceed with empty fields.
  const [status, setStatus] = useState("loading");
  const [retryToken, setRetryToken] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const avatarInputRef = useRef(null);
  const backgroundInputRef = useRef(null);

  // Focus (and select) the moment the pencil switches the name from
  // static text to an input, rather than requiring a second tap.
  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  // "Choose Character" / "Choose Artwork" pool real cast headshots and
  // backdrop stills from the shows already in the user's library — this
  // state backs the source-choice bottom sheet, the full-screen picker,
  // and the pool of items itself. null = not fetched yet; fetched once,
  // lazily, the first time either "Choose..." option is tapped, and
  // cached for the rest of this page's lifetime.
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [backgroundSheetOpen, setBackgroundSheetOpen] = useState(false);
  const [characterPickerOpen, setCharacterPickerOpen] = useState(false);
  const [artworkPickerOpen, setArtworkPickerOpen] = useState(false);
  const [libraryMedia, setLibraryMedia] = useState(null);
  const [libraryMediaLoading, setLibraryMediaLoading] = useState(false);

  const ensureLibraryMedia = async () => {
    if (libraryMedia || libraryMediaLoading) return;
    setLibraryMediaLoading(true);
    try {
      const byShow = await getUserShows(user.id);
      // Most recently touched shows first — a large library only pools
      // media from MAX_SHOWS of them server-side, so this decides which
      // ones actually get a chance to show up.
      const showIds = Object.entries(byShow)
        .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
        .map(([id]) => Number(id));
      const res = await fetch("/api/profile/library-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showIds }),
      });
      const data = await res.json();
      setLibraryMedia({ backdrops: data.backdrops ?? [], characters: data.characters ?? [] });
    } catch (err) {
      console.error("Failed to load library media:", err);
      setLibraryMedia({ backdrops: [], characters: [] });
    } finally {
      setLibraryMediaLoading(false);
    }
  };

  // Load the existing values when the page opens (or Retry is pressed).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setStatus("loading");
    setError("");
    getProfile(user.id).then((profile) => {
      if (cancelled) return;
      setDisplayName(profile?.displayName ?? "");
      setHandle(profile?.handle ?? "");
      setBio(profile?.bio ?? "");
      setAvatarUrl(profile?.avatarUrl ?? null);
      setBackgroundUrl(profile?.backgroundUrl ?? null);
      setSavedAvatarUrl(profile?.avatarUrl ?? null);
      setSavedBackgroundUrl(profile?.backgroundUrl ?? null);
      setStatus("ready");
    }).catch((err) => {
      console.error(err);
      if (cancelled) return;
      setError("Couldn't load your profile. Try again.");
      setStatus("error");
    });
    return () => { cancelled = true; };
  }, [user, retryToken]);

  // Basic type/size validation happens here, on the raw picked file — the
  // cropper's own output is always a fresh, small in-bounds JPEG it
  // generates itself, so there's nothing left to validate once that
  // comes back via cropAvatar below.
  const pickAvatar = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const validationError = validateImageFile(file);
    if (validationError) { setError(validationError); return; }
    setError("");
    setCropTarget("avatar");
    setCropperFile(file);
  };

  const cropAvatar = (croppedFile) => {
    setCropperFile(null);
    setAvatarFile(croppedFile);
    setAvatarUrl(URL.createObjectURL(croppedFile));
    setSaved(false);
  };

  // Same crop/reposition/zoom step avatars already got — was applied
  // directly with no adjustment step at all before.
  const pickBackground = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const validationError = validateImageFile(file);
    if (validationError) { setError(validationError); return; }
    setError("");
    setCropTarget("background");
    setCropperFile(file);
  };

  const cropBackground = (croppedFile) => {
    setCropperFile(null);
    setBackgroundFile(croppedFile);
    setBackgroundUrl(URL.createObjectURL(croppedFile));
    setSaved(false);
  };

  // A library pick is already a real TMDB CDN URL, not a local file —
  // no upload step needed, unlike pickAvatar/pickBackground above. Clears
  // any pending file too, in case the user picked one then changed their
  // mind for a library character/artwork instead.
  const chooseCharacter = (url) => {
    setAvatarFile(null);
    setAvatarUrl(url);
    setSaved(false);
    setCharacterPickerOpen(false);
  };

  const chooseArtwork = (url) => {
    setBackgroundFile(null);
    setBackgroundUrl(url);
    setSaved(false);
    setArtworkPickerOpen(false);
  };

  const save = async () => {
    if (!user) { router.push("/login"); return; }
    if (saving) return;
    const validationError = validateDisplayName(displayName) || validateHandle(handle) || validateBio(bio);
    if (validationError) { setError(validationError); setSaved(false); return; }

    setError("");
    setSaved(false);
    setSaving(true);
    try {
      // Only upload images that were actually changed — an unpicked image
      // stays undefined, and upsertProfile leaves that column alone,
      // preserving whatever was already saved.
      const [uploadedAvatarUrl, uploadedBackgroundUrl] = await Promise.all([
        avatarFile ? uploadProfileImage(user.id, avatarFile, "avatar") : Promise.resolve(undefined),
        backgroundFile ? uploadProfileImage(user.id, backgroundFile, "background") : Promise.resolve(undefined),
      ]);
      // A library character/artwork pick changes avatarUrl/backgroundUrl
      // directly (it's already a real TMDB URL) without ever going through
      // avatarFile/backgroundFile — that's still a real change to save,
      // just one with nothing to upload.
      const finalAvatarUrl = uploadedAvatarUrl ?? (avatarUrl !== savedAvatarUrl ? avatarUrl : undefined);
      const finalBackgroundUrl = uploadedBackgroundUrl ?? (backgroundUrl !== savedBackgroundUrl ? backgroundUrl : undefined);
      await upsertProfile(user.id, {
        displayName: displayName.trim(),
        handle: handle.trim().toLowerCase(),
        bio: bio.trim(),
        avatarUrl: finalAvatarUrl,
        backgroundUrl: finalBackgroundUrl,
      });

      // Best-effort: clean up the old file this replaced, if it was ever
      // an uploaded one — deleteProfileImage no-ops for a TMDB URL (no
      // /profile-media/ path to remove), so this is safe to call
      // regardless of whether the new value is an upload or a library
      // pick. Never let a cleanup failure surface as a save failure — the
      // save itself already succeeded above.
      const oldAvatarUrl = savedAvatarUrl;
      const oldBackgroundUrl = savedBackgroundUrl;
      Promise.all([
        finalAvatarUrl && oldAvatarUrl ? deleteProfileImage(oldAvatarUrl) : null,
        finalBackgroundUrl && oldBackgroundUrl ? deleteProfileImage(oldBackgroundUrl) : null,
      ]).catch((err) => console.warn("Old profile image cleanup failed:", err));

      setAvatarFile(null);
      setBackgroundFile(null);
      if (finalAvatarUrl) { setAvatarUrl(finalAvatarUrl); setSavedAvatarUrl(finalAvatarUrl); }
      if (finalBackgroundUrl) { setBackgroundUrl(finalBackgroundUrl); setSavedBackgroundUrl(finalBackgroundUrl); }
      setSaved(true);
      // Profile reads fresh from Supabase on mount, so navigating back is
      // what makes it reflect these changes immediately.
      setTimeout(() => router.push("/profile"), 600);
    } catch (err) {
      console.error(err);
      setError(err.message === "That handle is already taken." ? err.message : "Couldn't save your profile. Try again.");
    } finally {
      setSaving(false);
    }
  };

  // Not signed in — same "sign in first" pattern Profile itself uses.
  if (!authLoading && !user) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center text-center px-8" style={{ background: t.bg }}>
        <Icon name="user" size={30} color={t.textDim} />
        <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginTop: 14 }}>Sign in to edit your profile</div>
        <button onClick={() => router.push("/login")} className="rounded-full active:scale-95 transition" style={{ marginTop: 20, padding: "11px 24px", background: "#fff" }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1a1108" }}>Sign In</span>
        </button>
      </div>
    );
  }

  // Still resolving auth, or the profile fetch hasn't finished yet — a
  // real loading state, not a form full of blank fields pretending to be
  // ready for input.
  if (status === "loading") {
    return (
      <>
        <div className="px-6" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <GlassCircle onClick={() => router.back()} t={t}>
            <Icon name="back" size={16} color={t.text} />
          </GlassCircle>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", marginTop: 16 }}>Edit Profile</div>
        </div>
        <div className="px-6 flex flex-col items-center text-center" style={{ marginTop: 60 }}>
          <div style={{ fontSize: 13.5, color: t.textDim }}>Loading your profile…</div>
        </div>
      </>
    );
  }

  // The fetch itself failed (e.g. a real backend/RLS problem) — distinct
  // from a first-time user with no profile row yet (that's `status ===
  // "ready"` with every field simply empty). Blocking the form here
  // instead of quietly falling back to blank-but-editable fields is the
  // whole point: saving over an unknown state could silently wipe out a
  // profile this fetch just failed to actually read.
  if (status === "error") {
    return (
      <>
        <div className="px-6" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <GlassCircle onClick={() => router.back()} t={t}>
            <Icon name="back" size={16} color={t.text} />
          </GlassCircle>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", marginTop: 16 }}>Edit Profile</div>
        </div>
        <div className="px-6 flex flex-col items-center text-center" style={{ marginTop: 60 }}>
          <div style={{ fontSize: 14, color: "#e0567a" }}>{error || "Couldn't load your profile."}</div>
          <button onClick={() => setRetryToken((n) => n + 1)} className="rounded-full active:scale-95 transition" style={{ marginTop: 16, padding: "11px 24px", background: "rgba(255,255,255,0.1)" }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "#fff" }}>Retry</span>
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Live preview — deliberately the exact same structure/sizing as
          Profile's own header (app/(tabs)/profile/page.jsx: 190px
          full-bleed backdrop, avatar overlapping it by -34px, 76x76 +
          3px border, name/@handle/bio stack) so what's shown here is
          really what Profile will look like, not an approximation.
          Name/handle/bio all read live from the fields below as you
          type. @handle is the one line added on top of the original
          name+bio layout, not a replacement for anything. */}
      <div className="relative w-full" style={{ height: 190 }}>
        <button onClick={() => setBackgroundSheetOpen(true)} disabled={saving} className="absolute inset-0 w-full h-full text-left active:opacity-90 transition">
          <AtmosBackdrop imageUrl={backgroundUrl} />
        </button>
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <GlassCircle onClick={() => router.back()} t={t}>
            <Icon name="back" size={16} color={t.text} />
          </GlassCircle>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}>Edit Profile</span>
          <div style={{ width: 36 }} />
        </div>
        <div className="absolute" style={{ bottom: -18, right: 20 }}>
          <div className="relative">
            <button onClick={() => setBackgroundSheetOpen(true)} disabled={saving} className="flex items-center justify-center rounded-full active:scale-90 transition" style={{ width: 36, height: 36, background: "#fff", border: "2px solid #0A0A0C" }}>
              <Icon name="camera" size={14} color="#111" />
            </button>
            {backgroundSheetOpen && (
              <AnchoredMenu
                align="right"
                onClose={() => setBackgroundSheetOpen(false)}
                options={[
                  {
                    label: "Choose Show Artwork",
                    icon: "image",
                    onClick: () => { setBackgroundSheetOpen(false); setArtworkPickerOpen(true); ensureLibraryMedia(); },
                  },
                  {
                    label: "Upload Your Own Image",
                    icon: "camera",
                    onClick: () => { setBackgroundSheetOpen(false); backgroundInputRef.current?.click(); },
                  },
                ]}
              />
            )}
          </div>
        </div>
      </div>
      <input ref={backgroundInputRef} type="file" accept="image/*" onChange={pickBackground} className="hidden" />

      {/* Same stacked structure as the finished Profile page (avatar on
          top, name/@handle/bio directly under it, not beside it) — this
          preview is meant to be what Profile will actually look like, not
          an approximation. pointerEvents: none on the outer box (it's
          full-width, pulled up -34px with zIndex:10 to sit above the
          backdrop, and would otherwise silently swallow taps on the
          background's camera badge above it — same class of bug as the
          picker header title fixed earlier), re-enabled on the avatar
          button and the name row specifically since those are the only
          interactive pieces here. */}
      <div className="px-6" style={{ marginTop: -34, position: "relative", zIndex: 10, pointerEvents: "none" }}>
        <div className="relative" style={{ width: 76, pointerEvents: "auto" }}>
          <button onClick={() => setAvatarSheetOpen(true)} className="relative active:scale-95 transition" disabled={saving}>
            <div className="overflow-hidden" style={{ width: 76, height: 76, borderRadius: "50%", background: "linear-gradient(135deg,#e8a24c,#5a3420)", border: "3px solid #0A0A0C" }}>
              {avatarUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- Storage URL or TMDB path, not a static asset
                <img src={avatarUrl} alt="" className="w-full h-full" style={{ objectFit: "cover" }} />
              )}
            </div>
            <div className="absolute flex items-center justify-center" style={{ bottom: -2, right: -2, width: 26, height: 26, borderRadius: "50%", background: "#fff", border: "2px solid #0A0A0C" }}>
              <Icon name="camera" size={11} color="#111" />
            </div>
          </button>
          {avatarSheetOpen && (
            <AnchoredMenu
              align="left"
              onClose={() => setAvatarSheetOpen(false)}
              options={[
                {
                  label: "Choose a Character",
                  icon: "user",
                  onClick: () => { setAvatarSheetOpen(false); setCharacterPickerOpen(true); ensureLibraryMedia(); },
                },
                {
                  label: "Upload Your Own Photo",
                  icon: "camera",
                  onClick: () => { setAvatarSheetOpen(false); avatarInputRef.current?.click(); },
                },
              ]}
            />
          )}
        </div>
        <input ref={avatarInputRef} type="file" accept="image/*" onChange={pickAvatar} className="hidden" />
        <div className="text-left" style={{ marginTop: 10, minWidth: 0, pointerEvents: "auto" }}>
          {/* Plain text + pencil by default; tapping the pencil swaps in
              a real input, auto-focused, right in place. */}
          <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
            {editingName ? (
              <input
                ref={nameInputRef}
                type="text"
                value={displayName}
                onChange={(e) => { setDisplayName(e.target.value); setSaved(false); }}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditingName(false); } }}
                placeholder="Your Name"
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                disabled={saving}
                className="bg-transparent outline-none truncate"
                style={{ fontSize: 20.9, fontWeight: 700, color: "#fff", border: "none", padding: 0, minWidth: 0, flex: "0 1 auto" }}
              />
            ) : (
              <span className="truncate" style={{ fontSize: 20.9, fontWeight: 700, color: "#fff" }}>{displayName || "Your Name"}</span>
            )}
            <button
              type="button"
              onClick={() => setEditingName(true)}
              disabled={saving}
              className="flex items-center justify-center flex-shrink-0 active:scale-90 transition"
              style={{ width: 20, height: 20 }}
            >
              <Icon name="edit" size={12} color={t.textDim} />
            </button>
          </div>
          {handle && <div className="truncate" style={{ fontSize: 13.75, color: t.textDim, marginTop: 2 }}>@{handle}</div>}
          <div className="truncate" style={{ fontSize: 13.75, color: "#fff", marginTop: 2 }}>{bio}</div>
        </div>
      </div>

      <div className="px-6" style={{ marginTop: 22 }}>
        <SectionLabel>Handle</SectionLabel>
        <div className="relative flex items-center rounded-2xl" style={{ background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
          <span style={{ paddingLeft: 16, fontSize: 14.5, color: t.textDim }}>@</span>
          <input
            type="text"
            value={handle}
            // Lowercased as you type (not just on save) so what's shown
            // here always matches what'll actually be saved/displayed —
            // validateHandle's pattern only accepts lowercase anyway.
            onChange={(e) => { setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")); setSaved(false); }}
            maxLength={MAX_HANDLE_LENGTH}
            disabled={saving}
            className="w-full bg-transparent outline-none"
            style={{ padding: "15px 16px 15px 4px", fontSize: 14.5, color: "#fff" }}
          />
        </div>

        <SectionLabel>Bio</SectionLabel>
        <div className="relative rounded-2xl" style={{ background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
          <textarea
            value={bio}
            onChange={(e) => { setBio(e.target.value); setSaved(false); }}
            maxLength={MAX_BIO_LENGTH}
            disabled={saving}
            rows={3}
            className="w-full bg-transparent outline-none resize-none"
            style={{ padding: "15px 16px 22px", fontSize: 14, color: "#fff", lineHeight: 1.5 }}
          />
          <span style={{ position: "absolute", right: 14, bottom: 8, fontSize: 10.5, color: t.textDim }}>{bio.length}/{MAX_BIO_LENGTH}</span>
        </div>

        {error && <div style={{ fontSize: 12.5, color: "#e0567a", marginTop: 14 }}>{error}</div>}
        {saved && !error && <div style={{ fontSize: 12.5, color: accent, marginTop: 14 }}>Saved!</div>}

        <button onClick={save} disabled={saving} className="w-full rounded-full active:scale-95 transition" style={{ marginTop: error || saved ? 12 : 24, padding: "14px", background: "#fff", opacity: saving ? 0.6 : 1 }}>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: "#111" }}>{saving ? "Saving…" : "Save Changes"}</span>
        </button>
      </div>

      {characterPickerOpen && (
        <LibraryMediaPicker
          type="character"
          title="Choose a Character"
          items={libraryMedia?.characters ?? []}
          loading={libraryMediaLoading}
          onSelect={chooseCharacter}
          onClose={() => setCharacterPickerOpen(false)}
        />
      )}

      {artworkPickerOpen && (
        <LibraryMediaPicker
          type="artwork"
          title="Choose Show Artwork"
          items={libraryMedia?.backdrops ?? []}
          loading={libraryMediaLoading}
          onSelect={chooseArtwork}
          onClose={() => setArtworkPickerOpen(false)}
        />
      )}

      {cropperFile && cropTarget === "avatar" && (
        <ImageCropper file={cropperFile} onCancel={() => setCropperFile(null)} onConfirm={cropAvatar} />
      )}
      {cropperFile && cropTarget === "background" && (
        // aspectRatio 2 — matches the ~390x190 on-page banner (both here
        // and on Profile itself) closely enough that object-fit: cover
        // display never has to crop meaningfully further than what the
        // user already framed here. rect, not circle — a wide banner, not
        // an avatar.
        <ImageCropper file={cropperFile} onCancel={() => setCropperFile(null)} onConfirm={cropBackground} aspectRatio={2} shape="rect" outputFilename="background.jpg" />
      )}
    </>
  );
}
