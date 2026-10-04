import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { clearNuxtState } from '#app'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SafeUser } from '../../shared/contracts'
import { useAuth } from '../../app/composables/useAuth'

const { requestFetch, apiFetch } = vi.hoisted(() => ({
  requestFetch: vi.fn(),
  apiFetch: vi.fn()
}))

mockNuxtImport('useRequestFetch', () => () => requestFetch)

// `$fetch` is an auto-import in Nuxt 4.5, not a global, so auth requests are
// intercepted at the auto-import boundary. Anything else Nuxt fetches during a
// mount keeps the real implementation.
mockNuxtImport(
  '$fetch',
  (original: typeof globalThis.$fetch) =>
    (request: string, options?: unknown) =>
      request.startsWith('/api/auth/')
        ? apiFetch(request, options)
        : original(request as never, options as never)
)

const Harness = defineComponent({
  setup() {
    return { auth: useAuth() }
  },
  render: () => h('div')
})

// Two independent useAuth() calls in the same app, simulating separate
// components that each need auth state without coordinating with each other.
const TwoConsumerHarness = defineComponent({
  setup() {
    return { authA: useAuth(), authB: useAuth() }
  },
  render: () => h('div')
})

const user: SafeUser = {
  id: 'user-1',
  email: 'person@example.test',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z')
}
async function mountAuth() {
  return mountSuspended(Harness)
}

describe('useAuth', () => {
  beforeEach(async () => {
    await clearNuxtState()
    requestFetch.mockReset()
    requestFetch.mockResolvedValue(user)
    apiFetch.mockReset()
  })

  it('sets authenticated state when /me succeeds', async () => {
    const wrapper = await mountAuth()
    await wrapper.vm.auth.bootstrap()

    expect(wrapper.vm.auth.status.value).toBe('authenticated')
    expect(wrapper.vm.auth.user.value).toEqual(user)
    expect(requestFetch).toHaveBeenCalledWith('/api/auth/me')
    wrapper.unmount()
  })

  it('treats a /me 401 as anonymous', async () => {
    requestFetch.mockRejectedValue({ statusCode: 401 })
    const wrapper = await mountAuth()
    await wrapper.vm.auth.bootstrap()

    expect(wrapper.vm.auth.status.value).toBe('anonymous')
    expect(wrapper.vm.auth.user.value).toBeNull()
    wrapper.unmount()
  })

  it('keeps unexpected /me failures retryable', async () => {
    requestFetch.mockRejectedValueOnce(new Error('temporary failure'))
    const wrapper = await mountAuth()

    await expect(wrapper.vm.auth.bootstrap()).rejects.toThrow(
      'temporary failure'
    )
    await wrapper.vm.auth.bootstrap()

    expect(requestFetch).toHaveBeenCalledTimes(2)
    expect(wrapper.vm.auth.status.value).toBe('authenticated')
    wrapper.unmount()
  })

  it('deduplicates concurrent bootstrap calls across independent useAuth() consumers', async () => {
    let resolveRequest!: (value: SafeUser) => void
    requestFetch.mockReturnValue(
      new Promise<SafeUser>((resolve) => {
        resolveRequest = resolve
      })
    )
    const wrapper = await mountSuspended(TwoConsumerHarness)

    const first = wrapper.vm.authA.bootstrap()
    const second = wrapper.vm.authB.bootstrap()
    expect(requestFetch).toHaveBeenCalledTimes(1)

    resolveRequest(user)
    await Promise.all([first, second])
    expect(wrapper.vm.authA.status.value).toBe('authenticated')
    expect(wrapper.vm.authB.status.value).toBe('authenticated')
    wrapper.unmount()
  })

  it('updates state after login and signup', async () => {
    apiFetch.mockResolvedValue(user)
    const wrapper = await mountAuth()

    await wrapper.vm.auth.login({ email: user.email, password: 'Password-1!' })
    expect(wrapper.vm.auth.status.value).toBe('authenticated')
    expect(wrapper.vm.auth.user.value).toEqual(user)

    await wrapper.vm.auth.signup({
      email: user.email,
      password: 'Password-1!',
      passwordConfirmation: 'Password-1!'
    })
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/auth/signup', {
      method: 'POST',
      body: {
        email: user.email,
        password: 'Password-1!',
        passwordConfirmation: 'Password-1!'
      }
    })
    wrapper.unmount()
  })

  it('clears state after logout', async () => {
    apiFetch.mockResolvedValueOnce(user).mockResolvedValueOnce(undefined)
    const wrapper = await mountAuth()
    await wrapper.vm.auth.login({ email: user.email, password: 'Password-1!' })
    await wrapper.vm.auth.logout()

    expect(apiFetch).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST'
    })
    expect(wrapper.vm.auth.status.value).toBe('anonymous')
    expect(wrapper.vm.auth.user.value).toBeNull()
    wrapper.unmount()
  })

  it('uses request-aware fetching for SSR /me bootstrap', async () => {
    const wrapper = await mountAuth()
    await wrapper.vm.auth.bootstrap()

    expect(requestFetch).toHaveBeenCalledWith('/api/auth/me')
    wrapper.unmount()
  })
})
