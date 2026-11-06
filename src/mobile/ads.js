import { createInterstitialGate } from './interstitial-gate.js';

// Google's public demo units: these never earn advertising revenue.
export const TEST_INTERSTITIAL_IDS = Object.freeze({
  ios: 'ca-app-pub-3940256099942544/4411468910',
  android: 'ca-app-pub-3940256099942544/1033173712',
});

function productionAdId(value) {
  return typeof value === 'string'
    && /^ca-app-pub-\d{16}\/\d{10}$/.test(value)
    && !value.startsWith('ca-app-pub-3940256099942544/');
}

async function loadNativeSdk() {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return null;
  const sdk = await import('@capacitor-community/admob');
  return { ...sdk, platform: Capacitor.getPlatform() };
}

/** Injectable to test native SDK lifecycle and consent without live ad traffic. */
export function createAdService({
  env = {},
  loadSdk = loadNativeSdk,
  gateOptions = {},
  canPresent = () => typeof document === 'undefined' || !document.hidden,
  onConsentUiChange = active => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pixelnook-consent-ui', { detail: { active } }));
    }
  },
} = {}) {
  const mode = env.VITE_ADS_MODE || 'test';
  const configured = env.MODE === 'native' && ['test', 'production'].includes(mode);
  let sdk;
  let adId;
  let consent;
  let startup;
  let starting = false;
  let consentResolved = false;
  let retryStartupAt = 0;
  let retryPreparationAt = 0;
  const now = gateOptions.now || (() => Date.now());
  const retryDelayMs = 30_000;
  let sdkInitialization;
  let initialized = false;
  let prepared = false;
  let generation = 0;
  let presentation = null;
  let privacyUpdate = null;
  const handles = [];

  async function withConsentUi(action) {
    // A delayed network response must not put a consent dialog over another app.
    if (!canPresent()) throw new Error('Consent UI deferred while backgrounded');
    try {
      onConsentUiChange(true);
      return await action();
    } finally {
      onConsentUiChange(false);
    }
  }

  function retryStartupLater() {
    startup = undefined;
    retryStartupAt = now() + retryDelayMs;
  }

  function finishPresentation(reason) {
    if (!presentation) return;
    const current = presentation;
    presentation = null;
    current.resolve(reason);
  }

  async function initializeSdk() {
    if (!consent?.canRequestAds || !sdk || !adId) return false;
    if (!sdkInitialization) {
      sdkInitialization = (async () => {
        const events = sdk.InterstitialAdPluginEvents;
        handles.push(await sdk.AdMob.addListener(events.Showed, () => {
          if (!presentation || presentation.shown) return;
          presentation.shown = true;
          presentation.onShown();
        }));
        handles.push(await sdk.AdMob.addListener(events.Dismissed, () => finishPresentation('dismissed')));
        handles.push(await sdk.AdMob.addListener(events.FailedToShow, () => finishPresentation('failed')));
        await sdk.AdMob.initialize({
          initializeForTesting: mode === 'test',
          // General audience creatives; this does not claim the app targets kids.
          maxAdContentRating: sdk.MaxAdContentRating.General,
        });
        initialized = true;
        return true;
      })().catch(async error => {
        for (const handle of handles.splice(0)) await handle.remove().catch(() => {});
        sdkInitialization = undefined;
        throw error;
      });
    }
    return sdkInitialization;
  }

  async function start() {
    if (!configured) return false;
    if (privacyUpdate || now() < retryStartupAt) return false;
    if (!startup) {
      starting = true;
      startup = (async () => {
        sdk ||= await loadSdk();
        if (!sdk || !['ios', 'android'].includes(sdk.platform)) return false;
        const configuredId = sdk.platform === 'ios'
          ? env.VITE_ADMOB_IOS_INTERSTITIAL_ID
          : env.VITE_ADMOB_ANDROID_INTERSTITIAL_ID;
        adId = mode === 'test' ? TEST_INTERSTITIAL_IDS[sdk.platform]
          : productionAdId(configuredId) ? configuredId : undefined;
        if (!adId) return false; // Fail closed on incomplete production configuration.

        // UMP owns the GDPR/IDFA prompts configured in AdMob. Never reset consent.
        // A completed consent choice, including refusal, survives SDK retries.
        // Only a failed consent operation is requested again in this session.
        if (!consentResolved) {
          consent = await sdk.AdMob.requestConsentInfo();
          if (consent.isConsentFormAvailable && consent.status === sdk.AdmobConsentStatus.REQUIRED) {
            consent = await withConsentUi(() => sdk.AdMob.showConsentForm());
          }
          consentResolved = true;
        }
        return await initializeSdk();
      })().catch(() => {
        retryStartupLater();
        return false;
      }).finally(() => { starting = false; });
    }
    return startup;
  }

  const gate = createInterstitialGate({
    ...gateOptions,
    canPresent,
    cooldownMs: Number(env.VITE_ADS_COOLDOWN_SECONDS || 60) * 1000,
    adapter: {
      async prepare() {
        await start();
        if (!initialized || !consent?.canRequestAds || privacyUpdate || presentation || now() < retryPreparationAt) return false;
        const requestedGeneration = generation;
        try {
          await sdk.AdMob.prepareInterstitial({ adId, isTesting: mode === 'test' });
          prepared = requestedGeneration === generation && !!consent?.canRequestAds;
          return prepared;
        } catch {
          prepared = false;
          retryPreparationAt = now() + retryDelayMs;
          return false;
        }
      },
      show({ onShown }) {
        if (!prepared || !consent?.canRequestAds || privacyUpdate || presentation || !canPresent()) {
          return Promise.resolve('unavailable');
        }
        prepared = false;
        return new Promise(resolve => {
          const current = { resolve, onShown, shown: false };
          presentation = current;
          // Resolving showInterstitial means presentation was requested, not dismissed.
          // A late rejected request cannot release gameplay after Showed fired.
          Promise.resolve().then(() => {
            if (!canPresent()) { finishPresentation('background'); return; }
            return sdk.AdMob.showInterstitial({ adId });
          }).catch(() => {
            if (presentation === current && !current.shown) finishPresentation('failed');
          });
        });
      },
    },
  });

  async function initializeAds() {
    await start();
    const available = initialized && !!consent?.canRequestAds;
    if (available) void gate.preload();
    return available;
  }

  function privacyOptionsRequired() {
    return !!consent && consent.privacyOptionsRequirementStatus === sdk?.PrivacyOptionsRequirementStatus.REQUIRED;
  }

  function showPrivacyOptions() {
    if (privacyUpdate) return privacyUpdate;
    if (!sdk || !consent || presentation || starting) return Promise.resolve(false);
    generation += 1;
    prepared = false;
    gate.invalidate();
    privacyUpdate = (async () => {
      try {
        await withConsentUi(() => sdk.AdMob.showPrivacyOptionsForm());
        consent = await sdk.AdMob.requestConsentInfo();
        consentResolved = true;
        if (consent.canRequestAds && now() >= retryStartupAt) {
          try { await initializeSdk(); }
          catch { retryStartupLater(); }
        }
        return true;
      } catch {
        // Do not continue advertising with stale consent after a failed refresh.
        consent = { ...consent, canRequestAds: false };
        consentResolved = false;
        retryStartupLater();
        return false;
      }
    })().finally(() => { privacyUpdate = null; });
    return privacyUpdate;
  }

  return {
    initializeAds,
    showPrivacyOptions,
    privacyOptionsRequired,
    adsEnabled: () => configured && initialized && !!consent?.canRequestAds,
    noteGameOver() {
      gate.noteGameOver();
      if (canPresent()) void gate.preload();
    },
    beforeNextRound: gate.beforeNextRound,
  };
}

// Select only the public ad settings we use. Passing the whole import.meta.env
// object would embed every unrelated VITE_* setting in the shipped bundle.
const ads = createAdService({ env: {
  MODE: import.meta.env?.MODE,
  VITE_ADS_MODE: import.meta.env?.VITE_ADS_MODE,
  VITE_ADMOB_IOS_INTERSTITIAL_ID: import.meta.env?.VITE_ADMOB_IOS_INTERSTITIAL_ID,
  VITE_ADMOB_ANDROID_INTERSTITIAL_ID: import.meta.env?.VITE_ADMOB_ANDROID_INTERSTITIAL_ID,
  VITE_ADS_COOLDOWN_SECONDS: import.meta.env?.VITE_ADS_COOLDOWN_SECONDS,
} });
export const initializeAds = ads.initializeAds;
export const showPrivacyOptions = ads.showPrivacyOptions;
export const privacyOptionsRequired = ads.privacyOptionsRequired;
export const adsEnabled = ads.adsEnabled;
export const noteGameOver = ads.noteGameOver;
export const beforeNextRound = ads.beforeNextRound;

// Connectivity recovery only prepares future ads; it never presents one.
// start() throttles exception retries and preserves completed consent choices.
if (import.meta.env?.MODE === 'native' && typeof window !== 'undefined') {
  window.addEventListener('online', () => { void initializeAds(); });
}
