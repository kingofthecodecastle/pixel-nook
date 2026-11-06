import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { createStorageMirror } from './persistence-store.js';

let mirror;
let initializationFailed = false;

export async function restoreNativeStorage() {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    mirror ||= createStorageMirror({
      storage: window.localStorage,
      preferences: Preferences,
      onWarning: () => window.dispatchEvent(new Event('pixelnook-storage-warning')),
    });
    const restored = await mirror.restore();
    initializationFailed = !restored;
    return restored;
  } catch {
    initializationFailed = true;
    window.dispatchEvent(new Event('pixelnook-storage-warning'));
    return false;
  }
}

export async function flushNativeStorage() { return mirror ? mirror.flush() : !initializationFailed; }
export function nativeStorageWarning() { return initializationFailed || mirror?.hasWarning() || false; }
