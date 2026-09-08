"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
  // High z so the menu still wins when Edit Profile is inside the
  // desktop floating scrim (z-index 200).
  return (
    <>
      <div className="fixed inset-0" style={{ zIndex: 220 }} onClick={onClose} />
      <div
        className="absolute rounded-2xl"
        style={{
          zIndex: 230,
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

// Full-screen (mobile) / nested floating (desktop) gallery for picking
// real backdrop stills or cast headshots pooled from the caller's own
// library shows (app/api/profile/library-media).
function LibraryMediaPicker({ type, title, items, loading, onSelect, onClose, floating = false }) {
  const isCharacter = type === "character";
  const body = (
    <>
      {loading ? (
        <div className="edit-profile-picker-empty">Loading your library&apos;s art…</div>
      ) : items.length === 0 ? (
        <div className="edit-profile-picker-empty">
          {isCharacter
            ? "No characters found for the shows in your library yet."
            : "No artwork found for the shows in your library yet."}
        </div>
      ) : isCharacter ? (
        <div className={floating ? "edit-profile-picker-chars" : "px-6 grid grid-cols-3 gap-x-3 gap-y-6"} style={floating ? undefined : { marginTop: 22 }}>
          {items.map((c, i) => (
            <button key={`${c.personId}-${i}`} onClick={() => onSelect(tmdbImage(c.profilePath, "w500"))} className="flex flex-col items-center text-center active:scale-95 transition">
              <div className="rounded-full overflow-hidden" style={{ width: floating ? 64 : 76, height: floating ? 64 : 76, boxShadow: "0 6px 16px rgba(0,0,0,0.45)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- TMDB path, not a Storage URL */}
                <img src={tmdbImage(c.profilePath, "w300")} alt="" className="w-full h-full" style={{ objectFit: "cover" }} />
              </div>
              <div className="mt-2 leading-tight" style={{ fontSize: floating ? 11 : 11.5, fontWeight: 600, color: "#fff" }}>{c.character}</div>
              <div className="leading-tight" style={{ fontSize: 10, color: t.textDim, marginTop: 1 }}>{c.showTitle}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className={floating ? "edit-profile-picker-art" : "px-6 grid grid-cols-2 gap-3"} style={floating ? undefined : { marginTop: 22 }}>
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
    </>
  );

  if (floating) {
    return (
      <div className="edit-profile-picker-layer" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="edit-profile-picker-card">
          <div className="edit-profile-picker-head">
            <div className="settings-modal-title">{title}</div>
            <button type="button" className="settings-modal-close" onClick={onClose} aria-label="Close">
              <Icon name="x" size={16} />
            </button>
          </div>
          <div className="edit-profile-picker-body">{body}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50" style={{ background: t.bg }}>
      <div className="h-full overflow-y-auto pb-24" style={{ scrollbarWidth: "none" }}>
        <div className="flex items-center px-6" style={{ paddingTop: "env(safe-area-inset-top)", position: "relative" }}>
          <GlassCircle onClick={onClose} t={t}><Icon name="back" size={16} color={t.text} /></GlassCircle>
          <div style={{ position: "absolute", left: 0, right: 0, textAlign: "center", fontSize: 19, fontWeight: 700, color: "#fff", pointerEvents: "none" }}>
            {title}
          </div>
        </div>
        {body}
      </div>
    </div>
  );
}

export default function EditProfileModal({ open, onClose, focusCover = false }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef(null);
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [backgroundUrl, setBackgroundUrl] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [backgroundFile, setBackgroundFile] = useState(null);
  const [cropperFile, setCropperFile] = useState(null);
  const [cropTarget, setCropTarget] = useState("avatar");
  const [savedAvatarUrl, setSavedAvatarUrl] = useState(null);
  const [savedBackgroundUrl, setSavedBackgroundUrl] = useState(null);
  const [status, setStatus] = useState("loading");
  const [retryToken, setRetryToken] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const avatarInputRef = useRef(null);
  const backgroundInputRef = useRef(null);
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [backgroundSheetOpen, setBackgroundSheetOpen] = useState(false);
  const [characterPickerOpen, setCharacterPickerOpen] = useState(false);
  const [artworkPickerOpen, setArtworkPickerOpen] = useState(false);
  const [libraryMedia, setLibraryMedia] = useState(null);
  const [libraryMediaLoading, setLibraryMediaLoading] = useState(false);

  const close = () => {
    onClose?.();
  };

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
    if (!open || !user) return;
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
  }, [open, user, retryToken]);

  // "Edit cover" from the profile card — open the background picker once ready.
  useEffect(() => {
    if (!open || !focusCover || status !== "ready") return;
    setBackgroundSheetOpen(true);
  }, [open, focusCover, status]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (cropperFile || characterPickerOpen || artworkPickerOpen) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cropperFile, characterPickerOpen, artworkPickerOpen]);

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
      setTimeout(() => onClose?.(), 600);
    } catch (err) {
      console.error(err);
      setError(err.message === "That handle is already taken." ? err.message : "Couldn't save your profile. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const overlays = (
    <>
      <input ref={backgroundInputRef} type="file" accept="image/*" onChange={pickBackground} className="hidden" />
      <input ref={avatarInputRef} type="file" accept="image/*" onChange={pickAvatar} className="hidden" />

      {characterPickerOpen && (
        <LibraryMediaPicker
          type="character"
          title="Choose a Character"
          items={libraryMedia?.characters ?? []}
          loading={libraryMediaLoading}
          onSelect={chooseCharacter}
          onClose={() => setCharacterPickerOpen(false)}
          floating
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
          floating
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

  if (!open || typeof document === "undefined") return null;

  if (!authLoading && !user) {
    return createPortal(
      <div className="settings-modal-scrim" role="presentation" onClick={close}>
        <div className="edit-profile-modal-card" role="dialog" aria-modal="true" aria-label="Edit Profile" onClick={(e) => e.stopPropagation()}>
          <div className="settings-modal-head">
            <div>
              <div className="settings-modal-title">Edit Profile</div>
              <div className="settings-modal-sub">Sign in to continue</div>
            </div>
            <button type="button" className="settings-modal-close" onClick={close} aria-label="Close">
              <Icon name="x" size={16} />
            </button>
          </div>
          <div className="edit-profile-modal-status">
            <div style={{ color: "rgba(255,255,255,0.7)", marginBottom: 16 }}>Sign in to edit your profile</div>
            <button type="button" onClick={() => { close(); router.push("/login"); }} className="edit-profile-save">
              Sign In
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
      <div
        className="settings-modal-scrim"
        role="presentation"
        onClick={() => {
          if (characterPickerOpen || artworkPickerOpen || cropperFile) return;
          close();
        }}
      >
        <div
          className="edit-profile-modal-card"
          role="dialog"
          aria-modal="true"
          aria-label="Edit Profile"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="settings-modal-head">
            <div>
              <div className="settings-modal-title">Edit Profile</div>
              <div className="settings-modal-sub">Photo, name & bio</div>
            </div>
            <button type="button" className="settings-modal-close" onClick={close} aria-label="Close">
              <Icon name="x" size={16} />
            </button>
          </div>

          {status === "loading" && (
            <div className="edit-profile-modal-status">Loading your profile…</div>
          )}

          {status === "error" && (
            <div className="edit-profile-modal-status">
              <div style={{ color: "#e0567a" }}>{error || "Couldn't load your profile."}</div>
              <button type="button" className="edit-profile-modal-retry" onClick={() => setRetryToken((n) => n + 1)}>
                Retry
              </button>
            </div>
          )}

          {status === "ready" && (
            <div className="edit-profile-modal-body">
              <div className="edit-profile-banner">
                <button
                  type="button"
                  className="edit-profile-banner-hit"
                  onClick={() => setBackgroundSheetOpen(true)}
                  disabled={saving}
                  aria-label="Change background"
                >
                  <AtmosBackdrop imageUrl={backgroundUrl} />
                </button>
                <div className="edit-profile-banner-cam">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setBackgroundSheetOpen(true)}
                      disabled={saving}
                      className="edit-profile-cam-btn"
                    >
                      <Icon name="camera" size={13} color="#111" />
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

              <div className="edit-profile-identity">
                <div className="relative" style={{ width: 72 }}>
                  <button type="button" onClick={() => setAvatarSheetOpen(true)} className="edit-profile-avatar-btn" disabled={saving}>
                    <div className="edit-profile-avatar">
                      {avatarUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- Storage URL or TMDB path
                        <img src={avatarUrl} alt="" />
                      )}
                    </div>
                    <span className="edit-profile-avatar-cam">
                      <Icon name="camera" size={11} color="#111" />
                    </span>
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

                <div className="edit-profile-name-row">
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
                      className="edit-profile-name-input"
                    />
                  ) : (
                    <span className="edit-profile-name">{displayName || "Your Name"}</span>
                  )}
                  <button type="button" onClick={() => setEditingName(true)} disabled={saving} className="edit-profile-name-edit" aria-label="Edit name">
                    <Icon name="edit" size={12} color="rgba(255,255,255,0.5)" />
                  </button>
                </div>
                {handle ? <div className="edit-profile-handle-preview">@{handle}</div> : null}
                {bio ? <div className="edit-profile-bio-preview">{bio}</div> : null}
              </div>

              <div className="settings-modal-section-label">Handle</div>
              <div className="edit-profile-field">
                <span className="edit-profile-field-prefix">@</span>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => { setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")); setSaved(false); }}
                  maxLength={MAX_HANDLE_LENGTH}
                  disabled={saving}
                />
              </div>

              <div className="settings-modal-section-label">Bio</div>
              <div className="edit-profile-field edit-profile-field-bio">
                <textarea
                  value={bio}
                  onChange={(e) => { setBio(e.target.value); setSaved(false); }}
                  maxLength={MAX_BIO_LENGTH}
                  disabled={saving}
                  rows={3}
                />
                <span className="edit-profile-field-count">{bio.length}/{MAX_BIO_LENGTH}</span>
              </div>

              {error && <div className="edit-profile-msg is-error">{error}</div>}
              {saved && !error && <div className="edit-profile-msg is-ok">Saved!</div>}

              <button type="button" onClick={save} disabled={saving} className="edit-profile-save">
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          )}
        </div>
        {overlays}
      </div>,
      document.body
    );
}
