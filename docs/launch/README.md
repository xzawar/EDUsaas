# Launching EDUsaas on Google Play

Everything in the code is ready. What's left needs **your** accounts, money or decisions. Do the steps in order.
Files in this folder:

- `play-listing.md`: store texts to paste
- `data-safety.md`: answers for the Data safety, content rating and target audience forms
- `store-graphics/`: the 512 px icon and the 1024 × 500 feature graphic

---

## 1. Put the latest code live (web + database)

1. Merge the `redesign` branch into `main` on GitHub. Vercel deploys it and applies the database updates.
2. In **Vercel → Project → Settings → Environment Variables (Production)** set:

   | Variable                      | What to put                                                                                                                                       |
   | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `NEXT_PUBLIC_LEGAL_NAME`      | Your business name (or your own name) as the publisher                                                                                            |
   | `NEXT_PUBLIC_SUPPORT_EMAIL`   | An inbox you read. Google shows it on the store page.                                                                                             |
   | `NEXT_PUBLIC_LEGAL_COUNTRY`   | e.g. `Pakistan`                                                                                                                                   |
   | `RESEND_API_KEY`, `MAIL_FROM` | From resend.com, after verifying your domain. Without these, "Forgot password" emails are not sent (admins can still reset passwords in the app). |
   | `SENTRY_DSN`                  | Optional: server error alerts from sentry.io                                                                                                      |
   | `STORAGE_DRIVER=s3` + `S3_*`  | Required for payment screenshots and photos in production (Supabase Storage or Cloudflare R2)                                                     |
   | `DEMO_SEED`                   | `false` for the real launch                                                                                                                       |

3. **Use a clean production database** for real schools. The current deployment is a demo full of sample schools and
   test leftovers. Create a new Supabase project, point the production `DATABASE_URL`, `SYSTEM_DATABASE_URL` and
   `DIRECT_URL` at it, redeploy, then create your Platform Owner account. Keep the demo on a separate Vercel project if
   you want to show it to schools.
4. Open `https://<your-domain>/privacy`, `/terms` and `/delete-account` and check that your name and email show.

## 2. Accounts you need

| Account                                        | Cost                | Why                                                                                              |
| ---------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------ |
| Google Play Console developer account          | USD 25, once        | To publish. Organisation accounts need a D-U-N-S number; personal accounts need ID verification. |
| Expo account (expo.dev)                        | Free tier is enough | Cloud builds (EAS) that keep your signing key safe, and phone push notifications                 |
| Firebase project (console.firebase.google.com) | Free                | Android push notifications                                                                       |

> **New personal Play accounts must run a closed test first:** at least 12 testers opted in for 14 days in a row
> before you can apply for production. Organisation accounts skip this. Start the closed test as early as you can,
> for example with teachers from your first school.

## 3. Turn on phone notifications

1. In `apps/mobile`, run `npx eas-cli@latest init` (log in with your Expo account). It writes your project id into
   `app.json`.
2. In Firebase: add an Android app with package `com.edusaas.app`, download `google-services.json` and put it in
   `apps/mobile/` (it is git-ignored).
3. In Firebase → Project settings → Service accounts, create a key, then upload it in expo.dev → your project →
   Credentials → Android → FCM V1.

Until this is done the app works, but notices, marks and fee reminders only show inside the app, not as phone alerts.

## 4. Build the Play upload (.aab)

**Recommended: Expo's cloud build.** Expo creates and keeps the signing key for you.

```bash
cd apps/mobile
npx eas-cli@latest build --platform android --profile production
```

Set the production server first: edit `EXPO_PUBLIC_API_URL` in `apps/mobile/eas.json` to your real domain.

**Or build on your own computer** with your own upload key:

```bash
keytool -genkeypair -v -keystore upload.keystore -alias upload -keyalg RSA -keysize 3072 -validity 10000
```

```bash
EDUSAAS_KEYSTORE=$PWD/upload.keystore EDUSAAS_KEYSTORE_PASSWORD='…' EDUSAAS_KEY_ALIAS=upload VERSION_CODE=1 EXPO_PUBLIC_API_URL=https://<your-domain> bash scripts/build-store.sh
```

Back up `upload.keystore` and its password somewhere safe (not in git). Raise `VERSION_CODE` by one for every new
upload. The store build never contains the developer quick-sign-in or the demo password.

## 5. Fill in Play Console

1. **Create app**: name `EDUsaas – School App`, App, Free.
2. **Store listing**: paste from `play-listing.md` and upload the graphics. Take 4–8 phone screenshots from a demo
   build (the APK from `scripts/build-apk.sh` points at the demo and has the quick-sign-in).
3. **App content**:
   - Privacy policy: `https://<your-domain>/privacy`
   - App access: **"All or some functionality is restricted"**. Give Google a reviewer login: create a sample school
     in production (or point them at the demo) with one student and one teacher account, and paste the usernames and
     passwords here. Reviewers can't sign up themselves.
   - Ads: No ads
   - Content rating, Target audience, Data safety: from `data-safety.md`
   - Account deletion: `https://<your-domain>/delete-account`
4. **Testing → Internal testing**: upload the `.aab`, add yourself, install from the Play link and try every role.
5. **Closed testing** (personal accounts: 12 testers, 14 days), then **Production → Create release**.
   Google's first review usually takes a few days.

## 6. After launch

- Every update: raise the version (`version` in `app.json` for people, `VERSION_CODE` for Play), build, upload.
- The app asks people to update when the server says a newer version is required (`/api/v1/mobile/config`).
- iPhone (App Store) is not set up yet. It needs an Apple Developer account (USD 99/year) and can be built with the
  same EAS command using `--platform ios`.
