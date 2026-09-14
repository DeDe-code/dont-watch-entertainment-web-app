// Vitest setup for the "integration" project: verifies the configured
// database is a safe, isolated test database before any test can run
// destructive cleanup, and blocks unintercepted external HTTP calls.
import { afterAll, afterEach, beforeAll } from 'vitest'
import { mswServer } from './msw'
import { assertTestDatabaseUrl } from './test-database'

// Fail fast, before any destructive database access, if the configured
// database does not look like an isolated test database.
assertTestDatabaseUrl(process.env.TEST_DATABASE_URL)

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }))
afterEach(() => mswServer.resetHandlers())
afterAll(() => mswServer.close())
