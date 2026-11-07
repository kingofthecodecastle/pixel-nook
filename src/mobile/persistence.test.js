import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorageMirror, isSaveKey } from './persistence-store.js';
import { importSave } from '../save-transfer.js';

function fixture(local = {}, native = {}) {
  class MemoryStorage {
    constructor() { this.map = new Map(Object.entries(local)); }
    get length() { return this.map.size; }
    key(index) { return [...this.map.keys()][index] ?? null; }
    getItem(key) { return this.map.get(key) ?? null; }
    setItem(key, value) { this.map.set(key, String(value)); }
    removeItem(key) { this.map.delete(key); }
  }
  const storage = new MemoryStorage();
  const data = new Map(Object.entries(native));
  let warnings = 0;
  const preferences = {
    async keys() { return { keys: [...data.keys()] }; },
    async get({ key }) { return { value: data.get(key) ?? null }; },
    async set({ key, value }) { data.set(key, value); },
    async remove({ key }) { data.delete(key); },
  };
  const mirror = createStorageMirror({ storage, preferences, onWarning: () => warnings++ });
  return { storage, data, preferences, mirror, warningCount: () => warnings };
}

test('native mirror covers exact legacy keys and recovery snapshots only', () => {
  for (const key of ['pixelnook_progress', 'pixelnook_initials', 'pixelnook_hs_snake', 'pixelnook:import-backup:123']) assert.equal(isSaveKey(key), true);
  for (const key of ['session', 'api-token', null, undefined]) assert.equal(isSaveKey(key), false);
});

test('restores missing keys before boot, preserving existing local values byte-for-byte', async () => {
  const f = fixture({ pixelnook_initials: 'KAI' }, { pixelnook_initials: 'OLD', pixelnook_progress: '{"coins":42}', 'pixelnook:import-backup:abc': 'backup', secret: 'untouched' });
  try {
    assert.equal(await f.mirror.restore(), true);
    assert.equal(f.storage.getItem('pixelnook_initials'), 'KAI');
    assert.equal(f.storage.getItem('pixelnook_progress'), '{"coins":42}');
    assert.equal(f.storage.getItem('pixelnook:import-backup:abc'), 'backup');
    assert.equal(f.storage.getItem('secret'), null);
    assert.equal(f.data.get('pixelnook_initials'), 'KAI');
    assert.equal(f.data.get('secret'), 'untouched');
    f.storage.setItem('pixelnook_progress', '{"coins":43}');
    f.storage.setItem('unrelated', 'local only');
    assert.equal(await f.mirror.flush(), true);
    assert.equal(f.data.get('pixelnook_progress'), '{"coins":43}');
    assert.equal(f.data.has('unrelated'), false);
  } finally { f.mirror.dispose(); }
});

test('failed native reads fail closed without replacing an inaccessible saved game', async () => {
  const f = fixture({}, { pixelnook_progress: '{"coins":999}' });
  const get = f.preferences.get;
  f.preferences.get = async () => { throw new Error('temporarily unavailable'); };
  try {
    assert.equal(await f.mirror.restore(), false);
    assert.equal(await f.mirror.flush(), false);
    assert.equal(f.storage.getItem('pixelnook_progress'), null);
    assert.equal(f.data.get('pixelnook_progress'), '{"coins":999}');
    assert.ok(f.warningCount() > 0);
    f.preferences.get = get;
    assert.equal(await f.mirror.restore(), true);
    assert.equal(f.storage.getItem('pixelnook_progress'), '{"coins":999}');
  } finally { f.mirror.dispose(); }
});

test('temporary backup failure retries latest value and permanent failures are reported', async () => {
  const f = fixture({ pixelnook_initials: 'KAI' });
  try {
    await f.mirror.restore();
    const normal = f.preferences.set;
    f.preferences.set = async () => { throw new Error('disk full'); };
    f.storage.setItem('pixelnook_initials', 'NEW');
    assert.equal(await f.mirror.flush(), false);
    assert.equal(f.mirror.hasWarning(), true);
    assert.equal(f.storage.getItem('pixelnook_initials'), 'NEW');
    assert.equal(f.data.get('pixelnook_initials'), 'KAI');
    f.preferences.set = normal;
    assert.equal(await f.mirror.flush(), true);
    assert.equal(f.data.get('pixelnook_initials'), 'NEW');
    assert.equal(f.mirror.hasWarning(), false);
  } finally { f.mirror.dispose(); }
});

test('failed import rollback does not resurrect new keys from native backup', async () => {
  const f = fixture({ pixelnook_progress: '{"coins":20}' });
  try {
    await f.mirror.restore();
    const normal = f.storage.setItem.bind(f.storage);
    f.storage.setItem = (key, value) => {
      if (key === 'pixelnook_hs_snake') throw new Error('quota');
      return normal(key, value);
    };
    const text = JSON.stringify({ format: 'pixel-nook-save', version: 1, entries: { pixelnook_progress: '{"coins":80}', pixelnook_bg: 'sunset', pixelnook_hs_snake: '[{"score":100}]' } });
    assert.throws(() => importSave(text, { storage: f.storage }), /previous save was restored/);
    assert.equal(await f.mirror.flush(), true);
    assert.equal(f.data.get('pixelnook_progress'), '{"coins":20}');
    assert.equal(f.data.has('pixelnook_bg'), false);
    assert.equal([...f.data.keys()].filter((key) => key.startsWith('pixelnook:import-backup:')).length, 1);
  } finally { f.mirror.dispose(); }
});
