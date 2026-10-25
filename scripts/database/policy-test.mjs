import { readFile } from "node:fs/promises";
import { databasePool } from "./test-environment.mjs";
const pool = databasePool();
const connection = await pool.connect();
try {
  connection.on("notice", (notice) => console.log(notice.message));
  const sql = (
    await readFile("supabase/tests/student_profiles.sql", "utf8")
  ).replace(/^\\set.*\n/gm, "");
  await connection.query(sql);
  console.log("PostgreSQL policy assertions passed (transaction rolled back).");
} finally {
  connection.release();
  await pool.end();
}
