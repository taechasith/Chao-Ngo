# Google sign-in for Chao Ngo

The player uses Google only. Existing user IDs, names, custom avatars and progress stay in D1. A verified Google email matching an existing account links to that account. Unverified legacy accounts are verified only after Google's server-side OAuth exchange proves the same email; their earlier sessions are revoked. Email/password and email-verification endpoints are disabled.

## Google Cloud

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview). Select the project that will own Chao Ngo authentication, or create a project named **Chao Ngo** if none exists. Configure branding with the app name **Chao Ngo**, a monitored support email and developer contact chosen by the owner.
2. Use an **External** audience for public players. Google exempts apps requesting only basic identity (`openid`, `email`, `profile`) from the normal Testing test-user list requirement and seven-day authorization expiry. This does not establish the site's concurrent capacity or waive Google's other publishing requirements. The planned 300 players do not require additional Google data scopes.
3. Request only `openid`, `email`, and `profile`. The app does not request Drive, Gmail, or offline access.
4. Create an OAuth client of type **Web application**. Register these exact authorized redirect URIs:

   - Production: `https://chaongo.creativelabth.com/api/auth/callback/google`
   - Local: `http://localhost:3000/api/auth/callback/google`

5. Keep the new Client Secret private. The account owner enters it directly in the Worker secret form; do not paste it into chat, commit it, or include it in screenshots.

## Cloudflare Worker

In `chao-ngo-player` → Settings → Variables and Secrets, add **Secret** entries:

- `GOOGLE_CLIENT_ID`: the Web OAuth client ID ending in `.apps.googleusercontent.com`
- `GOOGLE_CLIENT_SECRET`: the matching client secret

Keep the existing `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL=https://chaongo.creativelabth.com`. Keep the existing Turnstile settings. Neither Resend nor changing the auth secret is needed for Google sign-in. The deploy workflow checks only that Google secret names exist and does not replace their values.

For local testing, put local credentials in the ignored `.dev.vars` file with `BETTER_AUTH_URL=http://localhost:3000`. An isolated OAuth client for local testing is preferable. The committed example contains blank placeholders only.

Configure Google and Worker secrets **before** merging this auth change to main. Missing settings show an unavailable sign-in button and return a no-store 503 for starting OAuth. The production deploy workflow fails before deployment if required Google secrets are absent.

## Verify before public release

- Open the public privacy-policy page at `https://chaongo.creativelabth.com/privacy` and register that URL in Google branding. The page documents Google identity use and reuses the existing research notice with the current runtime retention period. Keep it accurate when data processing changes.
- Login and signup expose only Google; old verification/reset URLs return to login.
- Turnstile is validated before starting Google's code flow. OAuth state, signed cookies, PKCE and same-origin callback validation stay enabled.
- Complete a real Google sign-in using an allowed test account. New players go to onboarding; returning players retain their `next` destination.
- Cancel Google login, then retry. Expired or mismatched state must not create a session.
- Verify a matching legacy account retains its user ID and progress; unverified Google email claims must be rejected.
- Check the Google profile image and editing of the local display name/avatar.
- Confirm no research consent is accepted automatically. Test protected game/submission access separately.

Automated tests mock Google token exchange and Turnstile only. They do not prove real Google credentials, consent-screen publishing, or production callback registration.

References: [Better Auth Google provider](https://better-auth.com/docs/authentication/google), [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Google audience and Testing exceptions](https://support.google.com/cloud/answer/15549945?hl=en), [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).
