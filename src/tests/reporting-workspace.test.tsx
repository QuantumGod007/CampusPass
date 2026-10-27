import {
  act,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "../app/auth";
import { authSession } from "./auth-fixtures";
import { CampusAnalytics } from "../features/campus/analytics";
import { CampusParticipationPanel } from "../features/campus/participation";
import { CampusError } from "../lib/campus/repository";
import {
  analyticsFixture,
  headerFixture,
  pageFixture,
  participationFixture,
  reportingEventId,
  reportingBookingId,
} from "./reporting-fixtures";
const mocks = vi.hoisted(() => ({
  analytics: vi.fn(),
  startReport: vi.fn(),
  reportPage: vi.fn(),
  participation: vi.fn(),
}));
vi.mock("../app/auth", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/campus/repository", async (original) => ({
  ...(await original<typeof import("../lib/campus/repository")>()),
  getCampusRepository: () => mocks,
}));
let auth: ReturnType<typeof useAuth>;
beforeEach(() => {
  vi.clearAllMocks();
  const session = authSession();
  auth = {
    status: "authenticated",
    session,
    user: session.user,
    error: null,
    isSigningOut: false,
    isPasswordRecovery: false,
    retry: vi.fn(),
    signOut: vi.fn(),
  };
  vi.mocked(useAuth).mockImplementation(() => auth);
  mocks.analytics.mockResolvedValue(analyticsFixture());
  mocks.startReport.mockResolvedValue(headerFixture());
  mocks.reportPage.mockResolvedValue(pageFixture());
  mocks.participation.mockResolvedValue(participationFixture());
});
afterEach(() => vi.restoreAllMocks());
function analytics() {
  return render(
    <MemoryRouter
      initialEntries={[`/campus/organizer/${reportingEventId}/analytics`]}
    >
      <Routes>
        <Route
          path="/campus/organizer/:eventId/analytics"
          element={<CampusAnalytics />}
        />
      </Routes>
    </MemoryRouter>,
  );
}
function participation() {
  return render(
    <MemoryRouter>
      <CampusParticipationPanel bookingId={reportingBookingId} />
    </MemoryRouter>,
  );
}
describe("reporting UI with mocked repositories; actual authorization verified separately", () => {
  it("displays server totals and distinguishes history from active attendance", async () => {
    analytics();
    await screen.findByRole("heading", { name: "Shared Attendance Workshop" });
    expect(screen.getByText("Current confirmed")).toBeVisible();
    expect(screen.getByText("Historical cancellations")).toBeVisible();
    expect(screen.getByText("All successful check-ins")).toBeVisible();
    expect(
      screen.getByText(/1 checked in \/ 2 current confirmed registrations/),
    ).toBeVisible();
    expect(mocks.reportPage).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Download complete CSV" }),
    ).toBeDisabled();
  });
  it("generates an authorized snapshot before displaying attendee rows", async () => {
    analytics();
    await screen.findByRole("button", { name: "Generate attendee report" });
    fireEvent.click(
      screen.getByRole("button", { name: "Generate attendee report" }),
    );
    await screen.findByText("CP-report-1");
    expect(mocks.startReport).toHaveBeenCalledWith(
      auth.user!.id,
      reportingEventId,
      expect.any(String),
      expect.any(AbortSignal),
    );
    expect(
      screen.getByRole("button", { name: "Download complete CSV" }),
    ).toBeEnabled();
  });
  it("does not announce report completion on network failure", async () => {
    mocks.startReport.mockRejectedValue(
      new CampusError("unavailable", "Connection failed."),
    );
    analytics();
    await screen.findByRole("button", { name: "Generate attendee report" });
    fireEvent.click(
      screen.getByRole("button", { name: "Generate attendee report" }),
    );
    await screen.findByRole("alert");
    expect(
      screen.getByRole("button", { name: "Download complete CSV" }),
    ).toBeDisabled();
    expect(screen.queryByText("CP-report-1")).not.toBeInTheDocument();
  });
  it("masks a late analytics response after an account switch", async () => {
    let resolve!: (v: unknown) => void;
    mocks.analytics.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const view = analytics();
    await waitFor(() => expect(mocks.analytics).toHaveBeenCalledTimes(1));
    auth = { ...auth, status: "unauthenticated", session: null, user: null };
    view.rerender(
      <MemoryRouter>
        <CampusAnalytics />
      </MemoryRouter>,
    );
    await act(async () => resolve(analyticsFixture()));
    expect(
      screen.queryByText("Shared Attendance Workshop"),
    ).not.toBeInTheDocument();
  });
  it("renders unauthorized analytics as an error with no private statistics", async () => {
    mocks.analytics.mockRejectedValue(
      new CampusError(
        "P1007",
        "Only the owning organizer can access this event.",
      ),
    );
    analytics();
    await screen.findByRole("alert");
    expect(
      screen.queryByText("Historical cancellations"),
    ).not.toBeInTheDocument();
  });
  it("discards a late generated report after sign-out", async () => {
    let resolve!: (v: unknown) => void;
    mocks.startReport.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const view = analytics();
    await screen.findByRole("button", { name: "Generate attendee report" });
    fireEvent.click(
      screen.getByRole("button", { name: "Generate attendee report" }),
    );
    await waitFor(() => expect(mocks.startReport).toHaveBeenCalledTimes(1));
    const signal = mocks.startReport.mock.calls[0][3] as AbortSignal;
    auth = { ...auth, status: "unauthenticated", session: null, user: null };
    view.rerender(
      <MemoryRouter>
        <CampusAnalytics />
      </MemoryRouter>,
    );
    await act(async () => resolve(headerFixture()));
    expect(signal.aborted).toBe(true);
    expect(screen.queryByText("CP-report-1")).not.toBeInTheDocument();
  });
  it("shows a genuine acknowledgement and invokes the browser print action", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    participation();
    await screen.findByText("Student Alpha");
    expect(screen.getByText(/does not prove physical identity/)).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Print / save participation record" }),
    );
    expect(print).toHaveBeenCalledTimes(1);
    expect(screen.getByText(participationFixture().record.id)).toBeVisible();
  });
  it.each([
    "event_not_ended",
    "not_checked_in",
    "event_cancelled",
    "booking_cancelled",
  ] as const)(
    "never offers printing when the server reports %s",
    async (reason) => {
      mocks.participation.mockResolvedValue({
        booking_id: reportingBookingId,
        checked_in_at: null,
        reason,
        record: null,
      });
      participation();
      await screen.findByRole("status");
      expect(
        screen.queryByRole("button", {
          name: "Print / save participation record",
        }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Student Alpha")).not.toBeInTheDocument();
    },
  );
  it("clears the previous private participation record on sign-out", async () => {
    const view = participation();
    await screen.findByText("Student Alpha");
    auth = { ...auth, status: "unauthenticated", session: null, user: null };
    view.rerender(
      <MemoryRouter>
        <CampusParticipationPanel bookingId={reportingBookingId} />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Student Alpha")).not.toBeInTheDocument();
  });
});
