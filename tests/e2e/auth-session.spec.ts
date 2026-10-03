import { expect, test } from '@playwright/test'
import type { Client } from 'pg'
import {
  connectTestDatabase,
  resetTestDatabase
} from '../setup/database-client'

// Application session cookie (see `server/utils/auth.ts`). The test only
// asserts whether it exists — it never reads or decodes its value.
const SESSION_COOKIE_NAME = 'dont-watch-session'

const PASSWORD = 'correct-horse-battery-staple'

// Unique per run so reruns stay deterministic without depending on the test
// database being clean beforehand.
function uniqueEmail() {
  const suffix = Math.random().toString(36).slice(2, 10)
  return `e2e-${Date.now()}-${suffix}@example.com`
}

/**
 * Authenticated browser flow for FE-014 (Slice C): a real visitor signs up
 * through the visible form, receives an application session, reaches the
 * authenticated Bookmarked page, logs out through the real UI, and is treated
 * as anonymous again.
 *
 * The run targets the isolated PostgreSQL test database (guarded by
 * `playwright.config.ts`). `/bookmarked` is the post-signup destination because
 * an empty bookmark list is served from that database alone, so the flow never
 * touches TMDB.
 */
test.describe('authenticated signup, session and logout', () => {
  let dbClient: Client

  test.beforeAll(async () => {
    dbClient = await connectTestDatabase()
    await resetTestDatabase(dbClient)
  })

  test.afterAll(async () => {
    if (!dbClient) return
    await resetTestDatabase(dbClient)
    await dbClient.end()
  })

  test('a visitor can sign up, reach an authenticated page and log out', async ({
    page,
    context
  }) => {
    const email = uniqueEmail()

    // 1. Start from Sign Up as an anonymous visitor.
    await page.goto('/signup?redirect=/bookmarked')
    await expect(page.getByRole('heading', { name: 'Sign Up' })).toBeVisible()

    // The server-rendered form is interactive only once Vue hydrates and
    // attaches its `@submit.prevent` handler. Submitting before that lets the
    // browser fall back to a native form submission (a full page navigation to
    // `/signup?`), so wait for the Vue root to be mounted before interacting.
    await page.waitForFunction(() => {
      const root = document.querySelector('#__nuxt')
      return Boolean(root && '__vue_app__' in root)
    })

    // 2. Create a real user through the visible signup form.
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByLabel('Repeat password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Create an account' }).click()

    // 3. The browser received an authenticated application session.
    // Wait on the pathname: the starting URL's `?redirect=/bookmarked` query
    // ends with the same text a `/\/bookmarked$/` match would accept, so a
    // regex assertion could succeed before the signup request settles and let
    // the cookie check race ahead of the session being created.
    await page.waitForURL((url) => url.pathname === '/bookmarked')
    const sessionCookie = (await context.cookies()).find(
      (cookie) => cookie.name === SESSION_COOKIE_NAME
    )
    expect(sessionCookie).toBeDefined()
    expect(sessionCookie?.httpOnly).toBe(true)

    // 4. The authenticated user reaches the authenticated page, and the session
    // resolves to the user the form created.
    await expect(
      page.getByPlaceholder('Search for bookmarked shows')
    ).toBeVisible()
    const me = await (await page.request.get('/api/auth/me')).json()
    expect(me.email).toBe(email)

    // 5. Log out through the real UI.
    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login$/)

    // 6. The session is gone and protected access redirects to Login.
    const cookiesAfterLogout = await context.cookies()
    expect(
      cookiesAfterLogout.find((cookie) => cookie.name === SESSION_COOKIE_NAME)
    ).toBeUndefined()

    await page.goto('/bookmarked')
    await expect(page).toHaveURL(/\/login\?/)
    expect(new URL(page.url()).searchParams.get('redirect')).toBe('/bookmarked')
  })
})
