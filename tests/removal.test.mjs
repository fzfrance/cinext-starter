import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
async function load(path, dependencies) {
  let source = await fs.readFile(new URL(path, import.meta.url), 'utf8');
  const names = [...source.matchAll(/export (?:async )?function (\w+)/g)].map(m => m[1]);
  source = source.replace(/^import \{([^}]+)\} from "([^"]+)";/gm, (_, names, path) => `const {${names}} = dependencies[${JSON.stringify(path)}] || {};`);
  source = source.replace(/export (async )?function/g, '$1function');
  return new Function('dependencies', `${source}\nreturn {${names.join(',')}};`)(dependencies);
}
async function fixture({ fail, retained = false } = {}) {
  const events = []; let library = true;
  const queue = await load('../lib/showMutations.js', {});
  const cleanup = name => async (user, show) => {
    assert.equal(user, 'owner'); assert.equal(show, 42); events.push(name);
    if (fail === name) throw Error('permission denied');
  };
  const supabase = { from(table) {
    assert.equal(table, 'user_shows'); let action = 'read'; let count = false;
    const q = { select(_cols, options) { count = !!options?.count; return q; }, eq() { return q; }, maybeSingle() { return q; }, delete() { action = 'delete'; return q; }, then(resolve, reject) {
      if (action === 'delete') { events.push('library'); if (!retained) library = false; }
      return Promise.resolve(count ? { count: library ? 1 : 0, error: null } : { data: { status: 'completed' }, error: null }).then(resolve, reject);
    } }; return q;
  } };
  const api = await load('../lib/userShows.js', {
    '@/lib/showMutations': queue,
    '@/lib/supabase': { supabase },
    '@/lib/episodeWatches': { deleteAllEpisodeWatchesForShow: cleanup('watches') },
    '@/lib/episodeSkips': { deleteAllEpisodeSkipsForShow: cleanup('skips') },
    '@/lib/seasonReviews': { deleteAllSeasonReviewsForShow: cleanup('reviews') },
    '@/lib/seasonRatings': { deleteAllSeasonRatingsForShow: cleanup('ratings') },
    '@/lib/sessionCaches': { invalidateWatchCaches: () => events.push('invalidate') },
  });
  return { api, events, library: () => library };
}
test('Remove clears all dependent history before removing the library row', async () => {
  const f = await fixture(); await f.api.removeUserShow('owner', '42');
  assert.deepEqual(f.events.slice(0, 5), ['watches', 'skips', 'reviews', 'ratings', 'library']);
  assert.equal(f.library(), false);
});
for (const fail of ['watches', 'skips', 'reviews', 'ratings']) {
  test(`failed ${fail} deletion cannot report a successful removal`, async () => {
    const f = await fixture({ fail });
    await assert.rejects(f.api.removeUserShow('owner', 42), /permission denied/);
    assert.equal(f.library(), true); assert.equal(f.events.includes('library'), false);
    assert.equal(f.events.at(-1), 'invalidate');
  });
}
test('a silent zero-row library delete is detected', async () => {
  const f = await fixture({ retained: true });
  await assert.rejects(f.api.removeUserShow('owner', 42), /verified/);
});
