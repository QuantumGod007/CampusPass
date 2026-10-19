import type { Session } from "@supabase/supabase-js";

// Synthetic session data. These tokens are not signed credentials.
export function authSession(
  id = "00000000-0000-4000-8000-000000000001",
): Session {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const payload = btoa(
    JSON.stringify({ sub: id, exp: expiresAt, role: "authenticated" }),
  )
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return {
    access_token: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.unsigned-test-fixture`,
    refresh_token: "synthetic-refresh-token",
    expires_in: 3600,
    expires_at: expiresAt,
    token_type: "bearer",
    user: {
      id,
      email: "student@example.test",
      aud: "authenticated",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      created_at: "2026-10-01T00:00:00.000Z",
    },
  };
}
