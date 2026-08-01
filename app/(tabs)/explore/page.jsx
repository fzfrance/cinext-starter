import ExploreClient from "./ExploreClient";
import { getExploreData } from "@/lib/exploreData";

export default async function Page() {
  const { trending, heroSlides } = await getExploreData();
  return <ExploreClient trending={trending} heroSlides={heroSlides} />;
}
