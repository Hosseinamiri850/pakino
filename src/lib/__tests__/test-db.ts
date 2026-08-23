import postgres from 'postgres';

// Shared connection pool for credit integration tests.
// Uses the same DATABASE_URL as the app; runs against the dev Postgres container.
// Each test file gets its own schema prefix to avoid cross-test interference.
const sql = postgres(process.env.DATABASE_URL ?? 'postgres://pakino:pakino@localhost:5432/pakino', {
  max: 5,
  prepare: false,
});

export { sql };

/** Drop all rows from pakino tables and reset sequences. */
export async function cleanPakinoTables(): Promise<void> {
  await sql`DELETE FROM credit_transactions`;
  await sql`DELETE FROM payment_transactions`;
  await sql`DELETE FROM subscriptions`;
  await sql`DELETE FROM jobs`;
  await sql`DELETE FROM files`;
  await sql`DELETE FROM users`;
}
