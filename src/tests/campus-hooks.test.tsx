import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../app/auth";
import { useAccountQuery, useCampusAction } from "../features/campus/hooks";
import { authSession } from "./auth-fixtures";
import { bookingFixture, eventFixture } from "./campus-fixtures";
const mocks = vi.hoisted(() => ({ book: vi.fn() }));
vi.mock("../app/auth", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/campus/repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/campus/repository")>()),
  getCampusRepository: () => ({ book: mocks.book }),
}));
let auth: ReturnType<typeof useAuth>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
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
  mocks.book.mockReset();
});
describe("live account query and action isolation", () => {
  it("masks previous bookings immediately and discards a late account A response", async () => {
    const pending = deferred<ReturnType<typeof bookingFixture>[]>();
    const b = authSession("00000000-0000-4000-8000-000000000002");
    const load = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce([bookingFixture(b.user.id)]);
    const view = renderHook(() => useAccountQuery<ReturnType<typeof bookingFixture>[]>(load));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    auth = { ...auth, session: b, user: b.user };
    view.rerender();
    expect(view.result.current.data).toBeNull();
    await waitFor(() =>
      expect(view.result.current.data?.[0].student_id).toBe(b.user.id),
    );
    await act(async () => pending.resolve([bookingFixture()]));
    expect(view.result.current.data?.[0].student_id).toBe(b.user.id);
  });
  it("clears bookings synchronously on sign-out without modifying demo storage", async () => {
    localStorage.setItem("campuspass.demo.v1", "fictional demo");
    const load = vi.fn().mockResolvedValue([bookingFixture()]);
    const view = renderHook(() => useAccountQuery<ReturnType<typeof bookingFixture>[]>(load));
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    auth = { ...auth, status: "unauthenticated", session: null, user: null };
    view.rerender();
    expect(view.result.current.data).toBeNull();
    expect(localStorage.getItem("campuspass.demo.v1")).toBe("fictional demo");
  });
  it("aborts an in-flight mutation and never announces success after an account switch", async () => {
    const pending = deferred<ReturnType<typeof bookingFixture>>();
    mocks.book.mockReturnValue(pending.promise);
    const view = renderHook(useCampusAction);
    let saving!: Promise<unknown>;
    act(() => {
      saving = view.result.current.run((repo, owner, signal) =>
        repo.book(owner, eventFixture().id, crypto.randomUUID(), signal),
      );
    });
    const rejected = expect(saving).rejects.toMatchObject({
      name: "AbortError",
    });
    const signal = mocks.book.mock.calls[0][3] as AbortSignal;
    const b = authSession("00000000-0000-4000-8000-000000000002");
    auth = { ...auth, session: b, user: b.user };
    view.rerender();
    expect(signal.aborted).toBe(true);
    expect(view.result.current.busy).toBe(false);
    await act(async () => pending.resolve(bookingFixture()));
    await rejected;
    expect(view.result.current.error).toBeNull();
  });
  it("prevents two queued mutations from dispatching duplicate requests", async () => {
    const pending = deferred<ReturnType<typeof bookingFixture>>();
    mocks.book.mockReturnValue(pending.promise);
    const view = renderHook(useCampusAction);
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => {
      first = view.result.current.run((repo, owner, signal) =>
        repo.book(owner, eventFixture().id, crypto.randomUUID(), signal),
      );
      second = view.result.current.run((repo, owner, signal) =>
        repo.book(owner, eventFixture().id, crypto.randomUUID(), signal),
      );
    });
    await expect(second).rejects.toMatchObject({ code: "busy" });
    expect(mocks.book).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(bookingFixture()));
    await first;
  });
  it("never loads real account data in demo mode", async () => {
    auth = { ...auth, status: "disabled", session: null, user: null };
    const load = vi.fn();
    renderHook(() => useAccountQuery<ReturnType<typeof bookingFixture>[]>(load));
    await act(async () => {});
    expect(load).not.toHaveBeenCalled();
  });
});
