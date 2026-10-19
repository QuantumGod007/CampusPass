# Authentication foundation

CampusPass is being upgraded incrementally to Supabase Auth and PostgreSQL.
Configuration validation, the Supabase client, and an application-level session
provider are implemented. The application still runs the existing browser-local
demo. Authentication screens, protected account routes, database tables, role
policies, and real bookings are subsequent milestones.

## Local configuration

No environment file is needed to run the demo:

```sh
npm ci
npm run dev
```

To prepare the authentication integration:

1. Create a separate development project in Supabase.
2. Copy `.env.example` to `.env.local`.
3. Copy the Project URL from the project's API settings to `VITE_SUPABASE_URL`.
4. Copy a **publishable** key (`sb_publishable_...`) from API Keys to
   `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. Set `VITE_AUTH_ENABLED=true` and restart Vite to enable session restoration.
   This does not add login screens or enable real reservations. Keep the flag
   disabled on the public demo until the account experience is ready.

The client accepts an HTTPS origin without credentials, a path, query, or
fragment. HTTP is accepted only for `localhost`, `127.0.0.1`, and `[::1]`, for a
local Supabase instance. Use that instance's publishable key; legacy JWT keys
are deliberately unsupported. Hosted custom HTTPS domains are supported.

`parseAuthConfig` returns demo mode when the flag is absent, empty, or `false`.
It accepts only `true` or `false` when a value is supplied. Enabled but incomplete
or invalid configuration throws `AuthConfigurationError`; it never quietly
switches an intended authenticated environment back to the demo. Errors identify
the setting to fix without reproducing its value.

## Client behavior and data boundaries

`getSupabaseClient()` initializes the SDK on first use and reuses one client for
the page's lifetime. Importing the module does not initialize it. Demo mode
returns `null`. `AuthProvider` consumes the helper and exposes disabled, loading,
authenticated, unauthenticated, and error states through `useAuth`. Public pages
remain usable while restoration runs or fails. Future account-specific actions
must handle these states explicitly.

The provider checks configuration before dynamically importing the client, so
the default demo does not download the Supabase SDK.

The client selects PKCE, session persistence, token refresh, and callback URL
detection. Session state uses `campuspass.auth.v1`, separate from the existing
`campuspass.demo.v1` records. The helper does not read, copy, migrate, or clear
demo data. Authenticated account state and demo registrations must continue to
remain separate in subsequent changes.

The provider restores sessions through `getSession()` and subscribes to SDK auth
events before reading the session. Newer events take precedence over old async
results. It tracks password recovery separately until a user update, sign-out,
or account change. `retry()` restarts restoration and replaces the subscription.
Unmount cleanup removes listeners without disposing the shared SDK client.

`signOut()` coalesces concurrent requests, reports progress, and calls the SDK
with `scope: "local"`. It returns whether the operation completed successfully.
SDK events may clear local credentials even if the remote request fails; the
provider preserves that state and reports a safe error. Logout never clears
demo records. Session tokens must not be logged or used to infer trusted roles.

Signup, login, Google sign-in, and account recovery screens still require
implementation and end-to-end verification against a configured project.

## Public keys and authorization

Vite exposes `VITE_` variables to browser code. Only the project URL and a
publishable key belong here. Never configure a secret key, service-role key,
database password, or JWT signing secret in a `VITE_` variable. The configuration
parser rejects keys outside the publishable format, including legacy JWT keys.
This validation is not a secret scanner: check deployment variables before
building, and rotate any credential accidentally exposed to a browser or Git.

Publishable keys identify the project; they do not grant organizer privileges.
Authorization will be enforced by PostgreSQL RLS and trusted role assignments
in a later PR. User-editable signup metadata must never be treated as a role.
Until migrations and database tests exist, this change makes no claims about
profile isolation or privilege escalation protection.

## Vercel preparation

The demo deployment needs no new variables. Keep `VITE_AUTH_ENABLED=false` or
unset. For enabled session restoration, configure the same three values in the intended Vercel environments
and redeploy; Vite reads them at build time. Use a separate Supabase development
project for preview deployments and the production project only for production.

Before enabling signup or OAuth, the later authentication UX PR must document
and test Supabase Site URL, allowed callback/recovery URLs, email confirmation
and SMTP settings, and Google provider credentials. Nothing in this PR changes
those dashboard settings or provisions an external project.

## Verification

Configuration tests cover opt-in behavior, URL validation, key rejection, and
redacted errors. SDK-mocked client tests cover lazy initialization, singleton
reuse, explicit failure, SDK options, and separation from demo records.
They do not contact Supabase or prove database authorization. Real auth and RLS
integration tests will require a local or isolated Supabase test environment.

Session-provider tests cover restoration, auth events, stale results, retry,
StrictMode/unmount cleanup, logout progress, and redacted errors. Additional
tests use the real SDK with synthetic sessions and a fixture HTTP transport for
storage restoration, refresh, logout, and SDK cleanup on remote logout failure.
Browser tests verify that demo navigation and reset do not modify auth storage
or make auth requests. No live Supabase credentials were used for these tests.

References: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
and [JavaScript client initialization](https://supabase.com/docs/reference/javascript/initializing),
[auth events](https://supabase.com/docs/reference/javascript/auth-onauthstatechange),
and [sign-out scopes](https://supabase.com/docs/reference/javascript/auth-signout).
