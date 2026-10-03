import { expect, test } from '@playwright/test'

/**
 * Minimal browser smoke test for the E2E foundation.
 *
 * It deliberately exercises a public route whose anonymous rendering needs no
 * database row, no TMDB call, and no signed-in user: an anonymous visitor has
 * no session cookie, so `/api/auth/me` resolves to 401 without touching the
 * database and the login form renders as a stable, deterministic page.
 */
test('login page renders for an anonymous visitor', async ({ page }) => {
  await page.goto('/login')

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  await expect(page.getByLabel('Email address')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
})
