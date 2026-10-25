import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import {
  createProfileRepository,
  profileError,
} from "../lib/profiles/repository";
import { authSession } from "./auth-fixtures";
import { profileAccount, profileValues } from "./profile-fixtures";
let client: SupabaseClient<Database> | undefined;
afterEach(async () => {
  await client?.auth.dispose();
  client = undefined;
});
function connect(transport: typeof fetch) {
  const session = authSession();
  client = createClient<Database>(
    "https://profile-fixture.example.test",
    "sb_publishable_fixture",
    {
      auth: {
        persistSession: false,
        storageKey: `profile-test-${crypto.randomUUID()}`,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: transport },
    },
  );
  vi.spyOn(client.auth, "getSession").mockResolvedValue({
    data: { session },
    error: null,
  });
  return { session, repository: createProfileRepository(client) };
}
describe("profile repository with the real SDK and a mocked HTTP transport", () => {
  it("validates the server identity and pins RPC authorization to the original token during an account switch", async () => {
    const session = authSession();
    const other = authSession("00000000-0000-4000-8000-000000000002");
    const calls: { url: string; headers: Headers; body: unknown }[] = [];
    const { repository } = connect(async (url, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(url),
        headers,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return new Response(
        JSON.stringify(
          String(url).includes("/auth/v1/user")
            ? session.user
            : profileAccount(undefined, true),
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.mocked(client!.auth.getSession)
      .mockResolvedValue({ data: { session: other }, error: null })
      .mockResolvedValueOnce({ data: { session }, error: null });
    const saved = await repository.save(session.user.id, profileValues);
    expect(saved.profile?.prn).toBe("002026123456");
    expect(calls[0].url).toContain("/auth/v1/user");
    const rpc = calls.find((call) =>
      call.url.includes("/rpc/save_student_profile"),
    )!;
    expect(rpc.headers.get("Authorization")).toBe(
      `Bearer ${session.access_token}`,
    );
    expect(rpc.body).toEqual({
      p_display_name: profileValues.displayName,
      p_prn: profileValues.prn,
      p_department: profileValues.department,
      p_academic_year: profileValues.academicYear,
    });
    expect(rpc.body).not.toHaveProperty("user_id");
    expect(rpc.body).not.toHaveProperty("institution_id");
    expect(rpc.body).not.toHaveProperty("role");
  });
  it("does not make a database request for a mismatched authenticated user", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify(authSession().user), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    const { repository } = connect(transport);
    await expect(
      repository.load("00000000-0000-4000-8000-000000000002"),
    ).rejects.toMatchObject({ kind: "session" });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("normalizes uniqueness errors without returning database details or another student identity", async () => {
    const { session, repository } = connect(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).includes("/auth/v1/user")
              ? authSession().user
              : {
                  code: "23505",
                  message: "private other-student@example.test details",
                },
          ),
          {
            status: String(url).includes("/auth/v1/user") ? 200 : 409,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    await expect(
      repository.save(session.user.id, profileValues),
    ).rejects.toMatchObject({ kind: "conflict" });
    expect(
      profileError({ code: "23505", message: "private" }).message,
    ).not.toContain("private");
  });
  it("rejects a response belonging to a different account, even when profile data is missing", async () => {
    const { session, repository } = connect(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).includes("/auth/v1/user")
              ? authSession().user
              : profileAccount("00000000-0000-4000-8000-000000000002"),
          ),
          { headers: { "Content-Type": "application/json" } },
        ),
    );
    await expect(repository.load(session.user.id)).rejects.toMatchObject({
      kind: "session",
    });
  });
  it("does not send an aborted request or save invalid fields", async () => {
    const transport = vi.fn<typeof fetch>();
    const { session, repository } = connect(transport);
    const controller = new AbortController();
    controller.abort();
    await expect(
      repository.load(session.user.id, controller.signal),
    ).rejects.toThrow();
    await expect(
      repository.save(session.user.id, { ...profileValues, prn: "123" }),
    ).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it.each(["42501", "PGRST301", "PGRST303"])(
    "normalizes revoked or expired session code %s",
    (code) => {
      expect(profileError({ code }).kind).toBe("session");
    },
  );
});
