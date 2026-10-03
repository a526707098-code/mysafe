import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "./pool.js";

/**
 * Forward-only SQL migrations from app/backend/migrations, applied in file
 * order inside one transaction each. A checksum guards against editing an
 * already-applied migration (schema changes always get a new file). A
 * Postgres advisory lock makes concurrent container starts safe.
 */
const LOCK_ID = 727_271_001;

export interface MigrationResult {
  applied: string[];
  skipped: number;
}

export async function migrate(pool: Pool, dir: string): Promise<MigrationResult> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const done = new Map(
      (
        await client.query<{ name: string; checksum: string }>(
          "SELECT name, checksum FROM schema_migrations",
        )
      ).rows.map((r) => [r.name, r.checksum]),
    );
    const files = (await readdir(dir)).filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f)).sort();
    const applied: string[] = [];
    for (const file of files) {
      const sql = await readFile(path.join(dir, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = done.get(file);
      if (previous) {
        if (previous !== checksum)
          throw new Error(`migration ${file} was modified after being applied`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(name, checksum) VALUES ($1, $2)", [
          file,
          checksum,
        ]);
        await client.query("COMMIT");
        applied.push(file);
      } catch (e) {
        await client.query("ROLLBACK");
        throw new Error(`migration ${file} failed`, { cause: e });
      }
    }
    return { applied, skipped: files.length - applied.length };
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
    client.release();
  }
}
