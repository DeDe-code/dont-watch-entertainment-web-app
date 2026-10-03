import { expect, test } from '@playwright/test'

/**
 * Anonymous authentication/navigation flow for FE-014 (Slice B).
 *
 * Everything here runs without an authenticated user, a database row, or a
 * TMDB call: an anonymous browser has no session cookie, so `/api/auth/me`
 * resolves to 401 and the auth pages render deterministically.
 */
test.describe('anonymous auth navigation', () => {
  test('login page renders for an anonymous visitor', async ({ page }) => {
    await page.goto('/login')

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
    await expect(page.getByLabel('Email address')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
  })

  test('login page navigates to sign up', async ({ page }) => {
    await page.goto('/login')

    await page.getByRole('link', { name: 'Sign Up' }).click()

    await expect(page).toHaveURL(/\/signup$/)
    await expect(page.getByRole('heading', { name: 'Sign Up' })).toBeVisible()
  })

  test('sign up page navigates back to login', async ({ page }) => {
    await page.goto('/signup')

    await page.getByRole('link', { name: 'Login' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  })

  test('anonymous visitor is redirected from /bookmarked to login', async ({
    page
  }) => {
    await page.goto('/bookmarked')

    await expect(page).toHaveURL(/\/login\?/)
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  })

  test('bookmarked redirect destination is preserved in the login URL', async ({
    page
  }) => {
    await page.goto('/bookmarked')

    await expect(page).toHaveURL(/\/login\?/)
    expect(new URL(page.url()).searchParams.get('redirect')).toBe('/bookmarked')
  })
})
