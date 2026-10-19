# Authentication foundation

CampusPass is being upgraded incrementally to Supabase Auth and PostgreSQL.
This first change adds configuration validation and an isolated Supabase client.
The application still runs the existing browser-local demo. No authentication
screens, session provider, database tables, role policies, or real bookings are
connected yet.

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
5. Set `VITE_AUTH_ENABLED=true` and restart Vite when testing modules that use
   the client. The current application does not consume the client yet, so this
   flag alone does not add login or enable real reservations.

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
returns `null`. Future consumers must handle both disabled configuration and
configuration errors before rendering account-specific actions.

The client selects PKCE, session persistence, token refresh, and callback URL
detection. Session state uses `campuspass.auth.v1`, separate from the existing
`campuspass.demo.v1` records. The helper does not read, copy, migrate, or clear
demo data. Authenticated account state and demo registrations must continue to
remain separate in subsequent changes.

These SDK options prepare future flows; they are not evidence that signup,
login, Google sign-in, logout, or account recovery works. Those flows require
their own implementation and tests.

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

The existing deployment needs no new variables for this PR. Keep
`VITE_AUTH_ENABLED=false` or unset. When the consuming authentication features
are ready, configure the same three values in the intended Vercel environments
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

References: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
and [JavaScript client initialization](https://supabase.com/docs/reference/javascript/initializing).
