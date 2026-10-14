import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/timeMachine.js", "utf8");
const moduleUrl = `data:text/javascript,${encodeURIComponent(source)}`;
const { recordLastWatched, resolveTimeMachineTypeFilter } = await import(moduleUrl);

test("a remembered media filter falls back to All for a year of the other type", () => {
  const movieOnly = [{ id: 1, mediaType: "movie" }, { id: 2, mediaType: "movie" }];
  assert.equal(resolveTimeMachineTypeFilter(movieOnly, "tv"), "all");
  assert.equal(resolveTimeMachineTypeFilter(movieOnly, "movie"), "movie");
});

test("historical rows without an exact timestamp remain in the year detail", () => {
  const dates = new Map();
  recordLastWatched(dates, 101, null, "2014-01-01");
  recordLastWatched(dates, 101, "2014-10-11", "2014-01-01");
  recordLastWatched(dates, 202, null, "2014-01-01");
  assert.deepEqual([...dates], [[101, "2014-10-11"], [202, "2014-01-01"]]);
});
