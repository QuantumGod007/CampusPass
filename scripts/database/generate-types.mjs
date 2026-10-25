import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import pg from "pg";
import { introspect, typescript } from "@supabase/typegen";
import { format } from "prettier";
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString)
  throw new Error(
    "Set TEST_DATABASE_URL to the disposable local PostgreSQL/Supabase database.",
  );
const url = new URL(connectionString);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  !["55437", "54322"].includes(url.port)
)
  throw new Error(
    "Type generation is restricted to the isolated local test database ports.",
  );
const pool = new pg.Pool({ connectionString });
try {
  const metadata = await introspect(pool, { includedSchemas: ["public"] });
  const source = await typescript.generate(
    metadata,
    { "detect-one-to-one-relationships": true },
    {
      cwd: process.cwd(),
      env: process.env,
      format: (code) => format(code, { parser: "typescript" }),
    },
  );
  const generated =
    "// Generated from the migrated PostgreSQL schema by npm run db:types. Do not edit.\n" +
    source;
  const target = "src/types/database.ts";
  if (process.argv.includes("--check")) {
    await mkdir(".test-artifacts", { recursive: true });
    await writeFile(".test-artifacts/database.generated.ts", generated);
    if ((await readFile(target, "utf8")) !== generated)
      throw new Error(
        "Database types differ from the migrated schema. Regenerate with npm run db:types.",
      );
    console.log("Generated database types match the migrated schema.");
  } else {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, generated);
    console.log("Generated src/types/database.ts from PostgreSQL.");
  }
} finally {
  await pool.end();
}
