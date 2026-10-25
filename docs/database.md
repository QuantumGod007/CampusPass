# Student account database (Phase 5)

The real account workflow is `/account/profile`. It uses Supabase Auth and
PostgreSQL; discovery, organizer tools, bookings and passes still use the
fictional browser-local demo. Nothing imports `campuspass.demo.v1` into an account.
This phase is a database foundation, not a production booking system.

## Schema and ownership

The versioned migration is `supabase/migrations/202610250001_student_accounts.sql`.

| Table                     | Identity and data                                                                                                             | Integrity                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `institutions`            | UUID, name, slug, optional public JSON metadata, active state, fixed `trusted_provisioning` membership policy, timestamps     | Unique slug; bounded name and metadata; no open enrollment                                                                                        |
| `student_profiles`        | `user_id` UUID PK/FK to `auth.users`, display name, text PRN, department/year enums, nullable institution, timestamps         | One profile per Auth user; exactly 12 PRN digits; 2–80-character name containing two letters; no control characters; allowed academic fields only |
| `institution_memberships` | UUID, Auth user/institution FKs, status, trusted role, optional provisioner, approval/revocation/expiry and record timestamps | Unique user/institution; at most one active membership per user; approval/revocation timestamps required for those states; identities immutable   |

`student_profiles.institution_id` has a composite FK with `user_id` to the
membership table. `(institution_id, prn)` is unique. PRNs remain text, preserving
leading zeros. A profile without a trusted active membership has a null
institution: its PRN is self-declared and does not reserve a number at any
institution. PostgreSQL permits multiple such unassociated PRNs. A trusted
membership activation binds the profile to its institution and enforces PRN
uniqueness in the same transaction; a conflict rejects activation atomically.
The same PRN is allowed at two independently provisioned institutions.

Auth-user deletion cascades personal profiles and memberships. An institution
with memberships cannot be deleted accidentally. Membership revocation/deletion
and institution deactivation clear the profile association, retaining the
personal profile. Expiry is checked against database time on every account read
and save; saving drops an expired association. A time-expired membership may
retain its stored PRN reservation until a save or administrative reconciliation.
**Future authorization must check current membership status, expiry and active
institution, never a stored profile association alone.**

Only a user lookup, institution lookup, active-membership uniqueness and the
required PK/unique/FK-supporting indexes are added. No real events or booking
schema is introduced.

## RLS and function boundary

All three tables have RLS enabled. Anonymous users have no table access.
Authenticated users have SELECT only; all direct client INSERT/UPDATE/DELETE
operations are denied, including apparently harmless updates. The permitted
personal fields are updated through the atomic RPC instead.

| Policy                            | Table                     | Effect                                                   |
| --------------------------------- | ------------------------- | -------------------------------------------------------- |
| `own_student_profile`             | `student_profiles`        | Read only the current validated student's profile        |
| `own_institution_memberships`     | `institution_memberships` | Read only that student's memberships                     |
| `associated_institution_metadata` | `institutions`            | Read institution metadata only through an own membership |

PostgREST validates the JWT signature. The private
`campuspass_private.current_student_id()` helper additionally requires the
JWT's `sub`, `session_id`, role and future `exp` to match an existing Auth
session/user. Expired sessions, deleted/banned users and anonymous Auth users
are rejected. Removing the backing session denies access even while its signed
JWT has not expired. Supabase Auth sessions remain the source of truth.

Two public security-definer RPCs have empty `search_path`, fully qualified
references, revoked PUBLIC/anonymous execution and explicit authenticated grants:

- `get_student_account()` returns the own profile (or explicit null) and an
  honest membership status: pending, active, revoked, expired or inactive.
- `save_student_profile(p_display_name, p_prn, p_department, p_academic_year)`
  derives ownership from the validated session. It accepts no user, institution,
  membership or role argument. A user-row lock serializes first saves and
  membership changes, followed by an atomic upsert. Institution state is locked
  before changing an association. Concurrent first saves create one record.

The repository validates the exact transport token with `auth.getUser(token)`
before making the RPC and pins its Authorization header to that token. A
concurrent SDK account switch cannot submit user A's form using user B's token.
The provider aborts obsolete requests and masks old account data during render,
before effect cleanup. RLS/RPC checks provide security even if a client bypasses
all UI and repository checks. Database errors are normalized without exposing
another student's PRN, identity or constraint details.

## Trusted memberships and roles

There is no self-enrollment or administrative provisioning UI/API in this phase.
Students see **Enrollment unverified** unless a trusted operator has provisioned
membership. Pending, revoked, expired and inactive states do not become approved
because a student enters a college email or PRN.

Only trusted database operators/backend service credentials can write
institutions or memberships. Service credentials must never be placed in Vite
variables or the browser. The future privileged role enum is present, but a
`privileged_roles_unavailable` constraint permits **student only**, even through
the service API. Enabling organizer/admin roles requires a reviewed migration
and an authenticated, authorized administrative workflow. User metadata and the
open Organizer demo confer no database privileges.

## Reproduce the isolated stack

Use Node 22.12+ and Docker (or a CLI-supported container runtime). The CLI and
Supabase type generator are pinned in `package-lock.json`.

```bash
npm ci
npx supabase start
npx supabase status
```

The dedicated project ID is `campuspass-phase5-isolated`. A fresh stack applies
versioned migrations automatically. This configuration enables real email
confirmation and captures messages in local Mailpit at
`http://127.0.0.1:54324`; it does not send production email. The test app callback
is exactly `http://127.0.0.1:4175/auth/callback`.

Copy only the local publishable key from status (not a secret/service-role key):

```bash
export TEST_SUPABASE_URL=http://127.0.0.1:54321
export TEST_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_WITH_LOCAL_VALUE
export TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
npm run db:types:check
npm run test:db
npm run test:db:concurrency
npm run test:integration
npx playwright install chromium
npm run test:e2e:integration
npx supabase stop --no-backup
```

The last two commands remove test containers/data and intentionally require the
isolated project. Never point tests at a production or linked database. Helpers
reject non-loopback URLs and database ports other than 54322/55437. The API tests
accept port 54321 only and delete only their disposable identities/institutions.
Do not reuse test mailboxes, credentials or test limits for production.

For interactive UI development against this stack, set `VITE_AUTH_ENABLED=true`,
`VITE_SUPABASE_URL` and the **publishable** key, then run Vite on port 4175
(`npm run dev -- --port 4175`). Other development origins must first be added to
the local Auth site/callback configuration. The unconfigured demo needs none of
these settings. A configured Auth project without this migration shows a
retryable database error rather than a fabricated profile.

### Migrations and generated types

For a fresh isolated checkout, `npx supabase start` applies migrations. To apply
additional pending migrations to that running local stack, use
`npx supabase migration up --local`. Do not use reset against a linked project.
New schema changes belong in a new ordered migration after deployment; do not
edit already deployed migration history.

The committed `src/types/database.ts` is generated by the pinned official
`@supabase/typegen` introspector from an actually migrated database:

```bash
npm run db:types
npm run db:types:check
```

The check regenerates from PostgreSQL and compares exact output, with a drift
artifact for CI review. It does not parse SQL or use hand-written table types.
Standalone PostgreSQL testing is also possible on the dedicated port 55437:
`scripts/database/local-auth-bootstrap.sql` supplies minimal Auth tables and
claim helpers **only in a new disposable cluster**. It is not Supabase Auth;
real Auth, mail confirmation and PostgREST require the full isolated stack.

A hosted rollout is a separate reviewed operation. Verify the intended project,
backups and Supabase Auth schema first. An operator can inspect pending changes
with `npx supabase db push --db-url "$REVIEWED_DATABASE_URL" --dry-run`, then
apply the same reviewed migrations to that explicitly selected database. Do not
run tests, local Auth bootstrap or destructive resets there. Configure the web
build with that project's URL and public publishable key. This PR does not
modify the existing hosted Supabase project or live Vercel deployment.

## Verification boundaries and next phase

- Unit/component tests use controlled identities/repository responses to cover
  forms, safe errors, duplicate submission, loading/retry and pending load/save
  account switches. SDK repository tests use mocked HTTP, not a real database.
- `test:db` executes real PostgreSQL RLS, role grants, validation, uniqueness,
  revocation and ownership assertions in a rolled-back transaction.
  `test:db:concurrency` uses independent real transactions and removes its rows.
- `test:integration` uses real Auth signups, Mailpit confirmation links,
  password logins and PostgREST. It checks concurrent creation, independent
  sessions, updates, cross-user/anonymous/forgery denial, institutional PRN
  uniqueness and a revoked-but-unexpired JWT.
- `test:e2e:integration` uses the real app and isolated API: signup, SMTP/PKCE
  confirmation, profile creation verified in PostgreSQL, refresh, edit, logout,
  password login and a second fresh browser context. No HTTP interception or
  copied browser storage is used. A distinct user is checked for privacy.
- Ordinary `test:e2e` uses explicitly mocked Auth/profile HTTP for UI regressions
  and screenshots at 320/390/768/1024/1440px. These images do not prove persistence.
- CI runs the real isolated stack without production credentials. Local standalone
  PG checks do not substitute for that job. See [Phase 5 verification](phase-5-verification.md)
  for observed results and evidence.

Phase 6 needs authenticated administrative provisioning with audit history,
reviewed organizer authorization, institutional PRN reconciliation, real event
publishing, transactional seat inventory and bookings, and server-verifiable
check-in/QR operations. OAuth, password recovery, data export/deletion UI,
production monitoring/backups and broader browser/device testing also remain.
