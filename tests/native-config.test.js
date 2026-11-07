import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveNativeAdConfig } from '../scripts/configure-native.mjs';

test('development defaults use Google demo app IDs for both platforms', () => {
  const config = resolveNativeAdConfig({});
  assert.equal(config.mode, 'test');
  assert.equal(config.ios, 'ca-app-pub-3940256099942544~1458002511');
  assert.equal(config.android, 'ca-app-pub-3940256099942544~3347511713');
});

test('production refuses incomplete IDs, demo IDs and mismatched publishers', () => {
  assert.throws(() => resolveNativeAdConfig({ VITE_ADS_MODE: 'production' }), /ADMOB_IOS_APP_ID/);
  const env = {
    VITE_ADS_MODE: 'production',
    ADMOB_IOS_APP_ID: 'ca-app-pub-1111111111111111~1111111111',
    ADMOB_ANDROID_APP_ID: 'ca-app-pub-1111111111111111~2222222222',
    VITE_ADMOB_IOS_INTERSTITIAL_ID: 'ca-app-pub-1111111111111111/3333333333',
    VITE_ADMOB_ANDROID_INTERSTITIAL_ID: 'ca-app-pub-1111111111111111/4444444444',
  };
  assert.equal(resolveNativeAdConfig(env).mode, 'production');
  assert.throws(() => resolveNativeAdConfig({ ...env, ADMOB_IOS_APP_ID: 'ca-app-pub-3940256099942544~1458002511' }), /demo IDs/);
  assert.throws(() => resolveNativeAdConfig({ ...env, VITE_ADMOB_ANDROID_INTERSTITIAL_ID: 'ca-app-pub-3940256099942544/1033173712' }), /demo IDs/);
  assert.throws(() => resolveNativeAdConfig({ ...env, VITE_ADMOB_IOS_INTERSTITIAL_ID: 'ca-app-pub-2222222222222222/3333333333' }), /same AdMob publisher/);
});
