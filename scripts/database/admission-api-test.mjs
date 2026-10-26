import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createLiveFixture, ok, registerTestAccount } from "./live-fixture.mjs";
import { apiEnvironment, apiClient } from "./test-environment.mjs";
const f = await createLiveFixture({ sampleEvent: false }),
  { pool, institution, organizer, studentA, studentB } = f;
let checks = 0;
const equal = (a, b, label) => {
  assert.equal(a, b, label);
  checks++;
};
const yes = (value, label) => {
  assert.ok(value, label);
  checks++;
};
const code = async (request, expected) =>
  equal(
    (await request).error?.code,
    expected,
    "Server authorization/error contract",
  );
const sessions = [];
async function event(minutes = 10) {
  const start = new Date(Date.now() + minutes * 60000);
  const draft = ok(
    await organizer.client.rpc("create_campus_event", {
      p_title: "Secure Admission API Workshop",
      p_description:
        "Disposable event for genuine Supabase admission validation and private record testing.",
      p_category: "Workshops",
      p_venue: "Test Institute Hall",
      p_starts_at: start.toISOString(),
      p_ends_at: new Date(start.getTime() + 7200000).toISOString(),
      p_capacity: 10,
      p_theme: "build",
    }),
  );
  return ok(
    await organizer.client.rpc("set_campus_event_status", {
      p_event_id: draft.id,
      p_expected_revision: draft.revision,
      p_status: "published",
    }),
  );
}
const book = async (e, account = studentA) =>
  ok(
    await account.client.rpc("book_campus_event", {
      p_event_id: e.id,
      p_request_id: randomUUID(),
    }),
  );
const issue = async (b, account = studentA) =>
  ok(await account.client.rpc("issue_campus_pass", { p_booking_id: b.id }));
const scan = async (e, token, account = organizer) =>
  ok(
    await account.client.rpc("check_in_campus_pass", {
      p_event_id: e.id,
      p_token: token,
    }),
  );
const age = async (b) =>
  pool.query(
    "update public.admission_tokens set issued_at=issued_at-interval '4 seconds',expires_at=expires_at-interval '4 seconds' where booking_id=$1",
    [b.id],
  );
try {
  const e = await event(),
    a = await book(e),
    b = await book(e, studentB);
  equal(
    ok(await studentA.client.rpc("get_campus_pass", { p_booking_id: a.id }))
      .eligible,
    true,
  );
  await code(
    studentB.client.rpc("issue_campus_pass", { p_booking_id: a.id }),
    "P1008",
  );
  await code(
    studentB.client.rpc("get_campus_pass", { p_booking_id: a.id }),
    "P1008",
  );
  const first = await issue(a),
    beta = await issue(b, studentB);
  yes(/^cp1_[0-9a-f]{64}$/.test(first.token));
  yes(first.token !== beta.token, "Independent unpredictable tokens");
  yes(Date.parse(first.expires_at) - Date.parse(first.server_now) <= 90000);
  const row = (
    await pool.query(
      "select * from public.admission_tokens where booking_id=$1",
      [a.id],
    )
  ).rows[0];
  yes(
    row.token_hash.equals(createHash("sha256").update(first.token).digest()),
    "Only SHA-256 hash is persisted",
  );
  yes(
    !JSON.stringify(row).includes(first.token),
    "No plaintext secret in token record",
  );
  for (const table of [
    "admission_tokens",
    "event_checkins",
    "admission_rate_limits",
    "audit_log",
  ]) {
    yes(
      (await studentA.client.from(table).select("*")).error,
      "Private admission tables are inaccessible",
    );
    yes(
      (
        await organizer.client
          .from(table)
          .update({ booking_id: b.id })
          .eq("booking_id", a.id)
      ).error,
      "Audit cannot be rewritten",
    );
  }
  await code(
    studentA.client.rpc("check_in_campus_pass", {
      p_event_id: e.id,
      p_token: first.token,
    }),
    "P1007",
  );
  await code(
    organizer.client.rpc("issue_campus_pass", { p_booking_id: a.id }),
    "P1008",
  );
  equal(
    (await scan(e, a.reference)).outcome,
    "invalid",
    "Reference is not an admission credential",
  );
  equal(
    (await scan(e, "x".repeat(5000))).outcome,
    "invalid",
    "Oversized payload rejected",
  );
  equal(
    (
      await scan(
        e,
        first.token.slice(0, -1) + (first.token.endsWith("0") ? "1" : "0"),
      )
    ).outcome,
    "invalid",
    "Modified credential rejected",
  );
  const other = await registerTestAccount("Independent Organizer", (x) =>
    f.accounts.push(x),
  );
  await pool.query(
    "select campuspass_private.provision_membership($1,$2,'organizer','active',null,'API test operator','Approved second isolated organizer')",
    [other.id, institution],
  );
  await code(
    other.client.rpc("check_in_campus_pass", {
      p_event_id: e.id,
      p_token: first.token,
    }),
    "P1007",
  );
  await code(
    other.client.rpc("get_campus_checkins", { p_event_id: e.id }),
    "P1007",
  );
  const another = await event();
  equal(
    (await scan(another, first.token)).outcome,
    "invalid",
    "Cross-event token rejected",
  );
  await age(a);
  const replacement = await issue(a);
  yes(replacement.token !== first.token);
  equal(
    (await scan(e, first.token)).outcome,
    "invalid",
    "Prior outstanding token superseded",
  );
  // Real independent GoTrue sessions concurrently submit the same valid credential.
  const secondScanner = apiClient();
  sessions.push(secondScanner);
  ok(
    await secondScanner.auth.signInWithPassword({
      email: organizer.email,
      password: organizer.password,
    }),
  );
  const raced = await Promise.all([
    scan(e, replacement.token),
    scan(e, replacement.token, { client: secondScanner }),
  ]);
  equal(raced.filter((x) => x.outcome === "admitted").length, 1);
  equal(raced.filter((x) => x.outcome === "already_checked_in").length, 1);
  equal(
    (
      await pool.query(
        "select count(*)::int n from public.event_checkins where booking_id=$1",
        [a.id],
      )
    ).rows[0].n,
    1,
  );
  equal(
    (await scan(e, replacement.token)).outcome,
    "already_checked_in",
    "Lost-response retry reconciles without a second success",
  );
  await code(
    studentA.client.rpc("issue_campus_pass", { p_booking_id: a.id }),
    "P1021",
  );
  const history = ok(
    await organizer.client.rpc("get_campus_checkins", { p_event_id: e.id }),
  );
  equal(history.admitted_count, 1);
  equal(history.confirmed_count, 2);
  equal(history.history[0].display_name, "Student Alpha");
  yes(!JSON.stringify(history).includes(studentA.email));
  yes(!JSON.stringify(history).includes(studentA.id));
  yes(!JSON.stringify(history).includes(replacement.token));
  const audit = (
    await pool.query(
      "select actor_user_id,details from public.audit_log where subject_id=$1 and action='admission_scan' and details->>'outcome'='admitted'",
      [e.id],
    )
  ).rows;
  equal(audit.length, 1);
  equal(audit[0].actor_user_id, organizer.id);
  const fresh = apiClient();
  sessions.push(fresh);
  ok(
    await fresh.auth.signInWithPassword({
      email: studentA.email,
      password: studentA.password,
    }),
  );
  yes(
    ok(await fresh.rpc("get_campus_pass", { p_booking_id: a.id }))
      .checked_in_at,
    "Persistent admission on a new real login",
  );
  // Move only disposable owner-controlled timestamps, never a production clock override.
  await pool.query(
    "update public.admission_tokens set issued_at=statement_timestamp()-interval '91 seconds',expires_at=statement_timestamp()-interval '1 second' where booking_id=$1",
    [b.id],
  );
  equal((await scan(e, beta.token)).outcome, "expired");
  equal(
    ok(await studentB.client.rpc("get_campus_pass", { p_booking_id: b.id }))
      .checked_in_at,
    null,
  );
  const beta2 = await issue(b, studentB);
  equal((await scan(e, beta2.token)).outcome, "admitted");
  const future = await event(120),
    futureBooking = await book(future);
  await code(
    studentA.client.rpc("issue_campus_pass", {
      p_booking_id: futureBooking.id,
    }),
    "P1020",
  );
  const cancelEvent = await event(),
    cancelBooking = await book(cancelEvent),
    cancelPass = await issue(cancelBooking);
  ok(
    await studentA.client.rpc("cancel_campus_booking", {
      p_booking_id: cancelBooking.id,
    }),
  );
  equal((await scan(cancelEvent, cancelPass.token)).outcome, "cancelled");
  await code(
    studentA.client.rpc("issue_campus_pass", {
      p_booking_id: cancelBooking.id,
    }),
    "P1005",
  );
  const cancelledEvent = await event(),
    cb = await book(cancelledEvent),
    ct = await issue(cb);
  ok(
    await organizer.client.rpc("set_campus_event_status", {
      p_event_id: cancelledEvent.id,
      p_expected_revision: cancelledEvent.revision,
      p_status: "cancelled",
    }),
  );
  equal((await scan(cancelledEvent, ct.token)).outcome, "cancelled");
  const revokedEvent = await event(),
    rb = await book(revokedEvent),
    rt = await issue(rb);
  await pool.query(
    "select campuspass_private.provision_membership($1,$2,'student','revoked',null,'API operator','Revoke disposable student institutional access')",
    [studentA.id, institution],
  );
  equal((await scan(revokedEvent, rt.token)).outcome, "ineligible");
  await code(
    studentA.client.rpc("issue_campus_pass", { p_booking_id: rb.id }),
    "P1002",
  );
  await pool.query(
    "select campuspass_private.provision_membership($1,$2,'student','active',null,'API operator','Restore disposable student institutional access')",
    [studentA.id, institution],
  );
  await pool.query(
    "update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=$1",
    [studentA.id],
  );
  equal((await scan(revokedEvent, rt.token)).outcome, "ineligible");
  await pool.query("update auth.users set banned_until=null where id=$1", [
    studentA.id,
  ]);
  await pool.query(
    "select campuspass_private.provision_membership($1,$2,'organizer','revoked',null,'API operator','Revoke disposable organizer while scanner open')",
    [organizer.id, institution],
  );
  await code(
    organizer.client.rpc("check_in_campus_pass", {
      p_event_id: revokedEvent.id,
      p_token: rt.token,
    }),
    "P1007",
  );
  await pool.query(
    "select campuspass_private.provision_membership($1,$2,'organizer','active',null,'API operator','Restore disposable organizer access for tests')",
    [organizer.id, institution],
  );
  const ended = await event(0.05),
    eb = await book(ended),
    et = await issue(eb);
  await pool.query(
    "select pg_sleep(greatest(0,extract(epoch from $1::timestamptz-clock_timestamp()))+0.02)",
    [ended.starts_at],
  );
  await pool.query(
    "update public.events set ends_at=clock_timestamp()-interval '1 millisecond' where id=$1",
    [ended.id],
  );
  // A changed event revision also invalidates the old pass before any admission.
  yes((await scan(ended, et.token)).outcome !== "admitted");
  await code(
    studentA.client.rpc("issue_campus_pass", { p_booking_id: eb.id }),
    "P1020",
  );
  // Bound unauthenticated and forged-ownership calls, with no private outcome data.
  const anon = apiClient();
  sessions.push(anon);
  yes((await anon.rpc("issue_campus_pass", { p_booking_id: rb.id })).error);
  yes(
    (
      await studentA.client.rpc("issue_campus_pass", {
        p_booking_id: rb.id,
        student_id: studentB.id,
      })
    ).error,
  );
  await pool.query(
    "insert into public.admission_rate_limits(actor_id,operation,minute,attempts) select $1,'scan',date_trunc('minute',statement_timestamp())+n*interval '1 minute',120 from generate_series(0,1) n on conflict(actor_id,operation,minute) do update set attempts=120",
    [organizer.id],
  );
  equal((await scan(revokedEvent, rt.token)).outcome, "rate_limited");
  await pool.query(
    "delete from public.admission_rate_limits where actor_id=$1",
    [organizer.id],
  );
  const token = ok(await organizer.client.auth.getSession()).session
    .access_token;
  ok(await organizer.client.auth.signOut({ scope: "local" }));
  const { url, key } = apiEnvironment();
  const stale = await fetch(`${url}/rest/v1/rpc/check_in_campus_pass`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_event_id: revokedEvent.id, p_token: rt.token }),
  });
  equal(stale.status, 403, "Revoked JWT replay fails");
  equal(
    (await pool.query("select capacity from public.events where id=$1", [e.id]))
      .rows[0].capacity,
    10,
  );
  equal(
    (
      await pool.query(
        "select count(*)::int n from public.bookings where event_id=$1",
        [e.id],
      )
    ).rows[0].n,
    2,
    "Admission creates no new booking",
  );
  yes(
    !(
      await pool.query(
        "select details::text from public.audit_log where institution_id=$1",
        [institution],
      )
    ).rows.some((row) => row.details.includes(rt.token)),
    "No raw credential in audit history",
  );
  console.log(
    `PASS: ${checks} REAL Supabase admission Auth/PostgREST checks: hashed short-lived passes, independent-session simultaneous scans, retry/replay, persistence, privacy, expiry, regeneration, cancellation, windows, roles, bans, membership and session revocation, rate limits and unchanged booking inventory.`,
  );
} finally {
  await Promise.all(sessions.map((c) => c.auth.dispose()));
  await f.dispose();
}
