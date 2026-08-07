import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { FavoritesProvider } from "@/lib/favorites-context";
import { ShowCustomizationsProvider } from "@/lib/show-customizations-context";
import { NavTintProvider } from "@/lib/nav-tint-context";
import { NavVisibilityProvider } from "@/lib/nav-visibility-context";
import SwipeBackGesture from "@/components/ui/SwipeBackGesture";

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

// Forces every page in the app to render dynamically instead of Next
// statically generating it at build time — inherited by every nested
// route, same as any other route segment config set on a layout. Every
// screen here is "use client" fetching its own live personal data on
// mount anyway (see next.config.mjs's staleTimes comment), so a
// statically generated shell buys nothing. It actively broke the PWA:
// Next.js overwrites next.config.mjs's Cache-Control header in
// production for statically generated pages (s-maxage=1y,
// stale-while-revalidate instead of the no-store this app declares), and
// an installed PWA — with no real hard-refresh gesture — could get stuck
// on that cached shell indefinitely. Dynamic rendering makes Next use its
// own no-store-by-default response instead, so no-store actually holds.
export const dynamic = "force-dynamic";

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
          <FavoritesProvider>
            <ShowCustomizationsProvider>
              <NavTintProvider>
                <NavVisibilityProvider>{children}</NavVisibilityProvider>
              </NavTintProvider>
            </ShowCustomizationsProvider>
          </FavoritesProvider>
        </AuthProvider>
        <SwipeBackGesture />
      </body>
    </html>
  );
}
