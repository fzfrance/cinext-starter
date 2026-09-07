"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const PUBLIC_PREFIXES = ["/login", "/signup"];

function isPublicPath(pathname) {
  if (!pathname) return false;
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Hard gate for the whole app: unsigned users only ever see login/signup.
// Applies to PWA mobile and desktop web the same way — no soft empty states
// or browsable Explore/Home without a session.
export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const publicRoute = isPublicPath(pathname);

  useEffect(() => {
    if (loading) return;
    if (!user && !publicRoute) {
      router.replace("/login");
      return;
    }
    if (user && publicRoute) {
      router.replace("/home");
    }
  }, [user, loading, publicRoute, router]);

  if (loading) return null;
  if (!user && !publicRoute) return null;
  if (user && publicRoute) return null;
  return children;
}
