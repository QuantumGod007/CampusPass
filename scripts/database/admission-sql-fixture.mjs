// Genuine PostgreSQL transactions using disposable Auth-shaped fixtures. The
// separate API suite exercises real GoTrue sessions, not these synthetic ones.
import { randomUUID } from "node:crypto";
import { databasePool } from "./test-environment.mjs";
export async function admissionFixture() {
  const pool = databasePool(),
    institution = randomUUID();
  const users = Array.from({ length: 4 }, () => ({
    id: randomUUID(),
    session: randomUUID(),
  }));
  const events = [];
  async function as(user, sql, args = []) {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({
          sub: user.id,
          session_id: user.session,
          role: "authenticated",
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ]);
      await c.query("set local role authenticated");
      const r = await c.query(sql, args);
      await c.query("commit");
      return r.rows[0]?.result;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }
  async function event(owner = users[0]) {
    const e = await as(
      owner,
      "select public.create_campus_event('Admission Test Workshop','An isolated event used only for genuine database admission tests.','Workshops','Test hall',clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '2 hours',10,'build') result",
    );
    events.push(e.id);
    return as(
      owner,
      "select public.set_campus_event_status($1,$2,'published') result",
      [e.id, e.revision],
    );
  }
  const dispose = async () => {
    try {
      await pool.query(
        "delete from public.event_checkins where event_id=any($1::uuid[])",
        [events],
      );
      await pool.query(
        "delete from public.admission_tokens where event_id=any($1::uuid[])",
        [events],
      );
      await pool.query(
        "delete from public.booking_requests where event_id=any($1::uuid[])",
        [events],
      );
      await pool.query(
        "delete from public.bookings where event_id=any($1::uuid[])",
        [events],
      );
      await pool.query("delete from public.events where id=any($1::uuid[])", [
        events,
      ]);
      await pool.query("delete from auth.users where id=any($1::uuid[])", [
        users.map((x) => x.id),
      ]);
      await pool.query("delete from public.institutions where id=$1", [
        institution,
      ]);
    } finally {
      await pool.end();
    }
  };
  try {
    await pool.query(
      "insert into public.institutions(id,name,slug) values($1,$2,$3)",
      [institution, "Admission Test Institute", `admission-${institution}`],
    );
    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      await pool.query("insert into auth.users(id,email) values($1,$2)", [
        u.id,
        `admission-${u.id}@example.test`,
      ]);
      await pool.query("insert into auth.sessions(id,user_id) values($1,$2)", [
        u.session,
        u.id,
      ]);
      await pool.query(
        "insert into public.student_profiles(user_id,display_name,prn,department,academic_year) values($1,'Admission Test Student',$2,'Other','First year')",
        [u.id, String(i + 801).padStart(12, "0")],
      );
      await pool.query(
        "select campuspass_private.provision_membership($1,$2,$3,'active',null,'Admission test operator','Approved isolated admission test account')",
        [u.id, institution, i < 2 ? "organizer" : "student"],
      );
    }
    return { pool, institution, users, event, as, dispose };
  } catch (e) {
    await dispose();
    throw e;
  }
}
