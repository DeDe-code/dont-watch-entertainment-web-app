// Provides a `pg` client connected to the isolated PostgreSQL test database,
// and a helper to reset application tables between test runs. Kept separate
// from Prisma so this infrastructure works independently of which task adds
// the PostgreSQL Prisma schema/migrations.
import { Client } from 'pg'
import { assertTestDatabaseUrl } from './test-database'

/**
 * Opens a new connection to the isolated test database. Throws if the
 * configured connection string does not pass the test-database guard.
 */
export async function connectTestDatabase(): Promise<Client> {
  assertTestDatabaseUrl(process.env.TEST_DATABASE_URL)

  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL })
  await client.connect()
  return client
}

/**
 * Truncates every application table in the `public` schema, preserving
 * Prisma's internal migration bookkeeping table. Safe to call even before
 * any application tables exist.
 */
export async function resetTestDatabase(client: Client): Promise<void> {
  const { rows } = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  )

  if (rows.length === 0) {
    return
  }

  const tableList = rows
    .map((row) => {
      return `"${row.tablename}"`
    })
    .join(', ')
  await client.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`)
}
