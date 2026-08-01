"use client";

// ---------------------------------------------------------------------------
// Floating nav visibility — shared source of truth
// ---------------------------------------------------------------------------
// The bottom nav (components/ui/FloatingNav.jsx) is rendered once, at the
// (tabs) layout level, so a descendant page that needs to temporarily replace
// it with its own bottom bar (e.g. Highlights' bulk-select action bar) can't
// just stop rendering it locally — it has to reach up to the shared layout,
// same problem useNavTint already solves for tint color. This is that same
// pattern applied to visibility: a page sets `true` while its own bottom bar
// should own that screen position instead, and (tabs)/layout.jsx skips
// rendering FloatingNav while it's set. Only one bottom-anchored element is
// ever mounted at a time this way, instead of two fixed elements floating
// independently at the same position with a z-index race between them.

import { createContext, useContext, useState } from "react";

const NavVisibilityContext = createContext([false, () => {}]);

export function NavVisibilityProvider({ children }) {
  const state = useState(false);
  return <NavVisibilityContext.Provider value={state}>{children}</NavVisibilityContext.Provider>;
}

// Returns [navHidden, setNavHidden] — read by (tabs)/layout.jsx, written by
// whichever page currently wants to take over the bottom nav's screen
// position with its own bar. Always reset back to false when that page's own
// bar closes (and on unmount), or the nav stays hidden after navigating away.
export function useNavVisibility() {
  return useContext(NavVisibilityContext);
}
