import React, { useState, useRef } from "react";

// ---------- Tokens (matches existing Cinext design system) ----------
const glassBorder = "rgba(255,255,255,0.14)";
const cardBorder = "rgba(255,255,255,0.07)";
const cardFill = "rgba(255,255,255,0.035)";
const textDim = "#9B9BA3";
const accent = "#E8A24C";

// ---------- Icons ----------
function Icon({ name, size = 18, color = "#fff", strokeWidth = 1.8 }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "back": return <svg {...p}><path d="M15 5l-7 7 7 7" /></svg>;
    case "more": return <svg {...p} fill={color} stroke="none"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>;
    case "x": return <svg {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>;
    case "edit": return <svg {...p}><path d="M4 20l1-4 11-11 3 3-11 11-4 1z" /><path d="M14 6l3 3" /></svg>;
    case "trash": return <svg {...p}><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M7 7l1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13" /></svg>;
    case "check": return <svg {...p}><path d="M4 12.5l5 5.5L20 6" /></svg>;
    case "star": return <svg {...p} fill={color} stroke="none"><path d="M12 2.5l2.9 6.1 6.6.7-4.9 4.6 1.3 6.6L12 17.3 5.9 20.5l1.3-6.6-4.9-4.6 6.6-.7z" /></svg>;
    case "sparkle": return <svg {...p} fill={color} stroke="none"><path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z" /></svg>;
    case "settings": return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4" /></svg>;
    case "crown": return <svg {...p} fill={color} stroke="none"><path d="M3 8l4 3 5-6 5 6 4-3-2 10H5L3 8z" /></svg>;
    case "chevronRight": return <svg {...p}><path d="M9 6l6 6-6 6" /></svg>;
    case "share": return <svg {...p}><path d="M12 15V3M8 7l4-4 4 4" /><path d="M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" /></svg>;
    default: return null;
  }
}

function Grain() {
  return (
    <svg style={{ position: "absolute", inset: 0, opacity: 0.045, mixBlendMode: "overlay" }} width="100%" height="100%">
      <filter id="ns2"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" /></filter>
      <rect width="100%" height="100%" filter="url(#ns2)" />
    </svg>
  );
}

function GlassButton({ children, onClick, style }) {
  return (
    <button onClick={onClick} style={{ background: "rgba(255,255,255,0.08)", color: "#fff", border: `1px solid ${glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", ...style }} className="flex items-center justify-center gap-2 rounded-full active:scale-95 transition">
      {children}
    </button>
  );
}

function SeasonThumb({ hue, size = 56 }) {
  return (
    <div className="relative flex-shrink-0 rounded-xl overflow-hidden" style={{ width: size, height: size * 1.39, background: `linear-gradient(160deg, ${hue}55 0%, #1c1712 55%, #0d0a07 100%)` }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 30% 20%, ${hue}66 0%, transparent 60%)` }} />
      <Grain />
    </div>
  );
}

// draggable star input, half-star precision. max=5 for episode-style ratings, max=10 for season ratings.
function StarInput({ value, onChange, size = 30, readOnly = false, max = 5 }) {
  const rowRef = useRef(null);
  const valueFromClientX = (clientX) => {
    const el = rowRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    if (!rect.width) return value;
    const raw = ((clientX - rect.left) / rect.width) * max;
    return Math.max(0, Math.min(max, Math.round(raw * 2) / 2));
  };
  const startDrag = (clientX) => {
    if (readOnly) return;
    onChange(valueFromClientX(clientX));
    const move = (e) => onChange(valueFromClientX(e.clientX));
    const tmove = (e) => { if (e.touches && e.touches[0]) onChange(valueFromClientX(e.touches[0].clientX)); };
    const stop = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchmove", tmove);
      window.removeEventListener("touchend", stop);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchmove", tmove, { passive: true });
    window.addEventListener("touchend", stop);
  };
  return (
    <div ref={rowRef} onMouseDown={(e) => startDrag(e.clientX)} onTouchStart={(e) => e.touches && e.touches[0] && startDrag(e.touches[0].clientX)} className="flex" style={{ gap: max > 5 ? 3 : 4, touchAction: "none", cursor: readOnly ? "default" : "pointer" }}>
      {Array.from({ length: max }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <div key={i} className="relative" style={{ width: size, height: size }}>
            <Icon name="star" size={size} color="rgba(255,255,255,0.18)" />
            {fill > 0 && <div className="absolute top-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%`, height: size }}><Icon name="star" size={size} color={accent} /></div>}
          </div>
        );
      })}
    </div>
  );
}

// tiny read-only 5-star row, for the per-episode breakdown list
function MiniStars({ value }) {
  return (
    <div className="flex" style={{ gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => <Icon key={i} name="star" size={11} color={value >= i ? accent : "rgba(255,255,255,0.16)"} />)}
    </div>
  );
}

// ---------- Mock data ----------
const showTitle = "Arrow";
const seasons = [
  { id: 1, title: "Season 1", hue: "#8fbf8a", episodes: [4, 5, 4, 3, 5, 4, 5, 5].map((r, i) => ({ n: i + 1, myRating: r })) },
  { id: 2, title: "Season 2", hue: "#e0a85e", episodes: [5, 5, 4, 5, 5, 4, 5, 5].map((r, i) => ({ n: i + 1, myRating: r })) },
  { id: 3, title: "Season 3", hue: "#7fa8c9", episodes: [3, 4, null, 4, 5, null, 4, null, null, null].map((r, i) => ({ n: i + 1, myRating: r })) },
  { id: 4, title: "Season 4", hue: "#c98a8a", episodes: [null, null, null, null, null, null].map((r, i) => ({ n: i + 1, myRating: r })) },
];

const moodList = [
  { id: "wow", label: "Wow", emoji: "😮" },
  { id: "happy", label: "Happy", emoji: "😊" },
  { id: "sad", label: "Sad", emoji: "😢" },
  { id: "thrilled", label: "Thrilled", emoji: "🤩" },
  { id: "bored", label: "Bored", emoji: "😑" },
];

const cast = [
  { id: "oliver", name: "Oliver", initials: "OQ", grad: "linear-gradient(135deg,#6f8f5a,#22301a)" },
  { id: "diggle", name: "Diggle", initials: "JD", grad: "linear-gradient(135deg,#8a6f4a,#2e2314)" },
  { id: "felicity", name: "Felicity", initials: "FS", grad: "linear-gradient(135deg,#9d7fc9,#2c2140)" },
  { id: "quentin", name: "Quentin", initials: "QL", grad: "linear-gradient(135deg,#7a8fa8,#25313d)" },
  { id: "roy", name: "Roy", initials: "RH", grad: "linear-gradient(135deg,#c9836f,#3a1f14)" },
];

const fmtDate = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function seasonAuto(season) {
  const rated = season.episodes.filter((e) => e.myRating);
  if (!rated.length) return null;
  const avg = rated.reduce((a, e) => a + e.myRating, 0) / rated.length;
  return { avg10: avg * 2, ratedCount: rated.length, total: season.episodes.length };
}

// ---------- Compact preview card (3 states: manual / auto / empty) ----------
function SeasonBanner({ s, manual, auto, onClick }) {
  const moodMeta = manual && moodList.find((m) => m.id === manual.mood);
  const castMeta = manual && manual.character && cast.find((c) => c.id === manual.character);
  const isEmpty = !manual && !auto;
  const score = manual ? manual.rating : auto ? auto.avg10 : null;
  return (
    <button onClick={onClick} className="relative w-full rounded-2xl overflow-hidden text-left active:scale-[0.98] transition flex items-center" style={{ height: 84, marginBottom: 10, border: manual ? "none" : `1.5px dashed rgba(255,255,255,0.14)` }}>
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${s.hue}${isEmpty ? "30" : "66"} 0%, #1c1712 55%, #0d0a07 100%)` }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 82% 10%, ${s.hue}55 0%, transparent 55%)` }} />
        <Grain />
      </div>
      <span style={{ position: "absolute", right: -4, top: -14, fontSize: 68, fontWeight: 800, color: "rgba(255,255,255,0.06)", lineHeight: 1, letterSpacing: "-0.05em" }}>{s.id}</span>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(100deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.2) 55%, transparent 100%)" }} />

      <div className="relative flex items-center justify-between w-full" style={{ padding: "0 15px" }}>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{s.title}</span>
            {!manual && !isEmpty && (
              <span className="flex items-center gap-1" style={{ fontSize: 9, fontWeight: 700, color: accent }}><Icon name="sparkle" size={8} color={accent} />AUTO</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 3 }}>
            {manual ? (
              <>
                {moodMeta && <span style={{ fontSize: 12.5 }}>{moodMeta.emoji}</span>}
                {castMeta && (
                  <span className="flex items-center gap-1">
                    <div style={{ width: 11, height: 11, borderRadius: "50%", background: castMeta.grad, flexShrink: 0 }} />
                    <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.75)" }}>{castMeta.name}</span>
                  </span>
                )}
                <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)" }}>{fmtDate(manual.savedAt)}</span>
              </>
            ) : isEmpty ? (
              <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)" }}>Not rated yet — tap to rate</span>
            ) : (
              <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)" }}>{auto.ratedCount}/{auto.total} episodes rated</span>
            )}
          </div>
        </div>
        {score != null ? (
          <div className="flex items-center gap-1 flex-shrink-0" style={{ marginLeft: 10 }}>
            <Icon name="star" size={13} color={accent} />
            <span style={{ fontSize: 16, fontWeight: 800, color: accent }}>{score.toFixed(1)}</span>
          </div>
        ) : (
          <div className="flex items-center justify-center flex-shrink-0 rounded-full" style={{ width: 26, height: 26, background: "rgba(255,255,255,0.08)", marginLeft: 10 }}>
            <Icon name="star" size={12} color="rgba(255,255,255,0.4)" />
          </div>
        )}
      </div>
    </button>
  );
}

// ---------- Screen ----------
export default function SeasonRatingPrototype() {
  const [view, setView] = useState("detail"); // 'detail' | 'profile'
  const [seasonReviews, setSeasonReviews] = useState({
    2: { rating: 9.4, mood: "thrilled", character: "diggle", text: "Best season of the show by far — the finale alone earns this. Every episode felt essential.", savedAt: new Date(2026, 5, 14), source: "manual" },
  });

  // one unified full-page screen replaces the old breakdown sheet + composer sheet + read view
  const [openFor, setOpenFor] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draftRating, setDraftRating] = useState(0); // 0–10 directly now
  const [draftMood, setDraftMood] = useState(null);
  const [draftCast, setDraftCast] = useState(null);
  const [draftText, setDraftText] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [shareCardFor, setShareCardFor] = useState(null);
  const [shareToast, setShareToast] = useState(false);

  const handleShare = () => {
    setShareToast(true);
    setTimeout(() => setShareToast(false), 1600);
  };

  const seasonById = (id) => seasons.find((s) => s.id === id);

  const loadDraft = (seasonId) => {
    const manual = seasonReviews[seasonId];
    setDraftRating(manual ? manual.rating : 0);
    setDraftMood(manual?.mood || null);
    setDraftCast(manual?.character || null);
    setDraftText(manual?.text || "");
  };

  // from the Reviews tab: manual → read view, auto/empty → straight into editing (encourages rating)
  const openSeason = (seasonId) => {
    const manual = seasonReviews[seasonId];
    setOpenFor(seasonId);
    setEditing(!manual);
    loadDraft(seasonId);
    setMoreOpen(false);
  };

  // from Profile: these are already "your ratings" being shown off, so always land on the
  // read/completed view — even for auto-only seasons, where stars reflect the auto score
  const viewSeason = (seasonId) => {
    const manual = seasonReviews[seasonId];
    const auto = seasonAuto(seasonById(seasonId));
    setOpenFor(seasonId);
    setEditing(false);
    setDraftRating(manual ? manual.rating : auto ? auto.avg10 : 0);
    setDraftMood(manual?.mood || null);
    setDraftCast(manual?.character || null);
    setDraftText(manual?.text || "");
    setMoreOpen(false);
  };

  const startEdit = () => {
    loadDraft(openFor);
    setEditing(true);
    setMoreOpen(false);
  };

  const saveReview = () => {
    setSeasonReviews((sr) => ({ ...sr, [openFor]: { rating: draftRating, mood: draftMood, character: draftCast, text: draftText.trim(), savedAt: new Date(), source: "manual" } }));
    setEditing(false);
    setJustSaved(true);
  };

  const deleteReview = () => {
    setSeasonReviews((sr) => { const n = { ...sr }; delete n[openFor]; return n; });
    setOpenFor(null);
  };

  const closeSeason = () => { setOpenFor(null); setEditing(false); setMoreOpen(false); };

  const canSave = draftRating > 0;

  const ratedEntries = seasons
    .map((s) => ({ s, manual: seasonReviews[s.id], auto: seasonAuto(s) }))
    .filter((x) => x.manual || x.auto);

  return (
    <div className="w-full min-h-screen flex flex-col items-center justify-center py-8 gap-4" style={{ background: "#000" }}>
      <div className="flex rounded-full" style={{ padding: 3, background: "rgba(255,255,255,0.06)", border: `1px solid ${cardBorder}` }}>
        {[{ id: "detail", label: "Show Detail" }, { id: "profile", label: "Profile" }].map((t) => (
          <button key={t.id} onClick={() => setView(t.id)} className="rounded-full transition" style={{ padding: "7px 16px", fontSize: 12.5, fontWeight: 600, background: view === t.id ? "#fff" : "transparent", color: view === t.id ? "#111" : textDim }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative overflow-hidden" style={{ width: 390, height: 844, borderRadius: 54, background: "#0A0A0C", boxShadow: "0 40px 100px rgba(0,0,0,0.7)", border: "8px solid #151517" }}>

        {/* ---------------- SHOW DETAIL VIEW ---------------- */}
        {view === "detail" && (
          <div className="h-full overflow-y-auto pb-10" style={{ scrollbarWidth: "none" }}>
            <div className="flex items-center justify-between px-6" style={{ paddingTop: 56 }}>
              <GlassButton style={{ width: 38, height: 38 }}><Icon name="back" size={16} /></GlassButton>
              <span style={{ fontSize: 15.5, fontWeight: 700, color: "#fff" }}>{showTitle}</span>
              <GlassButton style={{ width: 38, height: 38 }}><Icon name="more" size={16} /></GlassButton>
            </div>

            <div className="flex items-center gap-5 px-6" style={{ marginTop: 22, borderBottom: `1px solid ${cardBorder}` }}>
              {["Episodes", "Cast & Crew", "Details", "Reviews"].map((t) => {
                const active = t === "Reviews";
                return (
                  <div key={t} style={{ paddingBottom: 10, fontSize: 13.5, fontWeight: active ? 700 : 500, color: active ? "#fff" : "rgba(255,255,255,0.35)", borderBottom: active ? `2px solid ${accent}` : "2px solid transparent" }}>
                    {t}
                  </div>
                );
              })}
            </div>

            <div className="px-6" style={{ marginTop: 18 }}>
              {seasons.map((s) => {
                const manual = seasonReviews[s.id];
                const auto = seasonAuto(s);
                return <SeasonBanner key={s.id} s={s} manual={manual} auto={auto} onClick={() => openSeason(s.id)} />;
              })}
            </div>
          </div>
        )}

        {/* ---------------- PROFILE VIEW ---------------- */}
        {view === "profile" && (
          <div className="h-full overflow-y-auto pb-10" style={{ scrollbarWidth: "none" }}>
            <div className="relative w-full" style={{ height: 150 }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #1c1712 0%, #0d0a07 100%)" }}>
                <div style={{ position: "absolute", right: -60, top: "10%", width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle, rgba(232,162,76,0.3) 0%, transparent 70%)" }} />
                <Grain />
              </div>
              <div className="absolute top-0 right-0 px-6" style={{ paddingTop: 56 }}><GlassButton style={{ width: 38, height: 38 }}><Icon name="settings" size={16} /></GlassButton></div>
            </div>
            <div className="flex items-end gap-3.5 px-6" style={{ marginTop: -34, position: "relative", zIndex: 10 }}>
              <div style={{ width: 76, height: 76, borderRadius: "50%", background: "linear-gradient(135deg,#e8a24c,#5a3420)", border: "3px solid #0A0A0C", flexShrink: 0 }} />
              <div style={{ paddingBottom: 4 }}><div style={{ fontSize: 19, fontWeight: 700, color: "#fff" }}>France</div><div style={{ fontSize: 12.5, color: textDim, marginTop: 2 }}>Tracking shows since 2023</div></div>
            </div>

            <div style={{ marginTop: 28 }}>
              <div className="flex items-center justify-between px-6 mb-3"><span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>Favorites</span><span style={{ fontSize: 12.5, color: textDim, fontWeight: 500 }}>See All</span></div>
              <div className="flex gap-2.5 px-6" style={{ opacity: 0.3 }}>{[1, 2, 3].map((i) => <div key={i} style={{ width: 88, height: 130, borderRadius: 14, background: cardFill, flexShrink: 0 }} />)}</div>
            </div>

            <div style={{ marginTop: 26 }}>
              <div className="flex items-center justify-between px-6 mb-3"><span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>My Ratings</span><span style={{ fontSize: 12.5, color: textDim, fontWeight: 500 }}>See All</span></div>
              <div className="flex gap-2.5 overflow-x-auto px-6" style={{ scrollbarWidth: "none" }}>
                {ratedEntries.map(({ s, manual, auto }) => {
                  const moodMeta = manual && moodList.find((m) => m.id === manual.mood);
                  return (
                    <button key={s.id} onClick={() => setShareCardFor(s.id)} className="flex-shrink-0 text-left active:scale-95 transition" style={{ width: 118 }}>
                      <div className="relative rounded-2xl overflow-hidden" style={{ width: 118, height: 118 }}>
                        <SeasonThumb hue={s.hue} size={118} />
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 55%)" }} />
                        <div className="absolute flex items-center gap-1" style={{ left: 8, bottom: 8 }}>
                          <Icon name="star" size={11} color={accent} />
                          <span style={{ fontSize: 12.5, fontWeight: 800, color: "#fff" }}>{(manual ? manual.rating : auto.avg10).toFixed(1)}</span>
                        </div>
                        {moodMeta && <div className="absolute flex items-center justify-center rounded-full" style={{ right: 6, top: 6, width: 24, height: 24, background: "rgba(0,0,0,0.45)" }}><span style={{ fontSize: 12 }}>{moodMeta.emoji}</span></div>}
                        {!manual && (
                          <div className="absolute flex items-center gap-1 rounded-full" style={{ left: 6, top: 6, padding: "2px 6px", background: "rgba(232,162,76,0.2)" }}>
                            <Icon name="sparkle" size={8} color={accent} />
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#fff", marginTop: 6 }}>{showTitle}</div>
                      <div style={{ fontSize: 11, color: textDim, marginTop: 1 }}>{s.title}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: 26 }}>
              <div className="flex items-center justify-between px-6 mb-3"><span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>Collections</span><span style={{ fontSize: 12.5, color: textDim, fontWeight: 500 }}>See All</span></div>
              <div className="flex gap-2.5 px-6" style={{ opacity: 0.3 }}>{[1, 2].map((i) => <div key={i} style={{ width: 150, height: 118, borderRadius: 16, background: cardFill, flexShrink: 0 }} />)}</div>
            </div>
          </div>
        )}

        {/* ---------------- Unified season rating screen ---------------- */}
        {openFor != null && (() => {
          const s = seasonById(openFor);
          const manual = seasonReviews[openFor];
          const auto = seasonAuto(s);
          const readMoodMeta = manual && moodList.find((m) => m.id === manual.mood);
          const readCastMeta = manual && manual.character && cast.find((c) => c.id === manual.character);
          const viewingAuto = !editing && !manual && auto; // read-only view of an auto score, no manual saved yet

          return (
            <div className="absolute inset-0 z-40" style={{ background: `linear-gradient(180deg, ${s.hue}40 0%, #1a1712 30%, #100c09 56%, #0A0A0C 100%)` }}>
              <div className="h-full overflow-y-auto pb-12" style={{ scrollbarWidth: "none" }}>
                {/* backdrop — stretches to nearly half the screen, carries the season's color down instead of cutting to black */}
                <div className="relative w-full" style={{ height: 400 }}>
                  <div style={{ position: "absolute", inset: 0, background: `linear-gradient(165deg, ${s.hue}75 0%, #1c1712 62%, #0d0a07 100%)` }}>
                    <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 65% 12%, ${s.hue}85 0%, transparent 62%)` }} />
                    <Grain />
                  </div>
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(10,8,6,0.1) 0%, transparent 35%)" }} />

                  <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6" style={{ paddingTop: 56 }}>
                    <GlassButton onClick={closeSeason} style={{ width: 38, height: 38 }}><Icon name="back" size={16} /></GlassButton>
                    {!editing && (manual || auto) && (
                      <div className="flex items-center gap-2">
                        <GlassButton onClick={() => setShareCardFor(openFor)} style={{ width: 38, height: 38 }}><Icon name="share" size={15} /></GlassButton>
                        {manual && (
                          <div className="relative">
                            <GlassButton onClick={() => setMoreOpen((v) => !v)} style={{ width: 38, height: 38 }}><Icon name="more" size={16} /></GlassButton>
                            {moreOpen && (
                              <div className="absolute z-30 rounded-2xl" style={{ right: 0, top: "calc(100% + 8px)", width: 170, padding: 6, background: "rgba(28,22,16,0.95)", border: `1px solid ${glassBorder}`, backdropFilter: "blur(24px)", boxShadow: "0 20px 44px rgba(0,0,0,0.55)" }}>
                                <button onClick={startEdit} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "10px 12px" }}><Icon name="edit" size={14} /><span style={{ fontSize: 13.5, color: "#fff", fontWeight: 500 }}>Edit Rating</span></button>
                                <button onClick={deleteReview} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "10px 12px" }}><Icon name="trash" size={14} color="#e0567a" /><span style={{ fontSize: 13.5, color: "#e0567a", fontWeight: 500 }}>Delete Rating</span></button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="absolute left-0 right-0 px-6" style={{ bottom: 22 }}>
                    <div style={{ fontSize: 12, letterSpacing: "0.14em", color: accent, fontWeight: 600 }}>{showTitle.toUpperCase()}</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", marginTop: 3 }}>{s.title}</div>
                    {!editing && (manual || auto) && (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: viewingAuto ? "rgba(232,162,76,0.16)" : "rgba(255,255,255,0.1)", border: `1px solid ${viewingAuto ? accent : glassBorder}` }}>
                          {viewingAuto && <Icon name="sparkle" size={10} color={accent} />}
                          <Icon name="star" size={11} color={accent} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{(manual ? manual.rating : auto.avg10).toFixed(1)}<span style={{ color: textDim, fontWeight: 500 }}>/10</span></span>
                        </div>
                        <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)" }}>{manual ? fmtDate(manual.savedAt) : `${auto.ratedCount}/${auto.total} episodes rated`}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-6" style={{ marginTop: 20 }}>
                  {/* Rating — 10-star row, centered, card-grouped */}
                  <div className="rounded-3xl flex flex-col items-center text-center" style={{ padding: "22px 14px", background: cardFill, border: `1px solid ${cardBorder}` }}>
                    <div style={{ fontSize: 15.5, fontWeight: 600, color: "#fff" }}>{editing ? "Rate this season" : viewingAuto ? "Auto Rating" : "Your Rating"}</div>
                    <div className="mt-4"><StarInput value={draftRating} onChange={editing ? setDraftRating : () => {}} size={editing ? 26 : 22} readOnly={!editing} max={10} /></div>
                    {editing && draftRating > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: accent, marginTop: 9 }}>{draftRating.toFixed(1)}/10</div>}
                    {editing && !manual && auto && (
                      <div style={{ fontSize: 12.5, color: accent, fontWeight: 600, marginTop: 10 }}>Auto rating is {auto.avg10.toFixed(1)}/10 — save your own to override</div>
                    )}
                    {viewingAuto && (
                      <>
                        <div style={{ fontSize: 12, color: textDim, marginTop: 8 }}>Calculated from your episode ratings</div>
                        <button onClick={startEdit} className="rounded-full active:scale-95 transition" style={{ marginTop: 14, padding: "9px 18px", background: "rgba(232,162,76,0.14)", border: `1px solid ${accent}` }}>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: accent }}>Rate This Season Yourself</span>
                        </button>
                      </>
                    )}
                  </div>

                  {/* Mood */}
                  {(editing || readMoodMeta) && (
                    <div className="mt-4 rounded-3xl text-center" style={{ padding: "22px 16px", background: cardFill, border: `1px solid ${cardBorder}` }}>
                      <div style={{ fontSize: 15.5, fontWeight: 600, color: "#fff" }}>{editing ? "How did it make you feel?" : "Your Mood"}</div>
                      {editing ? (
                        <div className="mt-4 flex justify-between">
                          {moodList.map((m) => {
                            const active = draftMood === m.id;
                            return (
                              <button key={m.id} onClick={() => setDraftMood(active ? null : m.id)} className="flex flex-col items-center gap-1.5 active:scale-95 transition">
                                <div className="flex items-center justify-center rounded-full" style={{ width: 44, height: 44, background: active ? "rgba(232,162,76,0.14)" : "rgba(255,255,255,0.06)", border: `1.5px solid ${active ? accent : "transparent"}` }}>
                                  <span style={{ fontSize: 19 }}>{m.emoji}</span>
                                </div>
                                <span style={{ fontSize: 10.5, color: active ? accent : textDim, fontWeight: active ? 700 : 500 }}>{m.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2 mt-3.5">
                          <div className="flex items-center justify-center rounded-full" style={{ width: 34, height: 34, background: "rgba(255,255,255,0.06)" }}><span style={{ fontSize: 17 }}>{readMoodMeta.emoji}</span></div>
                          <span style={{ fontSize: 14, color: "#fff", fontWeight: 500 }}>{readMoodMeta.label}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Favorite character */}
                  {(editing || readCastMeta) && (
                    <div className="mt-4 rounded-3xl text-center" style={{ padding: "22px 16px", background: cardFill, border: `1px solid ${cardBorder}` }}>
                      <div style={{ fontSize: 15.5, fontWeight: 600, color: "#fff" }}>{editing ? "Favorite character?" : "Favorite Character"}</div>
                      {editing ? (
                        <div className="mt-4 flex gap-4 overflow-x-auto justify-center" style={{ scrollbarWidth: "none" }}>
                          {cast.map((c) => {
                            const active = draftCast === c.id;
                            return (
                              <button key={c.id} onClick={() => setDraftCast(active ? null : c.id)} className="flex-shrink-0 flex flex-col items-center gap-1.5 active:scale-95 transition">
                                <div className="relative">
                                  <div style={{ width: 52, height: 52, borderRadius: "50%", background: c.grad, display: "flex", alignItems: "center", justifyContent: "center", border: active ? `2px solid ${accent}` : "2px solid transparent" }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{c.initials}</span>
                                  </div>
                                  {active && <div style={{ position: "absolute", top: -8, right: -4, width: 18, height: 18, borderRadius: "50%", background: accent, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="crown" size={10} color="#1a1108" /></div>}
                                </div>
                                <span style={{ fontSize: 11, color: active ? "#fff" : textDim }}>{c.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2 mt-3.5">
                          <div style={{ width: 34, height: 34, borderRadius: "50%", background: readCastMeta.grad, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 11.5, fontWeight: 700, color: "#fff" }}>{readCastMeta.initials}</span></div>
                          <span style={{ fontSize: 14, color: "#fff", fontWeight: 500 }}>{readCastMeta.name}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Review — header centered like the other cards, body left-aligned for readability */}
                  {(editing || manual?.text) && (
                    <div className="mt-4 rounded-3xl" style={{ padding: "22px 16px", background: cardFill, border: `1px solid ${cardBorder}` }}>
                      <div className="text-center" style={{ fontSize: 15.5, fontWeight: 600, color: "#fff" }}>{editing ? "Write your review" : "Your Review"} {editing && <span style={{ fontSize: 12, color: textDim, fontWeight: 500 }}>(optional)</span>}</div>
                      {editing ? (
                        <div className="relative rounded-2xl mt-4" style={{ background: "rgba(255,255,255,0.04)" }}>
                          <textarea value={draftText} onChange={(e) => e.target.value.length <= 500 && setDraftText(e.target.value)} placeholder="Share your thoughts..." rows={4} className="w-full bg-transparent outline-none" style={{ padding: "12px 14px 22px", fontSize: 13.5, color: "#fff", lineHeight: 1.5, resize: "none", textAlign: "left" }} />
                          <span style={{ position: "absolute", right: 12, bottom: 8, fontSize: 10.5, color: textDim }}>{draftText.length}/500</span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.85)", marginTop: 10, textAlign: "left" }}>{manual.text}</div>
                      )}
                    </div>
                  )}

                  {/* Auto Rating + Rating Breakdown — inline reference, no separate sheet */}
                  {auto && (
                    <div className="mt-4 rounded-3xl" style={{ padding: "22px 16px", background: cardFill, border: `1px solid ${cardBorder}` }}>
                      <div className="text-center">
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: textDim }}>AUTO RATING</div>
                        <div className="flex items-end justify-center gap-1.5" style={{ marginTop: 6 }}>
                          <span style={{ fontSize: 30, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{auto.avg10.toFixed(1)}</span>
                          <span style={{ fontSize: 13, color: textDim, marginBottom: 3 }}>/10</span>
                        </div>
                        <div style={{ fontSize: 11.5, color: textDim, marginTop: 4 }}>Based on {auto.ratedCount} of {auto.total} rated episodes</div>
                      </div>

                      <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${cardBorder}` }}>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: textDim, marginBottom: 6 }}>RATING BREAKDOWN</div>
                        {s.episodes.map((e) => (
                          <div key={e.n} className="flex items-center justify-between" style={{ padding: "6px 0" }}>
                            <span style={{ fontSize: 13, color: e.myRating ? "#fff" : textDim, fontWeight: 500 }}>Episode {e.n}</span>
                            {e.myRating ? <MiniStars value={e.myRating} /> : <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.28)", fontStyle: "italic" }}>Not rated</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {editing && (
                    <button onClick={saveReview} disabled={!canSave} className="w-full mt-5 rounded-full active:scale-95 transition" style={{ padding: 14, background: canSave ? "#fff" : "rgba(255,255,255,0.15)", color: canSave ? "#111" : "rgba(255,255,255,0.4)", fontSize: 14.5, fontWeight: 700 }}>
                      Save Rating
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ---------------- Shareable summary card (opened from Profile) ---------------- */}
        {shareCardFor != null && (() => {
          const s = seasonById(shareCardFor);
          const manual = seasonReviews[shareCardFor];
          const auto = seasonAuto(s);
          const moodMeta = manual && moodList.find((m) => m.id === manual.mood);
          const castMeta = manual && manual.character && cast.find((c) => c.id === manual.character);
          const score = manual ? manual.rating : auto.avg10;
          return (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center" style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }} onClick={() => setShareCardFor(null)}>
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => { setShareCardFor(null); setView("detail"); viewSeason(shareCardFor); }} className="absolute flex items-center justify-center rounded-full active:scale-90 transition" style={{ top: -46, left: 0, width: 34, height: 34, background: "rgba(255,255,255,0.12)", border: `1px solid ${glassBorder}` }}><Icon name="edit" size={14} /></button>
                <button onClick={() => setShareCardFor(null)} className="absolute flex items-center justify-center rounded-full active:scale-90 transition" style={{ top: -46, right: 0, width: 34, height: 34, background: "rgba(255,255,255,0.12)", border: `1px solid ${glassBorder}` }}><Icon name="x" size={14} /></button>

                <div className="relative rounded-3xl overflow-hidden" style={{ width: 288, height: 478, boxShadow: "0 30px 70px rgba(0,0,0,0.6)" }}>
                  <div style={{ position: "absolute", inset: 0, background: `linear-gradient(160deg, ${s.hue}60 0%, #201811 55%, #0d0a07 100%)` }}>
                    <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 28% 10%, ${s.hue}70 0%, transparent 60%)` }} />
                    <Grain />
                  </div>
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 45%, rgba(0,0,0,0.4) 100%)" }} />

                  <div className="relative h-full flex flex-col items-center text-center" style={{ padding: "24px 22px 20px" }}>
                    <div className="flex items-center gap-1" style={{ opacity: 0.5 }}>
                      <Icon name="sparkle" size={9} color="#fff" />
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", color: "#fff" }}>CINEXT</span>
                    </div>

                    {/* poster — small and centered, backdrop wash carries the rest of the color */}
                    <div className="relative rounded-2xl overflow-hidden flex-shrink-0" style={{ width: 96, height: 142, marginTop: 16, boxShadow: "0 16px 32px rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.16)" }}>
                      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(155deg, ${s.hue}dd 0%, #2a2016 55%, #0d0a07 100%)` }}>
                        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 35% 18%, ${s.hue}ff 0%, transparent 58%)` }} />
                        <Grain />
                      </div>
                      <div className="absolute inset-x-0 flex items-center justify-center" style={{ bottom: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.9)", letterSpacing: "0.04em" }}>{showTitle.toUpperCase()}</span>
                      </div>
                    </div>

                    <div style={{ fontSize: 11, letterSpacing: "0.14em", color: "rgba(255,255,255,0.75)", fontWeight: 600, marginTop: 14 }}>{showTitle.toUpperCase()}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginTop: 2 }}>{s.title}</div>

                    <div className="flex items-center gap-1.5" style={{ marginTop: 10 }}>
                      <Icon name="star" size={16} color={accent} />
                      <span style={{ fontSize: 24, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{score.toFixed(1)}</span>
                      <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)" }}>/10</span>
                    </div>

                    {(moodMeta || castMeta) && (
                      <div className="flex items-center gap-2 flex-wrap justify-center" style={{ marginTop: 12 }}>
                        {moodMeta && (
                          <div className="flex items-center gap-1.5 rounded-full" style={{ padding: "4px 9px", background: "rgba(255,255,255,0.12)" }}>
                            <span style={{ fontSize: 12.5 }}>{moodMeta.emoji}</span>
                            <span style={{ fontSize: 10.5, color: "#fff", fontWeight: 600 }}>{moodMeta.label}</span>
                          </div>
                        )}
                        {castMeta && (
                          <div className="flex items-center gap-1.5 rounded-full" style={{ padding: "3px 9px 3px 3px", background: "rgba(255,255,255,0.12)" }}>
                            <div style={{ width: 14, height: 14, borderRadius: "50%", background: castMeta.grad }} />
                            <span style={{ fontSize: 10.5, color: "#fff", fontWeight: 600 }}>{castMeta.name}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {manual?.text && (
                      <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "rgba(255,255,255,0.85)", fontStyle: "italic", marginTop: 14, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        "{manual.text}"
                      </div>
                    )}

                    <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, paddingTop: 14 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: accent, letterSpacing: "0.02em" }}>@france</span>
                      <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)" }}>{fmtDate(manual ? manual.savedAt : new Date())}</span>
                    </div>
                  </div>
                </div>

                <button onClick={handleShare} className="w-full flex items-center justify-center gap-2 rounded-full active:scale-95 transition" style={{ marginTop: 16, padding: 13, background: "#fff" }}>
                  <Icon name="share" size={15} color="#111" />
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "#111" }}>{shareToast ? "Ready to Share!" : "Share"}</span>
                </button>
              </div>
            </div>
          );
        })()}

        {/* ---------------- Saved confirmation ---------------- */}
        {justSaved && (
          <div className="absolute inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
            <div className="w-full rounded-t-3xl flex flex-col items-center text-center flex-shrink-0" style={{ padding: "40px 28px 28px", background: "#161210", border: `1px solid ${glassBorder}`, borderBottom: "none", boxShadow: "0 -20px 60px rgba(0,0,0,0.6)" }}>
              <div className="flex items-center justify-center rounded-full" style={{ width: 76, height: 76, border: `2px solid ${accent}` }}><Icon name="check" size={30} color={accent} strokeWidth={3} /></div>
              <div style={{ fontSize: 19, fontWeight: 800, color: "#fff", marginTop: 18 }}>Rating Saved!</div>
              <div style={{ fontSize: 13, color: textDim, marginTop: 5 }}>Thanks for rating this season.</div>
              <button onClick={() => setJustSaved(false)} className="w-full rounded-full active:scale-95 transition" style={{ marginTop: 24, padding: 14, background: "#fff" }}><span style={{ fontSize: 14.5, fontWeight: 700, color: "#111" }}>Done</span></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
