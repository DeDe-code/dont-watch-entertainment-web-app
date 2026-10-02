import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaItem, PaginatedMedia } from '../../shared/contracts'
import { useTvMedia } from '../../app/composables/useTvMedia'

const TV = '/api/media/tv'

interface FetchStub {
  data: Ref<PaginatedMedia | undefined>
  status: Ref<string>
  error: Ref<unknown>
  refresh: ReturnType<typeof vi.fn>
}

// The page-1 read is stubbed at the `useFetch` boundary: these tests own the
// TV Series media lifecycle, not Nuxt's fetch/SSR mechanics.
const { fetchByUrl, requestedUrls, refreshTvSeries } = vi.hoisted(() => ({
  fetchByUrl: {} as Record<string, FetchStub>,
  requestedUrls: [] as string[],
  refreshTvSeries: vi.fn()
}))

mockNuxtImport('useFetch', () => (url: string) => {
  requestedUrls.push(url)
  return fetchByUrl[url]
})

// The composable under test is captured directly from setup so the tests read
// raw refs instead of the public-instance proxy.
let tv: ReturnType<typeof useTvMedia>

const Harness = defineComponent({
  setup() {
    tv = useTvMedia()
    return {}
  },
  render: () => h('div')
})

async function mountTv() {
  await mountSuspended(Harness)
  return tv
}

function stubFetch(
  url: string,
  value: { data: PaginatedMedia | undefined; status: string; error?: unknown }
) {
  fetchByUrl[url] = {
    data: ref(value.data),
    status: ref(value.status),
    error: ref(value.error ?? null),
    refresh: refreshTvSeries
  }
}

// TV-only fixtures: the TV endpoint is never expected to return mixed media.
function item(externalId: number): MediaItem {
  return {
    externalId,
    mediaType: 'TV',
    title: `TV ${externalId}`,
    year: 2021,
    posterPath: null,
    backdropPath: null,
    overview: null,
    contentRating: null,
    isTrending: false,
    isBookmarked: false
  }
}

function page(
  pageNumber: number,
  data: MediaItem[],
  totalPages = 1,
  totalResults = data.length
): PaginatedMedia {
  return { data, meta: { page: pageNumber, totalPages, totalResults } }
}

function identities(items: MediaItem[]): number[] {
  return items.map((entry) => entry.externalId)
}

let apiFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  requestedUrls.length = 0
  refreshTvSeries.mockReset()
  stubFetch(TV, { data: undefined, status: 'pending' })

  apiFetch = vi.fn()
  const originalFetch = globalThis.$fetch
  // Only the continuation request is intercepted; anything else Nuxt fetches
  // during a mount keeps its real implementation.
  vi.stubGlobal('$fetch', (request: string, options?: unknown) =>
    request === TV
      ? apiFetch(request, options)
      : originalFetch(request as never, options as never)
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('useTvMedia', () => {
  it('reads page 1 from the TV endpoint', async () => {
    stubFetch(TV, { data: page(1, [item(1)]), status: 'success' })

    await mountTv()

    expect(requestedUrls).toEqual([TV])
  })

  it('exposes the successful page-1 items and status', async () => {
    stubFetch(TV, {
      data: page(1, [item(1), item(2)]),
      status: 'success'
    })

    const media = await mountTv()

    expect(identities(media.items.value)).toEqual([1, 2])
    expect(media.status.value).toBe('success')
    expect(media.error.value).toBeNull()
  })

  it('exposes the backend totalResults as total, not the loaded item count', async () => {
    stubFetch(TV, {
      data: page(1, [item(1), item(2)], 3, 42),
      status: 'success'
    })

    const media = await mountTv()

    expect(media.items.value).toHaveLength(2)
    expect(media.total.value).toBe(42)
  })

  it('defaults total to 0 before a successful page 1', async () => {
    stubFetch(TV, { data: undefined, status: 'pending' })

    const media = await mountTv()

    expect(media.total.value).toBe(0)
    expect(media.hasMore.value).toBe(false)
  })

  it('defaults total to 0 when page 1 fails', async () => {
    stubFetch(TV, {
      data: undefined,
      status: 'error',
      error: new Error('tv unavailable')
    })

    const media = await mountTv()

    expect(media.total.value).toBe(0)
    expect(media.hasMore.value).toBe(false)
  })

  it('reports no more pages while page 1 data is still undefined', async () => {
    stubFetch(TV, { data: undefined, status: 'success' })

    const media = await mountTv()

    expect(media.hasMore.value).toBe(false)
    await media.loadNext()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('exposes an error status when page 1 fails', async () => {
    const failure = new Error('tv unavailable')
    stubFetch(TV, { data: undefined, status: 'error', error: failure })

    const media = await mountTv()

    expect(media.status.value).toBe('error')
    expect(media.error.value).toBe(failure)
    expect(media.items.value).toEqual([])
    expect(media.hasMore.value).toBe(false)
  })

  it('retries only the page-1 read', async () => {
    stubFetch(TV, {
      data: undefined,
      status: 'error',
      error: new Error('tv unavailable')
    })

    const media = await mountTv()
    media.retryTvSeries()

    expect(refreshTvSeries).toHaveBeenCalledTimes(1)
    // The retry re-runs the page-1 read, never a continuation request.
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('appends the next page', async () => {
    stubFetch(TV, { data: page(1, [item(1)], 2), status: 'success' })
    apiFetch.mockResolvedValueOnce(page(2, [item(2)], 2))

    const media = await mountTv()
    expect(media.hasMore.value).toBe(true)

    await media.loadNext()

    expect(apiFetch).toHaveBeenCalledWith(TV, { query: { page: 2 } })
    expect(identities(media.items.value)).toEqual([1, 2])
    expect(media.isLoadingMore.value).toBe(false)
    expect(media.hasMore.value).toBe(false)
  })

  it('collapses concurrent next-page calls into one request', async () => {
    stubFetch(TV, { data: page(1, [item(1)], 2), status: 'success' })
    let release!: (value: PaginatedMedia) => void
    apiFetch.mockImplementationOnce(
      () =>
        new Promise<PaginatedMedia>((resolve) => {
          release = resolve
        })
    )

    const media = await mountTv()
    const first = media.loadNext()
    const second = media.loadNext()

    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(media.isLoadingMore.value).toBe(true)

    release(page(2, [item(2)], 2))
    await Promise.all([first, second])

    expect(identities(media.items.value)).toEqual([1, 2])
    expect(media.isLoadingMore.value).toBe(false)
  })

  it('does not request a next page when page 1 already reports a single page', async () => {
    stubFetch(TV, { data: page(1, [item(1)]), status: 'success' })

    const media = await mountTv()

    expect(media.hasMore.value).toBe(false)
    await media.loadNext()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('stops once the last page has been appended', async () => {
    stubFetch(TV, { data: page(1, [item(1)], 2), status: 'success' })
    apiFetch.mockResolvedValueOnce(page(2, [item(2)], 2))

    const media = await mountTv()
    await media.loadNext()
    await media.loadNext()

    expect(apiFetch).toHaveBeenCalledTimes(1)
  })

  it('preserves loaded items and exposes the error when a continuation fails', async () => {
    stubFetch(TV, { data: page(1, [item(1)], 2), status: 'success' })
    const failure = new Error('page 2 failed')
    apiFetch.mockRejectedValueOnce(failure)

    const media = await mountTv()
    await media.loadNext()

    expect(identities(media.items.value)).toEqual([1])
    expect(media.error.value).toBe(failure)
    expect(media.isLoadingMore.value).toBe(false)
    // Page 1 stays successful; only the continuation failed.
    expect(media.status.value).toBe('success')
    // Still retryable, but only when the caller decides to.
    expect(media.hasMore.value).toBe(true)
  })

  it('remains manually retryable after a continuation failure', async () => {
    stubFetch(TV, { data: page(1, [item(1)], 2), status: 'success' })
    apiFetch.mockRejectedValueOnce(new Error('page 2 failed'))

    const media = await mountTv()
    await media.loadNext()

    apiFetch.mockResolvedValueOnce(page(2, [item(2)], 2))
    await media.loadNext()

    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(apiFetch).toHaveBeenLastCalledWith(TV, { query: { page: 2 } })
    expect(identities(media.items.value)).toEqual([1, 2])
    expect(media.error.value).toBeNull()
    // The continuation retry reuses the next-page request, never the page-1
    // refresh, and the loaded card was never cleared.
    expect(refreshTvSeries).not.toHaveBeenCalled()
  })

  it('does not automatically retry after a continuation failure', async () => {
    stubFetch(TV, { data: page(1, [item(1)], 2), status: 'success' })
    apiFetch.mockRejectedValueOnce(new Error('page 2 failed'))

    const media = await mountTv()
    await media.loadNext()

    expect(apiFetch).toHaveBeenCalledTimes(1)

    await nextTick()
    expect(apiFetch).toHaveBeenCalledTimes(1)
  })
})
