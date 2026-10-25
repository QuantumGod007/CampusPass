import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import { accountSchema, profileSchema, type ProfileValues } from "./schema";
import { getSupabaseClient } from "../auth/client";

export class ProfileError extends Error {
  readonly kind: "session" | "conflict" | "validation" | "unavailable";
  constructor(kind: ProfileError["kind"], message: string) {
    super(message);
    this.name = "ProfileError";
    this.kind = kind;
  }
}
export function profileError(error: unknown): ProfileError {
  if (error instanceof ProfileError) return error;
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  if (code === "42501" || code === "PGRST301" || code === "PGRST303")
    return new ProfileError(
      "session",
      "Your account session is no longer valid. Sign in again to continue.",
    );
  if (code === "23505")
    return new ProfileError(
      "conflict",
      "That PRN is already in use at your institution. Check the number or contact your institution.",
    );
  if (code === "23514" || code === "22P02" || code === "23502")
    return new ProfileError(
      "validation",
      "Check your name, 12-digit PRN, department, and academic year.",
    );
  return new ProfileError(
    "unavailable",
    "Your account profile could not be reached. Check your connection and try again. If this continues, the profile database may need to be configured.",
  );
}
export function createProfileRepository(client: SupabaseClient<Database>) {
  async function identity(expectedUserId: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    // getSession supplies a transport snapshot, never proof of identity. Validate
    // that exact JWT through Auth, then pin the RPC header to it. Account switches
    // cannot make an in-flight A form write through B's newly installed session.
    const {
      data: { session },
      error: sessionError,
    } = await client.auth.getSession();
    if (sessionError || !session)
      throw new ProfileError(
        "session",
        "Sign in again to access your student profile.",
      );
    const {
      data: { user },
      error,
    } = await client.auth.getUser(session.access_token);
    signal?.throwIfAborted();
    if (error || !user || user.id !== expectedUserId)
      throw new ProfileError(
        "session",
        "Your account changed or expired. Sign in again to continue.",
      );
    return { user, token: session.access_token };
  }
  async function request(
    expectedUserId: string,
    values?: ProfileValues,
    signal?: AbortSignal,
  ) {
    try {
      const { user, token } = await identity(expectedUserId, signal);
      const query = values
        ? client.rpc("save_student_profile", {
            p_display_name: values.displayName,
            p_prn: values.prn,
            p_department: values.department,
            p_academic_year: values.academicYear,
          })
        : client.rpc("get_student_account");
      query.setHeader("Authorization", `Bearer ${token}`);
      if (signal) query.abortSignal(signal);
      const { data, error } = await query;
      signal?.throwIfAborted();
      if (error) throw error;
      const account = accountSchema.parse(data);
      if (
        account.user_id !== user.id ||
        (account.profile && account.profile.user_id !== user.id)
      )
        throw new ProfileError(
          "session",
          "Your account changed. Reload your profile to continue.",
        );
      return {
        ...account,
        user: {
          id: user.id,
          email: user.email,
          emailConfirmedAt: user.email_confirmed_at,
        },
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      throw profileError(error);
    }
  }
  return {
    load: (userId: string, signal?: AbortSignal) =>
      request(userId, undefined, signal),
    save: async (
      userId: string,
      values: ProfileValues,
      signal?: AbortSignal,
    ) => {
      const parsed = profileSchema.safeParse(values);
      if (!parsed.success)
        throw new ProfileError("validation", parsed.error.issues[0].message);
      return request(userId, parsed.data, signal);
    },
  };
}
export type ProfileAccount = Awaited<
  ReturnType<ReturnType<typeof createProfileRepository>["load"]>
>;
export type VerifiedStudent = Pick<User, "id" | "email">;
export function getProfileRepository() {
  const client = getSupabaseClient();
  if (!client)
    throw new ProfileError(
      "unavailable",
      "Student accounts are not enabled in this demo.",
    );
  return createProfileRepository(client);
}
