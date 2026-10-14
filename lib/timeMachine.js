// A type preference is shared between Time Machine years. If a remembered
// preference has no matches in the newly opened year, show the complete year
// instead of presenting an empty page while the year card still reports data.
export function resolveTimeMachineTypeFilter(items, requested) {
  if (!Array.isArray(items) || items.length === 0 || requested === "all") return requested;
  return items.some((item) => item.mediaType === requested) ? requested : "all";
}

// Add every recorded media id to a year's sort map, even when an old import
// has no exact timestamp. The fallback key preserves count/detail parity;
// richer records still replace it when a real later date exists.
export function recordLastWatched(map, id, watchedAt, fallbackSortKey = "") {
  if (id == null || id === "") return;
  const sortKey = watchedAt || fallbackSortKey;
  if (!map.has(id) || sortKey > map.get(id)) map.set(id, sortKey);
}

