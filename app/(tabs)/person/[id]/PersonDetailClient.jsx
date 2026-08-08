"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Icon from "@/components/ui/Icon";
import Grain from "@/components/ui/Grain";
import PosterArt from "@/components/ui/PosterArt";
import { useAuth } from "@/lib/auth-context";
import { getWatchedShowIds } from "@/lib/episodeWatches";
import { tmdbImage } from "@/lib/tmdb";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { themes, DEFAULT_ACCENT, CAST_GRADIENTS } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

function GlassButton({ children, onClick, style }) {
  return (
    <button onClick={onClick} style={{ background: t.cardFill, color: "#fff", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", ...style }} className="flex items-center justify-center gap-2 rounded-full active:scale-95 transition">
      {children}
    </button>
  );
}

// Neutral fallback for someone with no profile_path — a tinted gradient
// bust silhouette, same visual language CastProfile's overlay used to use
// for every person (now only shown when there's genuinely no photo).
// Gradient is picked deterministically from the person's own TMDB id, not
// their position in some list (this page has no "list" to index into).
function PersonBackdropArt({ grad }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "linear-gradient(180deg, #1c1712 0%, #0d0a07 100%)" }}>
      <div style={{ position: "absolute", inset: 0, background: grad, opacity: 0.55 }} />
      <div style={{ position: "absolute", left: "50%", top: "34%", width: 280, height: 340, transform: "translate(-50%,-50%)", borderRadius: "50% 50% 44% 44%", background: "radial-gradient(ellipse at 50% 25%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.05) 42%, transparent 72%)" }} />
      <Grain />
    </div>
  );
}

export default function PersonDetailClient({ person }) {
  const router = useRouter();
  const { user } = useAuth();
  const readableLanguages = useReadableLanguages();
  const [filmTab, setFilmTab] = useState("tv");
  const [watchedShowIds, setWatchedShowIds] = useState(new Set());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getWatchedShowIds(user.id).then((ids) => { if (!cancelled) setWatchedShowIds(ids); }).catch(console.error);
    return () => { cancelled = true; };
  }, [user]);

  const grad = CAST_GRADIENTS[person.id % CAST_GRADIENTS.length];
  const work = person.credits
    .filter((c) => c.type === filmTab)
    .map((c) => ({ ...c, title: resolveTitle(c, readableLanguages) }));

  const bornLine = person.born
    ? person.died
      ? `${person.born} – ${person.died}${person.age != null ? ` (Age ${person.age})` : ""}`
      : person.age != null ? `${person.born} (Age ${person.age})` : person.born
    : null;

  const infoRows = [["Born", bornLine], ["Birthplace", person.birthplace], ["Nationality", person.nationality], ["Known For", person.department]].filter(([, v]) => v);

  return (
    <div className="min-h-dvh" style={{ background: t.bg }}>
      {/* hero — the photo itself IS the backdrop (full-bleed, same
          treatment as Show Detail's hero: PosterArt-style full-width
          image, gradient scrim, glass back button), not an inset card
          floating over a separate blurred background. The scrim is Show
          Detail's own hero gradient, reused as-is rather than a new one
          invented for this screen.
          Capped to a phone-frame width and centered — this app doesn't
          constrain any other screen on desktop (no screen ever has: the
          phone-frame wrapper was deliberately dropped app-wide, see
          app/layout.jsx), but a full-bleed portrait photo specifically
          breaks on a wide/short desktop viewport: object-fit: cover has
          to scale the image to match the viewport's full width, which
          for a 2:3 portrait blown up to ~1000px+ wide makes its rendered
          height enormous relative to this hero's fixed height, leaving a
          tiny, unpredictably-positioned sliver of the photo visible no
          matter what object-position is chosen. Capping the column width
          keeps the crop math the same as on a real phone.
          This cap used to wrap the ENTIRE page (hero + bio + filmography
          grid below), not just the hero — harmless on a real phone under
          430px wide, but on anything wider it centered the whole page
          with large dead margins on both sides and silently doubled up
          with the grid's own edge padding, which is exactly the "much
          larger than Explore's px-6" symptom reported. The bio/
          filmography section below has no portrait-crop problem to solve
          and needs the same full-width, px-6-edged treatment every other
          screen (Explore, Home) already uses, so the cap now ends right
          here instead of wrapping the rest of the page too. */}
      <div className="mx-auto" style={{ maxWidth: 430 }}>
        {/* height: 50dvh (was a fixed 370px) — the seam into the black
            section below sat too high, cropping the portrait; per
            explicit request it now lands around half the screen instead. */}
        <div className="relative w-full overflow-hidden" style={{ height: "50dvh" }}>
          {person.profilePath ? (
            <Image
              src={tmdbImage(person.profilePath, "h632")}
              alt=""
              fill
              sizes="100vw"
              // Biased toward the top rather than dead-center or a pure
              // 0% top-lock: on a short/wide hero (a portrait image forced
              // to cover a very wide, short box — worst case is a wide
              // desktop viewport) a plain "top" anchor can crop the visible
              // window entirely above the eyes, since TMDB photos usually
              // carry some headroom above the hair. 20% down shifts the
              // window enough to keep the face in frame without losing
              // the top-of-head framing "center" would.
              style={{ objectFit: "cover", objectPosition: "50% 20%" }}
            />
          ) : (
            <PersonBackdropArt grad={grad} />
          )}
          {/* Same scrim shape/stops as Show Detail's hero (solid at the
              bottom, fading to transparent going up), recalibrated to
              this app's ink black (#0A0A0C) — that's also this page's
              flat background color below, so the seam where the hero
              ends and the black section begins is invisible: both sides
              are the exact same solid color at that edge. */}
          <div className="absolute inset-0" style={{ zIndex: 1, background: "linear-gradient(0deg, #0A0A0C 0%, rgba(10,10,12,0.2) 60%, transparent 100%)" }} />
          <div className="absolute top-0 left-0 right-0 flex items-center px-6" style={{ zIndex: 10, paddingTop: "env(safe-area-inset-top)" }}>
            <GlassButton onClick={() => router.back()} style={{ width: 38, height: 38 }}><Icon name="back" size={16} color={t.text} /></GlassButton>
          </div>

          {/* name overlaps the photo's lower portion, sitting on the
              scrim above — not stacked below it. */}
          <div className="absolute left-0 right-0 px-6 text-center" style={{ zIndex: 5, bottom: 20 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>{person.name}</span>
          </div>
        </div>
      </div>

      {/* black section below — bio, born/birthplace/known-for, and the
          filmography toggle. Flush against the hero (no divider, no gap):
          the hero's own scrim already resolves to this section's exact
          background color at that seam. Full width, no max-width cap —
          same px-6 edge padding every other full-width screen (Explore,
          Home) uses, not nested inside the hero's phone-frame cap above. */}
      <div className="px-6" style={{ marginTop: 20, paddingBottom: 32, position: "relative", zIndex: 5 }}>
        <div className="mx-auto" style={{ maxWidth: 420 }}>
            {person.bio && (
              <div className="mt-5" style={{ fontSize: 12.5, lineHeight: 1.6, color: "rgba(255,255,255,0.75)" }}>
                {person.bio.length > 420 ? `${person.bio.slice(0, 420)}…` : person.bio}
              </div>
            )}

            {infoRows.length > 0 && (
              <div className="mt-5">
                {infoRows.map(([k, v]) => (
                  <div key={k} className="grid" style={{ gridTemplateColumns: "108px 1fr", padding: "9px 0" }}>
                    <span style={{ fontSize: 12, color: t.textDim }}>{k}</span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: 500, textAlign: "left" }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ borderTop: `1px solid ${t.cardBorder}`, marginTop: 20 }} />

          {/* filmography */}
          <div className="mt-7">
            <div className="flex rounded-full mx-auto" style={{ padding: 3, background: "rgba(255,255,255,0.06)", width: "fit-content" }}>
              {[{ id: "tv", label: "TV Shows" }, { id: "movie", label: "Movies" }].map((tb) => (
                <button key={tb.id} onClick={() => setFilmTab(tb.id)} className="rounded-full transition" style={{ padding: "7px 16px", fontSize: 12.5, fontWeight: 600, background: filmTab === tb.id ? "#fff" : "transparent", color: filmTab === tb.id ? "#111" : t.textDim }}>
                  {tb.label}
                </button>
              ))}
            </div>

            {/* Multi-column gallery, not a horizontal scroll row — same
                grid pattern Explore's own poster grid uses. */}
            <div className="grid grid-cols-3 gap-x-3 gap-y-5" style={{ marginTop: 16 }}>
              {work.length === 0 ? (
                <div style={{ fontSize: 12.5, color: t.textDim, padding: "18px 0", gridColumn: "1 / -1" }}>No titles yet.</div>
              ) : work.map((w) => {
                const card = (
                  <div className="relative rounded-xl overflow-hidden" style={{ aspectRatio: "2 / 3", boxShadow: "0 6px 16px rgba(0,0,0,0.45)" }}>
                    <PosterArt posterPath={w.posterPath} alt={w.title} />
                    {w.type === "tv" && watchedShowIds.has(w.id) && (
                      <div className="absolute flex items-center justify-center" style={{ right: 6, top: 6, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.55)" }}>
                        <Icon name="check" size={11} color={accent} strokeWidth={2.6} />
                      </div>
                    )}
                  </div>
                );
                // TV credits go to Show Detail, movie credits to Movie
                // Detail (movies-as-content-type plan) — both are real
                // routes now, so every credit card is clickable.
                return (
                  <button key={`${w.type}-${w.id}`} onClick={() => router.push(w.type === "tv" ? `/show/${w.id}` : `/movie/${w.id}`)} className="text-left active:scale-95 transition">
                    {card}
                    <div className="mt-1.5" style={{ fontSize: 11.5, fontWeight: 500, color: "#fff", lineHeight: 1.3 }}>{w.title}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
    </div>
  );
}
