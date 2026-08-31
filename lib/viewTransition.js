"use client";

// ---------------------------------------------------------------------------
// Wraps App Router navigation in the native View Transitions API (a plain
// browser API — document.startViewTransition — not a new dependency) so
// opening/closing the full-screen search overlay animates as a horizontal
// push/pop instead of an instant swap. Falls back to a plain navigation on
// browsers without support (e.g. older Safari): same end state, no animation.
//
// The 'vt-back' class toggled on <html> here is what app/globals.css's
// ::view-transition-old(root)/::view-transition-new(root) rules key off of
// to tell a "closing" transition (new content sliding in from the left,
// old content sliding out to the right — a curtain opening) apart from an
// "opening" one (the reverse) — the View Transitions API itself has no
// built-in notion of navigation direction, so this is what supplies it.
// ---------------------------------------------------------------------------

let activeTransition = null;

export function pushWithTransition(router, href) {
  if (typeof document !== "undefined" && document.startViewTransition) {
    activeTransition?.skipTransition?.();
    document.documentElement.classList.remove("vt-back");
    // Do not await route data here. View Transitions freezes the old root
    // while its update callback is pending; waiting for Search/Explore data
    // made a slow network request look like a several-second input freeze.
    const transition = document.startViewTransition(() => router.push(href));
    activeTransition = transition;
    transition.finished.finally(() => {
      if (activeTransition === transition) activeTransition = null;
    });
  } else {
    router.push(href);
  }
}

export function backWithTransition(router) {
  if (typeof document !== "undefined" && document.startViewTransition) {
    activeTransition?.skipTransition?.();
    document.documentElement.classList.add("vt-back");
    const transition = document.startViewTransition(() => router.back());
    activeTransition = transition;
    transition.finished.finally(() => {
      if (activeTransition === transition) activeTransition = null;
    });
  } else {
    router.back();
  }
}
