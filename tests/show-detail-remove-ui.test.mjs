import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parse } = require('next/dist/compiled/babel/parser');
function removalHandler(source, dependencies) {
  let initializer;
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id?.name === 'selectStatus') initializer = node.init;
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(parse(source, { sourceType: 'module', plugins: ['jsx'] }));
  assert.ok(initializer);
  return new Function('deps', `const {${Object.keys(dependencies).join(',')}} = deps; return (${source.slice(initializer.start, initializer.end)});`)(dependencies);
}
for (const variant of ['Mobile', 'Desktop']) {
  for (const fail of [false, true]) {
    test(`${variant}: Remove ${fail ? 'failure retains progress' : 'success clears all seasons without a callback exception'}`, async () => {
      let seasons = Array.from({ length: 5 }, (_, i) => ({ id: i+1, episodes: [{ n: 1, watched: true, watchCount: 2, skipped: true, myRating: 4 }] }));
      let inLibrary = true; let ratings = { 2: { rating: 8 } }; const alerts = [];
      const ref = value => ({ current: value });
      const dependencies = {
        user: { id: 'owner' }, showId: 60708, router: { push() {} },
        removingRef: ref(false), hydrationGenerationRef: ref(0),
        suppressStatusSyncRef: ref(false), suppressEpisodeWritesRef: ref(false),
        watchSeedGenRef: ref(0), skipSeedGenRef: ref(0),
        libraryWriteChainRef: ref(Promise.resolve()), episodeWriteChainsRef: ref({}), showWatchWriteChainRef: ref(Promise.resolve()),
        setPendingStatusSync() {}, setStatusOpen() {}, setStatus() {}, setStatusExplicit() {},
        setInLibrary: value => { inLibrary = value; },
        setSeasonRatings: value => { ratings = value; },
        setSeasons: fn => { seasons = fn(seasons); },
        removeUserShow: async () => { if (fail) throw Error('delete denied'); },
        window: { alert: message => alerts.push(message) }, console: { error() {} },
      };
      const source = fs.readFileSync(`app/(tabs)/show/[id]/ShowDetailClient${variant}.jsx`, 'utf8');
      removalHandler(source, dependencies)('remove');
      await new Promise(resolve => setImmediate(resolve));
      await dependencies.libraryWriteChainRef.current;
      assert.equal(alerts.length, fail ? 1 : 0);
      assert.equal(inLibrary, fail);
      for (const season of seasons) {
        assert.equal(season.episodes[0].watched, fail);
        assert.equal(season.episodes[0].watchCount, fail ? 2 : 0);
        assert.equal(season.episodes[0].skipped, fail);
        assert.equal(season.episodes[0].myRating, fail ? 4 : null);
      }
      if (!fail) assert.deepEqual(ratings, {});
    });
  }
}
