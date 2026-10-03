import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool } from "./pool.js";
import { migrate } from "./migrate.js";

const url = process.env.DATABASE_URL;
if (!url) {
  process.stderr.write("DATABASE_URL is required\n");
  process.exit(1);
}
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations");
const pool = createPool(url);
try {
  const r = await migrate(pool, dir);
  process.stdout.write(
    `migrations applied: ${r.applied.join(", ") || "none"} (${r.skipped} already applied)\n`,
  );
} finally {
  await pool.end();
}
