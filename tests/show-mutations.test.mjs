import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const code = await readFile(new URL('../lib/showMutations.js', import.meta.url), 'utf8');
const { mutateShow, resetShow, showGeneration, assertShowGeneration } = await import(`data:text/javascript,${encodeURIComponent(code)}`);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
test('Remove drains writes from other screens, blocks new writes, and deletes last', async () => {
  const gate = deferred(); const events = [];
  const write = mutateShow('owner', 1, async () => { await gate.promise; events.push('watch'); });
  const remove = resetShow('owner', '1', async () => { events.push('remove'); });
  await assert.rejects(mutateShow('owner', 1, () => events.push('late watch')), /removal/);
  gate.resolve(); await Promise.all([write, remove]);
  assert.deepEqual(events, ['watch', 'remove']);
  await mutateShow('owner', 1, () => events.push('explicit re-add'));
  assert.equal(events.at(-1), 'explicit re-add');
});
test('a slow Completed fetch cannot write after a completed Remove', async () => {
  const generation = showGeneration('owner', 2);
  await resetShow('owner', 2, async () => {});
  assert.throws(() => assertShowGeneration('owner', 2, generation), /changed/);
});
test('failed writes do not block Remove; failed Remove reports and allows retry', async () => {
  await assert.rejects(mutateShow('owner', 3, async () => { throw Error('insert failed'); }));
  await assert.rejects(resetShow('owner', 3, async () => { throw Error('delete denied'); }), /denied/);
  await resetShow('owner', 3, async () => {});
});
test('accounts and shows have independent queues; invalid IDs fail before work', async () => {
  const gate = deferred();
  const write = mutateShow('owner', 4, () => gate.promise);
  await resetShow('someone-else', 4, async () => {});
  await resetShow('owner', 5, async () => {});
  assert.throws(() => resetShow('owner', '', () => {}), /Invalid/);
  assert.throws(() => resetShow('owner', 1.5, () => {}), /Invalid/);
  gate.resolve(); await write;
});
