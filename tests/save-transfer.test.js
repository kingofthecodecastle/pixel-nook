import test from 'node:test';
import assert from 'node:assert/strict';
import { exportSave, importSave, exportRecoverySave, listRecoverySaves } from '../src/save-transfer.js';
import { getHighScores, saveHighScore, nameLatest, isTopScore } from '../src/storage.js';

class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  get length() { return this.map.size; }
  key(index) { return [...this.map.keys()][index] ?? null; }
  getItem(key) { return this.map.get(key) ?? null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}
const progress = (extra = {}) => JSON.stringify({ coins: 50, earned: 120, ach: { first: 20 }, played: { snake: 3 }, owned: { wood: true }, theme: 'wood', skins: {}, daily: {}, dailyCount: 0, ...extra });
const score = (points, at = points, name = 'KAI') => ({ score: points, at, name });
const transfer = (entries) => JSON.stringify({ format: 'pixel-nook-save', version: 1, entries });

test('exports every original game key verbatim and excludes unrelated data/backups', () => {
  const storage = new MemoryStorage({ pixelnook_hs_snake: '[{"score":42}]', pixelnook_progress: progress(), pixelnook_initials: 'KAI', pixelnook_cam_snake: 'fp', irrelevant: 'private', 'pixelnook:import-backup:old': '{}' });
  const exported = JSON.parse(exportSave(storage));
  assert.deepEqual(Object.keys(exported.entries), ['pixelnook_hs_snake', 'pixelnook_progress', 'pixelnook_initials', 'pixelnook_cam_snake']);
  assert.equal(exported.entries.pixelnook_progress, storage.getItem('pixelnook_progress'));
});

test('fresh app receives exact legacy keys and data; no source key is renamed', () => {
  const source = { pixelnook_hs_snake: JSON.stringify([score(100)]), pixelnook_progress: progress(), pixelnook_initials: 'KAI', pixelnook_bg: 'sunset' };
  const storage = new MemoryStorage();
  const result = importSave(transfer(source), { storage });
  assert.equal(result.changed, 4);
  for (const [key, value] of Object.entries(source)) assert.equal(storage.getItem(key), value);
  assert.deepEqual(JSON.parse(exportRecoverySave(result.backupKey, { source: 'incoming', storage })).entries, source);
});

test('merges all scores, ownership and progress without losing destination preferences or doubling imports', () => {
  const before = {
    pixelnook_hs_snake: JSON.stringify([score(500), score(400), score(300), score(200), score(100)]),
    pixelnook_progress: progress({ coins: 30, earned: 200, owned: { wood: true, arctic: true }, theme: 'arctic', skins: { snake: 'snake-ice' }, daily: { '2026-11-01': 10 }, dailyCount: 1, custom: 'kept' }),
    pixelnook_initials: 'KAI',
  };
  const incoming = {
    pixelnook_hs_snake: JSON.stringify([score(500), score(350), score(50)]),
    pixelnook_progress: progress({ coins: 80, earned: 180, played: { snake: 2, froghop: 4 }, ach: { first: 30, daily1: 40 }, owned: { wood: true, arctic: false, 'snake-ice': true }, theme: 'gold', skins: { snake: 'snake-gold', froghop: 'frog-pink' }, daily: { '2026-11-02': 20 }, dailyCount: 1, futureField: true }),
    pixelnook_initials: 'NEW',
  };
  const storage = new MemoryStorage(before);
  const result = importSave(transfer(incoming), { storage });
  assert.equal(JSON.parse(storage.getItem('pixelnook_hs_snake')).length, 7);
  const merged = JSON.parse(storage.getItem('pixelnook_progress'));
  assert.equal(merged.coins, 80);
  assert.equal(merged.earned, 200);
  assert.equal(merged.dailyCount, 2);
  assert.equal(merged.ach.first, 20);
  assert.equal(merged.ach.daily1, 40);
  assert.deepEqual(merged.played, { snake: 3, froghop: 4 });
  assert.equal(merged.owned.arctic, true);
  assert.equal(merged.owned['snake-ice'], true);
  assert.equal(merged.theme, 'arctic');
  assert.equal(merged.skins.snake, 'snake-ice');
  assert.equal(merged.skins.froghop, 'frog-pink');
  assert.equal(merged.custom, 'kept');
  assert.equal(merged.futureField, true);
  assert.equal(storage.getItem('pixelnook_initials'), 'KAI');
  assert.deepEqual(JSON.parse(exportRecoverySave(result.backupKey, { storage })).entries, before);
  assert.equal(importSave(transfer(incoming), { storage }).changed, 0);
  assert.equal(listRecoverySaves(storage).length, 1);
});

test('invalid and unrelated data fail before any mutation', () => {
  const cases = [
    'not json',
    transfer({ password: 'secret' }),
    transfer({ pixelnook_progress: '{"coins":-1}' }),
    transfer({ pixelnook_progress: '{"ach":[]}' }),
    transfer({ pixelnook_progress: '{"__proto__":{"polluted":true}}' }),
    transfer({ pixelnook_hs_snake: '[{"score":"500"}]' }),
    transfer({ pixelnook_initials: '<x>' }),
    JSON.stringify({ format: 'pixel-nook-save', version: 99, entries: {} }),
  ];
  for (const value of cases) {
    const storage = new MemoryStorage({ pixelnook_initials: 'KAI' });
    assert.throws(() => importSave(value, { storage }));
    assert.deepEqual([...storage.map], [['pixelnook_initials', 'KAI']]);
  }
  assert.equal({}.polluted, undefined);
});

test('refuses to overwrite an unreadable existing game save', () => {
  const storage = new MemoryStorage({ pixelnook_progress: 'broken legacy save' });
  assert.throws(() => importSave(transfer({ pixelnook_progress: progress() }), { storage }));
  assert.equal(storage.getItem('pixelnook_progress'), 'broken legacy save');
  assert.equal(storage.length, 1);
});

test('backup quota failure leaves original keys byte-for-byte unchanged', () => {
  const storage = new MemoryStorage({ pixelnook_progress: progress() });
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => importSave(transfer({ pixelnook_progress: progress({ coins: 70 }) }), { storage }), /not changed/);
  assert.equal(storage.getItem('pixelnook_progress'), progress());
});

test('mid-import failure restores originals and retains a complete recovery backup', () => {
  const before = { pixelnook_progress: progress({ coins: 20 }), pixelnook_initials: 'KAI' };
  const storage = new MemoryStorage(before);
  const normalSet = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    if (key === 'pixelnook_hs_snake') throw new Error('QuotaExceededError');
    normalSet(key, value);
  };
  const incoming = { pixelnook_progress: progress({ coins: 70 }), pixelnook_bg: 'stars', pixelnook_hs_snake: JSON.stringify([score(100)]) };
  assert.throws(() => importSave(transfer(incoming), { storage }), /previous save was restored/);
  for (const [key, value] of Object.entries(before)) assert.equal(storage.getItem(key), value);
  assert.equal(storage.getItem('pixelnook_bg'), null);
  const [backupKey] = listRecoverySaves(storage);
  assert.deepEqual(JSON.parse(exportRecoverySave(backupKey, { source: 'incoming', storage })).entries, incoming);
});

test('normal gameplay keeps the complete local score history and displays only the top five', () => {
  const previous = globalThis.localStorage;
  try {
    globalThis.localStorage = new MemoryStorage({ pixelnook_hs_snake: JSON.stringify([score(600), score(500), score(400), score(300), score(200), score(100)]) });
    const top = saveHighScore('snake', 50);
    assert.equal(top.length, 5);
    assert.equal(getHighScores('snake').length, 5);
    assert.equal(JSON.parse(localStorage.getItem('pixelnook_hs_snake')).length, 7);
    nameLatest('snake', 50, 'NEW');
    assert.equal(JSON.parse(localStorage.getItem('pixelnook_hs_snake')).find((entry) => entry.score === 50).name, 'NEW');
    assert.equal(isTopScore('snake', 150), false);
    assert.equal(isTopScore('snake', 250), true);
  } finally { globalThis.localStorage = previous; }
});
