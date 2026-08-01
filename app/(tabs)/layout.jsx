"use client";

import FloatingNav from "@/components/ui/FloatingNav";
import { useNavTint } from "@/lib/nav-tint-context";
import { useNavVisibility } from "@/lib/nav-visibility-context";
import { themes } from "@/lib/theme";

// TODO: once Settings is migrated, read the real theme/accent from context
// (e.g. a small ThemeProvider backed by Supabase user prefs + localStorage)
// instead of these hardcoded defaults.
const t = themes.dark;

export default function TabsLayout({ children }) {
  // Set by Show Detail (a descendant several levels down) via useNavTint's
  // setter — see lib/nav-tint-context.jsx for why this needs context rather
  // than a plain prop. null on every other tab (Home/Explore/Highlights/
  // Profile), where FloatingNav falls back to its own default amber tint.
  const [tintColor] = useNavTint();
  // Set by a descendant page (e.g. Highlights' bulk-select bar) via
  // useNavVisibility's setter, when that page needs its own bottom bar to
  // take over this screen position instead of floating a second fixed
  // element alongside it. See lib/nav-visibility-context.jsx.
  const [navHidden] = useNavVisibility();

  return (
    // min-h-dvh (not min-h-screen/100vh) already correctly handles the
    // Safari-vs-standalone-PWA viewport-height difference — Safari's own
    // address/toolbar chrome dynamically shows/hides and eats into a
    // plain 100vh, while 100dvh tracks that live; standalone has no such
    // chrome at all, so 100dvh there is just the true full screen. This
    // was already in place. overflow-x:hidden added as a defensive
    // horizontal-overflow guard at the one wrapper every tab shares.
    <div className="relative min-h-dvh" style={{ background: t.bg, overflowX: "hidden" }}>
      {/* FloatingNav is `position: fixed`, so it never pushes this content
          up on its own — without this padding, the last bit of any tab's
          content (e.g. Highlights' Watch History, whose last date card is
          the very last thing in the page) sits right underneath the pill,
          partly covered. The value matches the nav's own real footprint —
          its ~65px pill + the 14px bottom padding inside its own fixed
          wrapper (see FloatingNav.jsx) — plus ~20px of breathing room, with
          env(safe-area-inset-bottom) added on top (not folded into the
          100px) since the nav's own wrapper already adds that separately —
          this must match it 1:1, not double-count it, or content would
          still fall short on notched iPhones. One shared value here so
          every tab benefits without repeating it per screen. Still enough
          clearance when a page's own bottom bar (e.g. Highlights' bulk-edit
          toolbar below) temporarily replaces FloatingNav, since that bar's
          own footprint is shorter than the nav's. */}
      <div style={{ paddingBottom: "calc(100px + env(safe-area-inset-bottom, 0px))" }}>{children}</div>
      {!navHidden && <FloatingNav tintColor={tintColor} />}
    </div>
  );
}
