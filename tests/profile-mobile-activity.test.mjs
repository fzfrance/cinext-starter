import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const profile = fs.readFileSync("app/(tabs)/profile/page.jsx", "utf8");
const activity = fs.readFileSync("app/(tabs)/profile/activity/page.jsx", "utf8");

test("mobile profile keeps the full hero below the iOS safe area", () => {
  assert.match(profile, /height: "calc\(190px \+ env\(safe-area-inset-top, 0px\)\)"/);
  assert.match(profile, /paddingTop: "calc\(env\(safe-area-inset-top, 0px\) \+ 14px\)"/);
});

test("the notification bell opens activity and hydrates visible movies in bounded batches", () => {
  assert.match(profile, /router\.push\("\/profile\/activity\?tab=activity"\)/);
  assert.match(activity, /for \(let i = 0; i < ids\.length; i \+= 20\)/);
  assert.match(activity, /events\.filter\(\(event\) => event\.mediaType === "movie"\)/);
  assert.doesNotMatch(activity, /allMovieIds\.join/);
});
