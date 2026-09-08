"use client";

import { useNavVisibility } from "@/lib/nav-visibility-context";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Icon from "@/components/ui/Icon";
import { useAuth } from "@/lib/auth-context";
import { useDesktopModals } from "@/lib/desktop-modals-context";
import { useDesktopSearch } from "@/lib/desktop-search-context";
import { getProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { initialsOf } from "@/lib/theme";
import { useAppLanguage } from "@/lib/languages";

/**
 * Persistent desktop top nav. Search expands in-place inside the pill
 * (right→left swipe): tabs slide away, the search field fills the middle,
 * while the Cinext mark and profile avatar stay put.
 *
 * Library is split into three top-level tabs (Shows / Movies / Collections)
 * that share `/library?tab=…` so the existing data pipeline stays one place.
 */
export default function DesktopGlobalNav() {
  const pathname = usePathname();
  const [navHidden] = useNavVisibility();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { openSettings, openProfile, profileExpanded } = useDesktopModals();
  const {
    query,
    setQuery,
    clearSearch,
    lensOpen,
    openDesktopSearch,
    closeDesktopSearch,
  } = useDesktopSearch();
  const { t: tr } = useAppLanguage();
  const libraryTab = searchParams.get("tab");
  const desktopTabs = [
    { href: "/home", labelKey: "navSeeNext", icon: "playSquare", match: (p) => p?.startsWith("/home") },
    { href: "/explore", labelKey: "navExplore", icon: "sparkle", match: (p) => p?.startsWith("/explore") },
    {
      href: "/library?tab=movies",
      labelKey: "navMovies",
      icon: "clapperboard",
      match: (p) => p?.startsWith("/library") && libraryTab === "movies",
    },
    {
      href: "/library?tab=shows",
      labelKey: "navShows",
      icon: "tv",
      match: (p) => p?.startsWith("/library") && (libraryTab === "shows" || !libraryTab),
    },
    { href: "/highlights", labelKey: "navHighlights", icon: "sparkle", match: (p) => p?.startsWith("/highlights") },
    {
      href: "/library?tab=collections",
      labelKey: "navCollections",
      icon: "layers",
      match: (p) =>
        (p?.startsWith("/library") && libraryTab === "collections") ||
        p?.startsWith("/profile/collections"),
    },
  ];
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [initials, setInitials] = useState("?");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef(null);
  const searchInputRef = useRef(null);
  const navRef = useRef(null);
  const [lockedNavWidth, setLockedNavWidth] = useState(null);
  const searchMode = lensOpen || pathname?.startsWith("/search");

  // Keep search-mode pill the same width as the menu pill (don't shrink).
  useEffect(() => {
    if (!searchMode) {
      setLockedNavWidth(null);
      return undefined;
    }
    setLockedNavWidth((prev) => {
      if (prev != null) return prev;
      const el = navRef.current;
      const fromData = el?.dataset?.menuWidth ? Number(el.dataset.menuWidth) : null;
      const measured = el ? Math.round(el.getBoundingClientRect().width) : null;
      const w = fromData || measured;
      return w > 0 ? w : null;
    });
    return undefined;
  }, [searchMode]);

  // While menus are visible, keep a live measurement so openSearch can
  // lock to the true menu width before is-search restyles the pill.
  useEffect(() => {
    if (searchMode) return undefined;
    const el = navRef.current;
    if (!el) return undefined;
    const measure = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) el.dataset.menuWidth = String(w);
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [searchMode]);

  useEffect(() => {
    if (!user?.id) {
      setAvatarUrl(null);
      setInitials("?");
      return undefined;
    }
    let cancelled = false;
    getProfile(user.id)
      .then((profile) => {
        if (cancelled) return;
        setAvatarUrl(profile?.avatarUrl || null);
        const label = profile?.displayName || profile?.handle || user.email || "?";
        setInitials(initialsOf(String(label)) || "?");
      })
      .catch(() => {
        if (!cancelled) {
          setAvatarUrl(null);
          setInitials(initialsOf(user.email || "?") || "?");
        }
      });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname, libraryTab]);

  useEffect(() => {
    if (!searchMode) return undefined;
    const id = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [searchMode]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (!menuWrapRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  if (navHidden || /^\/show\/[^/]+\/episode\//.test(pathname ?? "") || pathname?.startsWith("/login") || pathname?.startsWith("/signup")) {
    return null;
  }

  const handleSignOut = () => {
    setMenuOpen(false);
    supabase.auth.signOut().then(() => router.push("/login"));
  };

  const openSearch = () => {
    setMenuOpen(false);
    if (searchMode) {
      searchInputRef.current?.focus();
      return;
    }
    const el = navRef.current;
    const fromData = el?.dataset?.menuWidth ? Number(el.dataset.menuWidth) : null;
    const measured = el ? Math.round(el.getBoundingClientRect().width) : null;
    const w = fromData || measured;
    if (w > 0) setLockedNavWidth(w);
    if (!openDesktopSearch()) {
      router.push("/search");
    }
  };

  const closeSearch = () => {
    setLockedNavWidth(null);
    if (lensOpen) {
      closeDesktopSearch();
      return;
    }
    clearSearch();
    if (pathname?.startsWith("/search")) {
      if (typeof window !== "undefined" && window.history.length > 1) router.back();
      else router.push("/home");
    }
  };

  const clearOrCloseSearch = () => {
    if (query.trim()) setQuery("");
    else closeSearch();
  };

  return (
    <nav
      ref={navRef}
      className={`desktop-global-nav${searchMode ? " is-search" : ""}`}
      aria-label="Cinext navigation"
      style={
        searchMode && lockedNavWidth
          ? { ["--desktop-nav-locked-width"]: `${lockedNavWidth}px` }
          : undefined
      }
    >
      <Link
        href="/home"
        className="desktop-global-nav-mark"
        aria-label="Cinext home"
        onClick={() => {
          if (lensOpen) closeDesktopSearch();
        }}
      >
        <Image src="/cinext-launch-mark.png" alt="Cinext" width={35} height={35} />
      </Link>
      <span className="desktop-global-nav-divider" aria-hidden="true" />

      <div className="desktop-global-nav-center">
        <div className="desktop-global-nav-tabs-pane" aria-hidden={searchMode}>
          <div className="desktop-global-nav-tabs">
            {desktopTabs.map((tab) => {
              // Full-page profile overlays the current route — don't keep
              // highlighting Library/Collections (or any other tab) as if
              // that page were still the focus.
              const active = !profileExpanded && tab.match(pathname);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`desktop-global-nav-item${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  tabIndex={searchMode ? -1 : undefined}
                  onClick={() => {
                    if (lensOpen) closeDesktopSearch();
                  }}
                >
                  <Icon name={tab.icon} size={15} />
                  {tr(tab.labelKey)}
                </Link>
              );
            })}
          </div>
          <button
            type="button"
            className="desktop-global-nav-item desktop-global-nav-search-trigger"
            onClick={openSearch}
            aria-label={tr("navSearch")}
            tabIndex={searchMode ? -1 : undefined}
          >
            <Icon name="search" size={17} />
            {tr("navSearch")}
          </button>
        </div>

        <div className="desktop-global-nav-search-pane" aria-hidden={!searchMode}>
          <Icon name="search" size={17} color="rgba(255,255,255,0.55)" />
          <input
            ref={searchInputRef}
            className="desktop-global-nav-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies, TV & actors..."
            aria-label="Search movies, TV and actors"
            autoComplete="off"
            spellCheck={false}
            tabIndex={searchMode ? 0 : -1}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeSearch();
            }}
          />
          <button
            type="button"
            className="desktop-global-nav-search-clear"
            onClick={clearOrCloseSearch}
            aria-label={query.trim() ? "Clear search" : "Close search"}
            tabIndex={searchMode ? 0 : -1}
          >
            <Icon name="x" size={14} color="rgba(255,255,255,0.75)" />
          </button>
        </div>
      </div>

      <div className="desktop-global-nav-avatar-wrap" ref={menuWrapRef}>
        <button
          type="button"
          className={`desktop-global-nav-avatar${menuOpen ? " is-open" : ""}`}
          aria-label={tr("accountMenu")}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded avatar URL
            <img src={avatarUrl} alt="" />
          ) : (
            <span>{initials.slice(0, 1)}</span>
          )}
        </button>
        {menuOpen && (
          <div className="desktop-global-nav-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              className="desktop-global-nav-menu-item"
              onClick={() => {
                setMenuOpen(false);
                openProfile();
              }}
            >
              <Icon name="user" size={16} />
              {tr("navProfile")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="desktop-global-nav-menu-item"
              onClick={() => {
                setMenuOpen(false);
                openSettings();
              }}
            >
              <Icon name="settings" size={16} />
              {tr("settings")}
            </button>
            <div className="desktop-global-nav-menu-divider" aria-hidden="true" />
            <button
              type="button"
              role="menuitem"
              className="desktop-global-nav-menu-item"
              onClick={handleSignOut}
            >
              <Icon name="logout" size={16} />
              {tr("signOut")}
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
