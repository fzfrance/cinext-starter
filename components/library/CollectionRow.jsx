"use client";

import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import CoverArt from "@/components/library/art/CoverArt";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;
const POSTER_W = 140; // matches RecommendedRow's poster size, same aspect ratio

// One section per real collection — the collection's name as a heading with
// a chevron directly next to it that opens the same real
// /profile/collections/[id] page this app already has, and a plain flat
// scrollable row of front-facing posters underneath (no overlap, no fan, no
// 3D — deliberately a simpler "gallery" treatment than the genre Aisle's DVD
// spines). Tapping a poster still opens the shared CaseOverlay, same as
// everywhere else in Library.
export default function CollectionRow({ id, name, shared, items, onOpen }) {
  const router = useRouter();
  if (!items.length) return null;
  return (
    <div style={{ marginTop: 30 }}>
      <div className="flex items-center gap-2" style={{ padding: "0 20px 14px" }}>
        <span style={{ fontSize: 19, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{name}</span>
        <button onClick={() => router.push(`/profile/collections/${id}`)} className="flex-shrink-0 active:scale-90 transition" style={{ padding: 4 }}>
          <Icon name="chevronRight" size={18} color={t.textDim} />
        </button>
        {shared && (
          <span className="flex items-center gap-1 rounded-full flex-shrink-0" style={{ padding: "3px 8px", background: t.cardFill, border: `1px solid ${t.glassBorder}` }}>
            <Icon name="globe" size={10} color={accent} />
            <span style={{ fontSize: 9.5, fontWeight: 700, color: accent, letterSpacing: 0.4 }}>SHARED</span>
          </span>
        )}
      </div>
      <div className="no-scrollbar" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        <div className="flex" style={{ gap: 12, padding: "0 20px", width: "max-content" }}>
          {items.map((s) => (
            <button key={s.id} onClick={(e) => onOpen(s, e.currentTarget.getBoundingClientRect())} className="flex-shrink-0 active:scale-95 transition" style={{ width: POSTER_W }}>
              <div style={{ position: "relative", width: POSTER_W, aspectRatio: "140 / 202", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 18px rgba(0,0,0,0.4)" }}>
                <CoverArt show={s} />
              </div>
            </button>
          ))}
          <div style={{ width: 8, flexShrink: 0 }} />
        </div>
      </div>
    </div>
  );
}
