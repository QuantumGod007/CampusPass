import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { admissionFixture } from "./admission-sql-fixture.mjs";
const f = await admissionFixture({ userCount: 106 }),
  { pool, users, as } = f;
const [org, , a, b, c, d, revoked, outsider] = users;
const book = (e, u, key = randomUUID()) =>
  as(u, "select public.book_campus_event($1,$2) result", [e.id, key]);
const join = (e, u, key = randomUUID()) =>
  as(u, "select public.join_campus_waitlist($1,$2) result", [e.id, key]);
const cancel = (booking, u) =>
  as(u, "select public.cancel_campus_booking($1) result", [booking.id]);
const status = (e, u) =>
  as(u, "select public.get_my_campus_waitlist($1) result", [e.id]);
async function capacity(e, n) {
  return as(
    org,
    "select public.save_campus_event($1,$2,$3,$4,'Workshops','Test hall',$5,$6,$7,'build') result",
    [e.id, e.revision, e.title, e.description, e.starts_at, e.ends_at, n],
  );
}
async function event(n = 1) {
  return capacity(await f.event(), n);
}
async function count(e) {
  return (
    await pool.query(
      "select count(*)::int n from public.bookings where event_id=$1 and status='confirmed'",
      [e.id],
    )
  ).rows[0].n;
}
try {
  let e = await event(),
    original = await book(e, a),
    key = randomUUID();
  const duplicates = await Promise.all(
    Array.from({ length: 8 }, () => join(e, b, key)),
  );
  assert.equal(new Set(duplicates.map((x) => x.entry.id)).size, 1);
  const wb = duplicates[0].entry,
    wc = (await join(e, c)).entry;
  assert.equal((await status(e, b)).entry.position, 1);
  assert.equal((await status(e, c)).entry.position, 2);
  const race = await Promise.allSettled([
    cancel(original, a),
    cancel(original, a),
    book(e, outsider),
  ]);
  assert.equal(race[0].status, "fulfilled");
  assert.equal(race[1].status, "fulfilled");
  assert.equal(race[2].status, "rejected");
  assert.equal(race[2].reason.code, "P1006");
  assert.equal(await count(e), 1);
  assert.equal((await status(e, b)).entry.status, "promoted");
  assert.equal((await status(e, c)).entry.position, 1);
  const promoted = (
    await as(b, "select public.list_my_campus_bookings() result")
  ).find((x) => x.event_id === e.id);
  assert.notEqual(promoted.id, original.id);
  assert.equal(
    (await join(e, b, key)).entry.id,
    wb.id,
    "Retry never creates another queue/booking",
  );
  assert.equal(
    (
      await pool.query(
        "select count(*)::int n from public.campus_notifications where recipient_id=$1 and event_id=$2 and kind='waitlist_promoted'",
        [b.id, e.id],
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(join(e, b), (x) => x.code === "P1032");
  const withdrawn = await as(
    c,
    "select public.withdraw_campus_waitlist($1) result",
    [wc.id],
  );
  assert.equal(withdrawn.status, "withdrawn");
  assert.equal(
    (await as(c, "select public.withdraw_campus_waitlist($1) result", [wc.id]))
      .status,
    "withdrawn",
  );
  assert.equal((await join(e, c)).entry.position, 1);
  // Multiple slots and competing cancellation/capacity/normal-book transactions.
  e = await event(2);
  const ba = await book(e, a),
    bb = await book(e, b);
  await join(e, c);
  await join(e, d);
  await join(e, revoked);
  await Promise.all([cancel(ba, a), cancel(bb, b)]);
  assert.equal(await count(e), 2);
  assert.equal((await status(e, c)).entry.status, "promoted");
  assert.equal((await status(e, d)).entry.status, "promoted");
  const capacityRace = await Promise.allSettled([
    capacity(e, 3),
    book(e, outsider),
  ]);
  assert.equal(capacityRace[0].status, "fulfilled");
  assert.equal(capacityRace[1].status, "rejected");
  assert.equal(await count(e), 3);
  assert.equal((await status(e, revoked)).entry.status, "promoted");
  // A stale UI/session cannot jump a queue whose first member was revoked.
  e = await event();
  const booked = await book(e, a);
  await join(e, revoked);
  await join(e, c);
  const blocker = await pool.connect();
  try {
    await blocker.query("begin");
    await blocker.query(
      "select campuspass_private.provision_membership($1,$2,'student','revoked',null,'Test operator','Revoke first queued student during real contention')",
      [revoked.id, f.institution],
    );
    const pending = cancel(booked, a);
    const end = Date.now() + 5000;
    let blocked = false;
    while (Date.now() < end) {
      const r = await pool.query(
        "select count(*)::int n from pg_stat_activity where wait_event_type='Lock' and query like '%cancel_campus_booking%' and pid<>pg_backend_pid()",
      );
      if (r.rows[0].n) {
        blocked = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(
      blocked,
      true,
      "Cancellation reached an actual eligibility lock wait",
    );
    await blocker.query("commit");
    await pending;
  } finally {
    await blocker.query("rollback");
    blocker.release();
  }
  assert.equal((await status(e, c)).entry.status, "promoted");
  assert.equal(
    (
      await pool.query(
        "select status,reason from public.event_waitlist where event_id=$1 and student_id=$2",
        [e.id, revoked.id],
      )
    ).rows[0].reason,
    "ineligible",
  );
  assert.equal(await count(e), 1);
  // Event cancellation closes all waiting entries and issues no bookings.
  e = await event();
  await book(e, a);
  await join(e, c);
  await join(e, d);
  await as(
    org,
    "select public.set_campus_event_status($1,$2,'cancelled') result",
    [e.id, e.revision],
  );
  assert.equal(await count(e), 0);
  assert.equal((await status(e, c)).entry.reason, "event_cancelled");
  const rows = (
    await pool.query(
      "select kind,count(*)::int n from public.campus_notifications where event_id=$1 group by kind",
      [e.id],
    )
  ).rows;
  assert.equal(
    rows.find((x) => x.kind === "waitlist_promoted"),
    undefined,
  );
  assert.equal(rows.find((x) => x.kind === "event_cancelled").n, 3);
  // A cancellation racing a join returns either a promotion or accurate availability.
  const joiningEvent = await event(),
    joiningBooking = await book(joiningEvent, a);
  const joinRace = await Promise.all([
    join(joiningEvent, b),
    cancel(joiningBooking, a),
  ]);
  const afterJoin = await status(joiningEvent, b);
  if (joinRace[0].outcome === "available") {
    assert.equal(afterJoin.entry, null);
    assert.equal(await count(joiningEvent), 0);
  } else {
    assert.equal(afterJoin.entry.status, "promoted");
    assert.equal(await count(joiningEvent), 1);
  }
  // The hard queue bound makes reconciliation complete without a worker.
  const capped = await event();
  const holder = await book(capped, a);
  const candidates = users.slice(3).filter((u) => u.id !== revoked.id);
  await Promise.all(candidates.slice(0, 100).map((u) => join(capped, u)));
  assert.equal((await status(capped, candidates[0])).waiting_count, 100);
  await assert.rejects(
    join(capped, candidates[100]),
    (x) => x.code === "P1034",
  );
  await cancel(holder, a);
  assert.equal(await count(capped), 1);
  assert.equal((await status(capped, candidates[0])).waiting_count, 99);
  console.log(
    "PASS: REAL waitlist concurrency: eight independent duplicate joins, FIFO cancellation, normal-booking fairness, simultaneous cancellations, capacity race, new booking identities, exactly-once notifications, withdrawal/rejoin, committed revocation during an observed lock wait and event cancellation.",
  );
} finally {
  await f.dispose();
}
