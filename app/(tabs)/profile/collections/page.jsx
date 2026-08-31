"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import GlassCircle from "@/components/ui/GlassCircle";
import { useAuth } from "@/lib/auth-context";
import { getCollections, createCollection as createCollectionRow, deleteCollection } from "@/lib/collections";
import { hydrateCollectionPreviews } from "@/lib/collectionPreviews";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";
import { CollectionBackdrop, backdropThemes, sortOptions, sortItems } from "./shared";
import CollectionBoxSet from "@/components/CollectionBoxSet";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

export default function Page() {
  const router = useRouter();
  const { user } = useAuth();
  const [collections, setCollections] = useState([]);
  const [activeMenu, setActiveMenu] = useState(null); // 'pageMenu' | 'collectionsSort' | null
  const toggleMenu = (key) => setActiveMenu((prev) => (prev === key ? null : prev ? null : key));
  const [editMode, setEditMode] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [collectionsSortMode, setCollectionsSortMode] = useState("firstAdded");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getCollections(user.id).then(async (rows) => {
      if (cancelled) return;
      const mapped = rows.map((c, i) => ({
        id: c.id,
        name: c.name,
        description: c.description ?? "",
        coverStyle: c.coverStyle,
        // Neither a backdrop theme choice nor a custom image has a column
        // on `collections` yet — cycle a theme deterministically so lists
        // still look distinct instead of all sharing one fallback color.
        backdropTheme: backdropThemes[i % backdropThemes.length],
        customImage: null,
        addedAt: new Date(c.createdAt).getTime(),
        count: c.showIds.length + (c.movieIds?.length ?? 0),
        showIds: c.showIds,
        movieIds: c.movieIds ?? [],
        covers: [],
      }));
      setCollections(mapped);

      // Only Collector Box Set needs real per-title art (posters/backdrops)
      // — every other style is still the local gradient/theme placeholder,
      // so this fetch is skipped entirely for those.
      const boxsetOnes = mapped.filter((c) => c.coverStyle === "boxset" && c.count > 0);
      const hydrated = await hydrateCollectionPreviews(boxsetOnes, 5);
      if (cancelled) return;
      const coversById = new Map(hydrated.map((c) => [c.id, c.covers]));
      setCollections((prev) => prev.map((c) => coversById.has(c.id) ? { ...c, covers: coversById.get(c.id) } : c));
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [user]);

  const removeCollection = (id) => {
    if (!user) { router.push("/login"); return; }
    setCollections((prev) => prev.filter((c) => c.id !== id));
    deleteCollection(id).catch(console.error);
  };
  const createCollection = () => {
    if (!user) { router.push("/login"); return; }
    const name = newTitle.trim();
    if (!name) return;
    setNewTitle("");
    setNewOpen(false);
    createCollectionRow(user.id, name)
      .then((row) => {
        setCollections((prev) => [...prev, {
          id: row.id, name: row.name, description: row.description ?? "", coverStyle: row.cover_style ?? "boxset",
          backdropTheme: backdropThemes[prev.length % backdropThemes.length],
          customImage: null, addedAt: new Date(row.created_at).getTime(), count: 0, showIds: [], movieIds: [], covers: [],
        }]);
      })
      .catch(console.error);
  };

  return (
    <>
      <div className="flex items-center justify-between px-6" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <GlassCircle onClick={() => router.back()} t={t}><Icon name="back" size={16} color={t.text} /></GlassCircle>
        {editMode ? (
          <button onClick={() => setEditMode(false)} style={{ fontSize: 14.5, fontWeight: 600, color: accent, padding: "6px 4px" }}>Done</button>
        ) : (
          <div className="relative">
            <GlassCircle onClick={() => toggleMenu("pageMenu")} t={t}><Icon name="more" size={16} color={t.text} /></GlassCircle>
            {activeMenu === "pageMenu" && (
              <div className="absolute z-30 rounded-2xl overflow-hidden" style={{ top: "calc(100% + 8px)", right: 0, width: 170, background: "#221c17", border: `1px solid ${t.glassBorder}` }}>
                <button onClick={() => { setActiveMenu(null); setEditMode(true); }} className="w-full flex items-center gap-2.5 active:opacity-70 transition" style={{ padding: "12px 14px" }}>
                  <Icon name="edit" size={14} color="#fff" /><span style={{ fontSize: 13.5, fontWeight: 500, color: "#fff" }}>Edit List</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-6" style={{ marginTop: 16 }}>
        <div>
          <div style={{ fontSize: 32.2, fontWeight: 800, color: "#fff" }}>Collections</div>
          <div style={{ fontSize: 12.5, color: t.textDim, marginTop: 3 }}>{collections.length} lists</div>
        </div>
        <div className="relative">
          <button onClick={() => toggleMenu("collectionsSort")} className="flex items-center gap-1 rounded-full active:scale-95 transition" style={{ padding: "6px 10px", background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
            <Icon name="sort" size={11} color={t.textDim} />
            <span style={{ fontSize: 11, fontWeight: 500, color: "#fff" }}>Sort By</span>
            <Icon name="chevronDown" size={10} color={t.textDim} />
          </button>
          {activeMenu === "collectionsSort" && (
            <div className="absolute z-30 rounded-2xl overflow-hidden" style={{ top: "calc(100% + 8px)", right: 0, width: 150, background: "#221c17", border: `1px solid ${t.glassBorder}` }}>
              {sortOptions.map((s) => (
                <button key={s.id} onClick={() => { setCollectionsSortMode(s.id); setActiveMenu(null); }} className="w-full flex items-center justify-between active:opacity-70 transition" style={{ padding: "10px 13px" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: collectionsSortMode === s.id ? accent : "#fff" }}>{s.label}</span>
                  {collectionsSortMode === s.id && <Icon name="check" size={13} color={accent} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="px-6 flex flex-col gap-4" style={{ marginTop: 18 }}>
        {sortItems(collections, collectionsSortMode, "name").map((l) => (
          <div key={l.id} className="relative">
            <button onClick={() => !editMode && router.push(`/profile/collections/${l.id}`)} className="relative w-full rounded-2xl overflow-hidden active:scale-[0.98] transition text-left" style={{ height: 170 }}>
              {l.coverStyle === "boxset" ? (
                // Explicit width override, not `compact` — this card is
                // full viewport width but only 170px tall (much wider,
                // shorter than either the narrow Profile mini-card or the
                // full-width-but-220px-tall detail header), so the same
                // compact percentage produced posters taller than the
                // card itself, clipped by its overflow:hidden. 50% of
                // what this used before (compact's old 43) keeps every
                // poster's height comfortably under the card's own.
                <CollectionBoxSet shows={l.covers} width={21.5} />
              ) : (
                <CollectionBackdrop covers={l.covers} theme={l.backdropTheme} image={l.customImage} />
              )}
              <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.6) 0%, transparent 55%)" }} />
              <div className="absolute left-4" style={{ bottom: 14 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{l.name}</span>
              </div>
              <div className="absolute flex items-center justify-center rounded-full" style={{ bottom: 14, right: 14, minWidth: 30, height: 30, padding: "0 10px", background: "rgba(0,0,0,0.55)" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{l.count}</span>
              </div>
            </button>
            {editMode && (
              <button onClick={() => removeCollection(l.id)} className="absolute flex items-center justify-center active:scale-90 transition" style={{ top: -8, right: -8, width: 26, height: 26, borderRadius: "50%", background: "rgba(0,0,0,0.8)", border: `1px solid ${t.glassBorder}` }}>
                <Icon name="x" size={14} color="#fff" strokeWidth={2.6} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* tap-outside catcher for open menus */}
      {(activeMenu === "pageMenu" || activeMenu === "collectionsSort") && <div className="fixed inset-0 z-20" onClick={() => setActiveMenu(null)} />}

      {/* create new list — icon-only, distinct from the show-search "+" buttons.
          bottom raised 10% (100 -> 110) — sat too close above FloatingNav's
          search circle at the default offset. */}
      <button onClick={() => setNewOpen(true)} className="fixed rounded-full flex items-center justify-center active:scale-90 transition" style={{ bottom: 110, right: 22, width: 54, height: 54, background: "rgba(20,16,12,0.92)", border: `1.5px solid ${accent}`, boxShadow: "0 10px 24px rgba(0,0,0,0.35)", backdropFilter: "blur(20px)" }}>
        <Icon name="folderPlus" size={22} color={accent} />
      </button>

      {/* new collection popup */}
      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-8" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setNewOpen(false)}>
          <div className="w-full rounded-3xl" style={{ padding: 22, background: "#1a1512", border: `1px solid ${t.glassBorder}`, boxShadow: "0 30px 60px rgba(0,0,0,0.6)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 14 }}>New List</div>
            <input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="List title" className="w-full rounded-2xl outline-none" style={{ padding: "13px 16px", background: t.cardFill, border: `1px solid ${t.cardBorder}`, fontSize: 14.5, color: "#fff" }} />
            <div className="flex gap-2.5" style={{ marginTop: 18 }}>
              <button onClick={() => { setNewOpen(false); setNewTitle(""); }} className="flex-1 rounded-full active:scale-95 transition" style={{ padding: 12, background: t.cardFill, border: `1px solid ${t.glassBorder}` }}><span style={{ fontSize: 13.5, fontWeight: 600, color: "#fff" }}>Cancel</span></button>
              <button onClick={createCollection} disabled={!newTitle.trim()} className="flex-1 rounded-full active:scale-95 transition" style={{ padding: 12, background: newTitle.trim() ? accent : t.cardFill }}><span style={{ fontSize: 13.5, fontWeight: 700, color: newTitle.trim() ? "#1a1108" : t.textDim }}>Create</span></button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
