import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AuthProvider, useAuth } from "../app/auth";
import { getSupabaseClient } from "../lib/auth/client";
import { authSession } from "./auth-fixtures";

vi.mock("../lib/auth/client", () => ({ getSupabaseClient: vi.fn() }));

let client: SupabaseClient | undefined;
let sequence = 0;
let storageKey: string;
const transport = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("VITE_AUTH_ENABLED", "true");
  vi.stubEnv("VITE_SUPABASE_URL", "https://campuspass-sdk.example.test");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_sdk-fixture");
  storageKey = `campuspass.auth.sdk-fixture-${++sequence}`;
  transport.mockReset().mockImplementation(async () => {
    throw new Error("Unexpected transport request in SDK test");
  });
});

afterEach(async () => {
  await client?.auth.dispose();
  client = undefined;
  vi.unstubAllEnvs();
});

function connect() {
  client = createClient(
    "https://campuspass-sdk.example.test",
    "sb_publishable_sdk-fixture",
    {
      auth: {
        flowType: "pkce",
        storageKey,
        storage: localStorage,
        persistSession: true,
        // Exercise refresh explicitly rather than starting background timers.
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: transport },
    },
  );
  vi.mocked(getSupabaseClient).mockReturnValue(client);
  return renderHook(useAuth, { wrapper: AuthProvider });
}

describe("session provider with the real Supabase SDK and a fixture HTTP transport", () => {
  it("restores SDK-persisted credentials and leaves demo records unchanged", async () => {
    const session = authSession();
    localStorage.setItem(storageKey, JSON.stringify(session));
    localStorage.setItem("campuspass.demo.v1", "demo-bookings-fixture");
    const { result } = connect();
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(result.current.user?.id).toBe(session.user.id);
    expect(result.current.session?.access_token).toBe(session.access_token);
    expect(localStorage.getItem("campuspass.demo.v1")).toBe(
      "demo-bookings-fixture",
    );
    expect(transport).not.toHaveBeenCalled();
  });

  it("receives SDK token-refresh events and persists the refreshed session", async () => {
    localStorage.setItem(storageKey, JSON.stringify(authSession()));
    const refreshed = {
      ...authSession(),
      refresh_token: "rotated-fixture-token",
    };
    transport.mockResolvedValueOnce(
      new Response(JSON.stringify(refreshed), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { result } = connect();
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    await act(async () => {
      const { error } = await client!.auth.refreshSession();
      expect(error).toBeNull();
    });
    expect(String(transport.mock.calls[0][0])).toContain(
      "/auth/v1/token?grant_type=refresh_token",
    );
    expect(result.current.session?.refresh_token).toBe("rotated-fixture-token");
    expect(JSON.parse(localStorage.getItem(storageKey)!).refresh_token).toBe(
      "rotated-fixture-token",
    );
  });

  it("uses the SDK logout endpoint and removes only its auth session", async () => {
    localStorage.setItem(storageKey, JSON.stringify(authSession()));
    localStorage.setItem("campuspass.demo.v1", "keep-demo-records");
    transport.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { result } = connect();
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    await act(async () => expect(await result.current.signOut()).toBe(true));
    expect(String(transport.mock.calls[0][0])).toContain(
      "/auth/v1/logout?scope=local",
    );
    expect(result.current.status).toBe("unauthenticated");
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(localStorage.getItem("campuspass.demo.v1")).toBe(
      "keep-demo-records",
    );
  });

  it("handles the SDK clearing local credentials when remote logout fails", async () => {
    localStorage.setItem(storageKey, JSON.stringify(authSession()));
    transport.mockResolvedValueOnce(
      new Response(JSON.stringify({ msg: "private-provider-error" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { result } = connect();
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    await act(async () => expect(await result.current.signOut()).toBe(false));
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.session).toBeNull();
    expect(result.current.error).toContain("confirm sign-out");
    expect(result.current.error).not.toContain("private-provider-error");
    expect(localStorage.getItem(storageKey)).toBeNull();
  });
});
