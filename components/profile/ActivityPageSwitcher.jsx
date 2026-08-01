"use client";

import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import GlassCircle from "@/components/ui/GlassCircle";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// The paired "Activity / Notifications" tabs — a local tab switch WITHIN
// one page (app/(tabs)/profile/activity/page.jsx), not two separate
// routes. Tapping between them is a plain state change, no navigation at
// all — there's nothing here for a route change to affect (FloatingNav,
// etc.), and no page-transition animation, since it was never really
// "opening a new page" in the first place, just swapping which tab's
// content shows. Simplified to plain underline tabs (no pill background,
// no icons) — active tab is white text with an accent underline under
// just its own label, inactive is dim grey with no underline; a single
// hairline spans the full width below both. `onChange` is the only way
// the active tab changes; back still leaves this screen entirely via
// router.back().
export default function ActivityPageSwitcher({ active, onChange }) {
  const router = useRouter();

  return (
    <div className="px-6" style={{ paddingTop: "calc(env(safe-area-inset-top) * 1.44)" }}>
      {/* Back button and the Activity/Notifications tabs now share one
          row (was: back on its own line, tabs centered below it) — per
          explicit "align these on the same line as the back button". The
          tab row is centered against the FULL row width (not just the
          remaining space next to the back button), so its center still
          lines up with the page's own horizontal center; the back button
          is pulled out via absolute positioning so it doesn't participate
          in that centering math or push the tabs off-center. */}
      <div className="relative flex items-center justify-center">
        <div className="absolute left-0">
          <GlassCircle onClick={() => router.back()} t={t}>
            <Icon name="back" size={16} color={t.text} />
          </GlassCircle>
        </div>
        <div className="flex items-center justify-center" style={{ gap: 36 }}>
          <button onClick={() => onChange("activity")} className="flex flex-col items-center">
            <span style={{ fontSize: 16, fontWeight: 700, color: active === "activity" ? "#fff" : "rgba(255,255,255,0.4)" }}>Activity</span>
            <div style={{ marginTop: 8, width: 28, height: 2, borderRadius: 1, background: active === "activity" ? accent : "transparent" }} />
          </button>
          <button onClick={() => onChange("notifications")} className="flex flex-col items-center">
            <span style={{ fontSize: 16, fontWeight: 700, color: active === "notifications" ? "#fff" : "rgba(255,255,255,0.4)" }}>Notifications</span>
            <div style={{ marginTop: 8, width: 28, height: 2, borderRadius: 1, background: active === "notifications" ? accent : "transparent" }} />
          </button>
        </div>
      </div>
      <div style={{ marginTop: 12, height: 1, background: "rgba(255,255,255,0.1)" }} />
    </div>
  );
}
