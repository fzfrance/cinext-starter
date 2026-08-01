"use client";

// ---------------------------------------------------------------------------
// Floating nav accent tint — shared source of truth
// ---------------------------------------------------------------------------
// The bottom nav (components/ui/FloatingNav.jsx) is rendered once, at the
// (tabs) layout level, so it wraps every tab route including Show Detail —
// but Show Detail is a *child* of that layout, several levels down, and
// needs to hand its own per-show tint color up to the nav instance its
// parent layout renders. Context is the standard way to let a descendant
// page reach an ancestor layout like this. Any page not inside (tabs) that
// wants its own FloatingNav instance (e.g. the standalone Episode Detail
// route) can just pass tintColor directly instead — this context only
// exists for the one case where the nav and the page that colors it aren't
// direct parent/child.

import { createContext, useContext, useState } from "react";

const NavTintContext = createContext([null, () => {}]);

export function NavTintProvider({ children }) {
  const state = useState(null);
  return <NavTintContext.Provider value={state}>{children}</NavTintContext.Provider>;
}

// Returns [tintColor, setTintColor] — read by (tabs)/layout.jsx, written by
// whichever page currently wants to color the shared nav (null resets it to
// FloatingNav's own default).
export function useNavTint() {
  return useContext(NavTintContext);
}
