"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Icon from "@/components/ui/Icon";
import { useAuth } from "@/lib/auth-context";
import { useDesktopModals } from "@/lib/desktop-modals-context";
import { getProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { initialsOf } from "@/lib/theme";
import { useAppLanguage } from "@/lib/languages";

/**
 * Persistent desktop top nav. Search is a normal control that navigates
 * to /search — the bar itself lives on the search page so opening never
 * collapses or reflows this shell. Profile avatar sits beside Search and
 * opens a compact account menu (Profile / Settings / Sign out).
 *
 * Library is split into three top-level tabs (Shows / Movies / Collections)
 * that share `/library?tab=…` so the existing data pipeline stays one place.
 */
export default function DesktopGlobalNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { openSettings } = useDesktopModals();
  const { t: tr } = useAppLanguage();
  const libraryTab = searchParams.get("tab");
  const desktopTabs = [
    { href: "/home", labelKey: "navSeeNext", icon: "playSquare", match: (p) => p?.startsWith("/home") },
    { href: "/explore", labelKey: "navExplore", icon: "sparkle", match: (p) => p?.startsWith("/explore") },
    {
      href: "/library?tab=shows",
      labelKey: "navShows",
      icon: "tv",
      match: (p) => p?.startsWith("/library") && (libraryTab === "shows" || !libraryTab),
    },
    {
      href: "/library?tab=movies",
      labelKey: "navMovies",
      icon: "clapperboard",
      match: (p) => p?.startsWith("/library") && libraryTab === "movies",
    },
    {
      href: "/library?tab=collections",
      labelKey: "navCollections",
      icon: "layers",
      match: (p) => p?.startsWith("/library") && libraryTab === "collections",
    },
    { href: "/highlights", labelKey: "navHighlights", icon: "sparkle", match: (p) => p?.startsWith("/highlights") },
  ];
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [initials, setInitials] = useState("?");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef(null);
  const onSearch = pathname?.startsWith("/search");

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

  if (pathname?.startsWith("/login") || pathname?.startsWith("/signup")) {
    return null;
  }

  if (onSearch) return null;

  const handleSignOut = () => {
    setMenuOpen(false);
    supabase.auth.signOut().then(() => router.push("/login"));
  };

  return (
    <nav className="desktop-global-nav" aria-label="Cinext navigation">
      <Link href="/home" className="desktop-global-nav-mark" aria-label="Cinext home">
        <Image src="/cinext-launch-mark.png" alt="Cinext" width={35} height={35} />
      </Link>
      <span className="desktop-global-nav-divider" aria-hidden="true" />
      <div className="desktop-global-nav-tabs">
        {desktopTabs.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`desktop-global-nav-item${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon name={tab.icon} size={15} />
              {tr(tab.labelKey)}
            </Link>
          );
        })}
      </div>
      <span className="desktop-global-nav-divider desktop-global-nav-auto" aria-hidden="true" />
      <button
        type="button"
        className="desktop-global-nav-item desktop-global-nav-search-trigger"
        onClick={() => router.push("/search")}
        aria-label={tr("navSearch")}
      >
        <Icon name="search" size={17} />
        {tr("navSearch")}
      </button>
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
            <Link
              href="/profile"
              role="menuitem"
              className="desktop-global-nav-menu-item"
              onClick={() => setMenuOpen(false)}
            >
              <Icon name="user" size={16} />
              {tr("navProfile")}
            </Link>
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
