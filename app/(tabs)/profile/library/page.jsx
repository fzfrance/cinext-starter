import { Suspense } from "react";
import LibraryClient from "./LibraryClient";

// LibraryClient reads `?genre=` via useSearchParams (Library's genre-aisle
// ">" tags this route with the tapped genre) — that hook requires a
// Suspense boundary on a statically-generated route like this one, or the
// build bails out of static generation entirely.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <LibraryClient />
    </Suspense>
  );
}
