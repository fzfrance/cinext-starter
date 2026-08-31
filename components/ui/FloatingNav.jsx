"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/ui/Icon";
import { themes, DEFAULT_ACCENT } from "@/lib/theme";

const t = themes.dark;
const accent = DEFAULT_ACCENT;

// Fixed footprint of the Search circle and the collapsed nav button (kept
// equal so the two read as one consistent size when they sit side by
// side) plus the gap between the pill and Search — shared constants so
// the expanded-width measurement below and the actual rendered sizes
// below can never silently drift apart from each other.
const SEARCH_SIZE = 64;
const GAP = 10;

// Explore dropped out of this pill — it's still a real route/page, just
// no longer reachable from the persistent global nav now that Search (its
// old icon here) is its own dedicated floating button instead. Library is
// the new DVD-shelf collection screen (app/(tabs)/library), added right
// next to See Next per its own request.
const tabs = [
  { href: "/home", label: "See Next", icon: "playSquare" },
  { href: "/library", label: "Library", icon: "collection" },
  { href: "/highlights", label: "Highlights", icon: "sparkle" },
  { href: "/profile", label: "Profile", icon: "user" },
];

/**
 * FloatingNav — the global bottom nav: a floating liquid-glass segmented
 * pill (Home/Library/Highlights/Profile), with a shared liquid-glass
 * droplet that stretches between active tabs, plus a separate circular
 * search button to its right. `tintColor` (a hex color, e.g. a show's own accent from
 * lib/theme.js's tintColorForShow) subtly colors the glass on both, so the
 * whole nav reads as belonging to whatever screen it's on. Defaults to the
 * app's own amber accent when no tintColor is given.
 */
export default function FloatingNav({ tintColor }) {
  const pathname = usePathname();
  const tint = tintColor || accent;

  const activeIndex = Math.max(0, tabs.findIndex((tb) => pathname?.startsWith(tb.href)));
  const activeTab = tabs[activeIndex];
  const fluidFilterId = `liquid-glow-${useId().replace(/:/g, "")}`;

  // The selected state is one shared glass droplet. It starts moving on
  // pointer-down, rather than waiting for the route to commit, so the nav
  // acknowledges a tap immediately. The first phase moves most of the way
  // while leaving a stretched trailing edge; the second lets surface
  // tension pull the droplet back to one tab's width.
  const [indicator, setIndicator] = useState({ left: activeIndex, width: 1, direction: 0 });
  const [selectedIndex, setSelectedIndex] = useState(activeIndex);
  const visualIndexRef = useRef(activeIndex);
  const settleTimerRef = useRef(null);

  const morphIndicatorTo = useCallback((nextIndex) => {
    const previousIndex = visualIndexRef.current;
    setSelectedIndex(nextIndex);
    if (previousIndex === nextIndex) return;

    window.clearTimeout(settleTimerRef.current);
    const direction = Math.sign(nextIndex - previousIndex);
    const distance = Math.abs(nextIndex - previousIndex);
    const stretch = Math.min(0.68, 0.38 + (distance - 1) * 0.12);

    visualIndexRef.current = nextIndex;
    setIndicator({
      left: direction > 0 ? nextIndex - stretch : nextIndex,
      width: 1 + stretch,
      direction,
    });

    settleTimerRef.current = window.setTimeout(() => {
      setIndicator({ left: nextIndex, width: 1, direction: 0 });
    }, 230);
  }, []);

  useEffect(() => {
    morphIndicatorTo(activeIndex);
  }, [activeIndex, morphIndicatorTo]);

  useEffect(() => () => window.clearTimeout(settleTimerRef.current), []);

  // Collapses to a single small button on scroll-down. Deliberately does
  // NOT auto-expand again on scroll-up — once collapsed, it stays that way
  // regardless of scroll direction until the user actually taps it, so it
  // doesn't pop back open mid-scroll just because they scrolled up a bit
  // to re-check something.
  const [collapsed, setCollapsed] = useState(false);
  const lastScrollY = useRef(0);
  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY;
      if (y > lastScrollY.current + 4 && y > 80) setCollapsed(true);
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  // Re-expand on every real navigation — landing on a new tab should
  // always show the full nav, not whatever collapsed state the previous
  // page's scroll position left behind.
  useEffect(() => { setCollapsed(false); lastScrollY.current = 0; }, [pathname]);

  // Collapse/expand is a plain two-state cross-fade (opacity + scale)
  // between the full nav and the separate corner button below. The active
  // droplet only moves inside the expanded pill; it never participates in
  // the collapse hand-off, which keeps that state change predictable.
  //
  // The expanded width used to be a hardcoded 340px, sized to roughly
  // fit 4 tabs. On a narrow phone (iPhone SE at 375px, or any width once
  // safe-area insets eat into it further), 340 + a 10px gap + a 64px
  // Search circle can genuinely exceed the viewport — Search doesn't
  // shrink to make room (flex-shrink:0 on this wrapper forced it to
  // absorb the whole deficit instead), so it got pushed partly off the
  // right edge. Measuring the OUTER wrapper's own available width (it's
  // anchored to both screen edges via left/right below, so its rendered
  // width already reflects the true available space including safe-area
  // insets) and subtracting Search's fixed footprint + the gap gives a
  // real, always-correct expanded width instead of a guessed constant.
  const wrapRef = useRef(null);
  const [expandedWidth, setExpandedWidth] = useState(280);
  useEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const available = wrap.getBoundingClientRect().width - SEARCH_SIZE - GAP;
      setExpandedWidth(Math.max(200, available));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const containerWidth = collapsed ? SEARCH_SIZE : expandedWidth;

  // Liquid-glass surface — simplified to a plain flat translucent fill,
  // no tint/gradient layers (the earlier diagonal sheen + per-show tint
  // wash read as busy rather than "simple glass"). Just strong blur, one
  // flat dark base (~15% more transparent than before: 0.34 -> 0.29), and
  // thin neutral inset highlight/shadow lines along the top/bottom edge
  // for a real glass-edge feel.
  const glassStyle = {
    background: "rgba(8,8,10,0.29)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.3)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    transition: "background 400ms ease, border-color 400ms ease, box-shadow 400ms ease",
  };

  return (
    <div
      // fixed, not sticky: this was tried as sticky to dodge a hypothetical
      // iOS bug where a transformed ancestor breaks `fixed`'s containing
      // block — but this app has no such ancestor anywhere (verified: no
      // framer-motion/transform-based page transitions, no transform on any
      // (tabs) layout ancestor). Sticky's real cost showed up on short
      // pages (e.g. a 1-item "In Progress" list): `bottom: 0` only pins a
      // sticky element to the viewport while its container is actually
      // scrolled past that point — with content shorter than the viewport
      // there's nothing to scroll, so it just sat in normal flow right
      // after the short content, leaving dead space both above it and
      // below it down to the real bottom edge. `fixed` is anchored to the
      // true viewport corner unconditionally, independent of how much
      // content the page has or its wrapper's min-height.
      //
      // Anchored to BOTH screen edges (left/right, each with a safe-area-
      // aware margin) rather than left-0/right-0 + inner padding — this is
      // the actual fix for Search getting clipped: the whole bar's
      // available width is now a real, safe-area-correct span the browser
      // computes for us, and the expanded-width measurement above reads
      // that span back via wrapRef. There's no fixed/oversized width left
      // anywhere that could push Search past the right edge.
      ref={wrapRef}
      className="fixed flex items-center"
      style={{
        left: "max(16px, env(safe-area-inset-left))",
        right: "max(16px, env(safe-area-inset-right))",
        bottom: "calc(12px + env(safe-area-inset-bottom))",
        gap: GAP,
        // Always space-between, not conditional on collapsed — the search
        // circle is a permanent fixture at the right edge regardless of
        // scroll/collapse state; only the left-hand item (pill vs. the
        // collapsed icon button) changes.
        justifyContent: "space-between",
        maxWidth: "100vw",
        boxSizing: "border-box",
        // Explicit, deliberately dominant z-index — a persistent global
        // nav should unconditionally win over any single page's local
        // overlays (menu backdrops, sheet scrims, etc. — several use
        // z-40/z-50/z-60 elsewhere in this app) rather than depend on
        // DOM-order luck against whatever a given page is showing.
        zIndex: 100,
      }}
    >
      {/* Both the pill and the collapsed button stay mounted at all times,
          cross-fading opacity/scale — a conditional swap (one unmounting,
          the other mounting) can't be CSS-transitioned at all. This
          wrapper's own WIDTH (a plain px value, not max-width fighting a
          flex-1 grow) animates between the pill's and the button's exact
          footprint — width is fully deterministic across browsers in a
          way max-width-plus-flex-grow isn't, since the layout doesn't need
          to re-resolve flex-grow against a moving cap on every frame. */}
      <div
        className="relative flex-shrink-0"
        style={{ width: containerWidth, height: 60, transition: "width 340ms cubic-bezier(.4,0,.2,1)", willChange: "width" }}
      >
        <nav
          className="absolute inset-0 flex items-center"
          style={{
            ...glassStyle,
            borderRadius: 9999,
            padding: "10px 8px",
            opacity: collapsed ? 0 : 1,
            transform: collapsed ? "scale(0.9)" : "scale(1)",
            pointerEvents: collapsed ? "none" : "auto",
            transition: `${glassStyle.transition}, opacity 220ms ease, transform 220ms ease`,
          }}
        >
          {/* The goo filter belongs only to the absolute background layer.
              Link content is rendered in separate z-indexed wrappers below,
              so icons and text never inherit filtering or backdrop blur. */}
          <svg aria-hidden="true" width="0" height="0" className="absolute">
            <defs>
              <filter
                id={fluidFilterId}
                x="-35%"
                y="-55%"
                width="170%"
                height="210%"
                colorInterpolationFilters="sRGB"
              >
                <feGaussianBlur
                  in="SourceGraphic"
                  stdDeviation="10"
                  result="blur"
                />
                <feColorMatrix
                  in="blur"
                  mode="matrix"
                  values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
                  result="goo"
                />
                <feComposite in="SourceGraphic" in2="goo" operator="atop" />
              </filter>
            </defs>
          </svg>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{ left: 8, right: 8, top: 7, bottom: 7 }}
          >
            <div
              className="menu-active-indicator absolute"
              style={{
                top: 0,
                bottom: 0,
                left: `${(indicator.left / tabs.length) * 100}%`,
                width: `${(indicator.width / tabs.length) * 100}%`,
                filter: `url(#${fluidFilterId})`,
                transition: "left 360ms cubic-bezier(0.4, 0, 0.2, 1.4), width 360ms cubic-bezier(0.4, 0, 0.2, 1.4), border-radius 360ms cubic-bezier(0.4, 0, 0.2, 1.4)",
                willChange: "left, width",
              }}
            >
              {/* Multiple smooth source shapes give the alpha-threshold
                  filter real material to merge. A lone pill would simply
                  composite back into the same geometric pill. */}
              <div
                className="absolute inset-0"
                style={{
                  borderRadius: 30,
                  background: "rgba(255,255,255,0.13)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  borderTopColor: "rgba(255,255,255,0.72)",
                  boxShadow: "0 8px 18px rgba(0,0,0,0.28), 0 2px 7px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.24)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                }}
              />
              <div
                className="absolute rounded-full"
                style={{
                  width: indicator.direction === 0 ? 22 : 30,
                  height: indicator.direction === 0 ? 22 : 30,
                  top: indicator.direction === 0 ? "54%" : "50%",
                  left: indicator.direction > 0 ? -7 : indicator.direction < 0 ? "auto" : "12%",
                  right: indicator.direction < 0 ? -7 : indicator.direction > 0 ? "auto" : "auto",
                  transform: "translateY(-50%)",
                  background: "rgba(255,255,255,0.14)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  transition: "width 280ms cubic-bezier(0.4, 0, 0.2, 1.4), height 280ms cubic-bezier(0.4, 0, 0.2, 1.4), left 280ms cubic-bezier(0.4, 0, 0.2, 1.4), right 280ms cubic-bezier(0.4, 0, 0.2, 1.4)",
                }}
              />
              <div
                className="absolute rounded-full"
                style={{
                  width: 14,
                  height: 14,
                  right: indicator.direction < 0 ? "auto" : 5,
                  left: indicator.direction < 0 ? 5 : "auto",
                  bottom: -2,
                  background: "rgba(255,255,255,0.16)",
                  transition: "left 280ms cubic-bezier(0.4, 0, 0.2, 1.4), right 280ms cubic-bezier(0.4, 0, 0.2, 1.4)",
                }}
              />
            </div>
          </div>

          {tabs.map((tab, index) => {
            const active = index === selectedIndex;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                onPointerDown={() => morphIndicatorTo(index)}
                // flex:"1 1 0" — every tab is an exact equal-width slot,
                // keeping the shared droplet aligned at every nav width.
                className="relative flex items-center justify-center active:scale-95 transition"
                style={{ flex: "1 1 0", minWidth: 0, padding: "7px 0" }}
              >
                <span className="relative z-10 flex flex-col items-center gap-1">
                  <Icon name={tab.icon} size={20} color={active ? accent : "rgba(255,255,255,0.75)"} />
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: active ? accent : "rgba(255,255,255,0.75)" }}>
                    {tab.label}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Collapsed state shows the CURRENT tab's own icon (changes per
            page), not a fixed logo mark — tapping it just re-expands the
            full pill, it doesn't navigate (collapsing already happened at
            the user's own scroll position, not a page change). */}
        <button
          onClick={() => setCollapsed(false)}
          className="absolute left-0 top-0 flex items-center justify-center rounded-full active:scale-90 transition"
          style={{
            ...glassStyle,
            width: SEARCH_SIZE,
            height: SEARCH_SIZE,
            opacity: collapsed ? 1 : 0,
            transform: collapsed ? "scale(1)" : "scale(0.9)",
            pointerEvents: collapsed ? "auto" : "none",
            transition: `${glassStyle.transition}, opacity 220ms ease, transform 220ms ease`,
          }}
        >
          <Icon name={activeTab.icon} size={20} color={accent} />
        </button>
      </div>

      {/* Separate floating circular search button — its own tap target, not
          one of the pill's items, for easy thumb reach off to the side.
          Rendered unconditionally (outside the collapsed/expanded switch
          above) so it stays put at the right edge regardless of scroll.
          Opens the full-screen search overlay (app/search) as a real
          route, not local component state, so it's reachable identically
          from every screen this nav appears on. A plain Link keeps Next's
          prefetched navigation immediate; wrapping router.push in the
          native View Transitions API produced duplicate page snapshots on
          mobile while React was committing the route asynchronously. */}
      <Link
        href="/search"
        className="flex items-center justify-center active:scale-90 transition flex-shrink-0"
        style={{ ...glassStyle, width: SEARCH_SIZE, height: SEARCH_SIZE, borderRadius: "50%", boxSizing: "border-box" }}
      >
        <Icon name="search" size={20} color={t.text} />
      </Link>
    </div>
  );
}
