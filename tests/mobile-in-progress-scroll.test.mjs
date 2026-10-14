import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("app/(tabs)/home/pageMobile.jsx", "utf8");

test("mobile In Progress rails keep native momentum scrolling", () => {
  assert.match(source, /const IN_PROGRESS_RAIL_STYLE = \{[\s\S]*WebkitOverflowScrolling: "touch"/);
  assert.equal((source.match(/style=\{IN_PROGRESS_RAIL_STYLE\}/g) || []).length, 2);
});

test("mobile In Progress cards do not animate transforms during a horizontal pan", () => {
  assert.match(source, /onToggleFavorite=\{\(\) => toggleFavorite\(item\.id, "Home:inProgressRow"\)\}[\s\S]{0,120}pressScale=\{false\}/);
  const compactCard = source.slice(source.indexOf("function InProgressCompactCard"), source.indexOf("// Same reasoning as InProgressGalleryCard"));
  assert.match(compactCard, /className="relative flex-shrink-0 rounded-\[16px\] overflow-hidden cursor-pointer"/);
});
