import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { clearNuxtState } from '#app'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SafeUser } from '../../shared/contracts'
import LoginPage from '../../app/pages/login/index.vue'
import SignupPage from '../../app/pages/signup/index.vue'

const { requestFetch } = vi.hoisted(() => ({ requestFetch: vi.fn() }))

mockNuxtImport('useRequestFetch', () => () => requestFetch)

const user: SafeUser = {
  id: 'user-1',
  email: 'person@example.test',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z')
}
const validPassword = 'Good-Password1!'
let apiFetch: ReturnType<typeof vi.fn>

function apiFetchStub() {
  const nuxtFetch = globalThis.$fetch
  apiFetch = vi.fn().mockRejectedValue(new Error('Unexpected auth API call'))
  vi.stubGlobal(
    '$fetch',
    (request: string, options?: Record<string, unknown>) => {
      if (request.startsWith('/api/auth/')) return apiFetch(request, options)
      return nuxtFetch(request, options)
    }
  )
}

async function mountAnonymousPage(
  page: typeof LoginPage | typeof SignupPage,
  route: string
) {
  requestFetch.mockRejectedValue({ statusCode: 401 })
  return mountSuspended(page, { route })
}

async function fillLogin(
  wrapper: Awaited<ReturnType<typeof mountAnonymousPage>>
) {
  await wrapper.get('#email').setValue(user.email)
  await wrapper.get('#password').setValue(validPassword)
}

async function fillSignup(
  wrapper: Awaited<ReturnType<typeof mountAnonymousPage>>,
  confirmation = validPassword
) {
  await wrapper.get('#signup-email').setValue(user.email)
  await wrapper.get('#signup-password').setValue(validPassword)
  await wrapper.get('#password-confirmation').setValue(confirmation)
}

function currentPath(wrapper: Awaited<ReturnType<typeof mountAnonymousPage>>) {
  return wrapper.vm.$router.currentRoute.value.fullPath
}

describe('Login page', () => {
  beforeEach(async () => {
    await clearNuxtState()
    requestFetch.mockReset()
    apiFetchStub()
  })

  afterEach(() => vi.unstubAllGlobals())

  it('prevents submission when input is invalid', async () => {
    const wrapper = await mountAnonymousPage(LoginPage, '/login')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.get('#email').attributes('aria-invalid')).toBe('true')
    expect(apiFetch).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows a generic error for invalid credentials', async () => {
    apiFetch.mockRejectedValue({ statusCode: 401 })
    const wrapper = await mountAnonymousPage(LoginPage, '/login')
    await fillLogin(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Email or password is incorrect.'
    )
    wrapper.unmount()
  })

  it('prevents duplicate submission while login is pending', async () => {
    let resolveLogin!: (value: SafeUser) => void
    apiFetch.mockReturnValue(
      new Promise<SafeUser>((resolve) => {
        resolveLogin = resolve
      })
    )
    const wrapper = await mountAnonymousPage(LoginPage, '/login')
    await fillLogin(wrapper)
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')

    expect(apiFetch).toHaveBeenCalledTimes(1)
    resolveLogin(user)
    await flushPromises()
    wrapper.unmount()
  })

  it('redirects to a safe internal path after login', async () => {
    apiFetch.mockResolvedValue(user)
    const wrapper = await mountAnonymousPage(
      LoginPage,
      '/login?redirect=%2Fmovies%3Fgenre%3Ddrama'
    )
    const replace = vi.spyOn(wrapper.vm.$router, 'replace')
    await fillLogin(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith('/movies?genre=drama')
    wrapper.unmount()
  })

  it('redirects authenticated visitors away from the page', async () => {
    requestFetch.mockResolvedValue(user)
    const wrapper = await mountSuspended(LoginPage, {
      route: '/login?redirect=%2Fmovies'
    })

    expect(currentPath(wrapper)).toBe('/')
    wrapper.unmount()
  })

  it('preserves redirect intent in the Signup link', async () => {
    const wrapper = await mountAnonymousPage(
      LoginPage,
      '/login?redirect=%2Fmovies%3Fgenre%3Ddrama'
    )
    const link = wrapper.get('.auth-switch a')

    expect(
      new URL(link.attributes('href')!, 'http://localhost').searchParams.get(
        'redirect'
      )
    ).toBe('/movies?genre=drama')
    expect(link.text()).toBe('Sign Up')
    wrapper.unmount()
  })
})

describe('Signup page', () => {
  beforeEach(async () => {
    await clearNuxtState()
    requestFetch.mockReset()
    apiFetchStub()
  })

  afterEach(() => vi.unstubAllGlobals())

  it('prevents submission when passwords do not match', async () => {
    const wrapper = await mountAnonymousPage(SignupPage, '/signup')
    await fillSignup(wrapper, 'Different-Password1!')
    await wrapper.get('form').trigger('submit')

    expect(
      wrapper.get('#password-confirmation').attributes('aria-invalid')
    ).toBe('true')
    expect(wrapper.get('#password-confirmation-error').text()).toBe(
      'Passwords do not match'
    )
    expect(apiFetch).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows an account conflict error', async () => {
    apiFetch.mockRejectedValue({ data: { code: 'CONFLICT' } })
    const wrapper = await mountAnonymousPage(SignupPage, '/signup')
    await fillSignup(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe(
      'An account with this email already exists.'
    )
    wrapper.unmount()
  })

  it('prevents duplicate submission while signup is pending', async () => {
    let resolveSignup!: (value: SafeUser) => void
    apiFetch.mockReturnValue(
      new Promise<SafeUser>((resolve) => {
        resolveSignup = resolve
      })
    )
    const wrapper = await mountAnonymousPage(SignupPage, '/signup')
    await fillSignup(wrapper)
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')

    expect(apiFetch).toHaveBeenCalledTimes(1)
    resolveSignup(user)
    await flushPromises()
    wrapper.unmount()
  })

  it('redirects to a safe internal path after signup', async () => {
    apiFetch.mockResolvedValue(user)
    const wrapper = await mountAnonymousPage(
      SignupPage,
      '/signup?redirect=%2Ftv-series%3Fsort%3Dpopular'
    )
    const replace = vi.spyOn(wrapper.vm.$router, 'replace')
    await fillSignup(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith('/tv-series?sort=popular')
    wrapper.unmount()
  })

  it('redirects authenticated visitors away from the page', async () => {
    requestFetch.mockResolvedValue(user)
    const wrapper = await mountSuspended(SignupPage, {
      route: '/signup?redirect=%2Fmovies'
    })

    expect(currentPath(wrapper)).toBe('/')
    wrapper.unmount()
  })

  it('preserves redirect intent in the Login link', async () => {
    const wrapper = await mountAnonymousPage(
      SignupPage,
      '/signup?redirect=%2Ftv-series%3Fsort%3Dpopular'
    )
    const link = wrapper.get('.auth-switch a')

    expect(
      new URL(link.attributes('href')!, 'http://localhost').searchParams.get(
        'redirect'
      )
    ).toBe('/tv-series?sort=popular')
    expect(link.text()).toBe('Login')
    wrapper.unmount()
  })
})
