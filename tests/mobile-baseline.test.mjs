import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import cp from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parse } = require('next/dist/compiled/babel/parser');
const manifest = JSON.parse(fs.readFileSync('MOBILE_RESTORATION_MANIFEST.json'));
function presentation(source) {
  source = source.replaceAll('background: accent', 'background: "#fff"')
    .replaceAll('background: filled ? accent', 'background: filled ? "#fff"')
    .replaceAll('background: canSave ? accent', 'background: canSave ? "#fff"')
    .replaceAll('ep.watched ? t.cardFill : accent', 'ep.watched ? t.cardFill : "#fff"')
    .replaceAll('background: filled ? "rgba(255,255,255,0.95)"', 'background: filled ? "#fff"');
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const trees = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      trees.push(source.slice(node.start, node.end)); return;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(ast); return trees;
}
// Home now follows the explicitly revised hero-exclusion and view-toggle design.
for (const path of manifest.pages.filter(path => path !== "app/(tabs)/home/page.jsx")) {
  test(`${path}: mobile JSX matches September 7 evening, including copy and inline styles`, () => {
    const original = cp.execFileSync('git', ['show', `${manifest.baseline}:${path}`], { encoding: 'utf8' });
    const restored = fs.readFileSync(path.replace('.jsx', 'Mobile.jsx'), 'utf8');
    assert.deepEqual(presentation(restored), presentation(original));
  });
}
test('all restored component markup matches the baseline', () => {
  for (const path of manifest.components) {
    const original = cp.execFileSync('git', ['show', `${manifest.baseline}:${path}`], { encoding: 'utf8' });
    const restored = fs.readFileSync(path.replace('components/', 'components/mobile-original/'), 'utf8');
    assert.deepEqual(presentation(restored), presentation(original), path);
  }
});
