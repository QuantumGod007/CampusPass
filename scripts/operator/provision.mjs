// Run only by a trusted database operator. Never use this connection in Vite.
import pg from "pg";
import { parseArgs } from "node:util";
const { values } = parseArgs({
  options: {
    user: { type: "string" },
    institution: { type: "string" },
    role: { type: "string", default: "student" },
    status: { type: "string", default: "active" },
    expires: { type: "string" },
    operator: { type: "string" },
    reason: { type: "string" },
  },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (
  !process.env.OPERATOR_DATABASE_URL ||
  !uuid.test(values.user || "") ||
  !uuid.test(values.institution || "") ||
  !values.operator ||
  !values.reason ||
  !["student", "organizer"].includes(values.role) ||
  !["pending", "active", "revoked"].includes(values.status)
)
  throw new Error(
    'Set OPERATOR_DATABASE_URL; provide --user UUID --institution UUID --role student|organizer --status pending|active|revoked --operator NAME --reason "meaningful reason" [--expires ISO_TIMESTAMP].',
  );
if (values.expires && !Number.isFinite(Date.parse(values.expires)))
  throw new Error("Invalid expiry timestamp.");
const pool = new pg.Pool({
  connectionString: process.env.OPERATOR_DATABASE_URL,
  application_name: "campuspass-trusted-provisioning",
});
try {
  await pool.query(
    "select campuspass_private.provision_membership($1,$2,$3,$4,$5,$6,$7)",
    [
      values.user,
      values.institution,
      values.role,
      values.status,
      values.expires || null,
      values.operator,
      values.reason,
    ],
  );
  console.log("Trusted membership change committed and audited.");
} catch (error) {
  // Do not print a connection string, credentials, user profile or SQL details.
  console.error(
    `Provisioning failed (${error.code || "connection error"}). Check the account, institution, profile, operator privileges and PRN conflicts.`,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
