import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  if (mode === 'native') {
    const url = new URL(env.VITE_SCORES_API_URL || 'https://pixel-nook-tawny.vercel.app/api/scores');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/api/scores') {
      throw new Error('VITE_SCORES_API_URL must be a public HTTPS /api/scores URL without credentials.');
    }
    if (!['test', 'production', 'off'].includes(env.VITE_ADS_MODE || 'test')) throw new Error('Invalid VITE_ADS_MODE');
    if (env.VITE_ADS_MODE === 'production') {
      for (const key of ['VITE_ADMOB_IOS_INTERSTITIAL_ID', 'VITE_ADMOB_ANDROID_INTERSTITIAL_ID']) {
        if (!/^ca-app-pub-\d{16}\/\d{10}$/.test(env[key] || '') || env[key].includes('3940256099942544')) throw new Error(`Set a live ${key} in secure build configuration.`);
      }
    }
    return {
      base: './',
      plugins: [{
        name: 'native-build-metadata',
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'native-build.json', source: JSON.stringify({
            adsMode: env.VITE_ADS_MODE || 'test', scoresApiUrl: url.href,
            iosInterstitialId: env.VITE_ADMOB_IOS_INTERSTITIAL_ID || '',
            androidInterstitialId: env.VITE_ADMOB_ANDROID_INTERSTITIAL_ID || '',
          }, null, 2) });
        },
      }],
      define: { 'import.meta.env.VITE_SCORES_API_URL': JSON.stringify(url.href) },
      build: { outDir: 'dist-native', target: 'es2022' },
    };
  }
  return { build: { target: 'es2022' } };
});
