"use client";
import { useSyncExternalStore } from "react";
const query = "(min-width: 900px)";
function subscribe(callback) {
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const snapshot = () => window.matchMedia(query).matches;
const serverSnapshot = () => null;
// Avoid duplicate fetches/effects and the wrong layout flashing at hydration.
export default function ResponsivePage({ mobile: Mobile, desktop: Desktop, pageProps }) {
  const desktop = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  if (desktop === null) return <div aria-busy="true" aria-label="Loading Cinext" />;
  const Component = desktop ? Desktop : Mobile;
  return <Component {...pageProps} />;
}
