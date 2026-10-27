import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function readPngDimensions(path) {
  const png = fs.readFileSync(path);
  assert.equal(png.toString("ascii", 1, 4), "PNG");
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

test("iPhone home-screen metadata points to a 180px Apple touch icon", () => {
  const layout = fs.readFileSync("app/layout.jsx", "utf8");
  assert.match(layout, /apple-touch-icon\.png/);
  assert.match(layout, /sizes: "180x180"/);
  assert.deepEqual(readPngDimensions("public/apple-touch-icon.png"), {
    width: 180,
    height: 180,
  });
});

test("web app manifest exposes stable application identity and icon purpose", () => {
  const manifest = JSON.parse(fs.readFileSync("public/manifest.json", "utf8"));
  assert.equal(manifest.id, "/");
  assert.equal(manifest.scope, "/");
  assert.deepEqual(
    manifest.icons.map(({ sizes, purpose }) => ({ sizes, purpose })),
    [
      { sizes: "192x192", purpose: "any" },
      { sizes: "512x512", purpose: "any" },
    ],
  );
});
