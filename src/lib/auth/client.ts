import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseAuthConfig } from "./config";

let client: SupabaseClient | null | undefined;

/**
 * Initialize on first use, never on import. Demo mode has no Supabase client.
 * Build-time configuration is immutable; reuse one auth client per page lifetime.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client;

  const config = parseAuthConfig({
    VITE_AUTH_ENABLED: import.meta.env.VITE_AUTH_ENABLED,
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env
      .VITE_SUPABASE_PUBLISHABLE_KEY,
  });
  if (config.mode === "demo") {
    client = null;
    return client;
  }

  client = createClient(config.url, config.publishableKey, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "campuspass.auth.v1",
    },
  });
  return client;
}
