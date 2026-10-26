import {
  act,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useAuth } from "../app/auth";
import { CampusEntryPass, CampusCheckin } from "../features/campus/admission";
import { CampusError } from "../lib/campus/repository";
import { authSession } from "./auth-fixtures";
const mocks = vi.hoisted(() => ({
  passStatus: vi.fn(),
  issuePass: vi.fn(),
  scanPass: vi.fn(),
  checkins: vi.fn(),
}));
vi.mock("../app/auth", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/campus/repository", async (original) => ({
  ...(await original<typeof import("../lib/campus/repository")>()),
  getCampusRepository: () => mocks,
}));
const id = "00000000-0000-4000-8000-000000000011",
  event = "00000000-0000-4000-8000-000000000012";
const token = "cp1_" + "a".repeat(64);
let auth: ReturnType<typeof useAuth>;
function status() {
  return {
    booking_id: id,
    eligible: true,
    checked_in_at: null,
    server_now: new Date().toISOString(),
    opens_at: new Date().toISOString(),
    closes_at: new Date(Date.now() + 3600000).toISOString(),
  };
}
function issued() {
  const server_now = new Date().toISOString();
  return {
    outcome: "issued" as const,
    booking_id: id,
    token,
    server_now,
    expires_at: new Date(Date.parse(server_now) + 90000).toISOString(),
  };
}
function checkins() {
  return {
    event_id: event,
    confirmed_count: 2,
    admitted_count: 0,
    history: [],
    server_now: new Date().toISOString(),
    opens_at: new Date().toISOString(),
    closes_at: new Date().toISOString(),
    event_status: "published",
  };
}
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
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  mocks.passStatus.mockResolvedValue(status());
  mocks.issuePass.mockImplementation(async () => issued());
  mocks.checkins.mockResolvedValue(checkins());
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function pass() {
  return render(
    <MemoryRouter>
      <CampusEntryPass bookingId={id} />
    </MemoryRouter>,
  );
}
function scanner() {
  return render(
    <MemoryRouter initialEntries={[`/campus/organizer/${event}/check-in`]}>
      <Routes>
        <Route
          path="/campus/organizer/:eventId/check-in"
          element={<CampusCheckin />}
        />
      </Routes>
    </MemoryRouter>,
  );
}
describe("admission UI with mocked repository (security proven separately against PostgreSQL)", () => {
  it("requests a real credential only on demand, renders a QR and never persists it", async () => {
    const user = userEvent.setup();
    pass();
    await screen.findByRole("button", { name: "Show entry pass" });
    expect(mocks.issuePass).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Show entry pass" }));
    await screen.findByRole("img", { name: "Temporary event entry QR code" });
    expect(mocks.issuePass).toHaveBeenCalledWith(
      auth.user!.id,
      id,
      expect.any(AbortSignal),
    );
    expect(screen.getByRole("timer")).toHaveTextContent(
      /Expires in (89|90) seconds/,
    );
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
  it("clears the credential immediately when hidden and does not poll while inactive", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    pass();
    await screen.findByRole("button", { name: "Show entry pass" });
    fireEvent.click(screen.getByRole("button", { name: "Show entry pass" }));
    await screen.findByRole("img");
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    const calls = mocks.passStatus.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    expect(mocks.passStatus).toHaveBeenCalledTimes(calls);
  });
  it("clears an offline pass instead of implying offline verification", async () => {
    pass();
    await screen.findByRole("button", { name: "Show entry pass" });
    fireEvent.click(screen.getByRole("button", { name: "Show entry pass" }));
    await screen.findByRole("img");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
  it("removes expired QR credentials using the server TTL rather than the wall clock", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    pass();
    await screen.findByRole("button", { name: "Show entry pass" });
    fireEvent.click(screen.getByRole("button", { name: "Show entry pass" }));
    await screen.findByRole("img");
    await act(async () => vi.advanceTimersByTimeAsync(91000));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
  it("never renders a late credential after an account switch", async () => {
    let resolve!: (value: ReturnType<typeof issued>) => void;
    mocks.issuePass.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const view = pass();
    await screen.findByRole("button", { name: "Show entry pass" });
    fireEvent.click(screen.getByRole("button", { name: "Show entry pass" }));
    await waitFor(() => expect(mocks.issuePass).toHaveBeenCalledTimes(1));
    const signal = mocks.issuePass.mock.calls[0][2] as AbortSignal;
    const session = authSession("00000000-0000-4000-8000-000000000002");
    auth = { ...auth, session, user: session.user };
    view.rerender(
      <MemoryRouter>
        <CampusEntryPass bookingId={id} />
      </MemoryRouter>,
    );
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(issued()));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText(token)).not.toBeInTheDocument();
  });
  it("displays checked-in server history and offers no new pass", async () => {
    mocks.passStatus.mockResolvedValue({
      ...status(),
      checked_in_at: new Date().toISOString(),
      eligible: false,
    });
    pass();
    await screen.findByText("Checked in");
    expect(
      screen.queryByRole("button", { name: "Show entry pass" }),
    ).not.toBeInTheDocument();
  });
  it("keeps cancelled/out-of-window bookings ineligible and offers useful refresh", async () => {
    mocks.passStatus.mockResolvedValue({ ...status(), eligible: false });
    pass();
    expect(
      await screen.findByRole("button", { name: "Show entry pass" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh admission status" }),
    );
    await waitFor(() => expect(mocks.passStatus).toHaveBeenCalledTimes(2));
  });
  it("rejects a booking reference without dispatching scan work", async () => {
    const user = userEvent.setup();
    scanner();
    await screen.findByLabelText("Entry code");
    await user.type(
      screen.getByLabelText("Entry code"),
      "CP-booking-reference",
    );
    await user.click(
      screen.getByRole("button", { name: "Validate and check in" }),
    );
    expect(mocks.scanPass).not.toHaveBeenCalled();
    expect(screen.getByText(/Invalid pass for this event/)).toBeVisible();
  });
  it("refreshes genuine counts and clears the secret after successful submission", async () => {
    mocks.scanPass.mockResolvedValue({
      outcome: "admitted",
      reference: "CP-test",
      checked_in_at: new Date().toISOString(),
    });
    const user = userEvent.setup();
    scanner();
    await screen.findByLabelText("Entry code");
    await user.type(screen.getByLabelText("Entry code"), token);
    await user.click(
      screen.getByRole("button", { name: "Validate and check in" }),
    );
    await screen.findByText(/Admitted — check-in recorded/);
    expect(screen.getByLabelText("Entry code")).toHaveValue("");
    await waitFor(() => expect(mocks.checkins).toHaveBeenCalledTimes(2));
  });
  it("never announces admission when a network response is lost", async () => {
    mocks.scanPass.mockRejectedValue(
      new CampusError("unavailable", "Connection failed."),
    );
    scanner();
    await screen.findByLabelText("Entry code");
    fireEvent.change(screen.getByLabelText("Entry code"), {
      target: { value: token },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Validate and check in" }),
    );
    await screen.findByRole("alert");
    expect(
      screen.queryByText(/Admitted — check-in recorded/),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/The result is unconfirmed/)).toBeVisible();
  });
  it("returns an accessible camera fallback when the browser API is unsupported", async () => {
    scanner();
    await screen.findByLabelText("Entry code");
    fireEvent.click(screen.getByRole("button", { name: "Scan with camera" }));
    await screen.findByText(/Camera unavailable/);
    expect(screen.getByLabelText("Entry code")).toBeEnabled();
  });
  it("never displays another organizer history on a denied server read", async () => {
    mocks.checkins.mockRejectedValue(
      new CampusError(
        "P1007",
        "Only the owning organizer may access this event.",
      ),
    );
    scanner();
    await screen.findByRole("alert");
    expect(screen.queryByLabelText("Entry code")).not.toBeInTheDocument();
  });
});
