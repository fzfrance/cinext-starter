// Both poster and episode-card rows exclude the show featured in the hero.
export function excludeHeroShow(items, heroShowId) {
  if (heroShowId == null) return items;
  return items.filter((item) => String(item.id) !== String(heroShowId));
}
