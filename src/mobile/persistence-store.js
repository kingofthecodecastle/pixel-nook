// Dependency-injected so restoration and failure recovery can be tested without
// a device. Storage keys are kept exactly as used by the original browser game.
export const isSaveKey = (key) => typeof key === 'string'
  && (key.startsWith('pixelnook_') || key.startsWith('pixelnook:import-backup:'));

export function createStorageMirror({ storage, preferences, onWarning = () => {}, prototype = Object.getPrototypeOf(storage) }) {
  let pending = Promise.resolve();
  let restoreFailed = false;
  let installed = false;
  const failedWrites = new Map();
  let originalSet;
  let originalRemove;
  let setWrapper;
  let removeWrapper;

  const warn = () => { try { onWarning(); } catch { /* A UI listener cannot break storage. */ } };
  function enqueue(key, value) {
    pending = pending.then(async () => {
      try {
        if (value === null) await preferences.remove({ key });
        else await preferences.set({ key, value });
        failedWrites.delete(key);
      } catch {
        failedWrites.set(key, value);
        warn();
      }
    });
  }

  async function flush() {
    await pending;
    // Retry the latest failed value once. Preserve ordering and report an error
    // instead of pretending a native backup succeeded.
    for (const [key, value] of [...failedWrites]) enqueue(key, value);
    await pending;
    return !restoreFailed && failedWrites.size === 0;
  }

  async function restore() {
    if (installed) return flush();
    try {
      const { keys } = await preferences.keys();
      for (const key of keys.filter(isSaveKey)) {
        if (storage.getItem(key) !== null) continue;
        const { value } = await preferences.get({ key });
        if (value !== null) storage.setItem(key, value);
      }
      restoreFailed = false;
    } catch {
      // Do not install a writer or boot cached empty progress after an
      // unsuccessful read: the existing native save might still be present.
      restoreFailed = true;
      warn();
      return false;
    }

    originalSet = prototype.setItem;
    originalRemove = prototype.removeItem;
    setWrapper = function (key, value) {
      originalSet.call(this, key, value);
      if (this === storage && isSaveKey(String(key))) enqueue(String(key), String(value));
    };
    removeWrapper = function (key) {
      originalRemove.call(this, key);
      // Keep a failed import's rollback from resurrecting newly added keys on
      // next launch. Existing game keys are never removed by imports.
      if (this === storage && isSaveKey(String(key))) enqueue(String(key), null);
    };
    prototype.setItem = setWrapper;
    prototype.removeItem = removeWrapper;
    installed = true;
    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (isSaveKey(key)) enqueue(key, storage.getItem(key));
      }
    } catch {
      restoreFailed = true;
      warn();
    }
    return flush();
  }

  return {
    restore,
    flush,
    hasWarning: () => restoreFailed || failedWrites.size > 0,
    // Used by tests. Runtime keeps the mirror for the app's lifetime.
    dispose() {
      if (prototype.setItem === setWrapper) prototype.setItem = originalSet;
      if (prototype.removeItem === removeWrapper) prototype.removeItem = originalRemove;
      installed = false;
    },
  };
}
