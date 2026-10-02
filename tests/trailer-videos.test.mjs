import test from "node:test";
import assert from "node:assert/strict";
import { selectTrailerVideos, trailerIdentity } from "../lib/trailerVideos.js";

function video(partial) {
  return { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", ...partial };
}

test("English titles keep the original trailer and drop regional dubs of it", () => {
  const selected = selectTrailerVideos([
    video({ key: "ml", name: "MALAYALAM TRAILER [English Subtitled]", iso_639_1: "ml" }),
    video({ key: "te", name: "TELUGU Trailer [English Subtitled]", iso_639_1: "te" }),
    video({ key: "ta", name: "Official Tamil Trailer [English Subtitled]", iso_639_1: "ta" }),
    video({ key: "ta2", name: "Official Tamil Trailer [English Subtitled]", iso_639_1: "en" }),
    video({ key: "en", name: "OFFICIAL TRAILER", iso_639_1: "en" }),
    video({ key: "teaser", name: "Official Teaser", type: "Teaser", iso_639_1: "en" }),
  ], "en");

  assert.deepEqual(selected.map((v) => v.key), ["en", "teaser"]);
});

test("The Trailer button's first result is the original-language official trailer", () => {
  const selected = selectTrailerVideos([
    video({ key: "ml", name: "MALAYALAM TRAILER [English Subtitled]", iso_639_1: "en" }),
    video({ key: "en", name: "Official Trailer", iso_639_1: "en" }),
  ], "en");
  assert.equal(selected[0].key, "en");
});

test("Same English trailer with and without subtitles collapses to one", () => {
  const selected = selectTrailerVideos([
    video({ key: "sub", name: "Official Trailer [English Subtitled]", iso_639_1: "en" }),
    video({ key: "plain", name: "Official Trailer", iso_639_1: "en" }),
  ], "en");
  assert.deepEqual(selected.map((v) => v.key), ["plain"]);
});

test("A non-English title prefers the original cut over the English-subtitled copy", () => {
  const selected = selectTrailerVideos([
    video({ key: "en-sub", name: "Official Trailer [English Subtitled]", iso_639_1: "en" }),
    video({ key: "ko", name: "메인 예고편", iso_639_1: "ko" }),
    video({ key: "hi", name: "Official Hindi Trailer", iso_639_1: "hi" }),
    video({ key: "teaser", name: "Teaser", type: "Teaser", iso_639_1: "en" }),
  ], "ko");
  assert.deepEqual(selected.map((v) => v.key), ["ko", "teaser"]);
});

test("Distinct trailers stay even when they share a language", () => {
  const selected = selectTrailerVideos([
    video({ key: "main", name: "Official Trailer", iso_639_1: "en" }),
    video({ key: "two", name: "Official Trailer 2", iso_639_1: "en" }),
    video({ key: "final", name: "Final Trailer", iso_639_1: "en" }),
  ], "en");
  assert.deepEqual(selected.map((v) => v.key), ["main", "two", "final"]);
});

test("A title word that is also a language is not treated as a dub", () => {
  const selected = selectTrailerVideos([
    video({ key: "dispatch", name: "The French Dispatch | Official Trailer", iso_639_1: "en" }),
    video({ key: "ml", name: "Malayalam Trailer", iso_639_1: "ml" }),
  ], "en");
  assert.deepEqual(selected.map((v) => v.key), ["dispatch"]);
  assert.equal(trailerIdentity(selected[0]).endsWith(":"), false);
});

test("When only regional dubs exist, one copy of that trailer is kept", () => {
  const selected = selectTrailerVideos([
    video({ key: "ml", name: "MALAYALAM TRAILER [English Subtitled]", iso_639_1: "ml" }),
    video({ key: "te", name: "TELUGU Trailer [English Subtitled]", iso_639_1: "te" }),
    video({ key: "ta", name: "Official Tamil Trailer", iso_639_1: "ta" }),
  ], "en");
  assert.equal(selected.length, 1);
});
