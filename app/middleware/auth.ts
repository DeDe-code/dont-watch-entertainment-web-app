import { getSafeRedirect } from '~/utils/auth-redirect'

/**
 * Route guard for authenticated-only pages (currently `/bookmarked`).
 * Anonymous visitors are redirected to the login page with a safe return path,
 * so the existing login redirect handling can send them back after signing in.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { status, bootstrap } = useAuth()
  if (status.value === 'unknown') await bootstrap()
  if (status.value !== 'authenticated') {
    return navigateTo({
      path: '/login',
      query: { redirect: getSafeRedirect(to.fullPath) }
    })
  }
})
