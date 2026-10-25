import { randomUUID, randomInt } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  apiClient,
  apiEnvironment,
  confirmationLink,
  databasePool,
} from "./test-environment.mjs";
export function ok(result) {
  if (result.error)
    throw new Error(
      `Isolated API request failed (${result.error.code || result.error.status || "provider error"}).`,
    );
  return result.data;
}
export async function registerTestAccount(label, onCreated = () => {}) {
  const email = `phase6-fixture-${randomUUID()}@example.test`,
    password = `Test-${randomUUID()}-9a!`,
    client = apiClient();
  const signed = ok(await client.auth.signUp({ email, password }));
  if (!signed.user?.id)
    throw new Error("Isolated signup did not create an account.");
  const account = { id: signed.user.id, email, password, client };
  onCreated(account);
  const response = await fetch(await confirmationLink(email), {
    redirect: "manual",
  });
  if (![302, 303].includes(response.status))
    throw new Error("Local email confirmation failed.");
  const authenticated = ok(
    await client.auth.signInWithPassword({ email, password }),
  );
  if (!authenticated.user.email_confirmed_at)
    throw new Error("Local Auth did not confirm the account.");
  ok(
    await client.rpc("save_student_profile", {
      p_display_name: label,
      p_prn: String(randomInt(0, 1_000_000_000_000)).padStart(12, "0"),
      p_department: "Computer Science",
      p_academic_year: "Second year",
    }),
  );
  return account;
}
export async function cleanupFixture(pool, institution, accounts) {
  const { rows } = await pool.query(
    "select id from public.institutions where id=$1 and slug=$2",
    [institution, `phase6-fixture-${institution}`],
  );
  if (rows.length) {
    await pool.query(
      "delete from public.booking_requests where event_id in(select id from public.events where institution_id=$1)",
      [institution],
    );
    await pool.query(
      "delete from public.bookings where event_id in(select id from public.events where institution_id=$1)",
      [institution],
    );
    await pool.query("delete from public.events where institution_id=$1", [
      institution,
    ]);
  }
  await Promise.all(accounts.map((account) => account.client?.auth.dispose()));
  if (accounts.length)
    await pool.query(
      "delete from auth.users where id=any($1::uuid[]) and email like 'phase6-fixture-%@example.test'",
      [accounts.map((account) => account.id)],
    );
  if (rows.length)
    await pool.query("delete from public.institutions where id=$1", [
      institution,
    ]);
}
export async function createLiveFixture({
  sampleEvent = true,
  capacity = 2,
} = {}) {
  apiEnvironment();
  const pool = databasePool(),
    institution = randomUUID(),
    accounts = [];
  const dispose = async () => {
    try {
      await cleanupFixture(pool, institution, accounts);
    } finally {
      await pool.end();
    }
  };
  try {
    await pool.query(
      "insert into public.institutions(id,name,slug) values($1,$2,$3)",
      [
        institution,
        "CampusPass Test Institute",
        `phase6-fixture-${institution}`,
      ],
    );
    const organizer = await registerTestAccount("Campus Organizer", (account) =>
      accounts.push(account),
    );
    const studentA = await registerTestAccount("Student Alpha", (account) =>
      accounts.push(account),
    );
    const studentB = await registerTestAccount("Student Beta", (account) =>
      accounts.push(account),
    );
    for (const account of accounts)
      await pool.query(
        "select campuspass_private.provision_membership($1,$2,$3,'active',null,'Isolated fixture operator','Approved disposable development account')",
        [
          account.id,
          institution,
          account.id === organizer.id ? "organizer" : "student",
        ],
      );
    let event;
    if (sampleEvent) {
      const start = new Date(Date.now() + 86400000),
        end = new Date(start.getTime() + 7200000);
      const draft = ok(
        await organizer.client.rpc("create_campus_event", {
          p_title: "CampusPass Shared Workshop",
          p_description:
            "An isolated development workshop for testing shared seat inventory and real account registrations.",
          p_category: "Workshops",
          p_venue: "Test Institute Hall",
          p_starts_at: start.toISOString(),
          p_ends_at: end.toISOString(),
          p_capacity: capacity,
          p_theme: "build",
        }),
      );
      event = ok(
        await organizer.client.rpc("set_campus_event_status", {
          p_event_id: draft.id,
          p_expected_revision: draft.revision,
          p_status: "published",
        }),
      );
    }
    return {
      pool,
      institution,
      accounts,
      organizer,
      studentA,
      studentB,
      event,
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const file = ".test-artifacts/live-fixture.json";
  if (process.argv.includes("--clean")) {
    apiEnvironment();
    const pool = databasePool();
    try {
      const stored = JSON.parse(await readFile(file, "utf8"));
      await cleanupFixture(pool, stored.institution, stored.accounts);
      console.log(
        "Only the recorded disposable institution/accounts were removed.",
      );
    } finally {
      await pool.end();
    }
  } else {
    const fixture = await createLiveFixture();
    try {
      await mkdir(".test-artifacts", { recursive: true });
      await writeFile(
        file,
        JSON.stringify(
          {
            institution: fixture.institution,
            event: fixture.event,
            accounts: fixture.accounts.map(({ id, email, password }) => ({
              id,
              email,
              password,
            })),
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
      console.log(
        "Disposable institution, organizer, two students and published two-seat event created. Local credentials: .test-artifacts/live-fixture.json (ignored; keep private).",
      );
    } finally {
      await Promise.all(
        fixture.accounts.map((account) => account.client.auth.dispose()),
      );
      await fixture.pool.end();
    }
  }
}
