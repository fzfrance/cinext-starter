import { NextResponse } from "next/server";
import { runRecommendationEngine } from "@/lib/recommend/engine";

/**
 * POST { titles: SignalTitle[], impressions?: Impression[] }
 * → { forYou: { items, tvItems, movieItems }, hero, sections, profile }
 *
 * Titles are client-assembled watch/library/rating signals. Auth stays
 * browser-side (no server session), matching the rest of Explore.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const titles = Array.isArray(body?.titles) ? body.titles : [];
    const impressions = Array.isArray(body?.impressions) ? body.impressions : [];
    if (titles.length === 0) {
      return NextResponse.json({
        forYou: { items: [], tvItems: [], movieItems: [] },
        hero: [],
        sections: [],
        profile: null,
      });
    }
    const result = await runRecommendationEngine({ titles, impressions });
    return NextResponse.json(result);
  } catch (err) {
    console.error("recommend engine failed", err);
    return NextResponse.json(
      { forYou: { items: [], tvItems: [], movieItems: [] }, hero: [], sections: [], profile: null, error: "failed" },
      { status: 500 }
    );
  }
}
