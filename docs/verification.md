# CampusPass verification record

Verified 18 October 2026 (Asia/Kolkata).

| Check | Actual result |
| --- | --- |
| Node.js | v22.23.2 |
| `npm run typecheck` | Passed; strict TypeScript compilation |
| `npm run lint` | Passed; no errors or warnings |
| `npm test` | 6 files, 59 tests passed |
| `npm run build` | Passed; Vite 8 production output generated in `dist/` |
| `npm run test:e2e` | All 31 Chromium scenarios passed against production Vite Preview; 25.9 seconds |
| Accessibility | No axe WCAG 2 A/AA or 2.1 AA violations in the tested main screens, digital pass, organizer dialog, and cancellation dialog; also mobile registration and organizer validation-error states |
| Design preservation | Stylesheet, font imports, all 12 posters, and favicon remain byte-identical. Desktop discovery and mobile registration screenshots are pixel-identical to the pre-audit captures. No layout, typography, color, or animation changes were made. |
| Responsive behavior | No document overflow across six principal routes at 1440, 1024, 768, 390, and 320px; organizer dialog fits each viewport |
| Artwork | All 12 SVG covers parse; browser checks verify intended poster URLs without fallback, load success, and nonzero image dimensions |
| Browser console | Homepage loaded without console errors or uncaught page errors |
| Direct URLs | Production-preview direct route loads and refreshes passed; missing events/bookings and unknown routes show recovery screens |
| Vercel configuration | Explicit Vite framework, build command, and `dist` output; SPA rewrite behavior checked for nested routes and static assets; all supplied options validated against their official Vercel schema definitions |
| Printing | Print action invocation and mobile print layout tested; print CSS preserves the pass and demo label while hiding application controls |
| Visual review | Desktop discovery, mobile discovery, registration, and demo pass screenshots inspected. The existing visual design was retained; this audit changed functionality and accessibility semantics only |
| Production bundles | Route and vendor chunks; application entry approximately 81 KB; largest vendor chunk approximately 304 KB; no oversized-chunk warning |

## Functional fixes from this audit

The original baseline passed 51 unit/component tests and 20 browser tests. Additional regression tests first reproduced these failures before the fixes were applied:

- Two queued organizer form submissions could create two events. A synchronous submission guard now permits one save and still releases the guard after a validation/domain failure.
- Next-7/30-day filters included events that started earlier today. Upcoming filters now exclude events at or before the current time.
- A `localStorage.clear()` call in another tab left stale records visible because its storage event has a null key. The store now handles that event and ignores unrelated sessionStorage updates.
- Booking search did not normalize surrounding whitespace. It now trims queries consistently with Discovery.
- Required-field semantics were absent from the registration form, and the organizer description hint was not associated with its textarea. ARIA attributes now expose these existing requirements and hints without changing visible labels or styles.

The final suite passed after these fixes. No dependencies or versions in the project were changed.

The upstream Vercel schema declares draft-04 but contains newer keywords in unrelated server-function options. The schema check used the unchanged definitions for every option supplied by this frontend; unused server sections were excluded from compilation.

## Functional scenarios exercised

Discovery and all filters; bookmark state synchronization and refresh persistence; empty and invalid registration; first-error focus and retained values; valid registration with leading-zero PRN; duplicate and double-click prevention; sold-out, past, malformed and missing event routes; digital pass; booking title/holder/reference search, upcoming/past/cancelled views; confirmed cancellation and exactly one released local seat; cancellation persistence and rebooking; organizer invalid dates/capacities, create/edit, attendee records, preservation of registrations and minimum capacity; corruption recovery, storage-write failure feedback, cross-tab synchronization/clearing, sessionStorage isolation, and reset; clipboard success and failure feedback; poster image fallback; mobile navigation and focus restoration.

Vercel configuration follows the [official Vite SPA documentation](https://vercel.com/docs/frameworks/frontend/vite#using-vite-to-make-spas).

The unit tests exercise booking mutations and validation independently from React. Component tests exercise actual fields and submissions. Browser tests run real navigation and interactions against the built application, not a mocked network.

## Practical limits

Testing used the installed Google Chrome browser on macOS. Safari, Firefox, and real mobile hardware were not independently tested. Automated accessibility checks do not certify every possible interaction or assistive technology. Physical printer output was not tested.

No external deployment was created. `vercel.json` prepares SPA route rewriting; deployed-host verification must occur after importing and deploying the repository through the user’s Vercel account. Browser-local demo data does not provide transactional multi-user booking or ticket verification.

Screenshots are in [`screenshots/`](screenshots/). Playwright’s generated HTML report and failure artifacts are intentionally ignored by Git; rerun `npm run test:e2e` to regenerate them.
