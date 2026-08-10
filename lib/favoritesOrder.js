// ---------------------------------------------------------------------------
// Favorites sort/order — shared source of truth
// ---------------------------------------------------------------------------
// The full Favorites list pages (Shows: app/(tabs)/profile/favorites,
// Movies: app/(tabs)/profile/favorites/movies) let the user pick a sort
// mode or hand-drag a custom order. Profile's own "Favorite Shows"/
// "Favorite Movies" preview rows (app/(tabs)/profile/page.jsx) need to
// reflect that exact same arrangement — not their own independent
// (effectively arbitrary, fetch-order-dependent) ordering — and it all
// needs to survive a refresh. localStorage-backed, same established
// per-browser preference pattern as e.g. Library's own view-mode toggle
// (LIBRARY_VIEW_MODE_KEY in app/(tabs)/library/LibraryClient.jsx) — no
// schema change, no account-level sync.

export const FAVORITE_SHOWS_ORDER_KEY = "cinext:favoriteShowsOrder";
export const FAVORITE_MOVIES_ORDER_KEY = "cinext:favoriteMoviesOrder";
export const FAVORITE_SHOWS_SORT_KEY = "cinext:favoriteShowsSort";
export const FAVORITE_MOVIES_SORT_KEY = "cinext:favoriteMoviesSort";

export function loadFavoriteOrder(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error(`Failed to read ${key}:`, err);
    return [];
  }
}

export function saveFavoriteOrder(key, ids) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch (err) {
    console.error(`Failed to save ${key}:`, err);
  }
}

export function loadFavoriteSort(key) {
  try {
    return localStorage.getItem(key) || "firstAdded";
  } catch (err) {
    console.error(`Failed to read ${key}:`, err);
    return "firstAdded";
  }
}

export function saveFavoriteSort(key, mode) {
  try {
    localStorage.setItem(key, mode);
  } catch (err) {
    console.error(`Failed to save ${key}:`, err);
  }
}

// items: objects with at least {id, addedAt, title}. `order` (userOrder
// mode only) is the saved id sequence — replayed in that order, with any
// item not yet in it (e.g. favorited since the last manual arrangement)
// appended at the end in its current relative order, rather than dropped
// or jumped to the front of a hand-arranged list.
export function sortFavorites(items, mode, order = []) {
  const arr = [...items];
  if (mode === "firstAdded") return arr.sort((a, b) => a.addedAt - b.addedAt);
  if (mode === "lastAdded") return arr.sort((a, b) => b.addedAt - a.addedAt);
  if (mode === "az") return arr.sort((a, b) => a.title.localeCompare(b.title));
  const byId = new Map(arr.map((item) => [item.id, item]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean);
  const seen = new Set(ordered.map((item) => item.id));
  const rest = arr.filter((item) => !seen.has(item.id));
  return [...ordered, ...rest];
}
