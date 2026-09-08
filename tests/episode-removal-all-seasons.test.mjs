import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
async function fixture(denyMiddleSeasons = false) {
  let rows = [];
  // More than the usual SELECT page limit, with repeated watch events.
  for (const owner of ['owner', 'another-user']) {
    for (let season = 1; season <= 5; season++) {
      for (let event = 0; event < 300; event++) rows.push({ user_id: owner, tmdb_show_id: 60708, season_number: season });
    }
  }
  rows.push({ user_id: 'owner', tmdb_show_id: 99, season_number: 1 });
  const supabase = { from(table) {
    assert.equal(table, 'episode_watches'); let deleting = false; const filters = [];
    const matches = row => filters.every(([key, value]) => row[key] === value);
    const q = {
      delete() { deleting = true; return q; }, select() { return q; },
      eq(key, value) { filters.push([key, value]); return q; },
      then(resolve, reject) {
        if (deleting) rows = rows.filter(row => !matches(row) || (denyMiddleSeasons && [2,3,4].includes(row.season_number)));
        return Promise.resolve({ error: null, count: rows.filter(matches).length }).then(resolve, reject);
      }
    }; return q;
  } };
  let source = await fs.readFile(new URL('../lib/episodeWatches.js', import.meta.url), 'utf8');
  source = source.replace(/^import \{[^}]+\} from "[^"]+";/gm, '').replace(/export (async )?function/g, '$1function');
  const remove = new Function('supabase', `${source}\nreturn deleteAllEpisodeWatchesForShow;`)(supabase);
  return { remove, rows: () => rows };
}
test('full-show reset deletes every season and rewatch, preserving other owners and titles', async () => {
  const f = await fixture(); await f.remove('owner', '60708');
  assert.equal(f.rows().filter(r => r.user_id === 'owner' && r.tmdb_show_id === 60708).length, 0);
  assert.equal(f.rows().filter(r => r.user_id === 'another-user').length, 1500);
  assert.equal(f.rows().filter(r => r.tmdb_show_id === 99).length, 1);
});
test('a partial delete of only seasons 1 and 5 is rejected, never reported as a full reset', async () => {
  const f = await fixture(true);
  await assert.rejects(f.remove('owner', 60708), /900 row\(s\) remain/);
});
