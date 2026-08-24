"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
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
// spines). Collections are always a poster-only view, so tapping artwork
// follows the app's standard poster behavior and navigates directly to the
// show detail page; the DVD CaseOverlay belongs only to DVD Case view.
export default function CollectionRow({ id, name, shared, items }) {
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
      <div className="no-scrollbar" style={{ overflowX: "auto", overflowY: "hidden", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        <div className="flex" style={{ gap: 12, padding: "0 20px", width: "max-content" }}>
          {items.map((s) => (
            <Link
              key={s.id}
              href={`/show/${s.id}`}
              className="flex-shrink-0"
              style={{
                width: POSTER_W,
                // Keep Safari's touch-down state compositor-neutral while
                // it decides whether this is a horizontal pan or a tap.
                // The old active scale transform caused the same intermittent
                // stuck gesture as Library's Shows/Movies poster rows.
                touchAction: "manipulation",
                WebkitTouchCallout: "none",
                WebkitTapHighlightColor: "transparent",
                WebkitUserSelect: "none",
                userSelect: "none",
              }}
            >
              <div style={{ position: "relative", width: POSTER_W, aspectRatio: "140 / 202", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 18px rgba(0,0,0,0.4)" }}>
                <CoverArt show={s} />
              </div>
            </Link>
          ))}
          <div style={{ width: 8, flexShrink: 0 }} />
        </div>
      </div>
    </div>
  );
}
