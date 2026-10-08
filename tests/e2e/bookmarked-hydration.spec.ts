import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { Client } from 'pg'
import movieFixture from '../fixtures/tmdb/movie.json' with { type: 'json' }
import {
  connectTestDatabase,
  resetTestDatabase
} from '../setup/database-client'

// The deterministic media the provider mock serves (see
// `tests/e2e/support/tmdb-fetch-mock.cjs`).
const MEDIA_TITLE = movieFixture.title
const MEDIA_EXTERNAL_ID = movieFixture.id

const PASSWORD = 'correct-horse-battery-staple'

function uniqueEmail() {
  const suffix = Math.random().toString(36).slice(2, 10)
  return `e2e-hydration-${Date.now()}-${suffix}@example.com`
}

/**
 * Collects every console message and page error that mentions hydration.
 *
 * Vue reports a hydration mismatch through the console — a detailed warning per
 * mismatched node plus a closing `Hydration completed but contains mismatches.`
 * message — so the console is the only place the failure is observable: the
 * client-rendered page looks correct after hydration has already repaired the
 * mismatched markup.
 */
function collectHydrationMessages(page: Page): string[] {
  const messages: string[] = []
  page.on('console', (message) => {
    if (/hydration/i.test(message.text())) messages.push(message.text())
  })
  page.on('pageerror', (error) => {
    if (/hydration/i.test(error.message)) messages.push(error.message)
  })
  return messages
}

/**
 * Registers a user and leaves the session cookie in the browser context.
 */
async function signUp(page: Page) {
  await page.goto('/signup')
  await page.waitForFunction(() => {
    const root = document.querySelector('#__nuxt')
    return Boolean(root && '__vue_app__' in root)
  })
  await page.getByLabel('Email address').fill(uniqueEmail())
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Repeat password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.waitForURL((url) => url.pathname === '/')
}

/**
 * Persists a bookmark through the real API. `page.request` shares the browser
 * context's cookie jar, so the write is attributed to the signed-up session.
 */
async function bookmarkMedia(page: Page) {
  const response = await page.request.post('/api/bookmarks', {
    data: {
      provider: 'TMDB',
      externalId: MEDIA_EXTERNAL_ID,
      mediaType: 'MOVIE'
    }
  })
  expect(response.status()).toBe(201)
}

/**
 * Waits a frame beyond hydration, so a mismatch warning raised while the client
 * hydrates has already reached the console.
 */
function waitForHydrationToSettle(page: Page) {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
}

/**
 * Authenticated Bookmarked hydration regression.
 *
 * An authenticated hard load of `/bookmarked` must produce the same list on the
 * server and on the client. When the two disagree, Vue repairs the DOM during
 * hydration and reports "Hydration completed but contains mismatches." The
 * server-rendered document is asserted directly as well, because it is the half
 * that no longer exists once hydration has run.
 */
test.describe('authenticated Bookmarked hydration', () => {
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

  test('a hard load renders the bookmarked list identically on the server and the client', async ({
    page
  }) => {
    const hydrationMessages = collectHydrationMessages(page)

    await signUp(page)
    await bookmarkMedia(page)

    // A full document load: the server renders `/bookmarked`, then the browser
    // hydrates that markup.
    const response = await page.goto('/bookmarked')
    expect(response?.status()).toBe(200)
    const serverHtml = (await response?.text()) ?? ''

    // The server rendered the bookmarked card, not the whole-page empty state.
    expect(serverHtml).toContain('media-card__title')
    expect(serverHtml).not.toContain('bookmarked-page__empty')

    // The card title is rendered on the client, matching the server's markup.
    await expect(
      page.getByRole('heading', { name: MEDIA_TITLE, exact: true })
    ).toBeVisible()
    await waitForHydrationToSettle(page)

    expect(hydrationMessages).toEqual([])
  })

  test('a hard load of a bookmarked search renders identically on the server and the client', async ({
    page
  }) => {
    const hydrationMessages = collectHydrationMessages(page)

    await signUp(page)
    await bookmarkMedia(page)

    const response = await page.goto(
      `/bookmarked?q=${encodeURIComponent(MEDIA_TITLE)}`
    )
    expect(response?.status()).toBe(200)
    const serverHtml = (await response?.text()) ?? ''

    // The server already resolved the direct-link query's results.
    expect(serverHtml).toContain('media-card__title')

    // The search result card is rendered on the client, matching the server.
    await expect(
      page.getByRole('heading', { name: MEDIA_TITLE, exact: true })
    ).toBeVisible()
    await waitForHydrationToSettle(page)

    expect(hydrationMessages).toEqual([])
  })
})
