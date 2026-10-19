# CampusPass architecture

CampusPass is a React, TypeScript, and Vite SPA hosted on Vercel. Public event
browsing and the browser-local college demo remain available during the
incremental migration to Supabase Auth and PostgreSQL.

## Components and boundaries

| Component                                       | Responsibility                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/app/app.tsx`                               | React Router routes, lazy page loading, provider composition                 |
| `src/app/auth.tsx`                              | Auth session restoration, SDK subscriptions, retry, logout, `useAuth`        |
| `src/lib/auth/config.ts`                        | Explicit auth opt-in and validation of public build-time settings            |
| `src/lib/auth/client.ts`                        | One lazily initialized Supabase client with PKCE and SDK-managed persistence |
| `src/app/store.tsx`                             | Existing demo events, bookings, bookmarks, and browser-tab synchronization   |
| `src/lib/domain.ts`, `schemas.ts`, `storage.ts` | Demo booking rules, Zod validation, persisted-data checks                    |
| `src/features/`                                 | Discovery, event details, registration, bookings, passes, organizer demo     |
| `src/components/`                               | Shared navigation, forms, dialogs, notifications, and UI primitives          |

## Data flows

- Demo: page interaction → demo store → domain validation → reducer update →
  `campuspass.demo.v1` in localStorage. Demo bookings do not reserve real seats.
- Auth: enabled configuration → Supabase client → subscribe to auth events,
  then restore with `getSession()` → provider state → `useAuth` consumers.
- Live auth events take precedence over pending restoration or older logout
  responses. `INITIAL_SESSION` is handled through the explicit restoration
  result so it cannot hide an SDK restoration error.
- Token persistence and refresh belong to the SDK, using `campuspass.auth.v1`.
  The provider never migrates, clears, or associates demo records with an account.
- Logout requests use Supabase's `local` scope: this browser session is ended,
  rather than every session on every device. SDK sign-out events remain
  authoritative even if the remote logout request reports an error.

## Database and authorization

No application PostgreSQL tables or RLS migrations have been introduced yet.
Profiles, institution-scoped PRNs, memberships, and trusted role assignment are
planned for a separate reviewed migration. Authentication screens and protected
account routes are also subsequent work.

Session data is a UI state source, not an authorization decision. User metadata
must never grant organizer or administrator privileges. Real database access
will require server-enforced PostgreSQL/RLS policies. Only publishable keys are
allowed in frontend configuration; no service-role or secret keys are bundled.

## Operational decisions and verification

- Auth is disabled by default. Public pages render during restoration and errors;
  future account screens must explicitly handle loading, error, recovery, and
  unauthenticated states. The current booking and organizer screens remain demos.
  The SDK is loaded through a dynamic import only when authentication is enabled.
- Subscribe before reading the session, use synchronous event callbacks, ignore
  obsolete asynchronous results, and unsubscribe on retry or unmount. The shared
  SDK client outlives React StrictMode remounts; the provider does not dispose it.
- Component tests exercise events, races, retries, cleanup, and errors. Real-SDK
  tests use synthetic sessions and a fixture HTTP transport for persistence,
  refresh, and logout. These do not prove live Supabase or database security.
- GitHub Actions runs lint, TypeScript, unit/component tests, and builds on Node
  22 and 24, followed by Chromium regressions. Focused PRs require owner approval
  before merging. No extra backend or authentication protocol is maintained.

Configuration details: [authentication setup](docs/authentication.md).
