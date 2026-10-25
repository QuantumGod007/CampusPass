import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../app/auth";
import { ProfileProvider, useStudentProfile } from "../app/profile";
import { authSession } from "./auth-fixtures";
import { profileAccount, profileValues } from "./profile-fixtures";
const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("../app/auth", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/profiles/repository", () => ({
  getProfileRepository: () => ({ load: mocks.load, save: mocks.save }),
}));
let auth: ReturnType<typeof useAuth>;
beforeEach(() => {
  const session = authSession();
  auth = {
    status: "authenticated",
    session,
    user: session.user,
    error: null,
    isPasswordRecovery: false,
    isSigningOut: false,
    retry: vi.fn(),
    signOut: vi.fn(),
  };
  vi.mocked(useAuth).mockImplementation(() => auth);
  mocks.load.mockReset().mockResolvedValue(profileAccount());
  mocks.save.mockReset().mockResolvedValue(profileAccount(undefined, true));
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
describe("account data lifecycle independent of demo storage", () => {
  it("loads after authentication and saves once for queued submissions", async () => {
    const view = renderHook(useStudentProfile, { wrapper: ProfileProvider });
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    let first!: ReturnType<typeof view.result.current.save>;
    await act(async () => {
      first = view.result.current.save(profileValues);
      const second = view.result.current.save(profileValues);
      expect(first).toBe(second);
      await first;
    });
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(view.result.current.account?.profile?.prn).toBe("002026123456");
  });
  it("masks previous data immediately and ignores a stale account load", async () => {
    const pending = deferred<ReturnType<typeof profileAccount>>();
    mocks.load
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({
        ...profileAccount("00000000-0000-4000-8000-000000000002", true),
        user: {
          id: "00000000-0000-4000-8000-000000000002",
          email: "other@example.test",
          emailConfirmedAt: undefined,
        },
      });
    const view = renderHook(useStudentProfile, { wrapper: ProfileProvider });
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    const session = authSession("00000000-0000-4000-8000-000000000002");
    auth = { ...auth, session, user: session.user };
    view.rerender();
    expect(view.result.current.account).toBeNull();
    await waitFor(() =>
      expect(view.result.current.account?.user.email).toBe(
        "other@example.test",
      ),
    );
    await act(async () => pending.resolve(profileAccount(undefined, true)));
    expect(view.result.current.account?.user.email).toBe("other@example.test");
  });
  it("clears account data on sign-out without touching demo records", async () => {
    localStorage.setItem("campuspass.demo.v1", "fictional-demo-data");
    const view = renderHook(useStudentProfile, { wrapper: ProfileProvider });
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    auth = { ...auth, status: "unauthenticated", session: null, user: null };
    view.rerender();
    expect(view.result.current.account).toBeNull();
    expect(view.result.current.status).toBe("disabled");
    expect(localStorage.getItem("campuspass.demo.v1")).toBe(
      "fictional-demo-data",
    );
  });
  it("does not query a database when auth is disabled", async () => {
    auth = { ...auth, status: "disabled", session: null, user: null };
    const view = renderHook(useStudentProfile, { wrapper: ProfileProvider });
    await act(async () => {});
    expect(view.result.current.status).toBe("disabled");
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("reports load failures and permits a real retry instead of fabricating a profile", async () => {
    mocks.load.mockRejectedValueOnce(new Error("Database unavailable"));
    const view = renderHook(useStudentProfile, { wrapper: ProfileProvider });
    await waitFor(() => expect(view.result.current.status).toBe("error"));
    expect(view.result.current.account).toBeNull();
    act(() => view.result.current.reload());
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });
});
