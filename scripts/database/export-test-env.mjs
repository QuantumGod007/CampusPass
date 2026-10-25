import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
const status = JSON.parse(
  execFileSync("node_modules/.bin/supabase", ["status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }),
);
const key = status.PUBLISHABLE_KEY;
if (!key?.startsWith("sb_publishable_"))
  throw new Error("Local Supabase did not provide a publishable key.");
const values = {
  TEST_SUPABASE_URL: status.API_URL,
  TEST_SUPABASE_PUBLISHABLE_KEY: key,
  TEST_DATABASE_URL: status.DB_URL,
};
if (!process.env.GITHUB_ENV)
  throw new Error(
    "This helper exports only to the isolated CI job environment.",
  );
for (const [name, value] of Object.entries(values)) {
  if (typeof value !== "string" || /[\r\n]/.test(value))
    throw new Error("Invalid local stack status.");
  console.log(`::add-mask::${value}`);
  appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
}
console.log(
  "Exported isolated API and database settings; service keys are not exported.",
);
