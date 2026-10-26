import {
  act,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useAuth } from "../app/auth";
import { authSession } from "./auth-fixtures";
import { eventFixture } from "./campus-fixtures";
import { CampusWaitlist } from "../features/campus/waitlists";
import {
  CampusNotifications,
  CampusNotificationLink,
} from "../features/campus/notifications";
import { CampusError } from "../lib/campus/repository";
const mocks = vi.hoisted(() => ({
  waitlist: vi.fn(),
  joinWaitlist: vi.fn(),
  withdrawWaitlist: vi.fn(),
  notifications: vi.fn(),
  markNotificationRead: vi.fn(),
}));
vi.mock("../app/auth", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/campus/repository", async (original) => ({
  ...(await original<typeof import("../lib/campus/repository")>()),
  getCampusRepository: () => mocks,
}));
const event = { ...eventFixture(), available_seats: 0, waiting_count: 2 };
const entry = {
  id: "74000000-0000-4000-8000-000000000001",
  event_id: event.id,
  status: "waiting",
  position: 1,
  booking_id: null,
  booking_status: null,
  reason: null,
  created_at: "2026-10-26T10:00:00Z",
  updated_at: "2026-10-26T10:00:00Z",
};
const notice = {
  id: "19",
  event_id: event.id,
  booking_id: null,
  kind: "waitlist_joined",
  title: "You joined the waitlist",
  body: "A free seat may be automatically confirmed.",
  created_at: "2026-10-26T10:00:00Z",
  read_at: null,
};
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
  mocks.waitlist.mockResolvedValue({ entry: null, waiting_count: 2 });
  mocks.notifications.mockResolvedValue({
    items: [notice],
    unread_count: 1,
    has_more: false,
  });
});
function waiting() {
  return render(
    <MemoryRouter>
      <CampusWaitlist event={event} onChanged={() => {}} />
    </MemoryRouter>,
  );
}
function inbox() {
  return render(
    <MemoryRouter>
      <CampusNotifications />
    </MemoryRouter>,
  );
}
describe("waitlist and inbox UI with mocked repositories; database security tested separately", () => {
  it("requires explicit automatic-confirmation consent before joining", async () => {
    const user = userEvent.setup();
    mocks.joinWaitlist.mockResolvedValue({ outcome: "joined", entry });
    waiting();
    const join = await screen.findByRole("button", { name: "Join waitlist" });
    expect(join).toBeDisabled();
    expect(mocks.joinWaitlist).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox"));
    await user.click(join);
    await waitFor(() => expect(mocks.joinWaitlist).toHaveBeenCalledTimes(1));
    expect(mocks.joinWaitlist).toHaveBeenCalledWith(
      auth.user!.id,
      event.id,
      expect.any(String),
      expect.any(AbortSignal),
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
  it("uses the same intent after a lost response and waits for authoritative queue state", async () => {
    const user = userEvent.setup();
    mocks.joinWaitlist
      .mockRejectedValueOnce(
        new CampusError("unavailable", "Connection failed."),
      )
      .mockResolvedValueOnce({ outcome: "joined", entry });
    waiting();
    await screen.findByRole("button", { name: "Join waitlist" });
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Join waitlist" }));
    await screen.findByRole("alert");
    const key = mocks.joinWaitlist.mock.calls[0][2];
    await user.click(screen.getByRole("button", { name: "Join waitlist" }));
    await waitFor(() => expect(mocks.joinWaitlist).toHaveBeenCalledTimes(2));
    expect(mocks.joinWaitlist.mock.calls[1][2]).toBe(key);
  });
  it("displays real queue position and withdraws only that server entry", async () => {
    mocks.waitlist.mockResolvedValue({ entry, waiting_count: 2 });
    mocks.withdrawWaitlist.mockResolvedValue({ ...entry, status: "withdrawn" });
    waiting();
    await screen.findByText("You are waiting · Position 1 of 2");
    fireEvent.click(screen.getByRole("button", { name: "Leave waitlist" }));
    await waitFor(() =>
      expect(mocks.withdrawWaitlist).toHaveBeenCalledWith(
        auth.user!.id,
        entry.id,
        expect.any(AbortSignal),
      ),
    );
  });
  it("links a promotion to its genuine booking without creating a QR for waiting", async () => {
    const booking = "72000000-0000-4000-8000-000000000002";
    mocks.waitlist.mockResolvedValue({
      entry: {
        ...entry,
        status: "promoted",
        position: null,
        booking_id: booking,
        booking_status: "confirmed",
      },
      waiting_count: 1,
    });
    waiting();
    expect(
      await screen.findByRole("link", { name: "Open promoted booking" }),
    ).toHaveAttribute("href", `/campus/bookings/${booking}`);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
  it("allows joining again after a promoted booking was cancelled", async () => {
    mocks.waitlist.mockResolvedValue({
      entry: {
        ...entry,
        status: "promoted",
        position: null,
        booking_id: "72000000-0000-4000-8000-000000000002",
        booking_status: "cancelled",
      },
      waiting_count: 1,
    });
    const user = userEvent.setup();
    waiting();
    await screen.findByRole("checkbox");
    expect(
      screen.queryByRole("link", { name: "Open promoted booking" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Join waitlist" })).toBeEnabled();
  });
  it("reports a seat becoming available rather than pretending to join", async () => {
    const user = userEvent.setup();
    mocks.joinWaitlist.mockResolvedValue({ outcome: "available", entry: null });
    waiting();
    await screen.findByRole("checkbox");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Join waitlist" }));
    await screen.findByText(/A seat is available. Refresh availability/);
  });
  it("masks a late queue response after account switching", async () => {
    let resolve!: (v: unknown) => void;
    mocks.waitlist.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const view = waiting();
    await waitFor(() => expect(mocks.waitlist).toHaveBeenCalledTimes(1));
    const session = authSession("00000000-0000-4000-8000-000000000002");
    auth = { ...auth, session, user: session.user };
    mocks.waitlist.mockResolvedValue({ entry: null, waiting_count: 0 });
    view.rerender(
      <MemoryRouter>
        <CampusWaitlist event={event} onChanged={() => {}} />
      </MemoryRouter>,
    );
    await act(async () => resolve({ entry, waiting_count: 2 }));
    expect(
      screen.queryByText("You are waiting · Position 1 of 2"),
    ).not.toBeInTheDocument();
  });
  it("reads unread counts and booking/event links from the server", async () => {
    inbox();
    await screen.findByRole("heading", { name: "You joined the waitlist" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 unread notifications",
    );
    expect(screen.getByRole("link", { name: "Open event" })).toHaveAttribute(
      "href",
      `/campus/events/${event.id}`,
    );
  });
  it("marks read only after server success and refreshes the inbox", async () => {
    mocks.markNotificationRead.mockImplementation(async () => {
      mocks.notifications.mockResolvedValue({
        items: [{ ...notice, read_at: "2026-10-26T11:00:00Z" }],
        unread_count: 0,
        has_more: false,
      });
      return { id: notice.id, read_at: "2026-10-26T11:00:00Z" };
    });
    const user = userEvent.setup();
    inbox();
    await screen.findByRole("heading", { name: notice.title });
    await user.click(screen.getByRole("button", { name: /Mark as read/ }));
    await screen.findByText("READ", { exact: true });
    expect(mocks.markNotificationRead).toHaveBeenCalledWith(
      auth.user!.id,
      notice.id,
      expect.any(AbortSignal),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "0 unread notifications",
    );
  });
  it("keeps an unread message unread on a network error", async () => {
    mocks.markNotificationRead.mockRejectedValue(
      new CampusError("unavailable", "Connection failed."),
    );
    inbox();
    await screen.findByRole("heading", { name: notice.title });
    fireEvent.click(screen.getByRole("button", { name: /Mark as read/ }));
    await screen.findByRole("alert");
    expect(screen.getByText("UNREAD", { exact: true })).toBeInTheDocument();
  });
  it("clears a previous private inbox synchronously on sign-out", async () => {
    const view = inbox();
    await screen.findByRole("heading", { name: notice.title });
    auth = { ...auth, status: "unauthenticated", session: null, user: null };
    view.rerender(
      <MemoryRouter>
        <CampusNotifications />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("heading", { name: notice.title }),
    ).not.toBeInTheDocument();
  });
  it("does not restore late read-mutation success after account switch", async () => {
    let resolve!: (v: unknown) => void;
    mocks.markNotificationRead.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const view = inbox();
    await screen.findByRole("heading", { name: notice.title });
    fireEvent.click(screen.getByRole("button", { name: /Mark as read/ }));
    await waitFor(() =>
      expect(mocks.markNotificationRead).toHaveBeenCalledTimes(1),
    );
    const signal = mocks.markNotificationRead.mock.calls[0][2] as AbortSignal;
    const session = authSession("00000000-0000-4000-8000-000000000002");
    auth = { ...auth, session, user: session.user };
    mocks.notifications.mockResolvedValue({
      items: [],
      unread_count: 0,
      has_more: false,
    });
    view.rerender(
      <MemoryRouter>
        <CampusNotifications />
      </MemoryRouter>,
    );
    await act(async () =>
      resolve({ id: "19", read_at: "2026-10-26T11:00:00Z" }),
    );
    expect(signal.aborted).toBe(true);
    expect(
      screen.queryByRole("heading", { name: notice.title }),
    ).not.toBeInTheDocument();
  });
  it("refreshes the badge after a transactional mutation without polling", async () => {
    render(
      <MemoryRouter>
        <CampusNotificationLink />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("link", { name: "Notifications, 1 unread" }),
    ).toHaveTextContent("Notifications, 1 unread");
    mocks.notifications.mockResolvedValue({
      items: [],
      unread_count: 0,
      has_more: false,
    });
    act(() => window.dispatchEvent(new Event("campus-inbox-changed")));
    await screen.findByRole("link", { name: "Notifications, 0 unread" });
    expect(mocks.notifications).toHaveBeenCalledTimes(2);
  });
});
