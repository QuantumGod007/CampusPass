import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(() => ({ auth: {} })),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient }));

beforeEach(() => {
  vi.resetModules();
  createClient.mockClear();
  vi.stubEnv("VITE_AUTH_ENABLED", "false");
  vi.stubEnv("VITE_SUPABASE_URL", "");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
});

afterEach(() => vi.unstubAllEnvs());

function enableAuth() {
  vi.stubEnv("VITE_AUTH_ENABLED", "true");
  vi.stubEnv("VITE_SUPABASE_URL", "https://campuspass-test.supabase.co");
  vi.stubEnv(
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_test-only-placeholder",
  );
}

describe("isolated Supabase client", () => {
  it("does not initialize an SDK client when the module is imported", async () => {
    enableAuth();
    await import("../lib/auth/client");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns null in demo mode without initializing the SDK", async () => {
    const { getSupabaseClient } = await import("../lib/auth/client");
    expect(getSupabaseClient()).toBeNull();
    expect(getSupabaseClient()).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("creates and reuses one client with PKCE and a separate auth storage key", async () => {
    enableAuth();
    const { getSupabaseClient } = await import("../lib/auth/client");
    const first = getSupabaseClient();
    expect(first).toBeDefined();
    expect(getSupabaseClient()).toBe(first);
    expect(createClient).toHaveBeenCalledExactlyOnceWith(
      "https://campuspass-test.supabase.co",
      "sb_publishable_test-only-placeholder",
      {
        auth: {
          flowType: "pkce",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "campuspass.auth.v1",
        },
      },
    );
  });

  it("fails explicitly on enabled but incomplete configuration", async () => {
    vi.stubEnv("VITE_AUTH_ENABLED", "true");
    const { getSupabaseClient } = await import("../lib/auth/client");
    expect(() => getSupabaseClient()).toThrow("VITE_SUPABASE_URL");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("does not pass a secret key to the SDK or silently fall back to demo mode", async () => {
    enableAuth();
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_secret_test-placeholder");
    const { getSupabaseClient } = await import("../lib/auth/client");
    expect(() => getSupabaseClient()).toThrow("public sb_publishable_ key");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("does not read or rewrite existing demo records", async () => {
    const fixture = '{"demo":"untouched"}';
    localStorage.setItem("campuspass.demo.v1", fixture);
    enableAuth();
    const { getSupabaseClient } = await import("../lib/auth/client");
    getSupabaseClient();
    expect(localStorage.getItem("campuspass.demo.v1")).toBe(fixture);
  });
});
