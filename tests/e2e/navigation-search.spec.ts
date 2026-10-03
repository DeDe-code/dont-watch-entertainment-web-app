import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import movieFixture from '../fixtures/tmdb/movie.json' with { type: 'json' }

// The deterministic media the provider mock serves (see
// `tests/e2e/support/tmdb-fetch-mock.cjs`), read from the same fixture so the
// assertion stays tied to the data the mock returns.
const MEDIA_TITLE = movieFixture.title

const SEARCH_QUERY = 'earth'

// Contextual placeholder of the Home search field, used instead of a container
// selector because it is the user-facing text of the control itself.
const HOME_SEARCH_PLACEHOLDER = 'Search for movies or TV series'

/**
 * Waits until Vue has finished hydrating.
 *
 * The server-rendered markup is visible before hydration, but the navigation
 * links and the search field only become interactive once hydration completes;
 * until then a click falls back to a native page load and a value written to the
 * search field is discarded by the client's first render. Nuxt exposes
 * `isHydrating` on its app instance (the E2E server always runs in dev mode), so
 * this waits for the exact moment the client takes over instead of a fixed
 * delay.
 */
async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const win = window as unknown as {
      useNuxtApp?: () => { isHydrating?: boolean }
    }
    return (
      typeof win.useNuxtApp === 'function' &&
      win.useNuxtApp().isHydrating === false
    )
  })
}

/**
 * Deterministic navigation/search journey for FE-014 (Slice E).
 *
 * An anonymous visitor loads Home with mocked provider media, moves through the
 * primary navigation, then searches on Home: the query is committed to the URL,
 * survives a full reload, and clearing it restores normal browse state. Only
 * TMDB reads are stubbed (see `tests/e2e/support/tmdb-fetch-mock.cjs`); the
 * journey needs no session and no database.
 */
test.describe('navigation and search query', () => {
  test('navigation keeps the route in sync and search state survives a reload', async ({
    page
  }) => {
    // 1. Home renders the deterministic media served by the provider mock.
    await page.goto('/')
    await waitForHydration(page)
    await expect(page.getByRole('heading', { name: MEDIA_TITLE })).toBeVisible()

    // 2. Primary navigation: Home -> Movies -> TV Series. Section links are
    // matched exactly so the logo's "Go to home" name cannot be selected too.
    await page.getByRole('link', { name: 'Movies', exact: true }).click()

    // 3. The route matches the destination and the page renders its own heading.
    await expect(page).toHaveURL((url) => url.pathname === '/movies')
    await expect(page.getByRole('heading', { name: 'Movies' })).toBeVisible()

    await page.getByRole('link', { name: 'TV Series', exact: true }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/tv-series')
    await expect(page.getByRole('heading', { name: 'TV Series' })).toBeVisible()

    // 4. Return to a page with search support.
    await page.getByRole('link', { name: 'Home', exact: true }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/')

    // 5. Enter a deterministic query through the visible search field.
    const searchField = page.getByPlaceholder(HOME_SEARCH_PLACEHOLDER)
    await searchField.fill(SEARCH_QUERY)

    // 6. The page enters its search state.
    await expect(
      page.getByRole('region', { name: 'Search results' })
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /Found 1 result for/ })
    ).toBeVisible()

    // 7. The committed query is represented in the URL.
    await expect(page).toHaveURL(
      (url) => url.searchParams.get('q') === SEARCH_QUERY
    )

    // 8. Revisit the URL directly so server rendering has to resolve the query.
    await page.reload()
    await waitForHydration(page)

    // 9. The search field and results are restored from the URL.
    await expect(page.getByPlaceholder(HOME_SEARCH_PLACEHOLDER)).toHaveValue(
      SEARCH_QUERY
    )
    await expect(
      page.getByRole('region', { name: 'Search results' })
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: MEDIA_TITLE })).toBeVisible()

    // 10. Clear the query: the page returns to its normal browse state.
    await page.getByPlaceholder(HOME_SEARCH_PLACEHOLDER).fill('')
    await expect(page).toHaveURL((url) => !url.searchParams.has('q'))
    await expect(page.getByRole('heading', { name: 'Trending' })).toBeVisible()
    await expect(
      page.getByRole('region', { name: 'Search results' })
    ).toBeHidden()
  })
})
