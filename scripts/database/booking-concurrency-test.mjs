import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { databasePool } from "./test-environment.mjs";
const pool = databasePool();
const institution = randomUUID();
const users = Array.from({ length: 17 }, () => ({
  id: randomUUID(),
  session: randomUUID(),
}));
let event;
async function as(user, sql, args = []) {
  const connection = await pool.connect();
  try {
    await connection.query("begin");
    await connection.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({
        sub: user.id,
        session_id: user.session,
        role: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ]);
    await connection.query("set local role authenticated");
    const result = await connection.query(sql, args);
    await connection.query("commit");
    return result.rows[0]?.result;
  } catch (error) {
    await connection.query("rollback");
    throw error;
  } finally {
    connection.release();
  }
}
const book = (user, key = randomUUID()) =>
  as(user, "select public.book_campus_event($1,$2) as result", [event.id, key]);
try {
  await pool.query(
    "insert into public.institutions(id,name,slug) values($1,$2,$3)",
    [
      institution,
      "Concurrent Booking Institute",
      `concurrency-booking-${institution}`,
    ],
  );
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    await pool.query("insert into auth.users(id,email) values($1,$2)", [
      user.id,
      `phase6-concurrent-${user.id}@example.test`,
    ]);
    await pool.query("insert into auth.sessions(id,user_id) values($1,$2)", [
      user.session,
      user.id,
    ]);
    await pool.query(
      "insert into public.student_profiles(user_id,display_name,prn,department,academic_year) values($1,'Concurrent Student',$2,'Other','First year')",
      [user.id, String(i + 1).padStart(12, "0")],
    );
    await pool.query(
      "select campuspass_private.provision_membership($1,$2,$3,'active',null,'Concurrency test','Approved isolated concurrency test')",
      [user.id, institution, i === 0 ? "organizer" : "student"],
    );
  }
  event = await as(
    users[0],
    "select public.save_campus_event(null,null,'Concurrent Seat Event','A useful concurrent event with a sufficiently detailed description.','Technology','Main hall',now()+interval '1 day',now()+interval '1 day 2 hour',1,'build') as result",
  );
  event = await as(
    users[0],
    "select public.set_campus_event_status($1,$2,'published') as result",
    [event.id, event.revision],
  );
  const results = await Promise.allSettled(
    users.slice(1).map((user) => book(user)),
  );
  const successes = results.flatMap((r, i) =>
    r.status === "fulfilled" ? [{ user: users[i + 1], booking: r.value }] : [],
  );
  assert.equal(
    successes.length,
    1,
    "Exactly one student may obtain the final seat.",
  );
  for (const result of results)
    if (result.status === "rejected") assert.equal(result.reason.code, "P1006");
  assert.equal(
    (
      await pool.query(
        "select count(*)::int n from public.bookings where event_id=$1 and status='confirmed'",
        [event.id],
      )
    ).rows[0].n,
    1,
  );
  const winner = successes[0];
  const duplicates = await Promise.all(
    Array.from({ length: 8 }, () => book(winner.user)),
  );
  assert.ok(duplicates.every((booking) => booking.id === winner.booking.id));
  const next = users.slice(1).find((user) => user.id !== winner.user.id);
  const cancellation = () =>
    as(winner.user, "select public.cancel_campus_booking($1) as result", [
      winner.booking.id,
    ]);
  const race = await Promise.allSettled([
    cancellation(),
    cancellation(),
    book(next),
  ]);
  assert.equal(race[0].status, "fulfilled");
  assert.equal(race[1].status, "fulfilled");
  if (race[2].status === "rejected") assert.equal(race[2].reason.code, "P1006");
  const replacement = await book(next);
  assert.notEqual(replacement.id, winner.booking.id);
  assert.equal(
    (
      await pool.query(
        "select count(*)::int n from public.bookings where event_id=$1 and status='confirmed'",
        [event.id],
      )
    ).rows[0].n,
    1,
  );
  // A cancel-event transaction racing a registration leaves no active booking.
  await Promise.allSettled([
    book(next),
    as(
      users[0],
      "select public.set_campus_event_status($1,$2,'cancelled') as result",
      [event.id, event.revision],
    ),
  ]);
  assert.equal(
    (
      await pool.query(
        "select count(*)::int n from public.bookings where event_id=$1 and status='confirmed'",
        [event.id],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await pool.query("select status from public.events where id=$1", [
        event.id,
      ])
    ).rows[0].status,
    "cancelled",
  );
  await assert.rejects(book(next), (error) => error.code === "P1005");
  console.log(
    "PASS: 16 independent students compete for one seat; 8 duplicate requests, repeated cancellation vs registration, and event cancellation vs registration preserve inventory and history.",
  );
} finally {
  // Only disposable records created by this run. No table truncation or resets.
  if (event) {
    await pool.query("delete from public.booking_requests where event_id=$1", [
      event.id,
    ]);
    await pool.query("delete from public.bookings where event_id=$1", [
      event.id,
    ]);
    await pool.query("delete from public.events where id=$1", [event.id]);
  }
  await pool.query("delete from auth.users where id=any($1::uuid[])", [
    users.map((user) => user.id),
  ]);
  await pool.query("delete from public.institutions where id=$1", [
    institution,
  ]);
  await pool.end();
}
