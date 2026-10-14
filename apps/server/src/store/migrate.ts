import pg from "pg";
import { migrate } from "./postgres.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url });
try {
  const ran = await migrate(pool);
  console.log(ran.length ? `applied: ${ran.join(", ")}` : "schema up to date");
} finally {
  await pool.end();
}
