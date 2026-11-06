// Browser and native WebViews have separate stores. Transfer saves explicitly;
// never change the existing pixelnook_* keys or contact the leaderboard/database.
const FORMAT = 'pixel-nook-save';
const VERSION = 1;
const PREFIX = 'pixelnook_';
// Deliberately outside pixelnook_* so exports do not recursively include backups.
const BACKUP_PREFIX = 'pixelnook:import-backup:';
const MAX_BYTES = 2 * 1024 * 1024;
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
const own = (object, key) => Object.hasOwn(object, key);
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonnegative = (value) => Number.isSafeInteger(value) && value >= 0;

function storageOrDefault(storage) {
  return storage || globalThis.localStorage;
}

function snapshot(storage) {
  const entries = Object.create(null);
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(PREFIX)) {
      const value = storage.getItem(key);
      if (value !== null) entries[key] = value;
    }
  }
  return entries;
}

function parseJSON(text, label) {
  try {
    return JSON.parse(text, (key, value) => {
      if (FORBIDDEN.has(key)) throw new Error('Unsafe object key');
      return value;
    });
  } catch {
    throw new Error(`${label} is not a valid save.`);
  }
}

function validateProgress(progress) {
  if (!plain(progress)) throw new Error('Invalid progress.');
  for (const key of ['coins', 'earned', 'dailyCount']) {
    if (own(progress, key) && !nonnegative(progress[key])) throw new Error(`Invalid progress ${key}.`);
  }
  for (const key of ['ach', 'played', 'owned', 'skins', 'daily']) {
    if (own(progress, key) && !plain(progress[key])) throw new Error(`Invalid progress ${key}.`);
  }
  for (const key of ['ach', 'played', 'daily']) {
    if (Object.values(progress[key] || {}).some((value) => !nonnegative(value))) {
      throw new Error(`Invalid progress ${key}.`);
    }
  }
  if (Object.values(progress.owned || {}).some((value) => typeof value !== 'boolean')) throw new Error('Invalid owned items.');
  if (Object.values(progress.skins || {}).some((value) => value !== null && typeof value !== 'string')) throw new Error('Invalid equipped skins.');
  if (own(progress, 'theme') && typeof progress.theme !== 'string') throw new Error('Invalid theme.');
  return progress;
}

function validateValue(key, value) {
  if (typeof value !== 'string') throw new Error(`Invalid value for ${key}.`);
  if (key.startsWith('pixelnook_hs_')) {
    const scores = parseJSON(value, key);
    if (!Array.isArray(scores) || scores.some((score) => !plain(score) || !nonnegative(score.score)
      || (own(score, 'name') && (typeof score.name !== 'string' || score.name.length > 100))
      || (own(score, 'at') && !nonnegative(score.at)))) throw new Error(`Invalid scores for ${key}.`);
    return scores;
  }
  if (key === 'pixelnook_progress') return validateProgress(parseJSON(value, key));
  if (key === 'pixelnook_initials' && !/^[A-Z0-9]{3}$/.test(value)) throw new Error('Invalid arcade initials.');
  return value;
}

function readTransfer(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BYTES) {
    throw new Error('Choose a Pixel Nook save smaller than 2 MB.');
  }
  const transfer = parseJSON(text, 'File');
  if (!plain(transfer) || transfer.format !== FORMAT || transfer.version !== VERSION || !plain(transfer.entries)) {
    throw new Error('Choose a Pixel Nook save exported by this version of the app.');
  }
  for (const [key, value] of Object.entries(transfer.entries)) {
    if (!/^pixelnook_[a-zA-Z0-9_-]+$/.test(key)) throw new Error('The save contains an unrelated storage key.');
    validateValue(key, value);
  }
  return transfer.entries;
}

function mergeNumbers(current = {}, incoming = {}) {
  const result = { ...incoming, ...current };
  for (const key of Object.keys(incoming)) result[key] = Math.max(current[key] || 0, incoming[key]);
  return result;
}

function mergeProgress(current, incoming) {
  const merged = { ...incoming, ...current };
  // Snapshots are not event logs. Taking maxima avoids awarding the same coins,
  // plays, achievements or daily rewards again when importing a save twice.
  for (const key of ['coins', 'earned']) merged[key] = Math.max(current[key] || 0, incoming[key] || 0);
  merged.played = mergeNumbers(current.played, incoming.played);
  for (const key of ['ach', 'daily']) {
    merged[key] = { ...incoming[key], ...current[key] };
    for (const name of Object.keys(incoming[key] || {})) {
      const previous = current[key]?.[name];
      const next = incoming[key][name];
      merged[key][name] = previous && next ? Math.min(previous, next) : previous || next;
    }
  }
  merged.owned = { ...incoming.owned, ...current.owned };
  for (const key of Object.keys(incoming.owned || {})) merged.owned[key] = !!(current.owned?.[key] || incoming.owned[key]);
  merged.skins = { ...incoming.skins, ...current.skins };
  merged.dailyCount = Math.max(current.dailyCount || 0, incoming.dailyCount || 0, Object.values(merged.daily).filter(Boolean).length);
  return merged;
}

function mergeValue(key, current, incoming) {
  if (current === undefined) return incoming;
  if (current === incoming) return current;
  const before = validateValue(key, current);
  const after = validateValue(key, incoming);
  if (key.startsWith('pixelnook_hs_')) {
    const result = [...before];
    const seen = new Set(before.map((entry) => JSON.stringify([entry.score, entry.name, entry.at])));
    for (const entry of after) {
      const signature = JSON.stringify([entry.score, entry.name, entry.at]);
      if (!seen.has(signature)) { result.push(entry); seen.add(signature); }
    }
    // Keep every existing and imported entry. The game still displays its usual
    // leaderboard; the untouched originals also remain in the recovery backup.
    result.sort((a, b) => b.score - a.score || (b.at || 0) - (a.at || 0));
    return JSON.stringify(result);
  }
  if (key === 'pixelnook_progress') return JSON.stringify(mergeProgress(before, after));
  // Initials, camera preferences, selected theme/skin etc. on this device win.
  return current;
}

/** Export all game keys, verbatim, including preferences and future save fields. */
export function exportSave(storage) {
  return JSON.stringify({ format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), entries: snapshot(storageOrDefault(storage)) }, null, 2);
}

/**
 * Merge a transferred save. Call location.reload() afterwards to refresh cached
 * progress. A durable backup of BOTH input stores is written before any change.
 * No existing key is ever deleted. No network/database operation is performed.
 */
export function importSave(text, { storage: suppliedStorage } = {}) {
  const storage = storageOrDefault(suppliedStorage);
  const incoming = readTransfer(text);
  const before = snapshot(storage);
  const writes = Object.entries(incoming)
    .map(([key, value]) => [key, mergeValue(key, before[key], value)])
    .filter(([key, value]) => before[key] !== value);
  if (!writes.length) return { changed: 0, backupKey: null };

  let backupKey;
  do {
    backupKey = BACKUP_PREFIX + (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  } while (storage.getItem(backupKey) !== null);
  try {
    storage.setItem(backupKey, JSON.stringify({ format: FORMAT, version: VERSION, createdAt: new Date().toISOString(), before, incoming }));
  } catch {
    throw new Error('Not enough storage to make a recovery backup. Your current save was not changed. Export it before freeing space.');
  }

  const applied = [];
  try {
    for (const [key, value] of writes) {
      storage.setItem(key, value);
      applied.push(key);
    }
  } catch (cause) {
    const failed = [];
    // Reverse order returns quota usage through the same successful states.
    // Only keys introduced by this failed import are removed; original game
    // keys and the full recovery backup are always retained.
    for (const key of applied.reverse()) {
      try {
        if (own(before, key)) storage.setItem(key, before[key]);
        else storage.removeItem(key);
      } catch { failed.push(key); }
    }
    const error = new Error(failed.length
      ? 'Import interrupted. A complete recovery backup is saved on this device; export your saves before continuing.'
      : 'Import could not be completed. Your previous save was restored; a recovery backup was kept.', { cause });
    error.backupKey = backupKey;
    error.recoveryRequired = failed.length > 0;
    throw error;
  }
  return { changed: writes.length, backupKey };
}

/** Export the exact pre-import or incoming store from a retained recovery backup. */
export function exportRecoverySave(backupKey, { source = 'before', storage: suppliedStorage } = {}) {
  if (!backupKey?.startsWith(BACKUP_PREFIX) || !['before', 'incoming'].includes(source)) throw new Error('Invalid recovery backup.');
  const backup = parseJSON(storageOrDefault(suppliedStorage).getItem(backupKey), 'Backup');
  if (!plain(backup) || !plain(backup[source])) throw new Error('Recovery backup was not found.');
  return JSON.stringify({ format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), entries: backup[source] }, null, 2);
}

export function listRecoverySaves(storage) {
  const target = storageOrDefault(storage);
  return Array.from({ length: target.length }, (_, index) => target.key(index)).filter((key) => key?.startsWith(BACKUP_PREFIX));
}
