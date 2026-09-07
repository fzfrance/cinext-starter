import { Suspense } from "react";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { FavoritesProvider } from "@/lib/favorites-context";
import { MovieFavoritesProvider } from "@/lib/movie-favorites-context";
import { ShowCustomizationsProvider } from "@/lib/show-customizations-context";
import { MovieCustomizationsProvider } from "@/lib/movie-customizations-context";
import { NavTintProvider } from "@/lib/nav-tint-context";
import { NavVisibilityProvider } from "@/lib/nav-visibility-context";
import { DesktopSearchProvider } from "@/lib/desktop-search-context";
import { DesktopModalsProvider } from "@/lib/desktop-modals-context";
import DesktopGlobalNav from "@/components/ui/DesktopGlobalNav";
import SwipeBackGesture from "@/components/ui/SwipeBackGesture";
import AppLaunchScreen from "@/components/ui/AppLaunchScreen";
import AppLanguageBoot from "@/components/ui/AppLanguageBoot";
import RequireAuth from "@/components/ui/RequireAuth";

// NOTE on the phone-frame pattern: every prototype file wrapped its content
// in a fixed 390x844 rounded rectangle to simulate a phone in the artifact
// preview (`<div style={{ width: 390, height: 844, borderRadius: 54, ... }}>`).
// That was only for previewing in chat. The real app should NOT keep that
// wrapper — it needs to fill the actual viewport (phone browser / installed
// PWA / desktop browser) responsively. Drop the phone-frame div when
// migrating each screen; keep the *content* inside it.

export const metadata = {
  title: "Cinext",
  description: "Track the TV series you watch.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cinext",
  },
};

export const viewport = {
  themeColor: "#0A0A0C",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

// suppressHydrationWarning below: this app never sets a class on <html>
// itself — this warning is the classic false positive caused by a browser
// extension (Grammarly, Dark Reader, translators, etc.) injecting a class
// attribute onto <html> before React hydrates, which Next.js docs call out
// by name as the fix for exactly this, since there's no real mismatch in
// the app's own markup to fix.
export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <AuthProvider>
          <AppLanguageBoot />
          <AppLaunchScreen />
          <RequireAuth>
            <FavoritesProvider>
              <MovieFavoritesProvider>
                <ShowCustomizationsProvider>
                  <MovieCustomizationsProvider>
                    <NavTintProvider>
                      <NavVisibilityProvider>
                        <DesktopSearchProvider>
                          <DesktopModalsProvider>
                            <Suspense fallback={null}>
                              <DesktopGlobalNav />
                            </Suspense>
                            {children}
                          </DesktopModalsProvider>
                        </DesktopSearchProvider>
                      </NavVisibilityProvider>
                    </NavTintProvider>
                  </MovieCustomizationsProvider>
                </ShowCustomizationsProvider>
              </MovieFavoritesProvider>
            </FavoritesProvider>
          </RequireAuth>
        </AuthProvider>
        <SwipeBackGesture />
      </body>
    </html>
  );
}
