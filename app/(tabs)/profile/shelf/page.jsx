import { Suspense } from "react";
import LibraryClient from "./LibraryClient";

// LibraryClient reads `?type=shows|movies` via useSearchParams (set by
// Profile's own "Shows"/"Movies" section chevrons) — that hook requires a
// Suspense boundary on a statically-generated route like this one, or the
// build bails out of static generation entirely.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <LibraryClient />
    </Suspense>
  );
}
