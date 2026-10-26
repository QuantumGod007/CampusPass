# CampusPass

Live demo: [https://campuspass-rho.vercel.app/](https://campuspass-rho.vercel.app/)

CampusPass is a React application for browsing college events and managing event registrations. Students can filter events, save them for later, register through a validated form, and view or cancel their bookings. An organizer workspace supports creating and editing events.

The original routes are a fictional browser-local demonstration. With Supabase configured, `/campus` provides separate shared institution events and genuine account-backed bookings. Demo records are never imported into real accounts.

![CampusPass event discovery](docs/screenshots/discover-desktop-preview.png)

[Mobile view](docs/screenshots/discover-mobile-preview.png) · [Registration form](docs/screenshots/registration-desktop.png) · [Event pass](docs/screenshots/demo-pass.png)

## Features

- Search events by title, category, venue, or organizer. Combine category, date, and availability filters, then sort the results.
- Open event pages with descriptions, agendas, venue details, and available capacity.
- Bookmark events and access them from Saved events.
- Register with student details and receive a printable demo pass with a unique booking reference.
- Search bookings, view upcoming, past, and cancelled registrations, and cancel before an event starts.
- Create local events with a poster theme. Edit their details and capacity, and inspect local registration records in Organizer studio.
- Keep data across refreshes, recover from invalid saved data, and reset the demo from the footer.

The initial dataset contains 12 events across seven categories. Dates are generated relative to the first launch and then persisted. It includes fully booked events and events with limited availability.

### Real student accounts (optional)

With Supabase configured and the versioned migration applied, `/account/profile`
supports first-time setup, authorized profile editing, confirmed Auth email,
server persistence and restoration from another signed-in browser. PRNs preserve
leading zeros; institution association requires trusted membership provisioning.
A self-declared PRN never verifies enrollment. Organizer access requires trusted
operator provisioning; administrator roles remain unavailable. See [database setup and security](docs/database.md).

## Technology

| Area              | Tools                                                                       |
| ----------------- | --------------------------------------------------------------------------- |
| Application       | React 19, TypeScript, Vite, React Router                                    |
| UI                | Tailwind CSS, Radix UI primitives, Lucide React, Motion for React           |
| Forms             | React Hook Form, Zod                                                        |
| Dates             | date-fns                                                                    |
| State and storage | React Context; browser-local demo; Supabase PostgreSQL for private profiles |
| Testing           | Vitest, React Testing Library, Playwright, axe-core                         |

## Local setup

Use Node.js 22.12 or later and npm. The project was tested with Node.js 22.23.2.

```bash
git clone https://github.com/QuantumGod007/CampusPass.git
cd CampusPass
npm ci
npm run dev
```

Open the URL printed by Vite, normally `http://127.0.0.1:5173`.

The default event demo does not require environment variables, API keys, a database, or a backend service.

Opt-in Supabase email/password signup, login, and session management are available separately from demo records.
Configuration, security boundaries, and email setup
are documented in [docs/authentication.md](docs/authentication.md). The default
original event and booking routes remain a demo. Real reservations are made only in `/campus`.
See [ARCHITECTURE.md](ARCHITECTURE.md) for the current components and data flows.

### Available commands

| Command                                   | Purpose                                                             |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `npm run dev`                             | Start the development server                                        |
| `npm run typecheck`                       | Check TypeScript types                                              |
| `npm run lint`                            | Run ESLint                                                          |
| `npm test`                                | Run unit and component tests                                        |
| `npm run test:watch`                      | Run unit tests in watch mode                                        |
| `npm run test:e2e`                        | Run browser tests against the production build                      |
| `npm run build`                           | Type-check and build into `dist/`                                   |
| `npm run preview`                         | Serve the production build locally                                  |
| `npm run db:types` / `db:types:check`     | Generate/check types from the migrated isolated PostgreSQL database |
| `npm run test:db` / `test:db:concurrency` | Run real SQL policies and concurrent-write tests                    |
| `npm run test:integration`                | Real isolated Supabase Auth, SMTP confirmation and API tests        |
| `npm run test:e2e:integration`            | Real Supabase browser account journey                               |

## Shared institution events

`/campus` lists published institution events, `/campus/bookings` contains the
signed-in student's persistent registrations, and `/campus/organizer` is available
only to provisioned organizers. The original `/`, `/bookings` and `/organizer`
routes remain explicitly separate demos. Account navigation links to Campus events.

Apply the forward-only migrations in `supabase/migrations/` before enabling the
account build. Use `npx supabase migration up --local` for the isolated local
stack; hosted migration remains an explicitly reviewed operator action (see
[database setup](docs/database.md)). No hosted database is migrated automatically.

For a disposable local multi-user setup, start Docker/Supabase and copy only its
publishable key from `npx supabase status`:

```bash
npx supabase start
export TEST_SUPABASE_URL=http://127.0.0.1:54321
export TEST_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_WITH_LOCAL_VALUE
export TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
npm run dev:fixtures
VITE_AUTH_ENABLED=true VITE_SUPABASE_URL="$TEST_SUPABASE_URL" VITE_SUPABASE_PUBLISHABLE_KEY="$TEST_SUPABASE_PUBLISHABLE_KEY" npm run dev -- --port 4175
```

The setup creates real confirmed local Auth accounts (one organizer and two
students), one institution and a published two-seat event through authenticated
APIs. Disposable login credentials are saved only in the ignored, private
`.test-artifacts/live-fixture.json`; never commit or publish that file. Use
`npm run dev:fixtures:clean` with the same isolated test settings to remove them.
Fresh ordinary signups receive no institutional approval or organizer role.

A trusted database operator can provision an existing account/profile using an
owner connection (or a DBA-authorized operator role), never a browser key:

```bash
# Set OPERATOR_DATABASE_URL securely to the deliberately selected database.
npm run operator:provision -- --user USER_UUID --institution INSTITUTION_UUID --role organizer --status active --operator "Operator name" --reason "Approved institution organizer"
# Use --role student for ordinary membership, --status revoked to revoke,
# and optional --expires ISO_TIMESTAMP for a time-limited grant.
```

The private SQL function records grants/revocations in `audit_log`. Every action
requires a backing Auth session and current active membership; metadata/email
domains never grant authority. Institution and organizer IDs are server-derived.
Booking, cancellation and capacity/state changes serialize on the event row.
Successful request UUIDs are remembered, so retries cannot take extra seats or
resurrect a cancelled registration. Cancellation requires active membership and
is allowed until the event starts; rebooking uses a new request/reference and
retains cancelled history. Organizer cancellation cancels all confirmed bookings.
Availability refreshes on navigation or the refresh buttons; booking always
rechecks capacity server-side. References do not verify admission. QR check-in,
waitlists and notifications remain future work.

Run `npm run test:db`, `npm run test:db:concurrency`, `npm run test:integration`
and `npm run test:e2e:integration` against the isolated stack. CI runs these with
real Auth/PostgREST and separate browser contexts. Ordinary browser regressions
use fixture HTTP for Auth; screenshot capture is opt-in and disabled by default.

## Registration and validation

React Hook Form manages the registration form, with Zod schemas defining the validation rules. Errors appear next to the relevant fields, the first invalid field receives focus on submission, and entered values are retained.

| Field                | Validation                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| Full name            | Trim surrounding whitespace; require at least two letters                                                       |
| Email                | Require a valid email address; no college-domain restriction                                                    |
| Indian mobile number | Require ten digits starting with 6–9; accept spaces, hyphens, parentheses, and an optional `+91` or `91` prefix |
| Student PRN          | Require exactly 12 digits; store as a string to preserve leading zeros                                          |
| Department           | Select a value from the predefined list                                                                         |
| Academic year        | Select first, second, third, or fourth year                                                                     |
| Note                 | Optional; up to 500 characters after trimming                                                                   |
| Consent              | Must be checked                                                                                                 |

Before saving a registration, the application checks that the event exists, has not started, has available capacity, and has no active registration for the same PRN. The form guards against repeated submissions. A successful submission creates a booking reference and opens the event pass.

Available seats are calculated from capacity, initial demo reservations, and confirmed local registrations. Cancelling changes the booking status, which releases its local seat. Cancelled records remain visible, and the student can register again if space is available.

Organizer forms also use Zod. Event titles must be 5–80 characters, descriptions 40–5,000 characters, and capacity a whole number from 1 to 10,000. The start must be in the future, and the end must follow the start. Venue and organizer names are required. Editing preserves registrations and prevents reducing capacity below confirmed reservations. Dates and times follow the device’s local time zone.

## Project structure

```text
src/
  app/                 Routing and shared state
  components/          Shared UI, navigation, dialogs, and notifications
  data/                Initial event data
  features/
    events/            Discovery, event details, and saved events
    registration/      Student registration form
    bookings/          Booking management and event passes
    organizer/         Event creation, editing, and registration records
  lib/                 Validation, booking rules, storage, and date helpers
  styles/              Application styles and design tokens
  tests/               Unit and component tests
  types/               Event and registration types
e2e/                   Browser tests
public/posters/        Event artwork
scripts/               SVG poster generator
docs/                  Screenshots and verification notes
```

Shared event, booking, and bookmark data is managed through Context and useReducer. Search inputs, filters, and dialogs use local component state. Booking rules and storage validation are kept outside page components. Secondary routes are loaded on demand.

## Testing

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Playwright uses installed Google Chrome on macOS when available. On other machines, install Chromium before running browser tests:

```bash
npx playwright install chromium
```

For a different Chromium executable, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. This is an optional test-runner setting, not an application requirement.

The browser suite builds the app and starts Vite Preview on port 4173, or reuses an existing preview there. Coverage includes filtering, bookmarks, validation, duplicate submissions, registration, cancellation, organizer edits, storage failures, and direct-route refreshes. Responsive checks cover 320, 390, 768, 1024, and 1440px widths. Accessibility checks use axe-core alongside keyboard and focus assertions.

Browser automation currently targets Chromium. Safari, Firefox, physical mobile devices, and physical printer output have not been independently tested. Recorded results are in [docs/verification.md](docs/verification.md).

## Deploying to Vercel

1. Import the GitHub repository into Vercel.
2. Select the Vite framework preset. The included `vercel.json` specifies `npm run build`, the `dist` output directory, and SPA rewrites for React Router.
3. For the event demo, deploy without application environment variables. To enable real student accounts, first apply the reviewed database migrations and configure the public Supabase variables described in [database setup](docs/database.md) and [authentication setup](docs/authentication.md).
4. Check a nested route such as `/events/buildfest` directly and refresh it to verify routing on the deployed host.

To inspect the build locally:

```bash
npm run build
npm run preview
```

The existing demo URL is linked at the top of this README. These changes do not migrate the hosted database or deploy backend changes automatically.

## Practical Demonstration Guide

A short walkthrough for reviewing the application:

1. Search for an event, try a filter, and open its details.
2. Submit an empty registration form and inspect the validation messages.
3. Enter sample student details, select a department and year, accept the demo terms, and submit.
4. Open the event pass and find the registration in My bookings.
5. Cancel the registration and check that the event has one more available seat.
6. Refresh to confirm persistence, then create an event in Organizer studio and find it in Discovery.

The code demonstrates reusable components and props, local state, shared state through Context and useReducer, event handlers, effects for browser storage, conditional rendering, and client-side form validation.

See [Phase 5 verification](docs/phase-5-verification.md) for account screenshots,
real versus mocked test coverage, and database CI evidence.

## Current limitations

- Real accounts/events/bookings require a configured, migrated Supabase project and trusted institutional provisioning. Demo routes remain browser-local. Payments, booking emails and security-verifiable admission/QR check-in are not implemented.
- Demo records belong to the browser profile and origin where they were created; they do not synchronize across users or devices. Use fictional details in demo forms. Real student profiles and campus bookings persist separately in PostgreSQL with own-only access.
- Tabs on the same origin receive storage updates, but concurrent writes are last-write-wins. This limitation applies to the demo; `/campus` allocates seats transactionally in PostgreSQL.
- Clearing browser storage removes demo records (not PostgreSQL profiles). If storage is unavailable, the app displays a notice and changes last only for the current session.
- Persisted events eventually become past events. Reset the demo to generate new upcoming dates.
- Poster themes use fixed artwork and lettering. Custom event titles appear separately in the interface and pass. The pass barcode is decorative and cannot verify entry.
