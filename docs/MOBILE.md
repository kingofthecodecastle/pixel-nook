# Pixel Nook for iOS and Android

These apps package the existing Vite/Canvas/Three.js game with Capacitor 8. They use the same twelve cartridges, retro graphics, controls, audio, achievements, shop and daily challenge. Web builds still go to `dist/`; bundled app builds go to `dist-native/`. No Firebase project, replacement database or second game implementation is needed.

The permanent app identifier is `ai.codecastle.pixelnook`. Native storage origins are `capacitor://localhost` on iOS and `https://localhost` on Android. Do not change the app identifier, hostname or schemes after players begin using a release: that can detach the app from its existing save data.

## Local build

Use Node 22+, the checked-in lockfile and the platform tools described in [Capacitor's environment setup](https://capacitorjs.com/docs/getting-started/environment-setup). iOS requires Xcode; the generated project targets iOS 15+. Android requires Android SDK 36 and a JDK compatible with Capacitor 8 (JDK 21), with a minimum supported device API of 24. Keep package installation, builds, tests and emulator work serial on this Mac.

```sh
npm ci
cp .env.native.example .env.native.local
npm run native:sync
npm run native:ios
```

For Android, use `npm run native:android` after the same sync. `npm run android:debug` creates an APK and automatically uses the project-local Java/Android tools under ignored `.tools/` when available; `npm run android:bundle` requires complete release configuration and secure signing variables. `native:sync` builds local game assets, generates native AdMob configuration and copies the assets/plugins to both native projects. It does not publish the website or upload to either store. Use the stable production API URL, not a temporary protected preview deployment.

By default these are **test-ad builds**. Google's public demo identifiers do not generate revenue. The generated app identifiers are written to ignored `ios/App/Config/Ads.local.xcconfig` and `android/app/src/main/res/values/admob.local.xml`. The tracked iOS config has a demo fallback. Regenerate local native configuration after changing ad settings.

## Save preservation and moving from the website

The existing keys remain unchanged: `pixelnook_hs_*`, `pixelnook_progress`, `pixelnook_initials`, and all other `pixelnook_*` settings. Native Preferences backs up local saves; the original keys remain the game's storage interface. Neither game initialization nor native sync should clear storage. The API uses the existing Neon `scores` table; the former startup deletion of old `TST` rows has been removed.

Safari/Chrome website storage and an installed app's storage are isolated. Capacitor cannot automatically read the old browser saves. To transfer them:

1. Open the updated Pixel Nook website in the browser/profile where the original progress exists.
2. Export a save from the save-transfer controls and keep the downloaded JSON as a backup.
3. Open the installed app and import that file using its save-transfer controls.
4. Check initials, local highscores, coins, achievements, themes and skins before discarding any backup.

Import merges existing data and creates a complete backup first; it does not reset local keys or upload old local scores into the public leaderboard. Keep an exported copy when replacing devices or uninstalling: app uninstall can remove native storage, and OS backups are not a guarantee. Browser/device profiles must each export their own local saves. Global scores stay in the same server database and need no migration.

## Shared leaderboard and server access

The public setting `VITE_SCORES_API_URL` is an absolute HTTPS endpoint for native builds, currently `https://pixel-nook-tawny.vercel.app/api/scores`. Regular web builds retain `/api/scores` unless explicitly configured otherwise. `DATABASE_URL`, `POSTGRES_URL` and other server credentials stay in Vercel's secure server environment. Never put them, signing keys or auth tokens in a variable beginning with `VITE_`; Vite embeds those values in the shipped app.

The API permits native `capacitor://localhost` and `https://localhost` origins and ordinary same-origin website requests. Optional server-only `SCORES_ALLOWED_ORIGINS` accepts a comma-separated list of exact additional HTTPS origins; no wildcard is enabled. OPTIONS is handled before any database contact. GET, POST and error responses include appropriate CORS headers and `Vary: Origin`. CORS does not authenticate scores: existing score validation, ceilings and rate limits remain active.

Deploy the API changes to the existing Vercel project before distributing apps. Verify access from an unauthenticated client; do not ship a Vercel protection-bypass token in a client URL. Protected previews can remain protected. The public production API must accept the app's origins, including JSON POST preflight, and Vercel's server function must retain its existing Neon environment variables.

These checks do not insert test scores:

```sh
curl --fail-with-body -i -X OPTIONS \
  -H 'Origin: capacitor://localhost' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' \
  'https://pixel-nook-tawny.vercel.app/api/scores'

curl --fail-with-body -i -X OPTIONS \
  -H 'Origin: https://localhost' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' \
  'https://pixel-nook-tawny.vercel.app/api/scores'

curl --fail-with-body -i -H 'Origin: capacitor://localhost' \
  'https://pixel-nook-tawny.vercel.app/api/scores?game=snake'
```

Expect 204 and the exact allowed origin for each preflight, then 200 and JSON for GET. A login page, 401/403, unexpected redirect or missing CORS header blocks app access even if the browser website works. Do not disable score validation or delete scores to investigate an access problem.

## Managed advertising

Google AdMob supplies ads, reporting and payouts on both iOS and Android. It is separate from App Store/Google Play publishing and in-app purchases. The account owner still sets up payout/identity details, registers both apps, creates an interstitial unit for each, and publishes the required privacy/consent messages. The integration uses `@capacitor-community/admob`; its native Google SDKs are already dependencies, so do not add a second manual SDK installation.

After a completed round, the next restart/launch can display a prepared interstitial before gameplay resumes. There is no ad on the first launch or in an active round. Saves finish before the transition, double presses share one transition, and the next round waits for the SDK's close/failure event. Missing consent, offline/no-fill, or an ad that cannot be prepared within the loading deadline lets play continue. Default spacing is 60 seconds between shown ads (`VITE_ADS_COOLDOWN_SECONDS`); the implementation enforces a minimum of 30 seconds to avoid repeated ads after very short rounds.

AdMob controls ad duration, video progress and skip/close UI. The SDK does not expose interstitial video progress, so the app does not draw a misleading 5–10-second countdown over the ad. The app's own short loading indicator concerns preparation only. In AdMob, disable **High-engagement ads** for shorter standard ad skip times; Google currently describes skip within five seconds with this setting off. That setting does not guarantee a fixed total ad length and does not govern every third-party bidding source. See [Google's duration setting](https://support.google.com/admob/answer/15525707) and [interstitial placement guidance](https://support.google.com/admob/answer/6201362).

UMP consent is refreshed at app start. The SDK initializes and loads ads only when `canRequestAds` permits it. Native measurement initialization is delayed, and required privacy options can be reopened from the app. Configure GDPR/EEA and any IDFA/ATT messages in AdMob; do not add a duplicate tracking prompt. Test refusal, consent changes, offline startup and interruption by backgrounding the app. The app does not reset users' consent choices. See [Google UMP guidance](https://developers.google.com/admob/android/privacy/gdpr) and the [plugin's consent flow](https://github.com/capacitor-community/admob/blob/main/docs/consent.md).

The iOS target includes `GADApplicationIdentifier`, the Google SKAdNetwork list retrieved from the [official setup page](https://developers.google.com/admob/ios/quick-start) on 2026-11-06, and a tracking-purpose string. The privacy manifest includes the required API reasons for [Preferences](https://capacitorjs.com/docs/apis/preferences) (`CA92.1`) and [Filesystem](https://capacitorjs.com/docs/apis/filesystem) (`C617.1`). This file does not replace App Store privacy disclosures or the Google Play Data safety form, which must describe the final SDK configuration and data use.

## Production configuration and signing

Use `.env.native.local` locally or a secure CI environment; do not commit real account configuration or credentials. App IDs and unit IDs are public identifiers that must reach the app, while server credentials and signing material must not.

| Setting | Purpose |
| --- | --- |
| `VITE_ADS_MODE=production` | Enable configured live units |
| `ADMOB_IOS_APP_ID` | iOS AdMob app identifier, containing `~` |
| `ADMOB_ANDROID_APP_ID` | Android AdMob app identifier, containing `~` |
| `VITE_ADMOB_IOS_INTERSTITIAL_ID` | iOS interstitial unit identifier, containing `/` |
| `VITE_ADMOB_ANDROID_INTERSTITIAL_ID` | Android interstitial unit identifier, containing `/` |
| `VITE_SCORES_API_URL` | Public HTTPS leaderboard endpoint |

Production configuration fails when app/unit IDs are absent, malformed, Google demo IDs, or from mismatched publishers on one platform. Run `npm run native:sync`, then `node scripts/validate-native-release.mjs`. The validator compares the built public metadata and all three asset copies, checks generated native app IDs and scans text bundles for recognized credential patterns. It is a practical leak check, not a proof that every possible secret is absent. Both platform release builds run this check; debug builds remain available with demo ads.

For iOS, select Codecastle's Apple Developer team in Xcode, register/confirm the `ai.codecastle.pixelnook` bundle ID and create the App Store Connect app. Keep certificates/private keys in Keychain or secure CI signing storage, then archive and upload through Xcode. `NODE_BINARY` can point to Node if Xcode cannot find it. Changing the signing team or bundle ID after release can affect upgrades and saved data, so settle ownership before distribution.

For Android, keep the upload keystore outside the repository and provide these environment variables to the release build:

- `PIXELNOOK_ANDROID_KEYSTORE_PATH`
- `PIXELNOOK_ANDROID_STORE_PASSWORD`
- `PIXELNOOK_ANDROID_KEY_ALIAS`
- `PIXELNOOK_ANDROID_KEY_PASSWORD`

The Gradle release task refuses missing signing values rather than signing a production build with a debug key. After native sync and release validation, build `bundleRelease` using the checked-in Gradle wrapper, then upload the AAB to Google Play Console. Enable Play App Signing and preserve the upload key securely. No signing material is created or uploaded by native sync.

Before the first monetized release, finish these account-owned items together: Apple team and App Store record, Google Play application and upload signing, both live AdMob apps/units and payouts, consent messages, privacy-policy/support URLs, app-ads.txt using AdMob's supplied publisher record, store age/content ratings and ad declarations, screenshots and review information. Store submission and account/payment verification remain separate from building the project.

## Verification before distribution

Run repository tests and web/native builds serially. On real iOS and Android devices, verify every cartridge, 2D/3D camera modes, touch and gamepad controls, audio, pause/background/resume, scores, daily challenge and shop. Test save export/import against existing progress, then update over an installed build and confirm saves survive. With demo ads verify first-round exemption, game-over restart, switching cartridges after a completed round, repeated restart taps, offline/no-fill, close/failure, and privacy changes. Check safe areas in both orientations. Use actual gameplay for server submissions; never manufacture leaderboard test rows that would later need deletion.
