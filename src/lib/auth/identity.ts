import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
export class SessionChangedError extends Error {
  constructor() {
    super("Your account changed or expired. Sign in again to continue.");
    this.name = "SessionChangedError";
  }
}
// getSession is a transport snapshot only. Validate that exact token with Auth,
// then use it on every subsequent RPC even if the SDK session switches accounts.
export async function verifiedIdentity(
  client: SupabaseClient<Database>,
  expectedUserId: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();
  if (sessionError || !session) throw new SessionChangedError();
  const {
    data: { user },
    error,
  } = await client.auth.getUser(session.access_token);
  signal?.throwIfAborted();
  if (error || !user || user.id !== expectedUserId)
    throw new SessionChangedError();
  return { user, token: session.access_token };
}
