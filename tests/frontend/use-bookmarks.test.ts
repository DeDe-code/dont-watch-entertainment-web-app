import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { clearNuxtState, useState } from '#app'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBookmarks } from '../../app/composables/useBookmarks'

// Auth is mocked at the composable boundary: these tests exercise bookmark
// mutation behavior, not /me bootstrapping (covered by the use-auth tests).
const { bootstrapMock, navigateToMock, auth } = vi.hoisted(() => ({
  bootstrapMock: vi.fn(),
  navigateToMock: vi.fn((to: unknown) => to),
  auth: { status: 'authenticated' as string }
}))

mockNuxtImport('useAuth', () => () => ({
  status: {
    get value() {
      return auth.status
    }
  },
  bootstrap: bootstrapMock
}))

mockNuxtImport('navigateTo', () => navigateToMock)

const Harness = defineComponent({
  setup() {
    return { bookmarks: useBookmarks() }
  },
  render: () => h('div')
})

// Two independent useBookmarks() calls in the same app, simulating separate
// components that each need bookmark state without coordinating with each other.
const TwoConsumerHarness = defineComponent({
  setup() {
    return { a: useBookmarks(), b: useBookmarks() }
  },
  render: () => h('div')
})

// Exposes the raw state map so a test can prove seeding does not store media
// content or duplicate entries per identity.
const StateHarness = defineComponent({
  setup() {
    return {
      bookmarks: useBookmarks(),
      state: useState<Record<string, boolean>>('bookmark-identities')
    }
  },
  render: () => h('div')
})

describe('useBookmarks', () => {
  beforeEach(async () => {
    await clearNuxtState()
  })

  it('returns false for an unknown identity', async () => {
    const wrapper = await mountSuspended(Harness)

    expect(
      wrapper.vm.bookmarks.isBookmarked({ mediaType: 'MOVIE', externalId: 999 })
    ).toBe(false)
    wrapper.unmount()
  })

  it('seeds a bookmarked identity as true', async () => {
    const wrapper = await mountSuspended(Harness)

    wrapper.vm.bookmarks.seed([
      { mediaType: 'MOVIE', externalId: 123, isBookmarked: true }
    ])

    expect(
      wrapper.vm.bookmarks.isBookmarked({ mediaType: 'MOVIE', externalId: 123 })
    ).toBe(true)
    wrapper.unmount()
  })

  it('seeds an unbookmarked identity as false', async () => {
    const wrapper = await mountSuspended(Harness)

    wrapper.vm.bookmarks.seed([
      { mediaType: 'MOVIE', externalId: 123, isBookmarked: false }
    ])

    expect(
      wrapper.vm.bookmarks.isBookmarked({ mediaType: 'MOVIE', externalId: 123 })
    ).toBe(false)
    wrapper.unmount()
  })

  it('keeps MOVIE and TV distinct for the same external id', async () => {
    const wrapper = await mountSuspended(Harness)

    wrapper.vm.bookmarks.seed([
      { mediaType: 'MOVIE', externalId: 123, isBookmarked: true },
      { mediaType: 'TV', externalId: 123, isBookmarked: false }
    ])

    expect(
      wrapper.vm.bookmarks.isBookmarked({ mediaType: 'MOVIE', externalId: 123 })
    ).toBe(true)
    expect(
      wrapper.vm.bookmarks.isBookmarked({ mediaType: 'TV', externalId: 123 })
    ).toBe(false)
    wrapper.unmount()
  })

  it('shares identity state across two useBookmarks() callers', async () => {
    const wrapper = await mountSuspended(TwoConsumerHarness)

    wrapper.vm.a.seed([{ mediaType: 'TV', externalId: 42, isBookmarked: true }])

    expect(wrapper.vm.b.isBookmarked({ mediaType: 'TV', externalId: 42 })).toBe(
      true
    )
    wrapper.unmount()
  })

  it('updates an identity in place without storing duplicate media state when re-seeded', async () => {
    const wrapper = await mountSuspended(StateHarness)

    wrapper.vm.bookmarks.seed([
      { mediaType: 'MOVIE', externalId: 123, isBookmarked: false }
    ])
    wrapper.vm.bookmarks.seed([
      { mediaType: 'MOVIE', externalId: 123, isBookmarked: true }
    ])

    expect(
      wrapper.vm.bookmarks.isBookmarked({ mediaType: 'MOVIE', externalId: 123 })
    ).toBe(true)
    expect(Object.keys(wrapper.vm.state)).toEqual(['MOVIE:123'])
    expect(wrapper.vm.state['MOVIE:123']).toBe(true)
    wrapper.unmount()
  })
})

type Bookmarks = ReturnType<typeof useBookmarks>

const MOVIE = { mediaType: 'MOVIE', externalId: 123 } as const
const TV = { mediaType: 'TV', externalId: 456 } as const

function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useBookmarks mutations', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    await clearNuxtState()
    bootstrapMock.mockReset()
    bootstrapMock.mockResolvedValue(undefined)
    navigateToMock.mockClear()
    auth.status = 'authenticated'
    fetchMock = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('$fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function mountBookmarks(route = '/movies') {
    return mountSuspended(Harness, { route })
  }

  function isBookmarked(
    bookmarks: Bookmarks,
    identity: typeof MOVIE | typeof TV
  ) {
    return bookmarks.isBookmarked(identity)
  }

  it('sends exactly one identity-only POST when bookmarking', async () => {
    const wrapper = await mountBookmarks()

    await wrapper.vm.bookmarks.toggle(MOVIE)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/bookmarks', {
      method: 'POST',
      body: { provider: 'TMDB', externalId: 123, mediaType: 'MOVIE' }
    })
    wrapper.unmount()
  })

  it('sends a DELETE scoped to the canonical provider identity when removing', async () => {
    const wrapper = await mountBookmarks()
    wrapper.vm.bookmarks.seed([{ ...TV, isBookmarked: true }])

    await wrapper.vm.bookmarks.toggle(TV)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/bookmarks/TMDB/456/TV', {
      method: 'DELETE'
    })
    wrapper.unmount()
  })

  it('applies optimistic state before the request resolves', async () => {
    const request = deferred()
    fetchMock.mockReturnValue(request.promise)
    const wrapper = await mountBookmarks()

    const pending = wrapper.vm.bookmarks.toggle(MOVIE)

    expect(isBookmarked(wrapper.vm.bookmarks, MOVIE)).toBe(true)
    request.resolve()
    await pending
    wrapper.unmount()
  })

  it('does not let a mid-flight seed overwrite an optimistic add', async () => {
    const request = deferred()
    fetchMock.mockReturnValue(request.promise)
    const wrapper = await mountBookmarks()

    const pending = wrapper.vm.bookmarks.toggle(MOVIE)

    // The optimistic add is visible before the response arrives.
    expect(isBookmarked(wrapper.vm.bookmarks, MOVIE)).toBe(true)

    // A stale response seeded for the same identity must not clobber it.
    wrapper.vm.bookmarks.seed([{ ...MOVIE, isBookmarked: false }])

    expect(isBookmarked(wrapper.vm.bookmarks, MOVIE)).toBe(true)

    request.resolve()
    await pending

    expect(isBookmarked(wrapper.vm.bookmarks, MOVIE)).toBe(true)
    wrapper.unmount()
  })

  it('rolls back to unbookmarked when the add request fails', async () => {
    fetchMock.mockRejectedValue(new Error('add failed'))
    const wrapper = await mountBookmarks()

    await expect(wrapper.vm.bookmarks.toggle(MOVIE)).rejects.toThrow(
      'add failed'
    )

    expect(isBookmarked(wrapper.vm.bookmarks, MOVIE)).toBe(false)
    expect(wrapper.vm.bookmarks.isPending(MOVIE)).toBe(false)
    wrapper.unmount()
  })

  it('rolls back to bookmarked when the remove request fails', async () => {
    fetchMock.mockRejectedValue(new Error('remove failed'))
    const wrapper = await mountBookmarks()
    wrapper.vm.bookmarks.seed([{ ...MOVIE, isBookmarked: true }])

    await expect(wrapper.vm.bookmarks.toggle(MOVIE)).rejects.toThrow(
      'remove failed'
    )

    expect(isBookmarked(wrapper.vm.bookmarks, MOVIE)).toBe(true)
    wrapper.unmount()
  })

  it('ignores a rapid duplicate toggle for the same identity', async () => {
    const request = deferred()
    fetchMock.mockReturnValue(request.promise)
    const wrapper = await mountBookmarks()

    const first = wrapper.vm.bookmarks.toggle(MOVIE)
    const second = wrapper.vm.bookmarks.toggle(MOVIE)

    expect(fetchMock).toHaveBeenCalledTimes(1)

    request.resolve()
    await Promise.all([first, second])
    expect(isBookmarked(wrapper.vm.bookmarks, MOVIE)).toBe(true)
    wrapper.unmount()
  })

  it('mutates different identities independently while one is pending', async () => {
    const request = deferred()
    fetchMock.mockReturnValue(request.promise)
    const wrapper = await mountBookmarks()

    const first = wrapper.vm.bookmarks.toggle(MOVIE)
    const second = wrapper.vm.bookmarks.toggle(TV)

    expect(wrapper.vm.bookmarks.isPending(MOVIE)).toBe(true)
    expect(wrapper.vm.bookmarks.isPending(TV)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    request.resolve()
    await Promise.all([first, second])
    expect(isBookmarked(wrapper.vm.bookmarks, MOVIE)).toBe(true)
    expect(isBookmarked(wrapper.vm.bookmarks, TV)).toBe(true)
    wrapper.unmount()
  })

  it('exposes pending state per identity', async () => {
    const request = deferred()
    fetchMock.mockReturnValue(request.promise)
    const wrapper = await mountBookmarks()

    const pending = wrapper.vm.bookmarks.toggle(MOVIE)

    expect(wrapper.vm.bookmarks.isPending(MOVIE)).toBe(true)
    expect(wrapper.vm.bookmarks.isPending(TV)).toBe(false)

    request.resolve()
    await pending
    expect(wrapper.vm.bookmarks.isPending(MOVIE)).toBe(false)
    wrapper.unmount()
  })

  it('shares optimistic state with another useBookmarks() caller', async () => {
    const request = deferred()
    fetchMock.mockReturnValue(request.promise)
    const wrapper = await mountSuspended(TwoConsumerHarness)

    const pending = wrapper.vm.a.toggle(MOVIE)

    expect(isBookmarked(wrapper.vm.b, MOVIE)).toBe(true)

    request.resolve()
    await pending
    wrapper.unmount()
  })

  it('redirects anonymous users to login with the safe current path and makes no API call', async () => {
    auth.status = 'anonymous'
    const wrapper = await mountBookmarks('/movies?genre=action')

    await wrapper.vm.bookmarks.toggle(MOVIE)

    expect(navigateToMock).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/movies?genre=action' }
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(isBookmarked(wrapper.vm.bookmarks, MOVIE)).toBe(false)
    wrapper.unmount()
  })

  it('bootstraps unknown auth before mutating', async () => {
    auth.status = 'unknown'
    bootstrapMock.mockImplementation(async () => {
      auth.status = 'authenticated'
    })
    const wrapper = await mountBookmarks()

    await wrapper.vm.bookmarks.toggle(MOVIE)

    expect(bootstrapMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('bootstraps unknown auth and redirects a visitor who turns out anonymous', async () => {
    auth.status = 'unknown'
    bootstrapMock.mockImplementation(async () => {
      auth.status = 'anonymous'
    })
    const wrapper = await mountBookmarks('/movies')

    await wrapper.vm.bookmarks.toggle(MOVIE)

    expect(bootstrapMock).toHaveBeenCalledTimes(1)
    expect(navigateToMock).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/movies' }
    })
    expect(fetchMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
