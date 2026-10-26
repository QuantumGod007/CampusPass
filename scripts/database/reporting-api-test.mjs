import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLiveFixture, registerTestAccount, ok } from "./live-fixture.mjs";
import { apiClient, apiEnvironment } from "./test-environment.mjs";
const f = await createLiveFixture({ capacity: 2, startsInMinutes: 10 }),
  { pool, organizer, studentA: a, studentB: b } = f;
let checks = 0;
const eq = (x, y, label) => {
    assert.equal(x, y, label);
    checks++;
  },
  yes = (x, label) => {
    assert.ok(x, label);
    checks++;
  };
const denied = async (p, code) => eq((await p).error?.code, code);
const sessions = [];
const externalInstitution = randomUUID();
const book = async (e, u) =>
  ok(
    await u.client.rpc("book_campus_event", {
      p_event_id: e.id,
      p_request_id: randomUUID(),
    }),
  );
const analytics = async (e, u = organizer) =>
  ok(await u.client.rpc("get_campus_event_analytics", { p_event_id: e.id }));
const start = (e, key = randomUUID(), u = organizer) =>
  u.client.rpc("start_campus_event_report", {
    p_event_id: e.id,
    p_request_id: key,
  });
const page = (header, after = 0, u = organizer) =>
  u.client.rpc("get_campus_event_report_page", {
    p_snapshot_id: header.id,
    p_after: after,
  });
const participation = (bk, u) =>
  u.client.rpc("get_campus_participation", { p_booking_id: bk.id });
const provision = (u, role, status = "active", institution = f.institution) =>
  pool.query(
    "select campuspass_private.provision_membership($1,$2,$3,$4,null,'Reporting API operator','Approved disposable reporting test access')",
    [u.id, institution, role, status],
  );
async function event(startSeconds = 600, duration = 3600) {
  const d = ok(
    await organizer.client.rpc("create_campus_event", {
      p_title: "Private Attendance API Event",
      p_description:
        "Disposable event for genuine authorized analytics, complete report and participation testing.",
      p_category: "Workshops",
      p_venue: "Test Hall",
      p_starts_at: new Date(Date.now() + startSeconds * 1000).toISOString(),
      p_ends_at: new Date(
        Date.now() + (startSeconds + duration) * 1000,
      ).toISOString(),
      p_capacity: 2,
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
try {
  const c = await registerTestAccount("Student Gamma", (x) =>
    f.accounts.push(x),
  );
  await provision(c, "student");
  const other = await registerTestAccount("Other Organizer", (x) =>
    f.accounts.push(x),
  );
  await provision(other, "organizer");
  const e = f.event;
  const empty = await analytics(e);
  eq(empty.metrics.booking_records, 0);
  eq(empty.metrics.checkin_percentage, 0);
  eq(empty.timeline.length, 0);
  eq(empty.lifecycle, "upcoming");
  const ba = await book(e, a),
    bb = await book(e, b);
  ok(
    await c.client.rpc("join_campus_waitlist", {
      p_event_id: e.id,
      p_request_id: randomUUID(),
    }),
  );
  ok(await a.client.rpc("cancel_campus_booking", { p_booking_id: ba.id }));
  const bc = ok(await c.client.rpc("list_my_campus_bookings")).find(
    (x) => x.event_id === e.id,
  );
  for (const [u, bk] of [
    [b, bb],
    [c, bc],
  ]) {
    const pass = ok(
      await u.client.rpc("issue_campus_pass", { p_booking_id: bk.id }),
    );
    eq(
      ok(
        await organizer.client.rpc("check_in_campus_pass", {
          p_event_id: e.id,
          p_token: pass.token,
        }),
      ).outcome,
      "admitted",
    );
    eq(
      ok(
        await organizer.client.rpc("check_in_campus_pass", {
          p_event_id: e.id,
          p_token: pass.token,
        }),
      ).outcome,
      "already_checked_in",
    );
  }
  const live = await analytics(e);
  eq(live.metrics.confirmed, 2);
  eq(live.metrics.cancelled, 1);
  eq(live.metrics.active_waitlist, 0);
  eq(live.metrics.promotions, 1);
  eq(live.metrics.total_checkins, 2);
  eq(live.metrics.confirmed_checked_in, 2);
  eq(live.metrics.confirmed_not_checked_in, 0);
  eq(live.metrics.checkin_percentage, 100);
  eq(
    live.timeline.reduce((n, x) => n + x.count, 0),
    2,
  );
  yes(live.timeline.length <= 20);
  await denied(
    other.client.rpc("get_campus_event_analytics", { p_event_id: e.id }),
    "P1007",
  );
  await denied(
    a.client.rpc("get_campus_event_analytics", { p_event_id: e.id }),
    "P1007",
  );
  await denied(start(e, randomUUID(), other), "P1007");
  // >200 real rows require multiple bounded pages, never partial-client analytics.
  await pool.query(
    "insert into public.bookings(event_id,student_id,status,cancelled_at,cancellation_reason) select $1,$2,'cancelled',clock_timestamp(),'student' from generate_series(1,205)",
    [e.id, a.id],
  );
  const key = randomUUID(),
    header = ok(await start(e, key));
  eq(header.row_count, 208);
  eq(header.analytics.metrics.booking_records, 208);
  eq(header.analytics.metrics.cancelled, 206);
  eq(ok(await start(e, key)).id, header.id);
  const first = ok(await page(header));
  eq(first.rows.length, 200);
  eq(first.next_after, 200);
  const second = ok(await page(header, 200));
  eq(second.rows.length, 8);
  eq(second.next_after, null);
  eq(new Set([...first.rows, ...second.rows].map((x) => x.position)).size, 208);
  yes(
    first.rows.every(
      (x) => !("prn" in x) && !("email" in x) && !("student_id" in x),
    ),
  );
  yes(!JSON.stringify(first).includes(a.email));
  await denied(page(header, 0, other), "P1008");
  await denied(page(header, 0, a), "P1008");
  await denied(page(header, -1), "23514");
  yes(
    (
      await organizer.client.rpc("get_campus_event_report_page", {
        p_snapshot_id: header.id,
        p_after: 0,
        organizer_id: other.id,
      })
    ).error,
  );
  for (const table of [
    "event_report_snapshots",
    "event_report_rows",
    "participation_records",
  ]) {
    yes((await organizer.client.from(table).select("*")).error);
    yes(
      (await a.client.from(table).insert({ event_id: e.id, student_id: a.id }))
        .error,
    );
  }
  // The immutable report continues to represent its original committed state.
  ok(await b.client.rpc("cancel_campus_booking", { p_booking_id: bb.id }));
  const changed = await analytics(e);
  eq(changed.metrics.confirmed, 1);
  eq(changed.metrics.total_checkins, 2);
  eq(changed.metrics.checkin_percentage, 100);
  eq(changed.metrics.confirmed_checked_in, 1);
  eq(changed.metrics.cancelled, 207);
  assert.deepEqual(ok(await page(header)).rows, first.rows);
  checks++;
  eq(ok(await participation(ba, a)).reason, "booking_cancelled");
  eq(ok(await participation(bb, b)).reason, "booking_cancelled");
  eq(ok(await participation(bc, c)).reason, "event_not_ended");
  await denied(participation(bc, a), "P1008");
  const ended = await event(4, 3),
    attended = await book(ended, a),
    absent = await book(ended, b);
  const token = ok(
    await a.client.rpc("issue_campus_pass", { p_booking_id: attended.id }),
  );
  ok(
    await organizer.client.rpc("check_in_campus_pass", {
      p_event_id: ended.id,
      p_token: token.token,
    }),
  );
  eq(ok(await participation(attended, a)).reason, "event_not_ended");
  await pool.query(
    "select pg_sleep(greatest(0,extract(epoch from $1::timestamptz-clock_timestamp()))+0.02)",
    [ended.ends_at],
  );
  eq((await analytics(ended)).lifecycle, "ended");
  eq(ok(await participation(absent, b)).reason, "not_checked_in");
  const record = ok(await participation(attended, a)).record;
  yes(record);
  eq(record.booking_id, attended.id);
  eq(record.event_id, ended.id);
  eq(record.display_name, "Student Alpha");
  eq(record.institution_name, "CampusPass Test Institute");
  yes(!("student_id" in record));
  yes(!("checkin_id" in record));
  eq(ok(await participation(attended, a)).record.id, record.id);
  await denied(participation(attended, b), "P1008");
  const profile = ok(
    await a.client.from("student_profiles").select("prn").single(),
  );
  ok(
    await a.client.rpc("save_student_profile", {
      p_display_name: "Renamed Student Alpha",
      p_prn: profile.prn,
      p_department: "Computer Science",
      p_academic_year: "Second year",
    }),
  );
  assert.deepEqual(ok(await participation(attended, a)).record, record);
  checks++;
  const audit = (
    await pool.query(
      "select actor_user_id from public.audit_log where action='participation_record_issued' and subject_id=$1",
      [record.id],
    )
  ).rows;
  eq(audit.length, 1);
  eq(audit[0].actor_user_id, a.id);
  const fresh = apiClient();
  sessions.push(fresh);
  ok(
    await fresh.auth.signInWithPassword({
      email: a.email,
      password: a.password,
    }),
  );
  eq(
    ok(
      await fresh.rpc("get_campus_participation", {
        p_booking_id: attended.id,
      }),
    ).record.id,
    record.id,
  );
  await provision(a, "student", "revoked");
  await denied(participation(attended, a), "P1002");
  await provision(a, "student");
  const cancelled = await event();
  const cancelledBooking = await book(cancelled, a);
  ok(
    await organizer.client.rpc("set_campus_event_status", {
      p_event_id: cancelled.id,
      p_expected_revision: cancelled.revision,
      p_status: "cancelled",
    }),
  );
  eq(ok(await participation(cancelledBooking, a)).reason, "event_cancelled");
  eq((await analytics(cancelled)).lifecycle, "cancelled");
  await provision(organizer, "organizer", "revoked");
  await denied(
    organizer.client.rpc("get_campus_event_analytics", { p_event_id: e.id }),
    "P1007",
  );
  await denied(page(header), "P1007");
  await provision(organizer, "organizer");
  await provision(other, "organizer", "revoked");
  await pool.query(
    "insert into public.institutions(id,name,slug) values($1,'External Reporting Institute',$2)",
    [externalInstitution, `reporting-external-${externalInstitution}`],
  );
  await provision(other, "organizer", "active", externalInstitution);
  await denied(
    other.client.rpc("get_campus_event_analytics", { p_event_id: e.id }),
    "P1007",
  );
  await denied(page(header, 0, other), "P1008");
  const old = await pool.query(
    "insert into public.event_report_snapshots(event_id,organizer_id,request_id,created_at,expires_at,row_count,analytics) values($1,$2,$3,statement_timestamp()-interval '10 minutes',statement_timestamp()-interval '1 second',0,'{}') returning id",
    [e.id, organizer.id, randomUUID()],
  );
  await denied(
    organizer.client.rpc("get_campus_event_report_page", {
      p_snapshot_id: old.rows[0].id,
    }),
    "P1041",
  );
  const orgToken = ok(await organizer.client.auth.getSession()).session
    .access_token;
  ok(await organizer.client.auth.signOut({ scope: "local" }));
  const { url, key: publicKey } = apiEnvironment();
  const stale = await fetch(`${url}/rest/v1/rpc/get_campus_event_report_page`, {
    method: "POST",
    headers: {
      apikey: publicKey,
      Authorization: `Bearer ${orgToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_snapshot_id: header.id, p_after: 0 }),
  });
  eq(stale.status, 403);
  const anon = apiClient();
  sessions.push(anon);
  yes(
    (await anon.rpc("get_campus_event_analytics", { p_event_id: e.id })).error,
  );
  yes(
    (await anon.rpc("get_campus_participation", { p_booking_id: attended.id }))
      .error,
  );
  eq(
    (
      await pool.query(
        "select count(*)::int n from public.participation_records where booking_id=$1",
        [attended.id],
      )
    ).rows[0].n,
    1,
  );
  console.log(
    `PASS: ${checks} REAL reporting/participation Auth/API checks: exact live/history metrics, FIFO/check-in sources, 208-row immutable paged report, role/privacy/cursor denial, end-time eligibility, absent/cancelled denial, stable own acknowledgement across profile edits/new login, audit identity and revoked membership/session rejection.`,
  );
} finally {
  await Promise.all(sessions.map((x) => x.auth.dispose()));
  await pool.query(
    "delete from public.institution_memberships where institution_id=$1",
    [externalInstitution],
  );
  await pool.query("delete from public.institutions where id=$1", [
    externalInstitution,
  ]);
  await f.dispose();
}
