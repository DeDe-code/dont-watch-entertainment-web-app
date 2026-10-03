import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { Client } from 'pg'
import movieFixture from '../fixtures/tmdb/movie.json' with { type: 'json' }
import {
  connectTestDatabase,
  resetTestDatabase
} from '../setup/database-client'

// The deterministic media the provider mock serves (see
// `tests/e2e/support/tmdb-fetch-mock.cjs`). Reading the shared fixture keeps the
// assertion names tied to the same data the mock returns instead of a second
// hard-coded copy.
const MEDIA_TITLE = movieFixture.title

const PASSWORD = 'correct-horse-battery-staple'

// Unique per run so reruns stay deterministic without depending on the test
// database being clean beforehand.
function uniqueEmail() {
  const suffix = Math.random().toString(36).slice(2, 10)
  return `e2e-bookmark-${Date.now()}-${suffix}@example.com`
}

/**
 * Waits until Vue has hydrated the page.
 *
 * The server-rendered markup is visible before hydration, but a form is only
 * interactive once its handlers are attached; interacting earlier lets the
 * browser fall back to a native submission.
 */
async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('#__nuxt')
    return Boolean(root && '__vue_app__' in root)
  })
}

/**
 * Authenticated bookmark journey for FE-014 (Slice D).
 *
 * A real visitor signs up, sees deterministic media on Home, bookmarks it
 * through the real application API, finds it on the authenticated Bookmarked
 * page, removes it there, and sees it disappear. Only the TMDB provider reads
 * are intercepted (see `tests/e2e/support/tmdb-fetch-mock.cjs`); bookmark
 * creation and removal are persisted by the real API against the isolated
 * PostgreSQL test database, so this exercises the actual bookmark contract
 * rather than a mocked one.
 */
test.describe('authenticated bookmark journey', () => {
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

  test('a user can bookmark media and remove it again', async ({ page }) => {
    const email = uniqueEmail()

    // 1. Sign up through the visible form. The default destination is Home.
    await page.goto('/signup')
    await waitForHydration(page)
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByLabel('Repeat password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Create an account' }).click()
    await page.waitForURL((url) => url.pathname === '/')

    // 2. Home shows the deterministic media served by the provider mock.
    await expect(page.getByRole('heading', { name: MEDIA_TITLE })).toBeVisible()

    // 3. The bookmark control starts out representing "not bookmarked".
    const addBookmark = page.getByRole('button', {
      name: `Add bookmark for ${MEDIA_TITLE}`
    })
    await expect(addBookmark).toBeVisible()
    await expect(addBookmark).toHaveAttribute('aria-pressed', 'false')

    // 4. Activate it, and wait for the real bookmark API to persist it before
    // navigating, so the Bookmarked page reads the row back from PostgreSQL.
    const bookmarkCreated = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/bookmarks'
    )
    await addBookmark.click()
    expect((await bookmarkCreated).status()).toBe(201)

    // 5. The card reflects the bookmarked state.
    await expect(
      page.getByRole('button', { name: `Remove bookmark for ${MEDIA_TITLE}` })
    ).toHaveAttribute('aria-pressed', 'true')

    // 6. Navigate to Bookmarked through the real navigation.
    await page.getByRole('link', { name: 'Bookmarked' }).click()
    await page.waitForURL((url) => url.pathname === '/bookmarked')

    // 7. The same media appears there.
    await expect(
      page.getByRole('heading', { name: 'Bookmarked Movies' })
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: MEDIA_TITLE })).toBeVisible()

    // 8. Remove the bookmark through the UI and wait for the real API call.
    const bookmarkDeleted = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        response.url().includes('/api/bookmarks/TMDB/')
    )
    await page
      .getByRole('button', { name: `Remove bookmark for ${MEDIA_TITLE}` })
      .click()
    expect((await bookmarkDeleted).ok()).toBe(true)

    // 9. The item disappears and the page reports the empty state.
    await expect(page.getByRole('heading', { name: MEDIA_TITLE })).toBeHidden()
    await expect(
      page.getByText(`You haven't bookmarked any shows yet.`)
    ).toBeVisible()
  })
})
