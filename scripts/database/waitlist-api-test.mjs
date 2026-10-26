import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLiveFixture, registerTestAccount, ok } from "./live-fixture.mjs";
import { apiClient, apiEnvironment } from "./test-environment.mjs";
const f = await createLiveFixture({ capacity: 1, startsInMinutes: 10 }),
  { pool, organizer, studentA: a, studentB: b } = f;
let checks = 0;
const equal = (x, y, label) => {
    assert.equal(x, y, label);
    checks++;
  },
  yes = (x, label) => {
    assert.ok(x, label);
    checks++;
  };
const denied = async (p, code) => equal((await p).error?.code, code);
const sessions = [];
const join = (event, u, key = randomUUID()) =>
  u.client.rpc("join_campus_waitlist", {
    p_event_id: event.id,
    p_request_id: key,
  });
const wait = (event, u) =>
  u.client.rpc("get_my_campus_waitlist", { p_event_id: event.id });
const inbox = (u) => u.client.rpc("list_campus_notifications");
const book = async (event, u = a) =>
  ok(
    await u.client.rpc("book_campus_event", {
      p_event_id: event.id,
      p_request_id: randomUUID(),
    }),
  );
const cancel = (booking, u) =>
  u.client.rpc("cancel_campus_booking", { p_booking_id: booking.id });
const grant = (u, status) =>
  pool.query(
    "select campuspass_private.provision_membership($1,$2,'student',$3,null,'API test operator','Disposable waitlist access authorization')",
    [u.id, f.institution, status],
  );
async function event(minutes = 10) {
  const d = ok(
    await organizer.client.rpc("create_campus_event", {
      p_title: "Waitlist API Test Event",
      p_description:
        "An isolated event testing real waitlist state and persistent private notification receipts.",
      p_category: "Workshops",
      p_venue: "Test Hall",
      p_starts_at: new Date(Date.now() + minutes * 60000).toISOString(),
      p_ends_at: new Date(Date.now() + 7200000).toISOString(),
      p_capacity: 1,
      p_theme: "build",
    }),
  );
  return ok(
    await organizer.client.rpc("set_campus_event_status", {
      p_event_id: d.id,
      p_expected_revision: d.revision,
      p_status: "published",
    }),
  );
}
const save = (e, capacity, venue = e.venue) =>
  organizer.client.rpc("save_campus_event", {
    p_event_id: e.id,
    p_expected_revision: e.revision,
    p_title: e.title,
    p_description: e.description,
    p_category: e.category,
    p_venue: venue,
    p_starts_at: e.starts_at,
    p_ends_at: e.ends_at,
    p_capacity: capacity,
    p_theme: e.theme,
  });
try {
  const c = await registerTestAccount("Student Gamma", (x) =>
    f.accounts.push(x),
  );
  await grant(c, "active");
  const e = f.event;
  equal(ok(await join(e, b)).outcome, "available");
  equal(ok(await wait(e, b)).entry, null);
  const original = await book(e);
  await denied(join(e, a), "P1032");
  const key = randomUUID(),
    wb = ok(await join(e, b, key)).entry,
    wc = ok(await join(e, c)).entry;
  equal(wb.position, 1);
  equal(wc.position, 2);
  equal(ok(await join(e, b, key)).entry.id, wb.id);
  equal(ok(await join(e, b)).entry.id, wb.id);
  const device = apiClient();
  sessions.push(device);
  ok(
    await device.auth.signInWithPassword({
      email: b.email,
      password: b.password,
    }),
  );
  equal(
    ok(
      await device.rpc("join_campus_waitlist", {
        p_event_id: e.id,
        p_request_id: randomUUID(),
      }),
    ).entry.id,
    wb.id,
  );
  equal(
    (
      await pool.query(
        "select count(*)::int n from public.event_waitlist where event_id=$1 and student_id=$2 and status='waiting'",
        [e.id, b.id],
      )
    ).rows[0].n,
    1,
  );
  equal(
    ok(await inbox(b)).items.filter((x) => x.kind === "waitlist_joined").length,
    1,
  );
  await denied(
    c.client.rpc("withdraw_campus_waitlist", { p_entry_id: wb.id }),
    "P1008",
  );
  await denied(
    c.client.rpc("issue_campus_pass", { p_booking_id: wb.id }),
    "P1008",
  );
  const joinedNotice = ok(await inbox(b)).items[0];
  equal(
    ok(await inbox(c)).items.some((x) => x.id === joinedNotice.id),
    false,
  );
  await denied(
    c.client.rpc("mark_campus_notification_read", {
      p_notification_id: joinedNotice.id,
    }),
    "P1008",
  );
  for (const table of [
    "event_waitlist",
    "waitlist_requests",
    "campus_notifications",
  ]) {
    yes((await b.client.from(table).select("*")).error);
    yes(
      (
        await b.client
          .from(table)
          .insert({ student_id: a.id, recipient_id: a.id, event_id: e.id })
      ).error,
    );
  }
  yes(
    (
      await c.client.rpc("join_campus_waitlist", {
        p_event_id: e.id,
        p_request_id: randomUUID(),
        student_id: b.id,
      })
    ).error,
  );
  yes(
    (await b.client.rpc("list_campus_notifications", { recipient_id: c.id }))
      .error,
  );
  ok(await cancel(original, a));
  ok(await cancel(original, a));
  const promoted = ok(await wait(e, b)).entry;
  equal(promoted.status, "promoted");
  yes(promoted.booking_id !== original.id);
  equal(ok(await wait(e, c)).entry.position, 1);
  equal(ok(await join(e, b, key)).entry.booking_id, promoted.booking_id);
  await denied(join(e, b), "P1032");
  const items = ok(await inbox(b));
  equal(items.items.filter((x) => x.kind === "waitlist_promoted").length, 1);
  yes(items.items[0].booking_id === promoted.booking_id);
  const read = ok(
    await b.client.rpc("mark_campus_notification_read", {
      p_notification_id: items.items[0].id,
    }),
  );
  yes(read.read_at);
  equal(
    ok(
      await b.client.rpc("mark_campus_notification_read", {
        p_notification_id: read.id,
      }),
    ).read_at,
    read.read_at,
  );
  equal(ok(await inbox(b)).unread_count, 1);
  equal(ok(await inbox(c)).unread_count, 1);
  const fresh = apiClient();
  sessions.push(fresh);
  ok(
    await fresh.auth.signInWithPassword({
      email: b.email,
      password: b.password,
    }),
  );
  equal(
    ok(await fresh.rpc("list_my_campus_bookings")).find(
      (x) => x.id === promoted.booking_id,
    )?.status,
    "confirmed",
  );
  equal(
    ok(await fresh.rpc("get_my_campus_waitlist", { p_event_id: e.id })).entry
      .status,
    "promoted",
  );
  const pass = ok(
    await b.client.rpc("issue_campus_pass", {
      p_booking_id: promoted.booking_id,
    }),
  );
  equal(
    ok(
      await organizer.client.rpc("check_in_campus_pass", {
        p_event_id: e.id,
        p_token: pass.token,
      }),
    ).outcome,
    "admitted",
  );
  const audit = (
    await pool.query(
      "select actor_user_id,details from public.audit_log where subject_id=$1 and action='waitlist_promoted'",
      [wb.id],
    )
  ).rows;
  equal(audit.length, 1);
  equal(audit[0].actor_user_id, a.id);
  equal(audit[0].details.booking_id, promoted.booking_id);
  // Withdrawal never cancels a booking that won a simultaneous promotion.
  equal(
    ok(await b.client.rpc("withdraw_campus_waitlist", { p_entry_id: wb.id }))
      .status,
    "promoted",
  );
  const e2 = await event();
  await book(e2);
  const k2 = randomUUID();
  const q2 = ok(await join(e2, b, k2)).entry;
  const q3 = ok(await join(e2, c)).entry;
  const increased = ok(await save(e2, 2));
  equal(increased.confirmed_count, 2);
  equal(increased.waiting_count, 1);
  equal(ok(await wait(e2, b)).entry.status, "promoted");
  equal(ok(await wait(e2, c)).entry.position, 1);
  const changed = ok(await save(increased, 2, "Updated Test Hall"));
  equal(
    ok(await inbox(c)).items.filter(
      (x) => x.event_id === e2.id && x.kind === "schedule_changed",
    ).length,
    1,
  );
  await denied(save(increased, 2, "Updated Test Hall"), "P1010");
  equal(
    ok(await inbox(c)).items.filter(
      (x) => x.event_id === e2.id && x.kind === "schedule_changed",
    ).length,
    1,
  );
  equal(
    ok(await c.client.rpc("withdraw_campus_waitlist", { p_entry_id: q3.id }))
      .status,
    "withdrawn",
  );
  equal(
    ok(await c.client.rpc("withdraw_campus_waitlist", { p_entry_id: q3.id }))
      .status,
    "withdrawn",
  );
  const rejoin = ok(await join(e2, c)).entry;
  yes(rejoin.id !== q3.id);
  equal(rejoin.position, 1);
  await denied(join(e, b, k2), "P1009");
  ok(
    await organizer.client.rpc("set_campus_event_status", {
      p_event_id: e2.id,
      p_expected_revision: changed.revision,
      p_status: "cancelled",
    }),
  );
  equal(ok(await wait(e2, c)).entry.reason, "event_cancelled");
  equal(
    ok(await inbox(c)).items.filter(
      (x) => x.event_id === e2.id && x.kind === "event_cancelled",
    ).length,
    1,
  );
  await denied(join(e2, c), "P1005");
  const e3 = await event(),
    ba = await book(e3);
  await join(e3, b);
  await join(e3, c);
  await grant(b, "revoked");
  await denied(wait(e3, b), "P1002");
  await denied(inbox(b), "P1002");
  await denied(
    b.client.rpc("mark_campus_notification_read", {
      p_notification_id: joinedNotice.id,
    }),
    "P1002",
  );
  ok(await cancel(ba, a));
  equal(ok(await wait(e3, c)).entry.status, "promoted");
  equal(
    (
      await pool.query(
        "select reason from public.event_waitlist where event_id=$1 and student_id=$2",
        [e3.id, b.id],
      )
    ).rows[0].reason,
    "ineligible",
  );
  await grant(b, "active");
  // Membership expiry, banned users and registration cutoff are real DB checks.
  const e4 = await event(),
    b4 = await book(e4);
  await join(e4, b);
  await join(e4, c);
  await pool.query(
    "update public.institution_memberships set expires_at=clock_timestamp()-interval '1 second' where user_id=$1",
    [b.id],
  );
  ok(await cancel(b4, a));
  equal(ok(await wait(e4, c)).entry.status, "promoted");
  await grant(b, "active");
  const e5 = await event(),
    b5 = await book(e5);
  await join(e5, b);
  await join(e5, c);
  await pool.query(
    "update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id=$1",
    [b.id],
  );
  ok(await cancel(b5, a));
  equal(ok(await wait(e5, c)).entry.status, "promoted");
  await pool.query("update auth.users set banned_until=null where id=$1", [
    b.id,
  ]);
  const e6 = await event(0.04);
  await book(e6);
  await join(e6, b);
  await pool.query(
    "select pg_sleep(greatest(0,extract(epoch from $1::timestamptz-clock_timestamp()))+0.02)",
    [e6.starts_at],
  );
  equal(ok(await wait(e6, b)).entry.reason, "registration_closed");
  await denied(join(e6, c), "P1004");
  equal(
    (
      await pool.query(
        "select count(*)::int n from public.bookings where event_id=$1",
        [e6.id],
      )
    ).rows[0].n,
    1,
  );
  await pool.query(
    "select campuspass_private.notify_campus($1,$2,null,'schedule_changed','pagination-fixture:'||$2::text||':'||n::text) from generate_series(1,60) n",
    [c.id, e.id],
  );
  // Bounded inbox pages use numeric IDs, with no leaked recipient or private data.
  const page = ok(await inbox(c));
  equal(page.items.length, 50);
  equal(page.has_more, true);
  yes(
    page.items.every(
      (x) =>
        !("recipient_id" in x) &&
        !("student_id" in x) &&
        !("prn" in x) &&
        !("email" in x),
    ),
  );
  yes(!JSON.stringify(page).includes(c.email));
  const before = page.items.at(-1).id;
  const older = ok(
    await c.client.rpc("list_campus_notifications", { p_before: before }),
  );
  yes(older.items.every((x) => BigInt(x.id) < BigInt(before)));
  yes(
    page.items.every(
      (x, i) => !i || BigInt(page.items[i - 1].id) > BigInt(x.id),
    ),
    "Inbox IDs are ordered numerically",
  );
  const token = ok(await b.client.auth.getSession()).session.access_token;
  ok(await b.client.auth.signOut({ scope: "local" }));
  const { url, key: publicKey } = apiEnvironment();
  const stale = await fetch(`${url}/rest/v1/rpc/list_campus_notifications`, {
    method: "POST",
    headers: {
      apikey: publicKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  equal(stale.status, 403);
  const anon = apiClient();
  sessions.push(anon);
  yes(
    (
      await anon.rpc("join_campus_waitlist", {
        p_event_id: e.id,
        p_request_id: randomUUID(),
      })
    ).error,
  );
  yes((await anon.rpc("list_campus_notifications")).error);
  equal(
    (
      await pool.query(
        "select count(*)::int n from public.bookings where event_id=$1",
        [e.id],
      )
    ).rows[0].n,
    2,
    "Promotion makes a new booking; cancelled history survives",
  );
  yes(q2.id);
  console.log(
    `PASS: ${checks} REAL Supabase waitlist/inbox checks: sold-out eligibility, multi-device idempotency, FIFO, automatic confirmation, exact notification/read receipts, persistent new booking, normal secure QR admission, capacity/schedule/event changes, withdrawal/rejoin, revoked/expired/banned access, private bounded inboxes, stale JWTs and demo separation.`,
  );
} finally {
  await Promise.all(sessions.map((s) => s.auth.dispose()));
  await f.dispose();
}
