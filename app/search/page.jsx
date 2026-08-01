import SearchClient from "./SearchClient";
import { getExploreData } from "@/lib/exploreData";

// Standalone top-level route (outside the (tabs) group, same pattern as
// app/show/[id]/episode/[season]/[ep]) — reached from the global nav's
// floating search button. Shows the exact same Explore content (hero,
// genre chips, Trending Now, For You, Browse All) as app/(tabs)/explore
// — same data fetch, same ExploreClient — with a search bar fixed over
// the bottom of it, swapping in live TMDB results while there's a query.
export default async function Page() {
  const { trending, heroSlides } = await getExploreData();
  return <SearchClient trending={trending} heroSlides={heroSlides} />;
}
