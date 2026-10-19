import { StrictMode, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
} from "@supabase/supabase-js";
import { AuthProvider, useAuth } from "../app/auth";
import { getSupabaseClient } from "../lib/auth/client";
import { AuthConfigurationError } from "../lib/auth/config";
import { authSession } from "./auth-fixtures";

vi.mock("../lib/auth/client", () => ({ getSupabaseClient: vi.fn() }));

type Listener = (event: AuthChangeEvent, session: Session | null) => void;
const listeners = new Set<Listener>();
const subscriptions: ReturnType<typeof vi.fn>[] = [];
const getSession = vi.fn(async () => ({
  data: { session: null as Session | null },
  error: null as Error | null,
}));
const signOut = vi.fn(async () => ({ error: null as Error | null }));
const onAuthStateChange = vi.fn((callback: Listener) => {
  listeners.add(callback);
  const unsubscribe = vi.fn(() => {
    listeners.delete(callback);
  });
  subscriptions.push(unsubscribe);
  return { data: { subscription: { unsubscribe } } };
});
const client = {
  auth: { getSession, signOut, onAuthStateChange },
} as unknown as SupabaseClient;

function emit(event: AuthChangeEvent, session: Session | null) {
  for (const listener of listeners) listener(event, session);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const setup = () => renderHook(useAuth, { wrapper: AuthProvider });

beforeEach(() => {
  vi.stubEnv("VITE_AUTH_ENABLED", "true");
  vi.stubEnv("VITE_SUPABASE_URL", "https://campuspass-provider.example.test");
  vi.stubEnv(
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_provider-fixture",
  );
  listeners.clear();
  subscriptions.length = 0;
  getSession
    .mockReset()
    .mockResolvedValue({ data: { session: null }, error: null });
  signOut.mockReset().mockResolvedValue({ error: null });
  onAuthStateChange.mockClear();
  vi.mocked(getSupabaseClient).mockReset().mockReturnValue(client);
});

afterEach(() => vi.unstubAllEnvs());

describe("authentication session lifecycle", () => {
  it("starts loading and restores a persisted session through the SDK", async () => {
    const session = authSession();
    getSession.mockResolvedValue({ data: { session }, error: null });
    const { result } = setup();
    expect(result.current.status).toBe("loading");
    expect(result.current.user).toBeNull();
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(result.current.session).toBe(session);
    expect(result.current.user).toBe(session.user);
    expect(onAuthStateChange.mock.invocationCallOrder[0]).toBeLessThan(
      getSession.mock.invocationCallOrder[0],
    );
  });

  it("settles as unauthenticated when no session exists", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    expect(result.current.session).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("keeps demo mode disabled without subscribing or reading auth storage", async () => {
    vi.stubEnv("VITE_AUTH_ENABLED", "false");
    localStorage.setItem("campuspass.demo.v1", "preserve-demo");
    localStorage.setItem("campuspass.auth.v1", "preserve-auth");
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe("disabled"));
    expect(onAuthStateChange).not.toHaveBeenCalled();
    expect(getSupabaseClient).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
    await expect(result.current.signOut()).resolves.toBe(false);
    expect(localStorage.getItem("campuspass.demo.v1")).toBe("preserve-demo");
    expect(localStorage.getItem("campuspass.auth.v1")).toBe("preserve-auth");
  });

  it("surfaces a safe configuration error without silently enabling demo fallback", async () => {
    vi.mocked(getSupabaseClient).mockImplementation(() => {
      throw new AuthConfigurationError("Set VITE_SUPABASE_URL.");
    });
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("Set VITE_SUPABASE_URL.");
    expect(getSession).not.toHaveBeenCalled();
  });

  it.each(["resolved", "rejected"])(
    "redacts a %s SDK restoration error and permits retry",
    async (mode) => {
      const error = new Error("private-token-and-student-data");
      if (mode === "resolved")
        getSession.mockResolvedValueOnce({ data: { session: null }, error });
      else getSession.mockRejectedValueOnce(error);
      const { result } = setup();
      await waitFor(() => expect(result.current.status).toBe("error"));
      expect(result.current.error).toContain("restore your account session");
      expect(result.current.error).not.toContain(error.message);
      act(() => result.current.retry());
      expect(result.current.status).toBe("loading");
      await waitFor(() =>
        expect(result.current.status).toBe("unauthenticated"),
      );
      expect(subscriptions[0]).toHaveBeenCalledOnce();
      expect(listeners.size).toBe(1);
      expect(result.current.error).toBeNull();
    },
  );

  it("follows sign-in, token refresh, user changes, recovery, and sign-out events", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    const session = authSession();
    act(() => emit("SIGNED_IN", session));
    expect(result.current.user?.id).toBe(session.user.id);
    const refreshed = { ...session, access_token: "refreshed-fixture-token" };
    act(() => emit("TOKEN_REFRESHED", refreshed));
    expect(result.current.session?.access_token).toBe(
      "refreshed-fixture-token",
    );
    act(() => emit("PASSWORD_RECOVERY", refreshed));
    expect(result.current.isPasswordRecovery).toBe(true);
    act(() => emit("TOKEN_REFRESHED", refreshed));
    expect(result.current.isPasswordRecovery).toBe(true);
    const updated = {
      ...refreshed,
      user: { ...session.user, email: "updated@example.test" },
    };
    act(() => emit("USER_UPDATED", updated));
    expect(result.current.user?.email).toBe("updated@example.test");
    expect(result.current.isPasswordRecovery).toBe(false);
    act(() => emit("SIGNED_OUT", null));
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.user).toBeNull();
  });

  it.each(["resolve", "reject"])(
    "does not let a stale initial %s overwrite a newer auth event",
    async (mode) => {
      const pending = deferred<Awaited<ReturnType<typeof getSession>>>();
      getSession.mockReturnValueOnce(pending.promise);
      const { result } = setup();
      await waitFor(() => expect(getSession).toHaveBeenCalledOnce());
      act(() => emit("SIGNED_IN", authSession()));
      await act(async () => {
        if (mode === "resolve")
          pending.resolve({ data: { session: null }, error: null });
        else pending.reject(new Error("stale-error"));
      });
      expect(result.current.status).toBe("authenticated");
      expect(result.current.error).toBeNull();
    },
  );

  it("does not resurrect a signed-out account when restoration completes late", async () => {
    const pending = deferred<Awaited<ReturnType<typeof getSession>>>();
    getSession.mockReturnValueOnce(pending.promise);
    const { result } = setup();
    await waitFor(() => expect(getSession).toHaveBeenCalledOnce());
    act(() => emit("SIGNED_OUT", null));
    await act(async () =>
      pending.resolve({ data: { session: authSession() }, error: null }),
    );
    expect(result.current.status).toBe("unauthenticated");
  });

  it("does not let INITIAL_SESSION mask a failed restoration", async () => {
    const pending = deferred<Awaited<ReturnType<typeof getSession>>>();
    getSession.mockReturnValueOnce(pending.promise);
    const { result } = setup();
    await waitFor(() => expect(getSession).toHaveBeenCalledOnce());
    act(() => emit("INITIAL_SESSION", null));
    await act(async () =>
      pending.resolve({
        data: { session: null },
        error: new Error("unavailable"),
      }),
    );
    expect(result.current.status).toBe("error");
  });

  it("ignores abandoned restoration requests and unsubscribes when retrying", async () => {
    const pending = deferred<Awaited<ReturnType<typeof getSession>>>();
    getSession.mockReturnValueOnce(pending.promise);
    const { result } = setup();
    await waitFor(() => expect(getSession).toHaveBeenCalledOnce());
    act(() => result.current.retry());
    await waitFor(() => expect(getSession).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    await act(async () =>
      pending.resolve({ data: { session: authSession() }, error: null }),
    );
    expect(result.current.status).toBe("unauthenticated");
    expect(subscriptions[0]).toHaveBeenCalledOnce();
  });

  it("has one active subscription under StrictMode and cleans it up on unmount", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>
        <AuthProvider>{children}</AuthProvider>
      </StrictMode>
    );
    const { unmount } = renderHook(useAuth, { wrapper });
    await waitFor(() => expect(listeners.size).toBe(1));
    expect(getSession).toHaveBeenCalledOnce();
    unmount();
    expect(listeners.size).toBe(0);
    expect(
      subscriptions.every((unsubscribe) => unsubscribe.mock.calls.length === 1),
    ).toBe(true);
  });

  it("ignores late requests and event callbacks after unmount", async () => {
    const pending = deferred<Awaited<ReturnType<typeof getSession>>>();
    getSession.mockReturnValueOnce(pending.promise);
    const { result, unmount } = setup();
    await waitFor(() => expect(getSession).toHaveBeenCalledOnce());
    const callback = onAuthStateChange.mock.calls[0][0];
    unmount();
    await act(async () => {
      pending.resolve({ data: { session: authSession() }, error: null });
      callback("SIGNED_IN", authSession());
    });
    expect(result.current.status).toBe("loading");
    expect(listeners.size).toBe(0);
  });

  it("requires useAuth consumers to be inside the provider", () => {
    expect(() => renderHook(useAuth)).toThrow("inside AuthProvider");
  });
});

describe("session logout", () => {
  async function signedIn() {
    getSession.mockResolvedValueOnce({
      data: { session: authSession() },
      error: null,
    });
    const hook = setup();
    await waitFor(() =>
      expect(hook.result.current.status).toBe("authenticated"),
    );
    return hook;
  }

  it("signs out this browser through Supabase without clearing demo records", async () => {
    const { result } = await signedIn();
    localStorage.setItem("campuspass.demo.v1", "keep-bookings");
    await act(async () => expect(await result.current.signOut()).toBe(true));
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.session).toBeNull();
    expect(result.current.isSigningOut).toBe(false);
    expect(localStorage.getItem("campuspass.demo.v1")).toBe("keep-bookings");
  });

  it("invalidates the old client immediately when retry and logout are requested together", async () => {
    const { result } = await signedIn();
    let request!: Promise<boolean>;
    act(() => {
      result.current.retry();
      request = result.current.signOut();
    });
    await expect(request).resolves.toBe(false);
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    expect(signOut).not.toHaveBeenCalled();
    expect(result.current.isSigningOut).toBe(false);
  });

  it("shares one in-flight logout request and reports progress", async () => {
    const pending = deferred<Awaited<ReturnType<typeof signOut>>>();
    signOut.mockReturnValueOnce(pending.promise);
    const { result } = await signedIn();
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.signOut();
      second = result.current.signOut();
    });
    expect(first).toBe(second);
    expect(result.current.isSigningOut).toBe(true);
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    await act(async () => {
      pending.resolve({ error: null });
      await first;
    });
    expect(result.current.isSigningOut).toBe(false);
  });

  it.each(["resolved", "rejected"])(
    "handles a %s logout failure without claiming success",
    async (mode) => {
      const error = new Error("private-token-in-server-error");
      if (mode === "resolved") signOut.mockResolvedValueOnce({ error });
      else signOut.mockRejectedValueOnce(error);
      const { result } = await signedIn();
      await act(async () => expect(await result.current.signOut()).toBe(false));
      expect(result.current.status).toBe("authenticated");
      expect(result.current.error).toContain("confirm sign-out");
      expect(result.current.error).not.toContain(error.message);
      expect(result.current.isSigningOut).toBe(false);
      await act(async () => expect(await result.current.signOut()).toBe(true));
      expect(signOut).toHaveBeenCalledTimes(2);
      expect(result.current.error).toBeNull();
    },
  );

  it("honors SDK local cleanup when remote logout fails", async () => {
    signOut.mockImplementationOnce(async () => {
      emit("SIGNED_OUT", null);
      return { error: new Error("remote logout failed") };
    });
    const { result } = await signedIn();
    await act(async () => expect(await result.current.signOut()).toBe(false));
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.session).toBeNull();
    expect(result.current.error).toContain("confirm sign-out");
  });

  it("does not let a late logout response overwrite a newer sign-in", async () => {
    const pending = deferred<Awaited<ReturnType<typeof signOut>>>();
    signOut.mockReturnValueOnce(pending.promise);
    const { result } = await signedIn();
    let request!: Promise<boolean>;
    act(() => {
      request = result.current.signOut();
    });
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    const next = authSession("00000000-0000-4000-8000-000000000002");
    act(() => emit("SIGNED_IN", next));
    await act(async () => {
      pending.resolve({ error: null });
      await request;
    });
    expect(result.current.user?.id).toBe(next.user.id);
  });

  it("exits loading if a logout started during restoration fails", async () => {
    const pending = deferred<Awaited<ReturnType<typeof getSession>>>();
    getSession.mockReturnValueOnce(pending.promise);
    signOut.mockRejectedValueOnce(new Error("offline"));
    const { result } = setup();
    await waitFor(() => expect(getSession).toHaveBeenCalledOnce());
    await act(async () => expect(await result.current.signOut()).toBe(false));
    await act(async () =>
      pending.resolve({ data: { session: authSession() }, error: null }),
    );
    expect(result.current.status).toBe("error");
    expect(result.current.session).toBeNull();
  });
});
