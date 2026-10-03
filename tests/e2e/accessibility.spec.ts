import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import movieFixture from '../fixtures/tmdb/movie.json' with { type: 'json' }

// These checks drive the shared dev server, and each one loads a full page and
// (twice) runs a browser-wide accessibility scan. Running them concurrently
// starves the dev server's on-demand compilation, so the group runs serially in
// one worker; this constrains execution only within this file.
test.describe.configure({ mode: 'serial' })

// The deterministic media the provider mock serves (see
// `tests/e2e/support/tmdb-fetch-mock.cjs`), read from the same fixture so the
// assertions stay tied to the data the mock returns.
const MEDIA_TITLE = movieFixture.title

const SEARCH_QUERY = 'earth'

// Contextual copy of the controls themselves, used instead of container
// selectors so the assertions describe what the user actually perceives.
const HOME_SEARCH_PLACEHOLDER = 'Search for movies or TV series'
const ACCOUNT_TRIGGER = '[aria-label="Account menu"]'

/**
 * Waits until Vue has finished hydrating.
 *
 * The server-rendered markup is accessible before hydration, but focus
 * behaviour, menu toggling, and client-side validation only exist once the
 * client owns the page; interacting earlier would test native browser
 * fallbacks instead of the application. Nuxt exposes `isHydrating` on its app
 * instance (the E2E server always runs in dev mode), so this waits for the
 * exact moment instead of a fixed delay.
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
 * Tabs until the active element matches `selector`, without depending on a
 * fixed tab order.
 *
 * The document outline is allowed to change as the UI evolves, so the journey
 * asserts that a control is reachable by keyboard, not that it sits at a
 * specific position in the tab sequence.
 */
async function tabTo(page: Page, selector: string, maxPresses = 25) {
  for (let press = 0; press < maxPresses; press++) {
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(
      (target) => document.activeElement?.matches(target) ?? false,
      selector
    )
    if (focused) return
  }
  throw new Error(`Keyboard focus never reached "${selector}"`)
}

interface FocusState {
  tag: string
  outlined: boolean
  focusVisible: boolean
}

/** Reads the focus-visible presentation of the currently focused element. */
function readFocusState(page: Page): Promise<FocusState | null> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null
    if (!element) return null
    const style = getComputedStyle(element)
    return {
      tag: element.tagName.toLowerCase(),
      outlined: style.outlineStyle !== 'none' && style.outlineWidth !== '0px',
      focusVisible: element.matches(':focus-visible')
    }
  })
}

/**
 * A keyboard focus indication must be both present and visible.
 *
 * `:focus-visible` is asserted rather than an exact CSS value so the visual
 * layer stays free to restyle the ring; the outline check only proves the
 * focused control is actually drawn differently, which is what a sighted
 * keyboard user depends on.
 */
async function expectVisibleFocus(page: Page) {
  const state = await readFocusState(page)
  expect(state, 'an element is focused').not.toBeNull()
  expect(state!.focusVisible, 'focused element matches :focus-visible').toBe(
    true
  )
  expect(
    state!.outlined,
    `focused <${state!.tag}> has a visible focus outline`
  ).toBe(true)
}

/** A stable, human-readable identifier for the currently focused element. */
function activeIdentifier(page: Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null
    if (!element) return 'none'
    const name =
      element.getAttribute('aria-label') ??
      element.id ??
      element.textContent?.trim().slice(0, 30) ??
      ''
    return `${element.tagName.toLowerCase()}:${name}`
  })
}

/** Formats axe violations so a failure names the rule, impact, and location. */
function describeViolations(
  violations: Array<{ id: string; impact?: string | null; help: string }>
) {
  return violations
    .map(
      (violation) =>
        `${violation.id} [${violation.impact ?? 'unknown'}] — ${violation.help}`
    )
    .join('\n')
}

test.describe('accessibility', () => {
  test('keyboard journey: navigation, visible focus, account menu, and no focus trap', async ({
    page
  }) => {
    await page.goto('/')
    await waitForHydration(page)

    // 1. Initial focus enters the application: the first Tab reaches the skip
    // link, which is revealed on focus.
    await page.keyboard.press('Tab')
    const skipLink = page.getByRole('link', { name: 'Skip to main content' })
    await expect(skipLink).toBeFocused()
    await expect(skipLink).toBeInViewport()
    await expectVisibleFocus(page)

    // 2. Tab advances to the next interactive control with visible focus.
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Go to home' })).toBeFocused()
    await expectVisibleFocus(page)

    // 3. Primary navigation is reachable and activatable with the keyboard.
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await tabTo(page, 'a[aria-label="Movies"]')
    await expect(
      nav.getByRole('link', { name: 'Movies', exact: true })
    ).toBeFocused()
    await expectVisibleFocus(page)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL((url) => url.pathname === '/movies')
    await expect(page.getByRole('heading', { name: 'Movies' })).toBeVisible()

    // 4. Back on Home, the account disclosure opens from its trigger.
    await page.goto('/')
    await waitForHydration(page)
    await tabTo(page, ACCOUNT_TRIGGER)
    const trigger = page.getByRole('button', { name: 'Account menu' })
    await expect(trigger).toBeFocused()
    await expectVisibleFocus(page)
    await page.keyboard.press('Enter')
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#account-menu')).toBeVisible()

    // 5. Escape closes the menu and returns focus to the trigger.
    await page.keyboard.press('Escape')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#account-menu')).toBeHidden()
    await expect(trigger).toBeFocused()

    // 6. Focus is not trapped: repeated Tab presses reach distinct controls and
    // eventually leave the account disclosure for the main content.
    const stops = new Set<string>()
    for (let press = 0; press < 12; press++) {
      await page.keyboard.press('Tab')
      stops.add(await activeIdentifier(page))
    }
    expect(stops.size, 'Tab reaches several distinct controls').toBeGreaterThan(
      3
    )
    const stillInAccount = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('.app-account'))
    )
    expect(stillInAccount, 'focus left the account disclosure').toBe(false)
  })

  test('authentication validation errors are associated with their inputs', async ({
    page
  }) => {
    await page.goto('/login')
    await waitForHydration(page)

    // Submitting empty fields triggers client-side schema validation only: no
    // credentials are sent and no database is involved.
    await page.getByRole('button', { name: 'Login to your account' }).click()

    const email = page.getByLabel('Email address')
    await expect(email).toHaveAttribute('aria-invalid', 'true')

    // The input points at the message element, and that element contains the
    // visible error text, so assistive technology reads the reason with the
    // control it belongs to.
    const describedBy = await email.getAttribute('aria-describedby')
    expect(describedBy, 'email is described by its error').toBe('email-error')
    const emailError = page.locator('#email-error')
    await expect(emailError).toBeVisible()
    await expect(emailError).not.toBeEmpty()

    const password = page.getByLabel('Password')
    await expect(password).toHaveAttribute('aria-invalid', 'true')
    await expect(password).toHaveAttribute('aria-describedby', 'password-error')
    const passwordError = page.locator('#password-error')
    await expect(passwordError).toBeVisible()
    await expect(passwordError).not.toBeEmpty()
  })

  test('bookmark controls expose a meaningful accessible name', async ({
    page
  }) => {
    await page.goto('/')
    await waitForHydration(page)
    await expect(page.getByRole('heading', { name: MEDIA_TITLE })).toBeVisible()

    // The deterministic media is unbookmarked and anonymous, so only the
    // intended label is inspected; the persistence flow is covered elsewhere.
    const bookmark = page
      .getByRole('button', { name: `Add bookmark for ${MEDIA_TITLE}` })
      .first()
    await expect(bookmark).toBeVisible()
    await expect(bookmark).toHaveAttribute('aria-pressed', 'false')
  })

  test('search results and status are exposed accessibly', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)

    await page.getByPlaceholder(HOME_SEARCH_PLACEHOLDER).fill(SEARCH_QUERY)

    // The result set is a labelled region and the committed count is a
    // discoverable heading, giving both a name and a state to navigate by.
    const results = page.getByRole('region', { name: 'Search results' })
    await expect(results).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /Found 1 result for/ })
    ).toBeVisible()

    // Continuation state is announced through the existing live region owned by
    // the progressive sentinel.
    const status = results.getByRole('status')
    await expect(status).toHaveText(/result/i)
  })

  test('main landmarks and headings are discoverable', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)

    // Home: banner and primary navigation landmarks wrap a single main
    // landmark, and the section headings are discoverable by role.
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' })
    ).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Trending' })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Recommended for you' })
    ).toBeVisible()

    // The auth route exposes a single main landmark and a page-level heading.
    await page.goto('/login')
    await waitForHydration(page)
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Login')
  })

  test('has no serious or critical automated accessibility violations', async ({
    page
  }) => {
    await page.goto('/')
    await waitForHydration(page)
    await expect(page.getByRole('heading', { name: MEDIA_TITLE })).toBeVisible()

    // `nuxt-devtools-frame` is Nuxt's development-only overlay injected by the
    // dev server, not application UI, so it is excluded from the scan.
    const homeResults = await new AxeBuilder({ page })
      .exclude('nuxt-devtools-frame')
      .analyze()
    const homeBlocking = homeResults.violations.filter(
      (violation) =>
        violation.impact === 'serious' || violation.impact === 'critical'
    )
    expect(
      homeBlocking,
      `Serious/critical axe violations on Home:\n${describeViolations(homeBlocking)}`
    ).toEqual([])

    await page.goto('/login')
    await waitForHydration(page)

    const loginResults = await new AxeBuilder({ page })
      .exclude('nuxt-devtools-frame')
      .analyze()
    const loginBlocking = loginResults.violations.filter(
      (violation) =>
        violation.impact === 'serious' || violation.impact === 'critical'
    )
    expect(
      loginBlocking,
      `Serious/critical axe violations on Login:\n${describeViolations(loginBlocking)}`
    ).toEqual([])
  })
})
