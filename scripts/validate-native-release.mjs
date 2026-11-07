import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { loadEnv } from 'vite';
import { resolveNativeAdConfig } from './configure-native.mjs';

const root = process.cwd();
const env = { ...loadEnv('native', root, ''), ...process.env };
const sensitiveContent = [
  /postgres(?:ql)?:\/\//i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bsk_(?:live|test)_[A-Za-z0-9]{16,}/,
];

async function inspectBundle(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) { await inspectBundle(path); continue; }
    if (!['.js', '.html', '.json', '.css', '.map'].includes(extname(path))) continue;
    if ((await stat(path)).size > 10 * 1024 * 1024) throw new Error(`Bundle file exceeds the 10 MB inspection limit: ${path}`);
    const text = await readFile(path, 'utf8');
    if (sensitiveContent.some((pattern) => pattern.test(text))) throw new Error(`Possible server credential found in ${path}. Remove it and rebuild.`);
  }
}

try {
  if (env.VITE_ADS_MODE !== 'production') throw new Error('A monetized release requires VITE_ADS_MODE=production. Test/off builds are for development.');
  for (const key of Object.keys(env)) {
    if (key.startsWith('VITE_') && /DATABASE|POSTGRES|SECRET|TOKEN|PASSWORD|PRIVATE_KEY|SERVICE_ROLE|SIGNING/.test(key)) {
      throw new Error(`Remove sensitive public build variable ${key}; VITE_ values are embedded in the app.`);
    }
  }
  const config = resolveNativeAdConfig(env);
  const expected = {
    adsMode: 'production',
    scoresApiUrl: new URL(env.VITE_SCORES_API_URL || 'https://pixel-nook-tawny.vercel.app/api/scores').href,
    iosInterstitialId: env.VITE_ADMOB_IOS_INTERSTITIAL_ID,
    androidInterstitialId: env.VITE_ADMOB_ANDROID_INTERSTITIAL_ID,
  };
  for (const directory of ['dist-native', 'ios/App/App/public', 'android/app/src/main/assets/public']) {
    const metadata = JSON.parse(await readFile(resolve(root, directory, 'native-build.json'), 'utf8'));
    for (const [key, value] of Object.entries(expected)) {
      if (metadata[key] !== value) throw new Error(`${directory} has outdated ${key}; run npm run native:sync with release configuration.`);
    }
    await inspectBundle(resolve(root, directory));
  }
  const ios = await readFile(resolve(root, 'ios/App/Config/Ads.local.xcconfig'), 'utf8');
  const android = await readFile(resolve(root, 'android/app/src/main/res/values/admob.local.xml'), 'utf8');
  if (!ios.includes(`ADMOB_APP_ID = ${config.ios}\n`) || !ios.includes('PIXELNOOK_ADS_MODE = production')) throw new Error('iOS AdMob configuration is stale. Run native:configure.');
  if (!android.includes(`>${config.android}</string>`) || !android.includes('>production</string>')) throw new Error('Android AdMob configuration is stale. Run native:configure.');
  console.log('Release configuration and all three asset copies match. No recognized server credentials found. Device, signing and store checks remain required.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
