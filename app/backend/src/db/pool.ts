import pg from "pg";

export function createPool(connectionString: string) {
  return new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Bound runaway queries; nothing in the vault should take this long.
    statement_timeout: 15_000,
    application_name: "private-vault",
  });
}

export type Pool = pg.Pool;
