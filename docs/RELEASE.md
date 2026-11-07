# Pixel Nook release record

Updated 7 November 2026. Publisher: **CodeCastle AS**. This document records preparation separately from store publication. No App Store or Google Play release has been submitted yet, and no live AdMob serving has been verified.

## Verified account and signing preparation

- Apple API access works with Codecastle's existing securely stored API key; no new login or key was required.
- Apple team: `52K9284XNV`.
- Registered bundle identifier: `ai.codecastle.pixelnook`; Apple bundle resource `3P5A35SVD9`.
- App Store provisioning profile: `Pixel Nook App Store`, resource `KCY9LFHXU9`, UUID `e50839ec-3f17-495e-8969-58361c7f94f4`. ACTIVE; expires 27 September 2027.
- The profile's application identifier is `52K9284XNV.ai.codecastle.pixelnook`. Its certificate matches the existing Codecastle distribution certificate, also expiring 27 September 2027. No certificate was revoked or replaced.
- The profile is saved with owner-only permissions at `~/.app-store/signing/pixelnook-ios.mobileprovision`. Existing API/private-key and distribution material stay in that secure directory, outside this repository. Never copy their contents to this document, logs or Git.
- A read of App Store Connect returned no app record for this bundle. Apple's [Apps API](https://developer.apple.com/documentation/appstoreconnectapi/apps) cannot create that initial record; use the authorized Codecastle account on the App Store Connect website.
- Local browser automation is currently disabled in Work settings. Native Xcode has no account signed in, but that is **not** an Apple API/signing blocker because existing secure material was verified independently.

## Store record values prepared

| Field | Value |
| --- | --- |
| App name | Pixel Nook |
| Publisher | CodeCastle AS |
| Bundle / Android application ID | `ai.codecastle.pixelnook` |
| Apple platform | iOS (iPhone and iPad) |
| Primary language | English; Norwegian store translation also prepared |
| Suggested SKU | `pixelnook-ios` |
| First version / build | `1.0` / `1` (check store state before uploading) |
| Developer / marketing website | `https://pixel-nook-tawny.vercel.app/` |
| Privacy URL | `https://pixel-nook-tawny.vercel.app/privacy.html` |
| Support URL | `https://pixel-nook-tawny.vercel.app/support.html` |
| Public support/privacy email | `kingdom@codecastle.ai`, verified on Codecastle's website |
| App access for reviewers | No login required |
| Monetization | Free game with AdMob interstitials between completed rounds; no in-app purchases |

Use [store-listing.md](store-listing.md) for the actual copy and review steps and [store-privacy-review.md](store-privacy-review.md) for the disclosure worksheet. These are prepared materials, not evidence that the corresponding forms were submitted.

## Remaining account setup, in one session

1. Enable the intended browser session and use Codecastle's existing App Store Connect, Google Play Console and AdMob accounts. Reuse existing access; do not create duplicate developer or advertising accounts. The initial Apple and Google Play app records need the respective consoles. Confirm app identity before assigning any signing material.
2. Create the Apple app record for the already registered bundle. Verify required agreements and company verification; any provider-required human acceptance remains a user action. Record the numeric App Store ID for upload and metadata operations.
3. Confirm Google Play's developer account, create/select the correct app, check existing package/upload-key state and production eligibility. Reuse an existing matching upload key if present; otherwise create a new key in secure storage outside Git and enable Play App Signing. Do not distribute the earlier debug APK as a store release.
4. In AdMob, create/select separate iOS and Android apps and one interstitial unit for each. Record the four public identifiers in ignored `.env.native.local` with `VITE_ADS_MODE=production`. Complete applicable consent/ATT messages, app verification, payout/account verification and disable High-engagement ads for shorter standard skip times. These are not configured by adding the SDK.
5. Set the **verified** `ADMOB_PUBLISHER_ID` (`pub-` plus 16 digits) in the existing Vercel project's production configuration. `/app-ads.txt` then serves the Google DIRECT seller record. Until configured it deliberately returns 404, never a demo or invented seller. Compare it to AdMob's exact snippet, link this website in each store listing and verify the crawler result. The endpoint does not touch Neon.
6. Confirm target audience, countries, content ratings and store data disclosures against the final SDK/configuration. Complete the actual review contact and required private fields. Do not assume a General ad rating configures child-directed treatment.

Passwords, API private keys, payment details and identity documents must not be pasted into chat or committed. Use secure provider configuration and the existing local private storage.

## Build and publish after configuration

Run `npm run native:sync`, then `npm run native:check-release`. Both release builds refuse demo/missing ad identifiers. Build serially with at most two build workers. Android uses the four secure signing environment variables documented in [MOBILE.md](MOBILE.md). For iOS, use the verified distribution material with a temporary build keychain and manual profile `Pixel Nook App Store`; preserve and restore the user's keychain search list. Do not modify the login keychain's existing access controls.

Inspect the signed IPA/AAB, actual embedded API URL, identifiers, SDK manifests and ad configuration. Verify real-device ad presentation/close/failure, consent refusal and change, background/resume, every cartridge and save transfer/update continuity. Existing simulator gameplay and unit tests do not prove live ad delivery.

Upload the exact verified artifacts, wait for provider processing, attach metadata/screenshots and submit for review. Record upload IDs, processed version/build, review/submission status and final public store links separately. Publishing is complete only after the stores show the apps available, not merely after an upload succeeds.

The existing web/API deployment and Neon leaderboard remain in place. No reset, deletion or storage-key renaming is part of this release.
