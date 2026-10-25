import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { databasePool } from "./test-environment.mjs";
const pool = databasePool();
const user = randomUUID(),
  session = randomUUID(),
  institution = randomUUID();
const claims = JSON.stringify({
  sub: user,
  session_id: session,
  role: "authenticated",
  exp: Math.floor(Date.now() / 1000) + 3600,
});
async function save() {
  const connection = await pool.connect();
  try {
    await connection.query("begin");
    await connection.query(
      "select set_config('request.jwt.claims', $1, true)",
      [claims],
    );
    await connection.query("set local role authenticated");
    await connection.query(
      "select public.save_student_profile('Concurrent Student', '000000123456', 'Other', 'First year')",
    );
    await connection.query("commit");
  } catch (error) {
    await connection.query("rollback");
    throw error;
  } finally {
    connection.release();
  }
}
try {
  await pool.query("insert into auth.users(id,email) values ($1,$2)", [
    user,
    `concurrency-${user}@example.test`,
  ]);
  await pool.query("insert into auth.sessions(id,user_id) values ($1,$2)", [
    session,
    user,
  ]);
  await Promise.all(Array.from({ length: 8 }, save));
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as count from public.student_profiles where user_id=$1",
        [user],
      )
    ).rows[0].count,
    1,
  );
  await pool.query(
    "insert into public.institutions(id,name,slug) values ($1,$2,$3)",
    [institution, "Concurrency Test Institute", `concurrency-${institution}`],
  );
  await pool.query(
    "insert into public.institution_memberships(user_id,institution_id,status,approved_at) values ($1,$2,'active',now())",
    [user, institution],
  );
  await Promise.all([
    save(),
    save(),
    pool.query(
      "update public.institution_memberships set status='revoked', revoked_at=now() where user_id=$1",
      [user],
    ),
  ]);
  assert.equal(
    (
      await pool.query(
        "select institution_id from public.student_profiles where user_id=$1",
        [user],
      )
    ).rows[0].institution_id,
    null,
  );
  await pool.query(
    "update public.institution_memberships set status='active' where user_id=$1",
    [user],
  );
  await Promise.all([
    save(),
    pool.query("update public.institutions set is_active=false where id=$1", [
      institution,
    ]),
  ]);
  assert.equal(
    (
      await pool.query(
        "select institution_id from public.student_profiles where user_id=$1",
        [user],
      )
    ).rows[0].institution_id,
    null,
  );
  console.log(
    "PASS: concurrent first saves create one profile; concurrent revocation and institution deactivation remove association.",
  );
} finally {
  await pool.query("delete from auth.users where id=$1", [user]);
  await pool.query("delete from public.institutions where id=$1", [
    institution,
  ]);
  await pool.end();
}
