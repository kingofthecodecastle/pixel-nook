# Pixel Nook — store privacy review

Reviewed 7 November 2026. **Working submission worksheet, not a submitted declaration or published privacy policy.** This review covers the existing leaderboard, local saves, Capacitor plugins and the planned monetized native app. No forms were submitted, account settings changed or scores modified during this review.

The owner must confirm the final AdMob configuration, audience, publisher identity, support contact and retention/deletion practices. The answers below distinguish observed implementation from suggested classifications and unresolved decisions. Check the final signed archive/AAB again; a debug build is evidence about included SDKs, not proof of every production data flow.

## 1. What the implementation actually does

| Component | Observed behavior | Evidence |
| --- | --- | --- |
| Local saves | Highscores, progress/coins/unlocks/daily challenge, initials and preferences retain the existing `pixelnook_*` keys. Native Preferences mirrors them on the device. | `src/storage.js`, `src/progress.js`, `src/mobile/persistence-store.js` |
| Browser → app transfer | User explicitly exports/imports JSON. Imports keep recovery copies. Native export writes to app cache and opens the OS share sheet; the chosen destination may be another app or cloud service. There is no automatic developer-operated cloud save upload. | `src/save-transfer.js`, `src/save-transfer-ui.js` |
| Platform backups | Android's manifest sets `allowBackup=true`. OS backup behavior therefore needs qualification: do not promise that all saves can only ever exist on the physical device. Export files can also outlive the app. | `android/app/src/main/AndroidManifest.xml` |
| Leaderboard reads | The cabinet fetches the public leaderboard automatically. Requests necessarily expose standard connection metadata to hosting infrastructure. The game does not store raw IP in its `scores` table. Hosting/network log practices were not inspected here. | `src/main.js` → `fetchAll()`, `src/online.js`, `api/scores.js` |
| Leaderboard submission | SUBMIT sends game ID, three chosen letters/digits and score; SKIP is available. The server stores those values, a timestamp and a stable 32-hex SHA-256-derived IP hash. The top ten initials/scores for each game are public. The initials are a pseudonym, not an authenticated account or verified legal name. | `src/main.js` → `openInitials()`, `src/online.js` → `submitScore()`, `api/scores.js` |
| Server retention | There is no automatic deletion/expiry in the current score handler. The one-minute/one-hour intervals are rate-limit queries, **not retention periods**. Removal of the old test-row cleanup preserves existing scores. | `api/scores.js` |
| IP hash | It uses the IP plus a fixed app prefix and optional project value. Hashing does not demonstrate anonymization or unlinkability. Multiple submissions can retain the same hash. | `api/scores.js` → `ipHash()` |
| Ads/consent | Native builds use Google Mobile Ads and UMP. Consent information is requested before ad initialization. Ad initialization and loading require `canRequestAds`. Failed consent/SDK operations retry with backoff; completed choices are not reset. | `src/mobile/ads.js` |
| Consent network traffic | UMP's consent lookup is itself a Google SDK operation before ad initialization. The statement “nothing is sent before consent” is not supported. Ad refusal also does not make leaderboard requests disappear. | `src/mobile/ads.js`; UMP manifest below |
| Privacy controls | AD PRIVACY opens UMP's privacy options when available. The current flow does not implement a global, every-region switch that disables all Google data collection. | `src/main.js`, `src/mobile/ads.js` |
| Audience configuration | The app sets maximum ad content rating to General. It does not set child-directed/under-age-of-consent flags or implement an age screen. A creative rating is not an audience declaration. | `src/mobile/ads.js` |
| Other app features | The inspected flow has no app-account registration, purchases, payment details, contact/address-book access, microphone recording, camera capture or GPS request. Coins are earned in gameplay. No Firebase analytics/crash package is declared. Google ad SDK diagnostics still count. | `package.json`, native manifests, `src/main.js`, `src/progress.js` |
| Transport | Score requests and the Neon HTTP endpoint use HTTPS; Android disables cleartext traffic. Database and signing credentials remain server/build configuration. AdMob app/unit IDs are public identifiers, not secrets. | `src/api-url.js`, `api/scores.js`, native config |

These are code observations. They do not establish the hosting providers' log retention, contractual roles, data residency, a legal retention basis, or how the owner handles support correspondence.

## 2. The SDKs actually present in the inspected build

The iOS simulator app inspected was `/tmp/pixelnook-ios-build/Build/Products/Debug-iphonesimulator/App.app`. Its framework Info.plists confirm Google Mobile Ads **13.11.0** and UMP **3.1.0**, consistent with the checked-in Swift Package resolution. The Android plugin declares Google Ads **25.4.+** and UMP **4.0.0**; the precise resolved Android Ads patch version must be recorded from the final release dependency/artifact report. A dynamic patch dependency can change independently of the JavaScript lockfile.

The source privacy manifest contains the app's required-reason API declarations for UserDefaults (`CA92.1`) and file timestamps (`C617.1`). It does not enumerate the first-party leaderboard collection. Include that collection separately in the store answers and consider recording it in the app manifest so the aggregate report is complete.

### Observed iOS framework manifest declarations

The following values come from the **13.11.0 framework actually embedded in the simulator app**, not from guessing what the current documentation's newest release does. “Ad purposes” below means the manifest lists Third-Party Advertising, Developer Advertising and Analytics.

| Google Mobile Ads data type | Linked | Tracking | Declared purposes |
| --- | --- | --- | --- |
| Other Diagnostic Data | No | No | Ad purposes |
| Coarse Location | Yes | No | Ad purposes |
| Performance Data | No | No | Ad purposes |
| Crash Data | No | No | Analytics |
| Advertising Data | Yes | No | Ad purposes |
| Product Interaction | Yes | No | Ad purposes |
| Device ID | Yes | **Yes** | Ad purposes |

UMP 3.1.0 additionally declares Coarse Location, Performance Data and Product Interaction, each unlinked/nontracking and used for App Functionality. When a data type appears in several components, the app's answer must account for all relevant uses; UMP's unlinked declaration does not cancel the ad SDK's linked collection.

Google's [iOS disclosure guidance](https://developers.google.com/admob/ios/privacy/data-disclosure) currently describes 13.12.0 and covers ad identifiers, advertising/interactions, location and diagnostics. Its published guidance and the installed version must be reconciled if the SDK changes. Generate the final archive's report through Xcode Organizer; Apple's [privacy-manifest guidance](https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests) describes the aggregate report. Do not remove a legitimate SDK manifest to obtain a smaller label.

### Observed Android merged permissions

`android/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml` includes:

- `com.google.android.gms.permission.AD_ID`
- `android.permission.ACCESS_ADSERVICES_AD_ID`
- `android.permission.ACCESS_ADSERVICES_ATTRIBUTION`
- `android.permission.ACCESS_ADSERVICES_TOPICS`
- Internet/network-state permissions and SDK supporting components.

The source app manifest's short permission list is therefore not the final permission inventory. The merged manifest has no GPS/camera/microphone permission in the inspected build. Google explains that SDK dependencies can merge `AD_ID` automatically in its [Advertising ID guidance](https://support.google.com/googleplay/android-developer/answer/6048248). Do not answer “no Advertising ID” for this build merely because the app's own JavaScript never requests one.

## 3. App Store Connect draft mapping

**Top-level answer: data is collected.** Both the public leaderboard and embedded advertising/consent SDKs prevent a “Data Not Collected” declaration. Apple includes third-party SDK behavior, treats retained off-device data as collection and requires linked/tracking answers per type. See [App privacy details](https://developer.apple.com/app-store/app-privacy-details/).

| Data/use | Working category and purpose | Review state |
| --- | --- | --- |
| Submitted game/score/timestamp | User Content → Gameplay Content; App Functionality | Observed; declare. |
| Chosen public initials | Identifiers → User ID is the conservative draft mapping for a screen-name-like pseudonym; App Functionality | Classification to confirm in the current form. Do not label them a verified real name. |
| Retained IP-derived rate-limit identifier | Other Data Types / network identifier; App Functionality (fraud/abuse prevention) | Confirm the console's best-fitting identifier category. Do not claim anonymization. |
| Linkage of the preceding first-party records | Treat as linked for the draft: submitted initials/score/hash are stored together and no pre-collection unlinking is implemented | Owner must verify any less conservative answer. |
| First-party score tracking | No cross-company advertising linkage is implemented for score data; it is not passed to AdMob by our code | Verify hosting/account practices; this does not mean the app as a whole is nontracking. |
| AdMob and UMP data | Use the observed SDK table above as the baseline; add all applicable purposes, linkage and tracking to the same categories | Regenerate from the final archive and verify production settings. |
| Device ID tracking | **Yes is the supported default for the planned advertising build**: the installed Google manifest explicitly marks it true | A no-tracking variant requires deliberate SDK/account configuration and verification; do not simply change the form answer. |
| Local save/progress and user-exported file | Not developer cloud collection through the implemented save flow | Explain on-device storage, OS backups and user-directed sharing in the policy. |
| Support requests | Customer Support, plus actual contact fields retained through email | Public support/privacy email is implemented as `kingdom@codecastle.ai`; mailbox handling and retention still need owner verification. There is no new contact form. |

The native plist supplies the ATT purpose string, but that string does not itself cause a prompt or prove the account is configured. The current code delegates any IDFA/ATT message to UMP; set up and test that message before serving tracking ads. Respect refusal and do not add an unnecessary duplicate prompt. [Google's IDFA flow](https://developers.google.com/admob/ios/privacy/idfa) explains the UMP integration.

The public privacy-policy link must appear both in App Store Connect and in an accessible app location. AD PRIVACY opens consent controls and is **not** a replacement for the written policy. Apple's [review rules](https://developer.apple.com/app-store/review/guidelines/#privacy) require the policy to describe collection, purposes, sharing and retention/deletion. A working support page must use verified contact information; see [App Store support metadata](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information).

## 4. Google Play draft mapping

**Top-level answers for the planned live-ad build: collects data = Yes; shares data = Yes; contains ads = Yes; uses Advertising ID = Yes.** The last answer follows the merged manifest and the active Google ad integration, not the source manifest alone.

Google's [Android SDK disclosure](https://developers.google.com/admob/android/privacy/play-data-disclosure), currently written for 25.5.0, identifies IP-derived approximate location, app interactions, diagnostics and device/account identifiers as collected/shared for advertising, analytics and fraud prevention. It states that SDK data is encrypted in transit. Reconcile this with the final resolved 25.4.x or updated SDK; add any extra mediation SDK behavior if adapters are enabled.

| Data/use | Draft Play type | Collected/shared and purpose |
| --- | --- | --- |
| Submitted initials | Personal info → User IDs (pseudonym) | Collected, optional submission, App functionality. Public display is user-initiated; evaluate Play's user-directed sharing exception rather than claiming the data stays private. |
| Submitted game/score/time | App activity → Other actions | Collected, optional submission, App functionality. Same public-display consideration. |
| Stable IP-derived submission hash | Device or other IDs | Collected for Fraud prevention, security and compliance; accompanies a chosen submission. Infrastructure log handling requires separate verification. |
| AdMob IP-derived coarse location | Approximate location | Collected/shared for the SDK purposes above. This does not require a GPS permission. |
| AdMob identifiers | Device or other IDs | Collected/shared; Advertising or marketing, Analytics, Fraud prevention/security/compliance as applicable. |
| Ad interactions | App activity → App interactions | Collected/shared for the SDK purposes above. |
| SDK diagnostics | App info and performance → Diagnostics; include Crash logs/Other app performance data where the resolved SDK guidance/artifact supports them | Collected/shared; reconcile exact subtype selections with the final SDK. |
| UMP consent activity | Map consent/interaction/device or regional data according to the installed UMP disclosures and production message configuration | App functionality; don't omit UMP because it runs before the ad SDK. |
| Game saves and export | Local-only processing through this code is not a developer server upload | Do not declare cloud-save collection that does not exist. Explain user-directed export and OS backup limitations. |

Required/optional answers need particular care. The leaderboard SUBMIT/SKIP choice supports optional first-party submission. The current UMP flow does **not** prove every user in every region can opt out of every ad/consent data type. Default those automatically collected SDK types to required until a verified global control supports otherwise. Google makes optional collection conditional on that choice being available to all users in its [Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469). Do not call retained scores, IP hashes or ad profiles ephemeral.

“Encrypted in transit” is supported for our HTTPS paths and Google's documented SDK transport; confirm any added vendors before answering for the whole app. The game has no account creation, so the account-creation answer is No for the inspected code. This does not eliminate data-deletion questions or the need to describe actual retention. Do not claim a deletion mechanism, deadline or retention exemption until it is operational. [Google account-deletion scope](https://support.google.com/googleplay/android-developer/answer/13327111).

The policy must be public, readable without sign-in, accessible from the app, and identify the app/developer and privacy contact. It must describe retention, deletion and providers; use an HTML page rather than a PDF or editable document. [Google User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311).

## 5. Publisher choices that code cannot settle

| Decision/evidence needed | Why it changes the submission |
| --- | --- |
| Store publisher ownership and monitored support/privacy contact | The official CodeCastle website identifies CodeCastle AS, Norway and `kingdom@codecastle.ai`; the prepared pages use these verified public details. Confirm the store accounts use the intended entity and the mailbox is monitored. No street address or response-time promise is invented. |
| Target ages and countries | General ad content rating is not a child-audience solution. If children are included, review age screening, child/under-age flags, eligible SDKs and ads before selecting Families/Kids answers. [Google Families policy](https://support.google.com/googleplay/android-developer/answer/9893335). |
| Personalized/limited ads, ATT and regional UMP messages | Determines real tracking/consent behavior. `canRequestAds` is a gate, not evidence of a particular dashboard configuration. |
| Any mediation, bidding, optional ad reporting or additional analytics | Adds vendors/data flows to both declarations and policy. None are asserted configured by this worksheet. |
| Retention/deletion practice for leaderboard, hosting logs, backups and support | Source currently retains score rows without expiry. Decide a truthful process; preserve existing data unless a separate, specific deletion is authorized. Do not silently add cleanup to make a policy sentence true. |
| Hosting agreements/access and logs | The code identifies Vercel/Neon as the backend path but does not verify account retention, subprocessor arrangements or data residency. |
| Real AdMob publisher ID and store-app linkage | Needed for app-ads.txt and verification; app IDs (`~`) and unit IDs (`/`) are not the seller-record publisher ID format. |

## 6. Policy, support and app-ads.txt preparation

Prepared in this implementation:

- `public/privacy.html`, `public/support.html` and shared `public/legal.css`, with accessible retro styling and relative local links for web/native copies.
- CodeCastle AS, Norway and `kingdom@codecastle.ai`, independently confirmed against the [official CodeCastle website](https://codecastle.ai/). No street address, support response deadline or store-account ownership was inferred from that page.
- Cabinet footer links to `./privacy.html` and `./support.html`, alongside the separate AD PRIVACY consent control.
- An explicit initials prompt: SUBMIT makes initials and score public; SKIP keeps the score on the device.
- Vercel routes for `/privacy`, `/support` and `/app-ads.txt`, with the real HTML/CSS resources excluded from the general SPA fallback.

The written policy describes local progress/native mirroring, possible OS backup, user-directed export, public submitted scores and the retained IP-derived abuse identifier. It names Vercel, Neon and Google ad/consent services; explains AD PRIVACY; and provides an email route for data requests. It explicitly describes the current lack of score expiry without promising anonymous data, one-hour deletion or an unimplemented response deadline. Support explains export-before-uninstall and the distinction between local and global scores.

These are implemented source changes. **Production route verification, final native-bundle verification and actual store submissions are separate steps and are not certified here.** Before submission, record the deployed policy/support URLs and verify that each returns the intended page unauthenticated, with its stylesheet, rather than the game home screen or a login page.

AdMob now requires app-ads.txt verification for new apps before full serving and a separate readiness approval. [Verification requirement](https://support.google.com/admob/answer/14538460). Publish the exact seller snippet supplied by the actual AdMob account at `/app-ads.txt` on the developer-website host linked from both store listings, then request verification. A file only inside the native bundle does not work. [Hosting and crawler instructions](https://support.google.com/admob/answer/9363762).

Do not invent a `pub-...` seller identifier, publish Google's demo publisher as Codecastle, or assume a support-page URL automatically establishes the intended developer website. Confirm the selected host can serve the file as text rather than rewriting it to the game. No Firebase project is necessary merely to host this file when the existing public site can do so.

`api/app-ads.js` now supplies the `/app-ads.txt` route. It returns 404 until the server-only `ADMOB_PUBLISHER_ID` contains an accepted non-demo publisher ID, then emits Google's standard DIRECT seller record. GET/HEAD are supported; other methods return 405. **This is format validation, not proof of account ownership or AdMob verification.** Set the value only after checking the real AdMob account, then confirm the public text response and crawl/readiness status. No publisher ID was invented or activated by this worksheet.

## 7. Completion evidence to retain with the release

Record the final app version/build number, exact resolved native SDK versions, Xcode aggregate privacy report, AAB merged permissions, published privacy/support/developer-website URLs, app-ads.txt crawl status, UMP messages and tested regions/ATT outcomes. Compare the final store selections against this worksheet and the actual release configuration. This audit did not submit declarations, approve the ads account or verify legal ownership; it provides implementation evidence for those final steps.
