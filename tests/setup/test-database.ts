// Guards integration tests against running destructive database operations
// against anything other than a verified, isolated PostgreSQL test database.
//
// The guard is intentionally conservative: it requires the connection string
// to use the postgres protocol and requires the database name itself to
// contain "test", so a developer's local `.env` (SQLite dev URL) or a
// production connection string can never be mistaken for the test database.
// The hostname is not trusted as proof by itself, since a host can be named
// "test" while still pointing at a shared or non-disposable database.

// Thrown when TEST_DATABASE_URL is missing, malformed, or does not look like
// an isolated test database.
export class UnsafeTestDatabaseError extends Error {}

const TEST_INDICATOR = /test/i

/**
 * Validates that `url` is a PostgreSQL connection string pointing at an
 * isolated test database. Throws `UnsafeTestDatabaseError` otherwise.
 */
export function assertTestDatabaseUrl(
  url: string | undefined
): asserts url is string {
  if (!url) {
    throw new UnsafeTestDatabaseError(
      'TEST_DATABASE_URL is not set. Integration tests require an isolated PostgreSQL test database.'
    )
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new UnsafeTestDatabaseError(
      `TEST_DATABASE_URL is not a valid connection string: "${url}"`
    )
  }

  if (!parsed.protocol.startsWith('postgres')) {
    throw new UnsafeTestDatabaseError(
      `TEST_DATABASE_URL must use a postgres:// connection string, got protocol "${parsed.protocol}"`
    )
  }

  const databaseName = parsed.pathname.replace(/^\//, '')

  if (!TEST_INDICATOR.test(databaseName)) {
    throw new UnsafeTestDatabaseError(
      `Refusing to run destructive test setup: database "${databaseName}" does not look like an isolated test database. The database name must contain "test".`
    )
  }
}
