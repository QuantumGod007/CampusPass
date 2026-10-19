# CampusPass

Live demo: [https://campuspass-rho.vercel.app/](https://campuspass-rho.vercel.app/)

CampusPass is a React application for browsing college events and managing event registrations. Students can filter events, save them for later, register through a validated form, and view or cancel their bookings. An organizer workspace supports creating and editing events.

Events and bookings are a browser-local demonstration. Events are fictional, and registrations do not reserve real seats. Optional student authentication uses Supabase; account sessions remain separate from demo records.

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

## Technology

| Area | Tools |
| --- | --- |
| Application | React 19, TypeScript, Vite, React Router |
| UI | Tailwind CSS, Radix UI primitives, Lucide React, Motion for React |
| Forms | React Hook Form, Zod |
| Dates | date-fns |
| State and storage | React Context, useReducer, localStorage |
| Testing | Vitest, React Testing Library, Playwright, axe-core |

## Local setup

Use Node.js 22.12 or later and npm. The project was tested with Node.js 22.23.2.

```bash
git clone https://github.com/QuantumGod007/CampusPass.git
cd CampusPass
npm ci
npm run dev
```

Open the URL printed by Vite, normally `http://127.0.0.1:5173`.

The application does not require environment variables, API keys, a database, or a backend service.

Opt-in Supabase email/password signup, login, and session management are available separately from demo records.
Configuration, security boundaries, and the remaining account integration steps
are documented in [docs/authentication.md](docs/authentication.md). The default
event and booking interface remains a demo; signing in does not create real reservations.
See [ARCHITECTURE.md](ARCHITECTURE.md) for the current components and data flows.

### Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run typecheck` | Check TypeScript types |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit and component tests |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run test:e2e` | Run browser tests against the production build |
| `npm run build` | Type-check and build into `dist/` |
| `npm run preview` | Serve the production build locally |

## Registration and validation

React Hook Form manages the registration form, with Zod schemas defining the validation rules. Errors appear next to the relevant fields, the first invalid field receives focus on submission, and entered values are retained.

| Field | Validation |
| --- | --- |
| Full name | Trim surrounding whitespace; require at least two letters |
| Email | Require a valid email address; no college-domain restriction |
| Indian mobile number | Require ten digits starting with 6–9; accept spaces, hyphens, parentheses, and an optional `+91` or `91` prefix |
| Student PRN | Require exactly 12 digits; store as a string to preserve leading zeros |
| Department | Select a value from the predefined list |
| Academic year | Select first, second, third, or fourth year |
| Note | Optional; up to 500 characters after trimming |
| Consent | Must be checked |

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
3. Deploy without application environment variables.
4. Check a nested route such as `/events/buildfest` directly and refresh it to verify routing on the deployed host.

To inspect the build locally:

```bash
npm run build
npm run preview
```

No live deployment URL is recorded in this repository.

## Practical Demonstration Guide

A short walkthrough for reviewing the application:

1. Search for an event, try a filter, and open its details.
2. Submit an empty registration form and inspect the validation messages.
3. Enter sample student details, select a department and year, accept the demo terms, and submit.
4. Open the event pass and find the registration in My bookings.
5. Cancel the registration and check that the event has one more available seat.
6. Refresh to confirm persistence, then create an event in Organizer studio and find it in Discovery.

The code demonstrates reusable components and props, local state, shared state through Context and useReducer, event handlers, effects for browser storage, conditional rendering, and client-side form validation.

## Current limitations

- Student login/signup requires a configured Supabase project and email delivery settings. Event bookings still have no shared backend, payments, booking emails, or external ticket verification. Organizer studio remains an open local demo and grants no database permissions.
- Records belong to the browser profile and origin where they were created. They do not synchronize across users or devices. Use fictional student details; localStorage is not appropriate for sensitive records.
- Tabs on the same origin receive storage updates, but concurrent writes are last-write-wins. Capacity is not a shared, transactional reservation system.
- Clearing browser storage removes saved records. If storage is unavailable, the app displays a notice and changes last only for the current session.
- Persisted events eventually become past events. Reset the demo to generate new upcoming dates.
- Poster themes use fixed artwork and lettering. Custom event titles appear separately in the interface and pass. The pass barcode is decorative and cannot verify entry.
