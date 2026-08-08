import ExploreClient from "./ExploreClient";
import { getExploreData } from "@/lib/exploreData";

export default async function Page() {
  const { trendingShows, trendingMovies, heroSlides } = await getExploreData();
  return <ExploreClient trendingShows={trendingShows} trendingMovies={trendingMovies} heroSlides={heroSlides} />;
}
