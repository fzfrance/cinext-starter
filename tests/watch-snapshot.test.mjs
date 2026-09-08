import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync('lib/watchSnapshot.js', 'utf8');
const { applyWatchSnapshot, applySkipSnapshot } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
test('empty database snapshot clears retained middle-season watches, ratings and skips', () => {
  const before = Array.from({length:5},(_,i)=>({id:i+1,episodes:[{n:1,title:'Episode',watched:i>0&&i<4,watchCount:2,myRating:5,skipped:true}]}));
  const after = applySkipSnapshot(applyWatchSnapshot(before, {}), new Set());
  assert.ok(after.every(s=>s.episodes.every(e=>!e.watched&&!e.skipped&&e.watchCount===0&&e.myRating===null)));
  assert.equal(after[2].episodes[0].title, 'Episode');
  assert.equal(before[2].episodes[0].watched, true);
});
test('snapshot preserves actual surviving watches and removes obsolete ratings', () => {
  const after = applyWatchSnapshot([{id:2,episodes:[{n:1,myRating:5},{n:2,watched:true,myRating:4}]}], {'2-1':{watchCount:3,rating:null}});
  assert.equal(after[0].episodes[0].watchCount,3);
  assert.equal(after[0].episodes[0].myRating,null);
  assert.equal(after[0].episodes[1].watched,false);
});
