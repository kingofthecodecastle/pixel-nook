import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdService, TEST_INTERSTITIAL_IDS } from './ads.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fakeSdk({ platform = 'ios', canRequestAds = true, requiresForm = false } = {}) {
  const listeners = new Map();
  const calls = [];
  let nextConsent = {
    status: requiresForm ? 'REQUIRED' : 'OBTAINED',
    isConsentFormAvailable: requiresForm,
    canRequestAds,
    privacyOptionsRequirementStatus: 'REQUIRED',
  };
  const sdk = {
    platform,
    InterstitialAdPluginEvents: { Showed: 'showed', Dismissed: 'dismissed', FailedToShow: 'failed' },
    AdmobConsentStatus: { REQUIRED: 'REQUIRED' },
    PrivacyOptionsRequirementStatus: { REQUIRED: 'REQUIRED' },
    MaxAdContentRating: { General: 'General' },
    AdMob: {
      requestConsentInfo: async () => { calls.push(['consent']); return { ...nextConsent }; },
      showConsentForm: async () => { calls.push(['form']); return { ...nextConsent, status: 'OBTAINED' }; },
      showPrivacyOptionsForm: async () => { calls.push(['privacy']); },
      addListener: async (event, callback) => {
        listeners.set(event, callback);
        return { remove: async () => listeners.delete(event) };
      },
      initialize: async options => { calls.push(['initialize', options]); },
      prepareInterstitial: async options => { calls.push(['prepare', options]); return { adUnitId: options.adId }; },
      showInterstitial: async options => { calls.push(['show', options]); },
    },
  };
  return {
    sdk, calls,
    emit: event => listeners.get(event)?.(),
    setConsent: value => { nextConsent = { ...nextConsent, ...value }; },
  };
}

test('web builds never import or initialize the native ad SDK', async () => {
  const ads = createAdService({ env: { MODE: 'production', VITE_ADS_MODE: 'production' },
    loadSdk: () => assert.fail('native SDK imported by web') });
  assert.equal(ads.privacyOptionsRequired(), false);
  assert.equal(await ads.initializeAds(), false);
  ads.noteGameOver();
  assert.equal((await ads.beforeNextRound()).shown, false);
});

test('native defaults use platform demo IDs and collect consent before SDK initialization', async () => {
  for (const platform of ['ios', 'android']) {
    const fake = fakeSdk({ platform, requiresForm: true });
    const ads = createAdService({ env: { MODE: 'native' }, loadSdk: async () => fake.sdk });
    assert.equal(await ads.initializeAds(), true);
    await tick();
    assert.deepEqual(fake.calls.slice(0, 3).map(call => call[0]), ['consent', 'form', 'initialize']);
    const [, options] = fake.calls.find(call => call[0] === 'prepare');
    assert.equal(options.adId, TEST_INTERSTITIAL_IDS[platform]);
    assert.equal(options.isTesting, true);
    assert.equal(ads.adsEnabled(), true);
  }
});

test('production requires a real configured ad unit and never substitutes a test ID', async () => {
  for (const id of [undefined, 'incorrect', TEST_INTERSTITIAL_IDS.ios]) {
    const fake = fakeSdk();
    const ads = createAdService({ env: { MODE: 'native', VITE_ADS_MODE: 'production', VITE_ADMOB_IOS_INTERSTITIAL_ID: id },
      loadSdk: async () => fake.sdk });
    assert.equal(await ads.initializeAds(), false);
    assert.equal(fake.calls.length, 0);
  }
  const fake = fakeSdk();
  const id = 'ca-app-pub-1234567890123456/1234567890';
  const ads = createAdService({ env: { MODE: 'native', VITE_ADS_MODE: 'production', VITE_ADMOB_IOS_INTERSTITIAL_ID: id },
    loadSdk: async () => fake.sdk });
  assert.equal(await ads.initializeAds(), true);
  await tick();
  assert.deepEqual(fake.calls.find(call => call[0] === 'prepare')[1], { adId: id, isTesting: false });
});

test('no consent means no SDK initialization or ad requests', async () => {
  const fake = fakeSdk({ canRequestAds: false });
  const ads = createAdService({ env: { MODE: 'native' }, loadSdk: async () => fake.sdk });
  assert.equal(await ads.initializeAds(), false);
  ads.noteGameOver();
  assert.equal((await ads.beforeNextRound()).shown, false);
  assert.deepEqual(fake.calls.map(call => call[0]), ['consent']);
  assert.equal(ads.privacyOptionsRequired(), true);
});

test('show promise does not resume gameplay; dismissal resumes only once', async () => {
  const fake = fakeSdk();
  const ads = createAdService({ env: { MODE: 'native' }, loadSdk: async () => fake.sdk });
  await ads.initializeAds();
  await tick();
  ads.noteGameOver();
  const pending = ads.beforeNextRound();
  assert.strictEqual(pending, ads.beforeNextRound());
  let resumed = 0;
  pending.then(() => { resumed += 1; });
  await tick();
  assert.equal(fake.calls.filter(call => call[0] === 'show').length, 1);
  assert.equal(resumed, 0);
  fake.emit('showed');
  await tick();
  assert.equal(resumed, 0);
  fake.emit('dismissed');
  fake.emit('dismissed');
  fake.emit('failed');
  assert.equal((await pending).shown, true);
  assert.equal(resumed, 1);
});

test('FailedToShow and a rejected presentation release the transition', async () => {
  for (const rejectShow of [false, true]) {
    const fake = fakeSdk();
    if (rejectShow) fake.sdk.AdMob.showInterstitial = async () => { throw new Error('cannot present'); };
    const ads = createAdService({ env: { MODE: 'native' }, loadSdk: async () => fake.sdk });
    await ads.initializeAds();
    await tick();
    ads.noteGameOver();
    const pending = ads.beforeNextRound();
    await tick();
    if (!rejectShow) fake.emit('failed');
    assert.equal((await pending).reason, 'failed');
  }
});

test('late show rejection cannot resume gameplay beneath a displayed ad', async () => {
  const fake = fakeSdk();
  const showRequest = deferred();
  fake.sdk.AdMob.showInterstitial = () => showRequest.promise;
  const ads = createAdService({ env: { MODE: 'native' }, loadSdk: async () => fake.sdk });
  await ads.initializeAds();
  await tick();
  ads.noteGameOver();
  let resumed = false;
  const pending = ads.beforeNextRound().then(result => { resumed = true; return result; });
  await tick();
  fake.emit('showed');
  showRequest.reject(new Error('late bridge error'));
  await tick();
  assert.equal(resumed, false);
  fake.emit('dismissed');
  assert.equal((await pending).shown, true);
});

test('revoked privacy consent invalidates preloaded ads', async () => {
  const fake = fakeSdk();
  const ads = createAdService({ env: { MODE: 'native' }, loadSdk: async () => fake.sdk });
  await ads.initializeAds();
  await tick();
  fake.setConsent({ canRequestAds: false });
  assert.equal(await ads.showPrivacyOptions(), true);
  assert.equal(ads.adsEnabled(), false);
  ads.noteGameOver();
  assert.equal((await ads.beforeNextRound()).shown, false);
  assert.equal(fake.calls.filter(call => call[0] === 'show').length, 0);
});

test('an offline startup retries after thirty seconds and can recover at game over', async () => {
  const fake = fakeSdk();
  let current = 0;
  let consentRequests = 0;
  const requestConsent = fake.sdk.AdMob.requestConsentInfo;
  fake.sdk.AdMob.requestConsentInfo = async () => {
    consentRequests += 1;
    if (consentRequests === 1) throw new Error('offline');
    return requestConsent();
  };
  const ads = createAdService({ env: { MODE: 'native' }, loadSdk: async () => fake.sdk,
    gateOptions: { now: () => current } });
  assert.equal(await ads.initializeAds(), false);
  current = 29_999;
  assert.equal(await ads.initializeAds(), false);
  ads.noteGameOver();
  assert.equal((await ads.beforeNextRound()).shown, false);
  assert.equal(consentRequests, 1);
  current = 30_000;
  ads.noteGameOver();
  await tick();
  assert.equal(ads.adsEnabled(), true);
  assert.equal(consentRequests, 2);
  assert.equal(fake.calls.filter(call => call[0] === 'initialize').length, 1);
});

test('SDK initialization retry retains completed consent and does not repeat its prompt', async () => {
  const fake = fakeSdk({ requiresForm: true });
  let current = 0;
  let attempts = 0;
  const consentUi = [];
  const initialize = fake.sdk.AdMob.initialize;
  fake.sdk.AdMob.initialize = async options => {
    attempts += 1;
    if (attempts === 1) throw new Error('bridge unavailable');
    return initialize(options);
  };
  const ads = createAdService({ env: { MODE: 'native' }, loadSdk: async () => fake.sdk,
    gateOptions: { now: () => current }, onConsentUiChange: active => consentUi.push(active) });
  assert.equal(await ads.initializeAds(), false);
  assert.equal(await ads.initializeAds(), false);
  assert.equal(attempts, 1);
  current = 30_000;
  assert.equal(await ads.initializeAds(), true);
  assert.equal(attempts, 2);
  assert.equal(fake.calls.filter(call => call[0] === 'consent').length, 1);
  assert.equal(fake.calls.filter(call => call[0] === 'form').length, 1);
  assert.deepEqual(consentUi, [true, false]);
  await tick();
  ads.noteGameOver();
  const transition = ads.beforeNextRound();
  await tick();
  fake.emit('showed');
  fake.emit('dismissed');
  assert.equal((await transition).shown, true);
});

test('refused consent is not requested again on connectivity retries or later rounds', async () => {
  const fake = fakeSdk({ requiresForm: true, canRequestAds: false });
  let current = 0;
  const consentUi = [];
  const ads = createAdService({ env: { MODE: 'native' }, loadSdk: async () => fake.sdk,
    gateOptions: { now: () => current }, onConsentUiChange: active => consentUi.push(active) });
  assert.equal(await ads.initializeAds(), false);
  current = 90_000;
  assert.equal(await ads.initializeAds(), false);
  ads.noteGameOver();
  assert.equal((await ads.beforeNextRound()).shown, false);
  assert.deepEqual(fake.calls.map(call => call[0]), ['consent', 'form']);
  assert.deepEqual(consentUi, [true, false]);
});

test('failed ad loads are throttled and may recover for a later round', async () => {
  const fake = fakeSdk();
  let current = 0;
  let loads = 0;
  fake.sdk.AdMob.prepareInterstitial = async () => {
    loads += 1;
    if (loads === 1) throw new Error('network unavailable');
    return { adUnitId: TEST_INTERSTITIAL_IDS.ios };
  };
  const ads = createAdService({ env: { MODE: 'native' }, loadSdk: async () => fake.sdk,
    gateOptions: { now: () => current } });
  await ads.initializeAds();
  await tick();
  ads.noteGameOver();
  assert.equal((await ads.beforeNextRound()).shown, false);
  assert.equal(loads, 1);
  current = 30_000;
  ads.noteGameOver();
  await tick();
  assert.equal(loads, 2);
});

test('consent UI pauses and releases gameplay on both success and failure', async () => {
  for (const fails of [false, true]) {
    const fake = fakeSdk({ requiresForm: true });
    const form = deferred();
    fake.sdk.AdMob.showConsentForm = () => form.promise;
    const changes = [];
    const ads = createAdService({ env: { MODE: 'native' }, loadSdk: async () => fake.sdk,
      onConsentUiChange: active => changes.push(active) });
    const initialized = ads.initializeAds();
    await tick();
    assert.deepEqual(changes, [true]);
    // The initial UMP form and manually opened privacy UI must not overlap.
    assert.equal(await ads.showPrivacyOptions(), false);
    if (fails) form.reject(new Error('form unavailable'));
    else form.resolve({ status: 'OBTAINED', canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' });
    assert.equal(await initialized, !fails);
    assert.deepEqual(changes, [true, false]);
  }
});

test('privacy UI is serialized and releases its pause even when it fails', async () => {
  const fake = fakeSdk();
  const form = deferred();
  fake.sdk.AdMob.showPrivacyOptionsForm = () => form.promise;
  const changes = [];
  const ads = createAdService({ env: { MODE: 'native' }, loadSdk: async () => fake.sdk,
    onConsentUiChange: active => changes.push(active) });
  await ads.initializeAds();
  const first = ads.showPrivacyOptions();
  assert.strictEqual(ads.showPrivacyOptions(), first);
  assert.deepEqual(changes, [true]);
  form.reject(new Error('form unavailable'));
  assert.equal(await first, false);
  assert.deepEqual(changes, [true, false]);
  assert.equal(ads.adsEnabled(), false);
});
