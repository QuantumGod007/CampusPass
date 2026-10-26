import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { createCampusRepository, campusError } from "../lib/campus/repository";
import { authSession } from "./auth-fixtures";
import { bookingFixture, eventFixture } from "./campus-fixtures";
let client: SupabaseClient<Database> | undefined;
afterEach(async () => {
  await client?.auth.dispose();
  client = undefined;
});
function connect(transport: typeof fetch) {
  client = createClient<Database>(
    "https://campus-fixture.example.test",
    "sb_publishable_fixture",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: crypto.randomUUID(),
      },
      global: { fetch: transport },
    },
  );
  vi.spyOn(client.auth, "getSession").mockResolvedValue({
    data: { session: authSession() },
    error: null,
  });
  return createCampusRepository(client);
}
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
describe("typed campus repository with mocked HTTP (not database security proof)", () => {
  it("pins booking authorization to the verified token despite an SDK account switch", async () => {
    const a = authSession(),
      b = authSession("00000000-0000-4000-8000-000000000002");
    let rpc: RequestInit | undefined;
    const repository = connect(async (url, init) => {
      if (String(url).includes("/user")) return response(a.user);
      rpc = init;
      return response(bookingFixture());
    });
    vi.mocked(client!.auth.getSession)
      .mockResolvedValue({ data: { session: b }, error: null })
      .mockResolvedValueOnce({ data: { session: a }, error: null });
    const requestId = crypto.randomUUID();
    await repository.book(a.user.id, eventFixture().id, requestId);
    expect(new Headers(rpc?.headers).get("Authorization")).toBe(
      `Bearer ${a.access_token}`,
    );
    expect(JSON.parse(String(rpc?.body))).toEqual({
      p_event_id: eventFixture().id,
      p_request_id: requestId,
    });
  });
  it("uses the typed create endpoint, converts local dates and never submits organizer or institution authority", async () => {
    let body: Record<string, unknown> | undefined;
    let path = "";
    const repository = connect(async (url, init) => {
      if (String(url).includes("/user")) return response(authSession().user);
      path = String(url);
      body = JSON.parse(String(init?.body));
      return response(eventFixture());
    });
    await repository.saveEvent(
      authSession().user.id,
      {
        title: "A shared campus workshop",
        description:
          "A meaningful shared event with a sufficiently detailed description.",
        category: "Technology",
        venue: "Main Hall",
        start: "2030-11-15T14:00",
        end: "2030-11-15T16:00",
        capacity: "2",
        theme: "build",
      },
      undefined,
    );
    expect(path).toContain("/create_campus_event");
    expect(body?.p_capacity).toBe(2);
    expect(body?.p_starts_at).toBe(new Date("2030-11-15T14:00").toISOString());
    expect(body).not.toHaveProperty("organizer_id");
    expect(body).not.toHaveProperty("user_id");
    expect(body).not.toHaveProperty("institution_id");
  });
  it("never returns bookings for a different user", async () => {
    const repository = connect(async (url) =>
      response(
        String(url).includes("/user")
          ? authSession().user
          : [bookingFixture("00000000-0000-4000-8000-000000000002")],
      ),
    );
    await expect(
      repository.bookings(authSession().user.id),
    ).rejects.toMatchObject({ code: "validation" });
  });
  it("does not send a mutation after Auth returns another identity", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response(authSession("00000000-0000-4000-8000-000000000002").user),
      );
    const repository = connect(transport);
    await expect(
      repository.cancel(authSession().user.id, bookingFixture().id),
    ).rejects.toMatchObject({ code: "42501" });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("does not send an aborted booking request", async () => {
    const transport = vi.fn<typeof fetch>();
    const repository = connect(transport);
    const controller = new AbortController();
    controller.abort();
    await expect(
      repository.book(
        authSession().user.id,
        eventFixture().id,
        crypto.randomUUID(),
        controller.signal,
      ),
    ).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it("pins the admission token to the verified account and never uses a booking reference", async () => {
    let rpc: RequestInit | undefined;
    const repository = connect(async (url, init) => {
      if (String(url).includes("/user")) return response(authSession().user);
      rpc = init;
      return response({
        outcome: "admitted",
        reference: "CP-fixture",
        checked_in_at: new Date().toISOString(),
      });
    });
    const token = "cp1_" + "a".repeat(64);
    await repository.scanPass(authSession().user.id, eventFixture().id, token);
    expect(new Headers(rpc?.headers).get("Authorization")).toBe(
      `Bearer ${authSession().access_token}`,
    );
    expect(JSON.parse(String(rpc?.body))).toEqual({
      p_event_id: eventFixture().id,
      p_token: token,
    });
    expect(() =>
      repository.scanPass(
        authSession().user.id,
        eventFixture().id,
        "CP-reference",
      ),
    ).toThrow();
  });
  it("rejects an admission result for another booking", async () => {
    const repository = connect(async (url) =>
      response(
        String(url).includes("/user")
          ? authSession().user
          : {
              outcome: "issued",
              booking_id: crypto.randomUUID(),
              token: "cp1_" + "a".repeat(64),
              server_now: new Date().toISOString(),
              expires_at: new Date(Date.now() + 90000).toISOString(),
            },
      ),
    );
    await expect(
      repository.issuePass(authSession().user.id, bookingFixture().id),
    ).rejects.toMatchObject({ code: "validation" });
  });
  it("does not issue a credential when Auth verifies a different account", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response(authSession("00000000-0000-4000-8000-000000000002").user),
      );
    const repository = connect(transport);
    await expect(
      repository.issuePass(authSession().user.id, bookingFixture().id),
    ).rejects.toMatchObject({ code: "42501" });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([
    "P1002",
    "P1003",
    "P1004",
    "P1005",
    "P1006",
    "P1007",
    "P1010",
    "P1011",
    "42501",
  ])("normalizes %s without private provider details", (code) => {
    const message = campusError({
      code,
      message: "private-person@example.test private PRN",
    }).message;
    expect(message).not.toContain("private-person");
    expect(message).not.toContain("private PRN");
    expect(message).not.toContain("could not complete");
  });
  it("returns a helpful sold-out failure instead of an invented success", async () => {
    const repository = connect(async (url) =>
      String(url).includes("/user")
        ? response(authSession().user)
        : response({ code: "P1006", message: "private details" }, 409),
    );
    await expect(
      repository.book(
        authSession().user.id,
        eventFixture().id,
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({
      code: "P1006",
      message: expect.stringContaining("final seat"),
    });
  });
});
