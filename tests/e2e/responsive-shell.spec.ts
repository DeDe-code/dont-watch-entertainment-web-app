import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import movieFixture from '../fixtures/tmdb/movie.json' with { type: 'json' }

// Deterministic media served by the provider mock (see
// `tests/e2e/support/tmdb-fetch-mock.cjs`), read from the same fixture so the
// assertion stays tied to the data the mock actually returns.
const MEDIA_TITLE = movieFixture.title

// Contextual placeholders of the Home and Movies search fields. Using the
// user-facing copy of the control itself avoids a container selector.
const HOME_SEARCH_PLACEHOLDER = 'Search for movies or TV series'
const MOVIES_SEARCH_PLACEHOLDER = 'Search for movies'

// Primary navigation destinations, matched by accessible name.
const NAV_DESTINATIONS = ['Home', 'Movies', 'TV Series', 'Bookmarked']

// FE-014 release widths with practical device heights. The shell is expected to
// stay fluid between them; these are the reference widths the responsive CSS is
// written for, not the only widths that work.
const VIEWPORTS = [
  { name: 'mobile 375', width: 375, height: 812 },
  { name: 'tablet 768', width: 768, height: 1024 },
  { name: 'desktop 1440', width: 1440, height: 900 }
] as const

/**
 * Waits until Vue has finished hydrating.
 *
 * The server-rendered shell is visible before hydration, but navigation clicks
 * only stay client-side once Vue owns the page; until then a click falls back
 * to a native page load. Nuxt exposes `isHydrating` on its app instance (the
 * E2E server always runs in dev mode), so this waits for the exact moment the
 * client takes over instead of a fixed delay.
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
 * Asserts the app shell's navigation does not overlap the main content.
 *
 * The shell deliberately changes shape — a top bar on mobile/tablet and a left
 * sidebar on desktop — but in every shape the navigation and the content must
 * occupy separate regions: a bar covering the first rows of content, or a
 * sidebar overlapping the grid, would make the page unusable even though each
 * element still passes a visibility check. Two axis-aligned rectangles are
 * disjoint when separated on either axis, which is the only geometry this
 * asserts; exact positions, sizes, and gaps stay with the visual layer.
 */
async function expectNavigationClearsContent(page: Page) {
  const nav = await page.getByRole('banner').boundingBox()
  const main = await page.getByRole('main').boundingBox()
  expect(nav, 'navigation bar has a layout box').not.toBeNull()
  expect(main, 'main content has a layout box').not.toBeNull()

  const [navBox, mainBox] = [nav!, main!]
  const disjoint =
    navBox.x + navBox.width <= mainBox.x ||
    mainBox.x + mainBox.width <= navBox.x ||
    navBox.y + navBox.height <= mainBox.y ||
    mainBox.y + mainBox.height <= navBox.y

  expect(disjoint, 'navigation and main content do not overlap').toBe(true)
}

/**
 * Responsive application-shell coverage for FE-014 (Slice F).
 *
 * For each release width an anonymous visitor loads Home with deterministic
 * mocked media, uses the primary navigation, and reaches Movies. The slice
 * verifies structural responsiveness and usability only — the shell's shape,
 * the navigation's presence, and that content stays visible and uncovered. It
 * asserts no exact spacing, positioning, or Figma fidelity, so it stays valid
 * as the visual layer changes. Only TMDB reads are stubbed; the flow needs no
 * session and no database.
 */
for (const viewport of VIEWPORTS) {
  test.describe(`responsive application shell at ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('navigation and Home content stay usable, and Movies renders', async ({
      page
    }) => {
      // 1. Home renders the deterministic media served by the provider mock.
      await page.goto('/')
      await waitForHydration(page)

      // 2. The primary navigation is present and exposes every destination.
      const nav = page.getByRole('navigation', { name: 'Main navigation' })
      await expect(nav).toBeVisible()
      for (const label of NAV_DESTINATIONS) {
        await expect(
          nav.getByRole('link', { name: label, exact: true })
        ).toBeVisible()
      }

      // 3. Home's search and content stay on screen at this width.
      const homeSearch = page.getByPlaceholder(HOME_SEARCH_PLACEHOLDER)
      await expect(homeSearch).toBeVisible()
      await expect(homeSearch).toBeInViewport()
      await expect(
        page.getByRole('heading', { name: MEDIA_TITLE })
      ).toBeVisible()

      // 4. The shell's navigation does not cover the content.
      await expectNavigationClearsContent(page)

      // 5. A navigation destination renders its own page and search context.
      await nav.getByRole('link', { name: 'Movies', exact: true }).click()
      await expect(page).toHaveURL((url) => url.pathname === '/movies')
      await expect(page.getByRole('heading', { name: 'Movies' })).toBeVisible()
      await expect(
        page.getByPlaceholder(MOVIES_SEARCH_PLACEHOLDER)
      ).toBeVisible()
      await expectNavigationClearsContent(page)

      // 6. Return Home so every width ends on the shell it started from.
      await page
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('link', { name: 'Home', exact: true })
        .click()
      await expect(page).toHaveURL((url) => url.pathname === '/')
      await expect(page.getByPlaceholder(HOME_SEARCH_PLACEHOLDER)).toBeVisible()
    })
  })
}
