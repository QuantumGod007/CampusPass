# Phase 5 verification — 25 October 2026

Baseline: `main` at `4bcf5378994f308daab828b82707ff8808dfaa02`, verified against
[successful main CI](https://github.com/QuantumGod007/CampusPass/actions/runs/39474438926)
before creating `feat/student-profiles-database-foundation`.

[Review PR](https://github.com/QuantumGod007/CampusPass/pull/7) targets that main
branch. GitHub assigned #7 because #6 was already an unrelated issue. No merge,
force-push, production migration or hosted database reset was performed.

## Observed results

[Successful Phase 5 CI run](https://github.com/QuantumGod007/CampusPass/actions/runs/40220440095)
on implementation commit `cef3cd9c67aaf002d5ae83d7786d76618de2eb59`:

| Check                                   | Result and scope                                                                                                                                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quality, Node 22 and 24                 | Lint, TypeScript, 272 unit/component tests in 21 files, production build all passed                                                                                                                                              |
| Chromium regression suite               | All 66 tests passed, including existing demo/auth workflows and 7 new account checks                                                                                                                                             |
| Actual migrated Supabase PostgreSQL     | Generated types matched exactly; all 24 SQL policy assertions passed                                                                                                                                                             |
| Real concurrent PostgreSQL transactions | Eight first saves produced one record; racing revocation/deactivation removed institution association                                                                                                                            |
| Real Supabase API suite                 | Signup, local SMTP confirmation, password login, parallel saves, second session, update, private reads, anonymous/forged ownership/role denial, institution PRN uniqueness and revoked-JWT rejection all passed                  |
| Real browser journey                    | Signup → Mailpit confirmation → PKCE callback → profile create → PostgreSQL row assertion → refresh → edit → logout → password login → fresh browser context restoration passed; a distinct real user could not read the profile |
| Dependency audit                        | Zero reported vulnerabilities in the locked dependency tree at verification time                                                                                                                                                 |

The CI stack is disposable, unlinked Supabase with Auth, PostgREST, PostgreSQL
and Mailpit. No browser/API request is mocked in the real integration job. Email
confirmation follows the actual local SMTP message; no admin confirmation flag
or generated fake token substitutes for signup. The fresh browser context has
separate storage and performs its own password login. The API suite also uses
independent SDK sessions. This verifies account persistence beyond localStorage,
not production email delivery or a deployed hosted environment.

Locally, Docker is unavailable. PostgreSQL 16.15 ran in a new disposable cluster
on port 55437, with minimal test Auth relations and claim helpers. The migration,
24 SQL assertions, real concurrent transactions and actual type generation/check
passed there. These SQL tests exercise genuine PostgreSQL grants/RLS/functions;
they do not pretend to be a local Supabase Auth server. Full-stack evidence is
provided by the CI job above.

Local unit/component tests (272), lint, TypeScript and production build passed.
The first full local browser run passed 65/66; the new demo-isolation assertion
incorrectly compared serialized JSON key order across reload. Comparing the
parsed data fixed the assertion. All 7 focused profile checks then passed, and
CI subsequently passed the entire 66-test suite. Existing registration component
tests emit React `act` warnings; assertions pass. New profile tests exercise
server-token pinning, delayed loads and saves across account switches, sign-out,
missing profiles, errors/retry, invalid fields and duplicate submissions.

## Responsive and accessibility evidence

The profile fixture browser suite checks form and overview at each requested
width. Every width passed document-overflow checks and axe checks on `main`,
including form labels and overview. Submission focuses the first invalid field;
success focuses the overview heading; forms disable during mutation. Keyboard
and existing navigation regressions also pass. Automated accessibility checks
are not a substitute for a full assistive-technology audit.

| Width  | Before profile creation (onboarding)         | After profile creation (overview)                  |
| ------ | -------------------------------------------- | -------------------------------------------------- |
| 320px  | [Setup](screenshots/profiles/setup-320.png)  | [Overview](screenshots/profiles/overview-320.png)  |
| 390px  | [Setup](screenshots/profiles/setup-390.png)  | [Overview](screenshots/profiles/overview-390.png)  |
| 768px  | [Setup](screenshots/profiles/setup-768.png)  | [Overview](screenshots/profiles/overview-768.png)  |
| 1024px | [Setup](screenshots/profiles/setup-1024.png) | [Overview](screenshots/profiles/overview-1024.png) |
| 1440px | [Setup](screenshots/profiles/setup-1440.png) | [Overview](screenshots/profiles/overview-1440.png) |

These committed screenshots use fictional fixture data and mocked HTTP. They
show UI states, not independent proof of real database persistence. The prior
application had no profile page; the existing landing page/layout was preserved.
Visual review at 320px and 1440px confirmed the inherited typography, palette,
spacing and page structure. Narrow forms use one column so PRNs and option
labels remain readable. Other widths have captured evidence and automated checks.

## Defects prevented/fixed and limits

- Prevent a pending user A form from being sent under user B's new SDK token by
  validating and pinning the same JWT for the RPC; ignore stale load/save results.
- Serialize profile creation and trusted association changes; lock institution
  state before writing association when activation races deactivation.
- Require a backing Auth session so a locally revoked, unexpired JWT cannot
  continue reading/updating the profile through PostgREST.
- Preserve leading-zero PRNs, reject invalid academic data and duplicate PRNs
  within an authorized institution, and prevent client-forged ownership/roles.
- Keep unprovisioned profiles explicitly unverified and never import demo data.

There is no institutional enrollment verification or student-accessible trusted
provisioning path. Privileged role assignments are deliberately unavailable.
Expiry is enforced on reads/saves; a stored expired association can reserve its
PRN until reconciliation (see [database details](database.md)). There are no real
events, bookings, shared seat inventory, publishing or QR/check-in verification.
The hosted project and production deployment were not modified. Firefox,
Safari, physical devices and a manual screen-reader audit were not tested.

Phase 6 must add reviewed administrative provisioning and audit history, trusted
organizer authorization, institutional reconciliation, shared events and atomic
booking/inventory operations before implementing real passes and check-in.
