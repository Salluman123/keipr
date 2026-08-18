# Keipr — Google Play Submission Roadmap

Last updated: Aug 7, 2026. This is your first Android/Google Play submission — there's no prior history to lean on, so treat this as the source of truth.

## The one thing that changes your timeline: start today

Since Aug 2026 policy, brand-new personal Play Console accounts must run a **closed test with 12 testers, each opted in continuously for 14 days**, before you can even apply for production access. There's no way to skip or speed this up — if a tester drops below 12 or opts out early, the 14-day clock resets.

**Practical implication:** get an app (even a rough build) into a closed testing track as early as possible, and start lining up 12 people willing to install and stay opted in for two weeks. Everything else below (store listing polish, RevenueCat, content rating) can happen *during* those 14 days — it doesn't have to be finished first.

Realistic minimum timeline: identity verification (hours–2 days) + 14-day closed test = **~2–3 weeks** before Keipr can go live on Android, even if everything else goes smoothly.

---

## Phase 1 — Google Play Console account (do this first, today)

1. Go to https://play.google.com/console/signup
2. Choose **Personal** account type (Organization requires a D-U-N-S number — skip unless you already have one).
3. Pay the one-time $25 registration fee via a Google payments profile. Use your legal name and a card that matches it.
4. Google will require identity verification: a government ID (passport/driver's license/national ID) and possibly a selfie. Name on the ID must match the name on the payment card. This typically takes a few hours, sometimes up to 2 business days.
5. Once verified, create your app entry in Play Console:
   - App name: Keipr
   - Default language, Free (not paid — Pro is handled via in-app subscription)
   - Package name: `com.getkeipr.app` (already set in the app — must match exactly, cannot be changed later)

## Phase 2 — Start the RevenueCat / Google Play Billing setup

This can happen in parallel with Phase 1 finishing, once your app entry exists in Play Console.

1. In Google Cloud Console, create a **service account** (IAM & Admin → Service Accounts) with **Monitoring Viewer** and **Pub/Sub Admin** roles, and download its JSON key.
2. In Play Console, link that service account under Setup → API access.
3. In Play Console → your app → Monetize → Products → Subscriptions, create your Pro subscription product(s) with pricing, and Activate them.
4. In the RevenueCat dashboard, add Keipr's Android app (package name `com.getkeipr.app`), upload the service account JSON, and attach the Play subscription product(s) to your existing `pro` entitlement (same entitlement your iOS build already uses).
5. RevenueCat will give you an Android-specific public SDK key (starts with `goog_`). This is different from the `appl_...` key currently in `eas.json`.

Once you have that `goog_` key, send it to me and I'll wire it into the build config (it needs to be picked at runtime based on platform — iOS keeps `appl_`, Android uses `goog_`).

## Phase 3 — Build config (done)

Already fixed in the repo:

- `eas.json` → production Android build type changed from `apk` to `app-bundle`. Google Play requires AAB (Android App Bundle) for all new app submissions — APK would have been rejected.
- `app.json` → removed duplicate entries in `android.permissions` (camera/storage/audio permissions were each listed twice; harmless but sloppy).

Still outstanding, once you have the RevenueCat Android key from Phase 2:
- Add platform-specific RevenueCat key handling (`appl_` for iOS, `goog_` for Android) in `purchaseStore.ts`.

## Phase 4 — First Android build

Once Phase 3's RevenueCat key is wired in (or sooner, for a testing-only build without working Pro purchases):

```
eas build --platform android --profile production
```

This produces an `.aab` file. Upload it to Play Console under Testing → Closed testing → create a track (e.g. "Alpha"), and add your 12 testers' email addresses there. Share the opt-in link with them and confirm they actually accept it on a device signed into that Google account — that's when the 14-day clock starts for each person.

## Phase 5 — Store listing assets

Android has different asset requirements than iOS — you cannot reuse the iPhone screenshots.

- **Screenshots:** at least 2, PNG or JPEG, 16:9 or 9:16 aspect ratio, min dimension 320px, max 3840px. Phone screenshots recommended size ~1080×1920 or 1080×2340. Will need fresh exports from a device/simulator at the right resolution (same 5 screens as iOS: Home → Transactions → Reports → Add Income → Settings works fine content-wise).
- **Feature graphic:** 1024×500 PNG/JPEG — iOS has no equivalent, this is Android-only. Needed for the store listing banner.
- **App icon:** 512×512 PNG (separate from the adaptive icon used in the build itself).
- **Short description:** max 80 characters.
- **Full description:** max 4000 characters — can adapt the iOS App Store description.
- **Title:** max 30 characters — "Keipr" fits easily, but you could add a qualifier like "Keipr - Expense & Income Tracker" if character budget allows.

## Phase 6 — Content rating & Data safety

Two Google-specific questionnaires, different format from Apple's:

- **Content rating questionnaire:** Play Console → Policy → App content → Content ratings. Answer honestly about violence, gambling, etc. — for Keipr this should come back low/everyone rating.
- **Data safety section:** Play Console → Policy → App content → Data safety. You'll need to declare what data Keipr collects (email/auth, financial info from expense/income entries, photos for receipts) and confirm it's encrypted in transit and deletable on request. This is Google's equivalent of Apple's App Privacy "nutrition label" — needs to be filled out fresh, the categories don't map 1:1 from what you submitted to Apple.

## Phase 7 — Pricing & distribution

- Set countries (match whatever you selected for iOS, or adjust as desired).
- Confirm Keipr is Free with in-app purchases (Pro subscription).
- Set the Pro subscription price per-country if not using Google's automatic conversion.

## Phase 8 — Closed testing → Production

1. Once 12 testers have been opted in continuously for 14 days, a **"Production"** option unlocks on your Play Console dashboard (App → Publishing overview, or Testing → look for a prompt to apply for production access).
2. Apply for production access.
3. Promote your tested build (or a newer one) to the Production track.
4. Submit for review. Google's review is typically faster than Apple's (often within a day or two, though it can vary), but this is a first submission from a new account so allow extra time.

---

## Quick reference — what's already correct vs. what's new work

**Already correct in the codebase**, no action needed:
- Package name `com.getkeipr.app` and versionCode `2` in `app.json`
- Android permissions (camera, storage, audio) already declared
- `react-native-purchases` (RevenueCat SDK) already integrated at the code level — Android just needs its own dashboard config and API key, not new code
- Adaptive icon asset already present

**Genuinely new territory:**
- Google Play Console account + identity verification
- RevenueCat Android app + Google Play Billing product setup
- 12-tester, 14-day closed testing gate
- Android-specific store assets (feature graphic, resized screenshots)
- Content rating & Data safety questionnaires

Sources: [Google Play developer verification](https://developer.android.com/developer-verification/guides/google-play-console) · [Play Console: new personal account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465) · [RevenueCat Google Play Billing guide](https://www.revenuecat.com/guides/google-play-billing) · [RevenueCat Android product setup](https://www.revenuecat.com/docs/getting-started/entitlements/android-products)
