import { describe, expect, it } from "vitest";
import { AuthConfigurationError, parseAuthConfig } from "../lib/auth/config";

const configured = {
  VITE_AUTH_ENABLED: "true",
  VITE_SUPABASE_URL: "https://campuspass-test.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test-only-placeholder",
};

describe("authentication configuration", () => {
  it("defaults to the existing demo without credentials", () => {
    expect(parseAuthConfig({})).toEqual({ mode: "demo" });
  });

  it("does not enable authentication just because credentials are present", () => {
    expect(
      parseAuthConfig({ ...configured, VITE_AUTH_ENABLED: undefined }),
    ).toEqual({ mode: "demo" });
  });

  it("ignores unused Supabase configuration when explicitly disabled", () => {
    expect(
      parseAuthConfig({
        VITE_AUTH_ENABLED: "false",
        VITE_SUPABASE_URL: "invalid",
        VITE_SUPABASE_PUBLISHABLE_KEY: "invalid",
      }),
    ).toEqual({ mode: "demo" });
  });

  it.each(["TRUE", "yes", "1", "enabled"])(
    "rejects an ambiguous feature flag: %s",
    (flag) => {
      expect(() =>
        parseAuthConfig({ ...configured, VITE_AUTH_ENABLED: flag }),
      ).toThrow(AuthConfigurationError);
    },
  );

  it("normalizes surrounding whitespace and the origin's trailing slash", () => {
    expect(
      parseAuthConfig({
        VITE_AUTH_ENABLED: " true ",
        VITE_SUPABASE_URL: ` ${configured.VITE_SUPABASE_URL}/ `,
        VITE_SUPABASE_PUBLISHABLE_KEY: ` ${configured.VITE_SUPABASE_PUBLISHABLE_KEY} `,
      }),
    ).toEqual({
      mode: "supabase",
      url: configured.VITE_SUPABASE_URL,
      publishableKey: configured.VITE_SUPABASE_PUBLISHABLE_KEY,
    });
  });

  it.each([
    undefined,
    "",
    "not a URL",
    "http://campuspass-test.supabase.co",
    "https://user:password@campuspass-test.supabase.co",
    "https://campuspass-test.supabase.co/rest/v1",
    "https://campuspass-test.supabase.co?token=private",
    "https://campuspass-test.supabase.co#fragment",
    "ftp://localhost",
    "http://localhost.example.com:54321",
    "http://192.168.1.2:54321",
  ])("rejects an invalid or insecure project URL: %s", (url) => {
    expect(() =>
      parseAuthConfig({ ...configured, VITE_SUPABASE_URL: url }),
    ).toThrow(AuthConfigurationError);
  });

  it.each([
    "http://localhost:54321",
    "http://127.0.0.1:54321",
    "http://[::1]:54321",
    "https://auth.campuspass.example",
  ])("allows a local Supabase or HTTPS custom origin: %s", (url) => {
    expect(
      parseAuthConfig({ ...configured, VITE_SUPABASE_URL: url }),
    ).toMatchObject({ mode: "supabase", url });
  });

  it.each([
    undefined,
    "",
    "sb_publishable_",
    "sb_publishable_invalid key",
    "sb_secret_do-not-expose",
    // Deliberately unsigned fixture with a service-role payload, never a credential.
    "eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.",
    "eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.",
  ])("rejects missing, secret, and legacy JWT keys: %s", (key) => {
    expect(() =>
      parseAuthConfig({ ...configured, VITE_SUPABASE_PUBLISHABLE_KEY: key }),
    ).toThrow(AuthConfigurationError);
  });

  it("never includes supplied keys or URLs in configuration errors", () => {
    const secret = "sb_secret_must-not-appear-in-errors";
    const badUrl = "https://private.example?token=do-not-log";
    for (const environment of [
      { ...configured, VITE_SUPABASE_PUBLISHABLE_KEY: secret },
      { ...configured, VITE_SUPABASE_URL: badUrl },
    ]) {
      try {
        parseAuthConfig(environment);
        expect.fail("Expected invalid configuration to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(AuthConfigurationError);
        expect(String(error)).not.toContain(secret);
        expect(String(error)).not.toContain(badUrl);
      }
    }
  });
});
