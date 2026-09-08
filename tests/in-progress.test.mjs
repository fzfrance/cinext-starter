import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { excludeHeroShow } = await import('data:text/javascript,' + encodeURIComponent(fs.readFileSync('lib/inProgress.js', 'utf8')));
test('hero show is omitted regardless of ID representation, preserving other shows and their order', () => {
  const items=[{id:1},{id:2},{id:3}];
  assert.deepEqual(excludeHeroShow(items,'2'),[{id:1},{id:3}]);
  assert.equal(items.length,3);
  assert.deepEqual(excludeHeroShow([{id:'2'}],2),[]);
});
test('no hero leaves In Progress intact; a hero-only library leaves no duplicate row', () => {
  const items=[{id:2}];
  assert.equal(excludeHeroShow(items,null),items);
  assert.deepEqual(excludeHeroShow(items,2),[]);
  assert.deepEqual(excludeHeroShow([],2),[]);
});
