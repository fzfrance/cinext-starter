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

function waitForNavigation(previousHref, readySelector) {
  return new Promise((resolve) => {
    const startedAt = performance.now();

    const check = () => {
      const routeChanged = window.location.href !== previousHref;
      const destinationReady = !readySelector || document.querySelector(readySelector);
      if ((routeChanged && destinationReady) || performance.now() - startedAt > 900) {
        // Let React paint the committed route before the browser captures
        // the transition's destination snapshot.
        requestAnimationFrame(() => requestAnimationFrame(resolve));
        return;
      }
      requestAnimationFrame(check);
    };

    check();
  });
}

export function pushWithTransition(router, href, readySelector) {
  if (typeof document !== "undefined" && document.startViewTransition) {
    activeTransition?.skipTransition?.();
    document.documentElement.classList.remove("vt-back");
    const previousHref = window.location.href;
    const transition = document.startViewTransition(async () => {
      router.push(href);
      await waitForNavigation(previousHref, readySelector);
    });
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
    const previousHref = window.location.href;
    const transition = document.startViewTransition(async () => {
      router.back();
      await waitForNavigation(previousHref);
    });
    activeTransition = transition;
    transition.finished.finally(() => {
      if (activeTransition === transition) activeTransition = null;
    });
  } else {
    router.back();
  }
}
