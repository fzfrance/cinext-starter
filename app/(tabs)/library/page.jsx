import { Suspense } from "react";
import LibraryClient from "./LibraryClient";

// LibraryClient reads `?tab=shows|movies|collections` via useSearchParams
// (set by its own tab-switcher, so a refresh or a back-navigation from a
// show/movie/collection detail page restores the same tab instead of
// always resetting to Shows) — that hook requires a Suspense boundary on
// a statically-generated route like this one, or the build bails out of
// static generation entirely.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <LibraryClient />
    </Suspense>
  );
}
