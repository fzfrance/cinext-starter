// One queue per account/show, shared by every screen in this browser tab.
const states = new Map();
function state(userId, showId) {
  const id = Number(showId);
  if (!userId || !Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid user or show ID");
  const key = `${userId}:${id}`;
  if (!states.has(key)) states.set(key, { tail: Promise.resolve(), generation: 0, resetting: false });
  return states.get(key);
}
export function showGeneration(userId, showId) {
  return state(userId, showId).generation;
}
export function assertShowGeneration(userId, showId, generation) {
  const s = state(userId, showId);
  if (s.resetting || s.generation !== generation) throw new Error("Show changed while this action was loading. Please try again.");
}
export function mutateShow(userId, showId, work) {
  const s = state(userId, showId);
  if (s.resetting) return Promise.reject(new Error("Show removal is in progress. Please try again when it finishes."));
  const result = s.tail.catch(() => {}).then(work);
  s.tail = result.catch(() => {});
  return result;
}
export function resetShow(userId, showId, work) {
  const s = state(userId, showId);
  if (s.resetting) return s.reset;
  s.resetting = true;
  s.generation += 1;
  const result = s.tail.catch(() => {}).then(work).finally(() => { s.resetting = false; });
  s.tail = result.catch(() => {});
  s.reset = result;
  return result;
}
