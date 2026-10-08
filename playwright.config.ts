import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import { assertTestDatabaseUrl } from './tests/setup/test-database'

// E2E base URL. Overridable so the config can still address the
// Playwright-managed Nuxt dev server when that server is intentionally told to
// listen at a different host/port. It does not select an externally started
// server: the webServer below always launches `npm run dev` and never reuses an
// existing one.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

// Test-only fetch interceptor injected into the Nuxt server process. The server
// talks to TMDB server-to-server, which a browser-level mock cannot reach, so
// this preload answers the provider endpoints the flows need with fixed
// fixtures. Absolute so it resolves regardless of the server's working
// directory.
const tmdbFetchMockPreload = fileURLToPath(
  new URL('./tests/e2e/support/tmdb-fetch-mock.cjs', import.meta.url)
)

// The Nuxt server Playwright starts must never reach the developer's real
// `.env` database. When no test database is supplied (the anonymous specs need
// only a running server), point the server at an intentionally unreachable
// local PostgreSQL URL whose database name contains "test". The server still
// boots — nothing connects at startup — but any database access fails instead
// of silently reading or writing a real database.
const UNREACHABLE_TEST_DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:1/e2e_requires_test_database'

// Authenticated E2E needs an isolated PostgreSQL test database. When
// TEST_DATABASE_URL is provided it must pass the shared integration guard, so
// an unsafe value fails immediately — before any server or browser starts.
// When it is absent, only the anonymous specs can run, using the unreachable
// fallback above.
function resolveServerDatabaseUrl(): string {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL
  if (!testDatabaseUrl) return UNREACHABLE_TEST_DATABASE_URL
  assertTestDatabaseUrl(testDatabaseUrl)
  return testDatabaseUrl
}

const serverDatabaseUrl = resolveServerDatabaseUrl()

/**
 * Playwright browser-test foundation for FE-014.
 *
 * The suite drives the real Nuxt application through a real browser against a
 * database that is never the developer's `.env` database. Playwright always
 * starts the server itself so a stale server that used the developer's `.env`
 * database can never be reused by mistake.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // Authenticated specs share and reset one isolated PostgreSQL test database
  // (TEST_DATABASE_URL), so parallel workers would interfere with each other's
  // session state. Serial execution keeps the release gate deterministic.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      // WebKit is Playwright's Safari-compatible engine (Safari/WebKit).
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    }
  ],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    // An already-running server may have started with the developer's `.env`
    // database, so it is never reused; Playwright always starts its own server
    // with the database resolved above.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      // The Nuxt server's Prisma client reads DATABASE_URL, so the server must
      // use the database resolved above. Setting it explicitly also overrides
      // any inherited developer value. The dummy TMDB token lets the server
      // boot without live provider credentials; the preload above answers every
      // TMDB call, so the flow never reaches the live provider.
      DATABASE_URL: serverDatabaseUrl,
      NUXT_TMDB_ACCESS_TOKEN: 'e2e-test-token',
      // Appended rather than replaced so any NODE_OPTIONS already in the
      // environment is preserved.
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        `--require ${tmdbFetchMockPreload}`
      ]
        .filter(Boolean)
        .join(' ')
    }
  }
})
