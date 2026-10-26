import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { admissionFixture } from "./admission-sql-fixture.mjs";
const f = await admissionFixture(),
  { pool, as, users, institution } = f;
const [organizer, other, student, second] = users;
const scan = (event, token, actor = organizer) =>
  as(actor, "select public.check_in_campus_pass($1,$2) result", [
    event.id,
    token,
  ]);
const book = (event, actor = student) =>
  as(actor, "select public.book_campus_event($1,$2) result", [
    event.id,
    randomUUID(),
  ]);
const issue = (booking, actor = student) =>
  as(actor, "select public.issue_campus_pass($1) result", [booking.id]);
async function waitForLock(pid) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    const r = await pool.query(
      "select wait_event_type from pg_stat_activity where pid=$1",
      [pid],
    );
    if (r.rows[0]?.wait_event_type === "Lock") return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error("Scan did not reach the expected real database lock wait");
}
try {
  const e = await f.event(),
    b = await book(e),
    credential = await issue(b);
  const race = await Promise.all(
    Array.from({ length: 8 }, () => scan(e, credential.token)),
  );
  assert.equal(race.filter((x) => x.outcome === "admitted").length, 1);
  assert.equal(
    race.filter((x) => x.outcome === "already_checked_in").length,
    7,
  );
  assert.equal(
    (
      await pool.query(
        "select count(*)::int n from public.event_checkins where booking_id=$1",
        [b.id],
      )
    ).rows[0].n,
    1,
  );
  assert.equal((await scan(e, credential.token)).outcome, "already_checked_in");
  const e2 = await f.event(),
    b2 = await book(e2);
  const issuing = await Promise.allSettled([issue(b2), issue(b2)]);
  assert.equal(issuing.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    issuing.find((x) => x.status === "rejected").reason.code,
    "P1022",
  );
  const t2 = issuing.find((x) => x.status === "fulfilled").value.token;
  await Promise.all([
    scan(e2, t2),
    as(student, "select public.cancel_campus_booking($1) result", [b2.id]),
  ]);
  assert.equal(
    (
      await pool.query("select status from public.bookings where id=$1", [
        b2.id,
      ])
    ).rows[0].status,
    "cancelled",
  );
  assert.notEqual((await scan(e2, t2)).outcome, "admitted");
  const e3 = await f.event(),
    b3 = await book(e3),
    t3 = await issue(b3);
  // A committed student-membership revocation wins against an actual waiting scan.
  const blocker = await pool.connect(),
    scanner = await pool.connect();
  try {
    await blocker.query("begin");
    await blocker.query(
      "update public.institution_memberships set status='revoked',revoked_at=clock_timestamp() where user_id=$1",
      [student.id],
    );
    await scanner.query("begin");
    await scanner.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({
        sub: organizer.id,
        session_id: organizer.session,
        role: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ]);
    await scanner.query("set local role authenticated");
    const scanning = scanner.query(
      "select public.check_in_campus_pass($1,$2) result",
      [e3.id, t3.token],
    );
    await waitForLock(scanner.processID);
    await blocker.query("commit");
    assert.equal((await scanning).rows[0].result.outcome, "ineligible");
    await scanner.query("commit");
  } finally {
    await blocker.query("rollback");
    await scanner.query("rollback");
    blocker.release();
    scanner.release();
  }
  await pool.query(
    "select campuspass_private.provision_membership($1,$2,'student','active',null,'Test operator','Restore disposable student access')",
    [student.id, institution],
  );
  const e4 = await f.event(),
    b4 = await book(e4),
    t4 = await issue(b4);
  await Promise.all([
    scan(e4, t4.token),
    as(
      organizer,
      "select public.set_campus_event_status($1,$2,'cancelled') result",
      [e4.id, e4.revision],
    ),
  ]);
  assert.notEqual((await scan(e4, t4.token)).outcome, "admitted");
  const b5 = await book(e, second),
    t5 = await issue(b5, second);
  await assert.rejects(scan(e, t5.token, other), (e) => e.code === "P1007");
  assert.equal((await scan(e, t5.token)).outcome, "admitted");
  console.log(
    "PASS: REAL PostgreSQL admission concurrency: 8 simultaneous scanners yield exactly one admission; duplicate issuance, scan/cancel, scan/event cancellation, committed revocation during an observed lock wait and independent student credentials.",
  );
} finally {
  await f.dispose();
}
