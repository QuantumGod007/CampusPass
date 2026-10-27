import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { admissionFixture } from "./admission-sql-fixture.mjs";
const f = await admissionFixture({ userCount: 6 }),
  { pool, as, users } = f;
const [org, other, a, b, c] = users;
const analytics = (e) =>
  as(org, "select public.get_campus_event_analytics($1) result", [e.id]);
const book = (e, u) =>
  as(u, "select public.book_campus_event($1,$2) result", [e.id, randomUUID()]);
const cancel = (bk, u) =>
  as(u, "select public.cancel_campus_booking($1) result", [bk.id]);
const join = (e, u) =>
  as(u, "select public.join_campus_waitlist($1,$2) result", [
    e.id,
    randomUUID(),
  ]);
const pass = (bk, u) =>
  as(u, "select public.issue_campus_pass($1) result", [bk.id]);
const scan = (e, t) =>
  as(org, "select public.check_in_campus_pass($1,$2) result", [e.id, t]);
const record = (bk, u) =>
  as(u, "select public.get_campus_participation($1) result", [bk.id]);
async function identity(conn, u) {
  await conn.query("begin");
  await conn.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({
      sub: u.id,
      session_id: u.session,
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ]);
  await conn.query("set local role authenticated");
}
async function lockWait(query) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    const r = await pool.query(
      "select count(*)::int n from pg_stat_activity where wait_event_type='Lock' and query like $1 and pid<>pg_backend_pid()",
      [`%${query}%`],
    );
    if (r.rows[0].n) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error("Expected genuine database lock wait was not observed");
}
function consistent(result) {
  const m = result.metrics;
  assert.equal(m.confirmed + m.cancelled, m.booking_records);
  assert.equal(
    m.confirmed_checked_in + m.confirmed_not_checked_in,
    m.confirmed,
  );
  assert.equal(
    result.timeline.reduce((n, x) => n + x.count, 0),
    m.total_checkins,
  );
  assert.ok(m.confirmed <= m.capacity);
  assert.ok(m.checkin_percentage >= 0 && m.checkin_percentage <= 100);
}
try {
  let e = await f.event();
  e = await as(
    org,
    "select public.save_campus_event($1,$2,$3,$4,'Workshops','Test hall',$5,$6,2,'build') result",
    [e.id, e.revision, e.title, e.description, e.starts_at, e.ends_at],
  );
  const empty = await analytics(e);
  assert.equal(empty.metrics.checkin_percentage, 0);
  assert.equal(empty.timeline.length, 0);
  // Reporting holds the event shared lock until commit; a genuine booking waits.
  const reporter = await pool.connect();
  let bookingA;
  try {
    await identity(reporter, org);
    const before = (
      await reporter.query(
        "select public.get_campus_event_analytics($1) result",
        [e.id],
      )
    ).rows[0].result;
    const pending = book(e, a);
    await lockWait("book_campus_event");
    const again = (
      await reporter.query(
        "select public.get_campus_event_analytics($1) result",
        [e.id],
      )
    ).rows[0].result;
    assert.equal(before.metrics.confirmed, 0);
    assert.deepEqual(again.metrics, before.metrics);
    await reporter.query("commit");
    bookingA = await pending;
  } finally {
    await reporter.query("rollback");
    reporter.release();
  }
  const bookingB = await book(e, b);
  await join(e, c);
  const held = await pool.connect();
  try {
    await identity(held, org);
    const before = (
      await held.query("select public.get_campus_event_analytics($1) result", [
        e.id,
      ])
    ).rows[0].result;
    const cancelling = cancel(bookingA, a);
    await lockWait("cancel_campus_booking");
    const during = (
      await held.query("select public.get_campus_event_analytics($1) result", [
        e.id,
      ])
    ).rows[0].result;
    assert.deepEqual(during.metrics, before.metrics);
    await held.query("commit");
    await cancelling;
  } finally {
    await held.query("rollback");
    held.release();
  }
  const bookingC = (
    await as(c, "select public.list_my_campus_bookings() result")
  ).find((x) => x.event_id === e.id);
  const tb = await pass(bookingB, b),
    tc = await pass(bookingC, c);
  const race = await Promise.all([
    scan(e, tb.token),
    scan(e, tb.token),
    analytics(e),
  ]);
  assert.equal(race.filter((x) => x.outcome === "admitted").length, 1);
  consistent(race[2]);
  await scan(e, tc.token);
  const after = await analytics(e);
  consistent(after);
  assert.deepEqual(
    [
      after.metrics.confirmed,
      after.metrics.cancelled,
      after.metrics.promotions,
      after.metrics.total_checkins,
      after.metrics.checkin_percentage,
    ],
    [2, 1, 1, 2, 100],
  );
  const key = randomUUID(),
    header = await as(
      org,
      "select public.start_campus_event_report($1,$2) result",
      [e.id, key],
    );
  assert.equal(header.row_count, 3);
  assert.equal(
    (
      await as(org, "select public.start_campus_event_report($1,$2) result", [
        e.id,
        key,
      ])
    ).id,
    header.id,
  );
  const page = () =>
    as(org, "select public.get_campus_event_report_page($1,0) result", [
      header.id,
    ]);
  const first = await page();
  assert.equal(
    first.rows.filter((x) => x.booking_status === "cancelled").length,
    1,
  );
  assert.equal(first.rows.filter((x) => x.from_waitlist).length, 1);
  await assert.rejects(
    as(other, "select public.get_campus_event_analytics($1) result", [e.id]),
    (x) => x.code === "P1007",
  );
  await assert.rejects(
    as(other, "select public.get_campus_event_report_page($1,0) result", [
      header.id,
    ]),
    (x) => x.code === "P1008",
  );
  // A completed report retains its committed historical view through cancellation.
  const cancelled = await Promise.all([
    as(org, "select public.set_campus_event_status($1,$2,'cancelled') result", [
      e.id,
      e.revision,
    ]),
    analytics(e),
  ]);
  consistent(cancelled[1]);
  assert.equal((await analytics(e)).metrics.confirmed, 0);
  assert.deepEqual((await page()).rows, first.rows);
  // Concurrent post-end opens issue one immutable participation acknowledgement.
  const ended = await f.event(org, 2, 2);
  const attended = await book(ended, a),
    absent = await book(ended, b);
  const token = await pass(attended, a);
  await scan(ended, token.token);
  assert.equal((await record(attended, a)).reason, "event_not_ended");
  await pool.query(
    "select pg_sleep(greatest(0,extract(epoch from $1::timestamptz-clock_timestamp()))+0.02)",
    [ended.ends_at],
  );
  const records = await Promise.all(
    Array.from({ length: 6 }, () => record(attended, a)),
  );
  assert.equal(new Set(records.map((x) => x.record.id)).size, 1);
  assert.equal((await record(absent, b)).reason, "not_checked_in");
  await assert.rejects(record(attended, b), (x) => x.code === "P1008");
  const original = records[0].record;
  await pool.query(
    "update public.student_profiles set display_name='Renamed Test Student' where user_id=$1",
    [a.id],
  );
  assert.deepEqual((await record(attended, a)).record, original);
  await assert.rejects(
    pool.query(
      "update public.participation_records set display_name='Forged' where id=$1",
      [original.id],
    ),
    (x) => x.code === "23514",
  );
  // Committed organizer revocation wins against an actual protected-read wait.
  const blocker = await pool.connect();
  try {
    await blocker.query("begin");
    await blocker.query(
      "select campuspass_private.provision_membership($1,$2,'organizer','revoked',null,'Reporting test','Revoke organizer during a reporting read')",
      [org.id, f.institution],
    );
    const denied = analytics(ended);
    const rejection = assert.rejects(denied, (x) => x.code === "P1007");
    await lockWait("get_campus_event_analytics");
    await blocker.query("commit");
    await rejection;
  } finally {
    await blocker.query("rollback");
    blocker.release();
  }
  await assert.rejects(page(), (x) => x.code === "P1007");
  console.log(
    "PASS: REAL reporting concurrency: consistent aggregates during booking, cancellation/promotion, simultaneous scans and event cancellation; immutable export snapshot; observed revocation lock wait; six simultaneous post-end record opens issue exactly one stable acknowledgement.",
  );
} finally {
  await f.dispose();
}
