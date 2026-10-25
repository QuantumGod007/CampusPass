import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createLiveFixture,
  ok,
  registerTestAccount,
  cleanupFixture,
} from "./live-fixture.mjs";
import { apiClient, apiEnvironment } from "./test-environment.mjs";
const fixture = await createLiveFixture({ capacity: 1 });
const { pool, institution, organizer, studentA, studentB } = fixture;
const extraInstitution = randomUUID(),
  extraAccounts = [];
const sessions = [];
const event = fixture.event;
const values = {
  p_title: "Concurrent API Workshop",
  p_description:
    "A sufficiently detailed workshop description for real multi-user API verification.",
  p_category: "Technology",
  p_venue: "Main Institute Hall",
  p_starts_at: event.starts_at,
  p_ends_at: event.ends_at,
  p_capacity: 1,
  p_theme: "build",
};
try {
  assert.equal(
    ok(await organizer.client.rpc("get_campus_access")).role,
    "organizer",
  );
  ok(
    await studentA.client.auth.updateUser({
      data: { role: "organizer", institution_id: institution },
    }),
  );
  assert.ok((await studentA.client.rpc("create_campus_event", values)).error);
  assert.ok(
    (
      await studentA.client
        .from("institution_memberships")
        .update({ role: "organizer" })
        .eq("user_id", studentA.id)
    ).error,
  );
  assert.ok(
    (
      await studentA.client
        .from("events")
        .insert({ organizer_id: studentA.id, institution_id: institution })
    ).error,
  );
  assert.equal(
    ok(await studentA.client.rpc("get_campus_event", { p_event_id: event.id }))
      .available_seats,
    1,
  );
  const keys = [randomUUID(), randomUUID()];
  const race = await Promise.all(
    [studentA, studentB].map((account, i) =>
      account.client.rpc("book_campus_event", {
        p_event_id: event.id,
        p_request_id: keys[i],
      }),
    ),
  );
  assert.equal(race.filter((result) => !result.error).length, 1);
  assert.equal(race.find((result) => result.error).error.code, "P1006");
  const index = race.findIndex((result) => !result.error),
    winner = [studentA, studentB][index],
    loser = [studentA, studentB][1 - index],
    booking = ok(race[index]);
  assert.equal(
    ok(
      await winner.client.rpc("book_campus_event", {
        p_event_id: event.id,
        p_request_id: keys[index],
      }),
    ).id,
    booking.id,
  );
  assert.equal(
    ok(
      await winner.client.rpc("book_campus_event", {
        p_event_id: event.id,
        p_request_id: randomUUID(),
      }),
    ).id,
    booking.id,
  );
  assert.deepEqual(ok(await loser.client.from("bookings").select("*")), []);
  assert.ok(
    (
      await loser.client.rpc("cancel_campus_booking", {
        p_booking_id: booking.id,
      })
    ).error,
  );
  assert.ok(
    (
      await loser.client
        .from("bookings")
        .insert({ event_id: event.id, student_id: winner.id })
    ).error,
  );
  assert.ok(
    (
      await loser.client.rpc("book_campus_event", {
        p_event_id: event.id,
        p_request_id: randomUUID(),
        student_id: winner.id,
      })
    ).error,
  );
  const fresh = apiClient();
  sessions.push(fresh);
  ok(
    await fresh.auth.signInWithPassword({
      email: winner.email,
      password: winner.password,
    }),
  );
  assert.equal(
    ok(await fresh.rpc("list_my_campus_bookings"))[0].reference,
    booking.reference,
  );
  let changed = ok(
    await organizer.client.rpc("save_campus_event", {
      ...values,
      p_event_id: event.id,
      p_expected_revision: event.revision,
      p_capacity: 2,
    }),
  );
  ok(
    await loser.client.rpc("book_campus_event", {
      p_event_id: event.id,
      p_request_id: randomUUID(),
    }),
  );
  assert.equal(
    (
      await organizer.client.rpc("save_campus_event", {
        ...values,
        p_event_id: event.id,
        p_expected_revision: changed.revision,
        p_capacity: 1,
      })
    ).error.code,
    "P1011",
  );
  assert.equal(
    (
      await organizer.client.rpc("save_campus_event", {
        ...values,
        p_event_id: event.id,
        p_expected_revision: 1,
        p_capacity: 2,
      })
    ).error.code,
    "P1010",
  );
  ok(
    await winner.client.rpc("cancel_campus_booking", {
      p_booking_id: booking.id,
    }),
  );
  ok(
    await winner.client.rpc("cancel_campus_booking", {
      p_booking_id: booking.id,
    }),
  );
  assert.equal(
    ok(await loser.client.rpc("get_campus_event", { p_event_id: event.id }))
      .available_seats,
    1,
  );
  assert.equal(
    ok(
      await winner.client.rpc("book_campus_event", {
        p_event_id: event.id,
        p_request_id: keys[index],
      }),
    ).status,
    "cancelled",
  );
  const rebooked = ok(
    await winner.client.rpc("book_campus_event", {
      p_event_id: event.id,
      p_request_id: randomUUID(),
    }),
  );
  assert.notEqual(rebooked.id, booking.id);
  const attendee = ok(
    await organizer.client.rpc("list_campus_attendees", {
      p_event_id: event.id,
    }),
  );
  assert.equal(
    attendee.filter((item) => item.status === "confirmed").length,
    2,
  );
  assert.ok(
    attendee.every(
      (item) =>
        !("prn" in item) && !("email" in item) && !("student_id" in item),
    ),
  );
  assert.ok((await organizer.client.from("audit_log").select("*")).error);
  const otherOrganizer = await registerTestAccount(
    "Other Organizer",
    (account) => fixture.accounts.push(account),
  );
  await pool.query(
    "select campuspass_private.provision_membership($1,$2,'organizer','active',null,'API operator','Approved isolated organizer test access')",
    [otherOrganizer.id, institution],
  );
  assert.equal(
    (
      await otherOrganizer.client.rpc("list_campus_attendees", {
        p_event_id: event.id,
      })
    ).error.code,
    "P1007",
  );
  await pool.query(
    "insert into public.institutions(id,name,slug) values($1,$2,$3)",
    [
      extraInstitution,
      "Other Test Institute",
      `phase6-fixture-${extraInstitution}`,
    ],
  );
  const outsider = await registerTestAccount(
    "Other Institute Student",
    (account) => extraAccounts.push(account),
  );
  await pool.query(
    "select campuspass_private.provision_membership($1,$2,'student','active',null,'API operator','Approved cross institution test membership')",
    [outsider.id, extraInstitution],
  );
  assert.equal(
    ok(await outsider.client.rpc("get_campus_event", { p_event_id: event.id })),
    null,
  );
  assert.equal(
    (
      await outsider.client.rpc("book_campus_event", {
        p_event_id: event.id,
        p_request_id: randomUUID(),
      })
    ).error.code,
    "P1002",
  );
  const anonymous = apiClient();
  sessions.push(anonymous);
  assert.ok(
    (
      await anonymous.rpc("book_campus_event", {
        p_event_id: event.id,
        p_request_id: randomUUID(),
      })
    ).error,
  );
  assert.ok((await anonymous.from("bookings").select("*")).error);
  changed = ok(
    await organizer.client.rpc("set_campus_event_status", {
      p_event_id: event.id,
      p_expected_revision: changed.revision,
      p_status: "cancelled",
    }),
  );
  assert.equal(changed.confirmed_count, 0);
  assert.equal(
    (
      await studentA.client.rpc("book_campus_event", {
        p_event_id: event.id,
        p_request_id: randomUUID(),
      })
    ).error.code,
    "P1005",
  );
  assert.ok(
    ok(await studentA.client.rpc("list_my_campus_bookings")).every(
      (item) => item.status === "cancelled",
    ),
  );
  await pool.query(
    "select campuspass_private.provision_membership($1,$2,'organizer','revoked',null,'API operator','Revoked isolated organizer test access')",
    [organizer.id, institution],
  );
  assert.equal(
    (await organizer.client.rpc("create_campus_event", values)).error.code,
    "P1007",
  );
  assert.equal(
    (
      await organizer.client.rpc("list_campus_attendees", {
        p_event_id: event.id,
      })
    ).error.code,
    "P1007",
  );
  await pool.query(
    "update public.institution_memberships set expires_at=clock_timestamp()-interval '1 minute' where user_id=$1",
    [studentB.id],
  );
  assert.equal(
    (
      await studentB.client.rpc("book_campus_event", {
        p_event_id: event.id,
        p_request_id: randomUUID(),
      })
    ).error.code,
    "P1002",
  );
  const token = (await winner.client.auth.getSession()).data.session
    .access_token;
  ok(await winner.client.auth.signOut({ scope: "local" }));
  const { url, key } = apiEnvironment();
  const stale = await fetch(`${url}/rest/v1/rpc/list_my_campus_bookings`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(stale.status, 403);
  assert.ok(ok(await fresh.rpc("list_my_campus_bookings")).length >= 1);
  assert.equal(
    (
      await pool.query(
        "select count(*)::int n from public.events where institution_id=$1",
        [institution],
      )
    ).rows[0].n,
    1,
    "No demo events are imported.",
  );
  console.log(
    "PASS: REAL Supabase organizer grants, publishing, last-seat competition, idempotency, fresh-session restoration, cancellations, capacity/revision checks, attendee privacy, cross-institution isolation and membership/session revocation.",
  );
} finally {
  await Promise.all(sessions.map((client) => client.auth.dispose()));
  await cleanupFixture(pool, extraInstitution, extraAccounts);
  await fixture.dispose();
}
