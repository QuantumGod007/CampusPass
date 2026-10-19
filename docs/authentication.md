# Student authentication

CampusPass supports Supabase email/password signup, login, email-confirmation
callbacks, persistent sessions, and this-browser logout. Authentication is opt-in.
The event, booking, saved-event, and organizer experiences remain local demos;
signing in never creates a real booking or grants organizer privileges.

## Supabase dashboard setup

Use a separate development project before enabling authentication in production.

1. **Project Settings → API / API Keys:** copy the Project URL and a publishable
   key (`sb_publishable_...`). Never use a secret or service-role key in Vite.
2. **Authentication → Sign In / Providers → Email:** enable email/password
   authentication and allow new user signups. Enable **Confirm email** for the
   intended verified-email flow. Set minimum password length to **8**. The signup
   form accepts at least eight characters and at most 72 UTF-8 bytes; additional
   provider password requirements are enforced by Supabase. Login does not
   reject existing passwords simply because they predate the signup policy.
3. **Authentication → URL Configuration:** set **Site URL** to the deployment
   origin. For the existing production site this is
   `https://campuspass-rho.vercel.app`. Add these exact **Redirect URLs** as needed:

   ```text
   http://127.0.0.1:5173/auth/callback
   http://localhost:5173/auth/callback
   http://127.0.0.1:4173/auth/callback
   https://campuspass-rho.vercel.app/auth/callback
   ```

   For a Vercel preview, add that preview's exact origin plus `/auth/callback`
   to the development project. Avoid broad production redirect wildcards.

4. **Authentication → Email Templates → Confirm signup:** keep the standard
   Supabase confirmation link using `{{ .ConfirmationURL }}`. The application
   supplies a fixed `emailRedirectTo` of the current origin plus `/auth/callback`.
   A custom token-hash confirmation route is not implemented.
5. **Authentication → SMTP Settings:** configure a verified sender, SMTP host,
   port, username, and password before sending to real students. Supabase's
   built-in email sender has recipient restrictions and rate limits; do not
   treat it as production email delivery. SMTP credentials stay in Supabase,
   never in the repository or frontend environment.

If email confirmation is enabled, a signup without a returned session displays
the inbox instructions and remains signed out. The wording also covers existing
accounts without revealing whether an email is registered. If confirmation is
disabled and Supabase returns a session, the existing AuthProvider completes
sign-in; the UI does not invent an email-confirmation step.

## Local and Vercel configuration

The demo needs no credentials. Leave `VITE_AUTH_ENABLED` unset or `false`.
`/login` and `/signup` show an unavailable state with no functional forms, and
navigation does not advertise sign-in.

To enable student accounts, copy `.env.example` to `.env.local` and set:

```dotenv
VITE_AUTH_ENABLED=true
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-public-key
```

Replace the placeholders with the development project's values and restart
`npm run dev`. For Vercel, set the same values in the intended deployment
environment and redeploy; Vite reads them at build time. Use a development
Supabase project for previews and the production project only for production.

The URL validator allows HTTPS origins without credentials, paths, queries, or
fragments. HTTP is allowed only for `localhost`, `127.0.0.1`, and `[::1]` when
using local Supabase. Only the publishable key format is accepted; legacy JWT
keys are intentionally unsupported. Invalid enabled configuration produces an
error instead of silently falling back to demo mode. Vite variables are public;
validation is not a secret scanner and cannot undo accidental exposure.

## Sessions, callbacks, and redirects

- Signup sends only email, password, and the fixed callback URL to the SDK.
  Passwords stay in form memory during submission; the app never manually
  persists them or logs credentials or tokens. Role metadata is never submitted.
- The SDK owns PKCE, session storage, and refresh. Open confirmation links in
  the browser and origin where signup started so the PKCE verifier is available.
  A different browser may confirm the email without establishing this app's
  session; the callback then guides the student to sign in with their password.
- The callback waits for provider restoration. Success returns to Discovery.
  Failed, expired, or reused links show safe guidance, without echoing provider
  details, and remove one-time callback parameters from the address bar.
- Login and immediate-session signup accept `next` only for existing student
  event, saved-event, and booking paths. External URLs, encoded paths, query/hash
  payloads, auth loops, and organizer destinations fall back to `/`.
- Authenticated navigation uses the existing provider's `signOut()` with local
  scope. Failed server confirmation is reported honestly, including cases where
  the SDK already removed local credentials. Demo records are never cleared.

Auth storage (`campuspass.auth.v1`) remains separate from demo storage
(`campuspass.demo.v1`). User/session metadata is not a role or authorization
boundary. PostgreSQL profiles, memberships, and RLS policies have not been
introduced. Google OAuth and password recovery are separate milestones.

## Verification

Automated tests cover validation, redirects, UI loading/errors, queued
submissions, confirmation messaging, session transitions, navigation, logout,
and demo compatibility. Playwright builds a demo preview on port 4173 and a
separate auth-enabled preview on port 4174. All requests to the latter's fixture
Supabase origin are intercepted; no emails or external accounts are created.
These tests exercise the real SDK, including PKCE code exchange, but do not
prove live Supabase authentication or delivery.

After dashboard setup, use a real development email to test signup, receipt of
the confirmation link, same-browser confirmation, login, refresh persistence,
invalid credentials, and logout. Verify that demo events/bookings remain separate.
Also test an expired or reused link. Record the observed results separately from
the automated fixture tests.

### Live development check — 19 October 2026

The PR #4 implementation was checked locally against `campuspass-dev` at
`http://127.0.0.1:5173`. The owner entered credentials directly in the application;
no test email, password, confirmation link, or session token is recorded here.

| Check                     | Observed result                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Project connection        | Public auth settings returned HTTP 200; email signup was enabled and email confirmation was required.                                           |
| Signup and email delivery | The owner submitted signup and confirmed receipt of the confirmation email.                                                                     |
| Email confirmation        | The owner opened the confirmation link. An authenticated session was observed, and a later password login succeeded with confirmation required. |
| Session persistence       | A full browser refresh retained authenticated navigation.                                                                                       |
| Logout                    | The live session was signed out; navigation offered Sign in and no longer offered Sign out.                                                     |
| Fresh password login      | After logout, the owner entered credentials locally and signed in again; authenticated navigation was verified on the bookings page.            |
| Demo boundary             | Discovery remained available while signed out. The empty Upcoming booking count remained demo data; authentication created no real bookings.    |

No application fix was needed. `.env.local` remains ignored and untracked.
This check did not independently capture the confirmation callback/code exchange,
forced token refresh, invalid credentials, or expired/reused email links against
the live project; those paths remain covered by isolated automated tests.
Production configuration, broader email delivery, and database authorization
were not validated by this development check.

References: [email/password auth](https://supabase.com/docs/guides/auth/passwords),
[redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls),
[password security](https://supabase.com/docs/guides/auth/password-security),
and [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
