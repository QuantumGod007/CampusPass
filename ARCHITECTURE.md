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
| `src/lib/auth/forms.ts`                         | Credential validation, restricted return destinations, safe SDK error copy   |
| `src/features/auth/`                            | Login, signup, confirmation callback, and scoped authentication styles       |
| `src/components/auth-navigation.tsx`            | Enabled-only sign-in entry, account dialog, and mobile logout                |
| `src/app/profile.tsx`, `src/lib/profiles/`      | Real profile lifecycle, verified-token repository, validation                |
| `supabase/migrations/`, `src/types/database.ts` | Versioned schema/RLS and generated PostgreSQL types                          |
| `src/app/store.tsx`                             | Existing demo events, bookings, bookmarks, and browser-tab synchronization   |
| `src/lib/domain.ts`, `schemas.ts`, `storage.ts` | Demo booking rules, Zod validation, persisted-data checks                    |
| `src/features/`                                 | Discovery, event details, registration, bookings, passes, organizer demo     |
| `src/components/`                               | Shared navigation, forms, dialogs, notifications, and UI primitives          |

## Data flows

- Demo: page interaction → demo store → domain validation → reducer update →
  `campuspass.demo.v1` in localStorage. Demo bookings do not reserve real seats.
- Auth: enabled configuration → Supabase client → subscribe to auth events,
  then restore with `getSession()` → provider state → `useAuth` consumers.
- Login/signup: React Hook Form + Zod → Supabase SDK → AuthProvider events →
  validated local destination. A signup without a session shows confirmation
  instructions. Confirmation callbacks use SDK-managed PKCE and return to Discovery.
- Live auth events take precedence over pending restoration or older logout
  responses. `INITIAL_SESSION` is handled through the explicit restoration
  result so it cannot hide an SDK restoration error.
- Token persistence and refresh belong to the SDK, using `campuspass.auth.v1`.
  The provider never migrates, clears, or associates demo records with an account.
- Logout requests use Supabase's `local` scope: this browser session is ended,
  rather than every session on every device. SDK sign-out events remain
  authoritative even if the remote logout request reports an error.

## Database and authorization

Phase 5 adds `institutions`, `institution_memberships` and `student_profiles`
through a versioned migration. All have RLS enabled and anonymous access denied.
Own-only SELECT policies use a server session helper; ordinary clients cannot
write table rows directly. Two hardened RPCs load the own account and atomically
save four permitted personal fields. No RPC accepts ownership, role or institution
claims. The helper checks the backing `auth.sessions` record as well as JWT
identity/expiry, so revocation takes effect before token expiry.

`src/lib/profiles/repository.ts` uses the existing typed singleton client. It
validates the exact token with Auth, pins RPC authorization to that token and
normalizes errors. `src/app/profile.tsx` owns account load/mutation states and
aborts/masks stale loads and saves on identity changes. It never reads demo
storage. The lazy `/account/profile` page provides onboarding, overview and edit
states within the existing layout and design system. Auth-disabled mode keeps
the full demo and shows an honest unavailable account state.

Institution-scoped text PRNs are unique only after trusted active membership
provisioning. Unprovisioned profiles remain personal and unverified. Phase 6 permits audited organizer grants through an owner-only operator function; administrator roles stay blocked. `/campus` uses typed repositories and abortable account-scoped hooks, separate from the demo store. Event-row locks serialize booking, cancellation, capacity edits and event cancellation; a request ledger preserves retry idempotency. Attendee RPCs require current event ownership and active organizer membership. No account metadata authorizes the Organizer demo. QR verification remains future work.

Details, lock ordering, expiry semantics, migration/type generation commands and
policy names are documented in [database foundation](docs/database.md).

## Operational decisions and verification

- Auth is disabled by default; functional login/signup forms and sign-in controls
  are hidden in that mode. Public demo pages remain accessible without login,
  including during restoration and errors. The booking and organizer screens remain demos.
  The SDK is loaded through a dynamic import only when authentication is enabled.
- Subscribe before reading the session, use synchronous event callbacks, ignore
  obsolete asynchronous results, and unsubscribe on retry or unmount. The shared
  SDK client outlives React StrictMode remounts; the provider does not dispose it.
- Component tests exercise events, races, retries, cleanup, and errors. Real-SDK
  tests use synthetic sessions and a fixture HTTP transport for persistence,
  refresh, and logout. These do not prove live Supabase or database security.
- Auth UI browser tests use a separate enabled production build with intercepted
  Supabase HTTP responses, including confirmation-required and immediate-session
  signup, PKCE callbacks, safe redirects, refresh persistence, and mobile logout.
  No passwords are manually persisted; SDK errors and URL fragments are not echoed.
- A development check against `campuspass-dev` on 19 October 2026 verified email
  signup/delivery, confirmation followed by password login, refresh persistence,
  and local logout. The authentication guide records the evidence and limits;
  this does not establish production delivery or database authorization.
- GitHub Actions runs lint, TypeScript, unit/component tests, and builds on Node
  22 and 24, followed by Chromium regressions. A separate disposable Supabase
  job applies migrations, checks generated types, executes SQL policies and
  concurrent writes, and verifies real Auth/API and fresh-browser profile journeys. Focused PRs require owner approval
  before merging. No extra backend or authentication protocol is maintained.

Configuration details: [authentication setup](docs/authentication.md).
