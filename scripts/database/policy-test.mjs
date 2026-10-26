import { readFile, readdir } from "node:fs/promises";
import { databasePool } from "./test-environment.mjs";
const pool = databasePool();
const connection = await pool.connect();
try {
  connection.on("notice", (notice) => console.log(notice.message));
  for (const file of (await readdir("supabase/tests"))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = (await readFile(`supabase/tests/${file}`, "utf8")).replace(
      /^\\set.*\n/gm,
      "",
    );
    await connection.query(sql);
  }
  console.log("PostgreSQL policy assertions passed (transaction rolled back).");
} finally {
  connection.release();
  await pool.end();
}
