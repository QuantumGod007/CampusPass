import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  apiClient,
  apiEnvironment,
  confirmationLink,
  databasePool,
} from "./test-environment.mjs";
const pool = databasePool();
const clients = [];
const users = [];
const institutions = [];
const values = {
  p_display_name: "Real API Student",
  p_prn: "001234567890",
  p_department: "Computer Science",
  p_academic_year: "Second year",
};
const connect = () => {
  const client = apiClient();
  clients.push(client);
  return client;
};
const success = (result) => {
  assert.equal(
    result.error,
    null,
    result.error?.code || "Unexpected API error",
  );
  return result.data;
};
async function register() {
  const email = `phase5-api-${randomUUID()}@example.test`;
  const password = `Test-${randomUUID()}-9a!`;
  const client = connect();
  const registration = success(await client.auth.signUp({ email, password }));
  assert.ok(registration.user?.id);
  users.push(registration.user.id);
  assert.equal(
    registration.session,
    null,
    "Email confirmation must be enabled in this stack.",
  );
  const link = await confirmationLink(email);
  const confirmation = await fetch(link, { redirect: "manual" });
  assert.ok(
    [302, 303].includes(confirmation.status),
    "Actual Auth email confirmation must redirect.",
  );
  const login = success(
    await client.auth.signInWithPassword({ email, password }),
  );
  assert.ok(login.user.email_confirmed_at);
  assert.ok((await client.auth.getUser()).data.user?.id);
  return {
    client,
    email,
    password,
    user: login.user,
    token: login.session.access_token,
  };
}
try {
  const a = await register();
  assert.equal(
    success(await a.client.rpc("get_student_account")).profile,
    null,
  );
  const concurrent = await Promise.all(
    Array.from({ length: 8 }, () =>
      a.client.rpc("save_student_profile", values),
    ),
  );
  concurrent.forEach(success);
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as n from public.student_profiles where user_id=$1",
        [a.user.id],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    success(await a.client.rpc("get_student_account")).profile.prn,
    values.p_prn,
  );
  const secondSession = connect();
  success(
    await secondSession.auth.signInWithPassword({
      email: a.email,
      password: a.password,
    }),
  );
  assert.equal(
    success(await secondSession.rpc("get_student_account")).profile
      .display_name,
    values.p_display_name,
  );
  success(
    await secondSession.rpc("save_student_profile", {
      ...values,
      p_display_name: "Updated API Student",
    }),
  );
  assert.equal(
    success(await a.client.rpc("get_student_account")).profile.display_name,
    "Updated API Student",
  );
  const b = await register();
  assert.deepEqual(
    success(await b.client.from("student_profiles").select("*")),
    [],
  );
  assert.ok(
    (await b.client.from("student_profiles").insert({ user_id: a.user.id }))
      .error,
  );
  assert.ok(
    (
      await b.client
        .from("student_profiles")
        .update({ user_id: a.user.id })
        .eq("user_id", b.user.id)
    ).error,
  );
  assert.ok(
    (
      await b.client
        .from("institution_memberships")
        .insert({ user_id: b.user.id, role: "admin" })
    ).error,
  );
  assert.ok(
    (
      await b.client.rpc("save_student_profile", {
        ...values,
        user_id: a.user.id,
      })
    ).error,
  );
  assert.ok(
    (await b.client.rpc("save_student_profile", { ...values, p_prn: "123" }))
      .error,
  );
  assert.ok(
    (
      await b.client.rpc("save_student_profile", {
        ...values,
        p_department: "Imaginary",
      })
    ).error,
  );
  const anon = connect();
  assert.ok((await anon.from("student_profiles").select("*")).error);
  assert.ok((await anon.rpc("get_student_account")).error);
  for (let n = 0; n < 2; n++) {
    const id = randomUUID();
    institutions.push(id);
    await pool.query(
      "insert into public.institutions(id,name,slug) values ($1,$2,$3)",
      [id, `API Test Institute ${n}`, `api-${id}`],
    );
  }
  await pool.query(
    "insert into public.institution_memberships(user_id,institution_id,status,approved_at) values ($1,$3,'active',now()),($2,$3,'active',now())",
    [a.user.id, b.user.id, institutions[0]],
  );
  assert.equal(
    (await b.client.rpc("save_student_profile", values)).error?.code,
    "23505",
  );
  await pool.query(
    "delete from public.institution_memberships where user_id=$1",
    [b.user.id],
  );
  await pool.query(
    "insert into public.institution_memberships(user_id,institution_id,status,approved_at) values ($1,$2,'active',now())",
    [b.user.id, institutions[1]],
  );
  assert.equal(
    success(await b.client.rpc("save_student_profile", values)).profile
      .institution_id,
    institutions[1],
  );
  await pool.query(
    "update public.institution_memberships set status='revoked',revoked_at=now() where user_id=$1",
    [b.user.id],
  );
  assert.equal(
    success(await b.client.rpc("get_student_account")).profile.institution_id,
    null,
  );
  assert.equal(
    success(await b.client.rpc("get_student_account")).membership.status,
    "revoked",
  );
  success(await a.client.auth.signOut({ scope: "local" }));
  const { url, key } = apiEnvironment();
  const stale = await fetch(`${url}/rest/v1/rpc/get_student_account`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${a.token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(
    stale.status,
    403,
    "Revoked but unexpired JWT must be rejected by the database.",
  );
  assert.equal(
    success(await secondSession.rpc("get_student_account")).profile
      .display_name,
    "Updated API Student",
  );
  console.log(
    "PASS: REAL Auth signup + SMTP confirmation, password login, concurrent API creation, second-session restoration, update, own-only RLS, anonymous/forgery/role denial, institutional PRN uniqueness, revocation, and stale JWT denial.",
  );
} finally {
  await Promise.all(clients.map((client) => client.auth.dispose()));
  if (users.length)
    await pool.query("delete from auth.users where id=any($1::uuid[])", [
      users,
    ]);
  if (institutions.length)
    await pool.query(
      "delete from public.institutions where id=any($1::uuid[])",
      [institutions],
    );
  await pool.end();
}
