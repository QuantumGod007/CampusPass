import { z } from "zod";

interface AuthEnvironment {
  readonly VITE_AUTH_ENABLED?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

export type AuthConfig =
  { mode: "demo" } | { mode: "supabase"; url: string; publishableKey: string };

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

const projectUrl = z
  .string()
  .trim()
  .refine((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return (
      (url.protocol === "https:" || (url.protocol === "http:" && local)) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  });

// Accept only the browser-safe key format. Legacy JWTs and secret keys fail closed.
const publishableKey = z
  .string()
  .trim()
  .regex(/^sb_publishable_[A-Za-z0-9_-]+$/);

/** Parse public build-time configuration without starting an auth client. */
export function parseAuthConfig(environment: AuthEnvironment): AuthConfig {
  const enabled = environment.VITE_AUTH_ENABLED?.trim() || "false";
  if (enabled !== "true" && enabled !== "false") {
    throw new AuthConfigurationError(
      "VITE_AUTH_ENABLED must be true or false.",
    );
  }
  if (enabled === "false") return { mode: "demo" };

  const url = projectUrl.safeParse(environment.VITE_SUPABASE_URL);
  if (!url.success) {
    throw new AuthConfigurationError(
      "Set VITE_SUPABASE_URL to an HTTPS project origin, or an HTTP loopback origin for local Supabase.",
    );
  }
  const key = publishableKey.safeParse(
    environment.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
  if (!key.success) {
    throw new AuthConfigurationError(
      "Set VITE_SUPABASE_PUBLISHABLE_KEY to a public sb_publishable_ key. Secret, service-role, and legacy JWT keys are not accepted.",
    );
  }

  return {
    mode: "supabase",
    url: new URL(url.data).origin,
    publishableKey: key.data,
  };
}

export function getAuthConfig(): AuthConfig {
  return parseAuthConfig({
    VITE_AUTH_ENABLED: import.meta.env.VITE_AUTH_ENABLED,
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env
      .VITE_SUPABASE_PUBLISHABLE_KEY,
  });
}
