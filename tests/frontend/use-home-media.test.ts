import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  MediaItem,
  MediaType,
  PaginatedMedia
} from '../../shared/contracts'
import { useHomeMedia } from '../../app/composables/useHomeMedia'

const TRENDING = '/api/media/trending'
const RECOMMENDED = '/api/media/recommended'

interface FetchStub {
  data: Ref<PaginatedMedia | null>
  status: Ref<string>
  error: Ref<unknown>
  refresh: ReturnType<typeof vi.fn>
}

// The two page-1 reads are stubbed at the `useFetch` boundary: these tests own
// the Home media lifecycle, not Nuxt's fetch/SSR mechanics.
const { fetchByUrl, requestedUrls } = vi.hoisted(() => ({
  fetchByUrl: {} as Record<string, FetchStub>,
  requestedUrls: [] as string[]
}))

mockNuxtImport('useFetch', () => (url: string) => {
  requestedUrls.push(url)
  return fetchByUrl[url]
})

// The composable under test is captured directly from setup so the tests read
// raw refs instead of the public-instance proxy.
let home: ReturnType<typeof useHomeMedia>

const Harness = defineComponent({
  setup() {
    home = useHomeMedia()
    return {}
  },
  render: () => h('div')
})

async function mountHome() {
  await mountSuspended(Harness)
  return home
}

function stubFetch(
  url: string,
  value: { data: PaginatedMedia | null; status: string; error?: unknown },
  refresh: ReturnType<typeof vi.fn> = vi.fn()
) {
  fetchByUrl[url] = {
    data: ref(value.data),
    status: ref(value.status),
    error: ref(value.error ?? null),
    refresh
  }
}

function item(mediaType: MediaType, externalId: number): MediaItem {
  return {
    externalId,
    mediaType,
    title: `${mediaType} ${externalId}`,
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

function identities(items: MediaItem[]): string[] {
  return items.map((entry) => `${entry.mediaType}:${entry.externalId}`)
}

let apiFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  requestedUrls.length = 0
  stubFetch(TRENDING, { data: null, status: 'pending' })
  stubFetch(RECOMMENDED, { data: null, status: 'pending' })

  apiFetch = vi.fn()
  const originalFetch = globalThis.$fetch
  // Only the continuation request is intercepted; anything else Nuxt fetches
  // during a mount keeps its real implementation.
  vi.stubGlobal('$fetch', (request: string, options?: unknown) =>
    request === RECOMMENDED
      ? apiFetch(request, options)
      : originalFetch(request as never, options as never)
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('useHomeMedia', () => {
  it('loads Trending and Recommended page 1 independently', async () => {
    stubFetch(TRENDING, {
      data: page(1, [item('MOVIE', 1)]),
      status: 'success'
    })
    stubFetch(RECOMMENDED, {
      data: page(1, [item('TV', 2)]),
      status: 'success'
    })

    const media = await mountHome()

    expect(requestedUrls).toEqual([TRENDING, RECOMMENDED])
    expect(identities(media.trendingItems.value)).toEqual(['MOVIE:1'])
    expect(media.trendingStatus.value).toBe('success')
    expect(media.trendingError.value).toBeNull()
    expect(identities(media.recommendedItems.value)).toEqual(['TV:2'])
    expect(media.recommendedStatus.value).toBe('success')
    expect(media.recommendedError.value).toBeNull()
  })

  it('caps the visible Trending items at the first five without mutating the response', async () => {
    const trendingPage = page(
      1,
      Array.from({ length: 8 }, (_, index) => item('MOVIE', index + 1))
    )
    stubFetch(TRENDING, { data: trendingPage, status: 'success' })
    stubFetch(RECOMMENDED, { data: page(1, []), status: 'success' })

    const media = await mountHome()

    expect(identities(media.trendingItems.value)).toEqual([
      'MOVIE:1',
      'MOVIE:2',
      'MOVIE:3',
      'MOVIE:4',
      'MOVIE:5'
    ])
    expect(trendingPage.data).toHaveLength(8)
  })

  it('keeps Recommended available when Trending fails', async () => {
    const failure = new Error('trending unavailable')
    stubFetch(TRENDING, { data: null, status: 'error', error: failure })
    stubFetch(RECOMMENDED, {
      data: page(1, [item('TV', 2), item('TV', 3)]),
      status: 'success'
    })

    const media = await mountHome()

    expect(media.trendingItems.value).toEqual([])
    expect(media.trendingStatus.value).toBe('error')
    expect(media.trendingError.value).toBe(failure)
    expect(identities(media.recommendedItems.value)).toEqual(['TV:2', 'TV:3'])
    expect(media.recommendedStatus.value).toBe('success')
    expect(media.recommendedError.value).toBeNull()
  })

  it('keeps Trending available when Recommended fails', async () => {
    const failure = new Error('recommended unavailable')
    stubFetch(TRENDING, {
      data: page(1, [item('MOVIE', 1)]),
      status: 'success'
    })
    stubFetch(RECOMMENDED, { data: null, status: 'error', error: failure })

    const media = await mountHome()

    expect(identities(media.trendingItems.value)).toEqual(['MOVIE:1'])
    expect(media.trendingStatus.value).toBe('success')
    expect(media.trendingError.value).toBeNull()
    expect(media.recommendedItems.value).toEqual([])
    expect(media.recommendedStatus.value).toBe('error')
    expect(media.recommendedError.value).toBe(failure)
    expect(media.recommendedHasMore.value).toBe(false)
  })

  it('omits Recommended items that duplicate a visible Trending identity', async () => {
    stubFetch(TRENDING, {
      data: page(
        1,
        Array.from({ length: 6 }, (_, index) => item('MOVIE', index + 1))
      ),
      status: 'success'
    })
    // MOVIE:1 is visible in the rail, MOVIE:6 is the sixth item and therefore
    // not hidden, MOVIE:7 does not appear in trending at all.
    stubFetch(RECOMMENDED, {
      data: page(1, [item('MOVIE', 1), item('MOVIE', 6), item('MOVIE', 7)]),
      status: 'success'
    })

    const media = await mountHome()

    expect(identities(media.recommendedItems.value)).toEqual([
      'MOVIE:6',
      'MOVIE:7'
    ])
  })

  it('treats MOVIE:123 and TV:123 as different identities', async () => {
    stubFetch(TRENDING, {
      data: page(1, [item('MOVIE', 123)]),
      status: 'success'
    })
    stubFetch(RECOMMENDED, {
      data: page(1, [item('TV', 123), item('MOVIE', 999)]),
      status: 'success'
    })

    const media = await mountHome()

    expect(identities(media.recommendedItems.value)).toEqual([
      'TV:123',
      'MOVIE:999'
    ])
  })

  it('exposes the backend Recommended total, not the rendered item count', async () => {
    stubFetch(RECOMMENDED, {
      data: page(1, [item('TV', 1), item('TV', 2)], 3, 40),
      status: 'success'
    })

    const media = await mountHome()

    expect(media.recommendedTotal.value).toBe(40)
  })

  it('defaults the Recommended total to 0 before a successful page 1', async () => {
    stubFetch(RECOMMENDED, {
      data: null,
      status: 'error',
      error: new Error('recommended unavailable')
    })

    const media = await mountHome()

    expect(media.recommendedTotal.value).toBe(0)
  })

  it('keeps the Recommended total when Trending hides a duplicate', async () => {
    stubFetch(TRENDING, {
      data: page(1, [item('MOVIE', 1)]),
      status: 'success'
    })
    // Page 1 reports 9 results across 2 pages; MOVIE:1 is visible in the rail
    // and is therefore filtered out of the rendered list.
    stubFetch(RECOMMENDED, {
      data: page(1, [item('MOVIE', 1), item('TV', 2)], 2, 9),
      status: 'success'
    })

    const media = await mountHome()

    expect(identities(media.recommendedItems.value)).toEqual(['TV:2'])
    expect(media.recommendedTotal.value).toBe(9)
  })

  it('appends the next Recommended page', async () => {
    stubFetch(RECOMMENDED, {
      data: page(1, [item('TV', 1)], 2),
      status: 'success'
    })
    apiFetch.mockResolvedValueOnce(page(2, [item('TV', 2)], 2))

    const media = await mountHome()
    expect(media.recommendedHasMore.value).toBe(true)

    await media.loadRecommendedNext()

    expect(apiFetch).toHaveBeenCalledWith(RECOMMENDED, {
      query: { page: 2 }
    })
    expect(identities(media.recommendedItems.value)).toEqual(['TV:1', 'TV:2'])
    expect(media.recommendedLoadingMore.value).toBe(false)
    expect(media.recommendedHasMore.value).toBe(false)
  })

  it('collapses concurrent next-page calls into one request', async () => {
    stubFetch(RECOMMENDED, {
      data: page(1, [item('TV', 1)], 2),
      status: 'success'
    })
    let release!: (value: PaginatedMedia) => void
    apiFetch.mockImplementationOnce(
      () =>
        new Promise<PaginatedMedia>((resolve) => {
          release = resolve
        })
    )

    const media = await mountHome()
    const first = media.loadRecommendedNext()
    const second = media.loadRecommendedNext()

    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(media.recommendedLoadingMore.value).toBe(true)

    release(page(2, [item('TV', 2)], 2))
    await Promise.all([first, second])

    expect(identities(media.recommendedItems.value)).toEqual(['TV:1', 'TV:2'])
    expect(media.recommendedLoadingMore.value).toBe(false)
  })

  it('does not request a next page when page 1 already reports a single page', async () => {
    stubFetch(RECOMMENDED, {
      data: page(1, [item('TV', 1)]),
      status: 'success'
    })

    const media = await mountHome()

    expect(media.recommendedHasMore.value).toBe(false)
    await media.loadRecommendedNext()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('stops once the last page has been appended', async () => {
    stubFetch(RECOMMENDED, {
      data: page(1, [item('TV', 1)], 2),
      status: 'success'
    })
    apiFetch.mockResolvedValueOnce(page(2, [item('TV', 2)], 2))

    const media = await mountHome()
    await media.loadRecommendedNext()
    await media.loadRecommendedNext()

    expect(apiFetch).toHaveBeenCalledTimes(1)
  })

  it('preserves loaded items and exposes the error when a continuation fails', async () => {
    stubFetch(RECOMMENDED, {
      data: page(1, [item('TV', 1)], 2),
      status: 'success'
    })
    const failure = new Error('page 2 failed')
    apiFetch.mockRejectedValueOnce(failure)

    const media = await mountHome()
    await media.loadRecommendedNext()

    expect(identities(media.recommendedItems.value)).toEqual(['TV:1'])
    expect(media.recommendedError.value).toBe(failure)
    expect(media.recommendedLoadingMore.value).toBe(false)
    // Still retryable, but only when the caller decides to: no automatic retry.
    expect(media.recommendedHasMore.value).toBe(true)
    expect(media.recommendedStatus.value).toBe('success')
    expect(apiFetch).toHaveBeenCalledTimes(1)

    await nextTick()
    expect(apiFetch).toHaveBeenCalledTimes(1)
  })

  it('retries only the failed Trending read', async () => {
    const trendingRefresh = vi.fn()
    const recommendedRefresh = vi.fn()
    stubFetch(
      TRENDING,
      {
        data: null,
        status: 'error',
        error: new Error('trending unavailable')
      },
      trendingRefresh
    )
    stubFetch(
      RECOMMENDED,
      { data: page(1, [item('TV', 2)]), status: 'success' },
      recommendedRefresh
    )

    const media = await mountHome()
    await media.retryTrending()

    expect(trendingRefresh).toHaveBeenCalledTimes(1)
    expect(recommendedRefresh).not.toHaveBeenCalled()
    // The healthy section is untouched by the other section's retry.
    expect(identities(media.recommendedItems.value)).toEqual(['TV:2'])
    expect(media.recommendedStatus.value).toBe('success')
    expect(media.recommendedError.value).toBeNull()
  })

  it('retries only the failed Recommended read', async () => {
    const trendingRefresh = vi.fn()
    const recommendedRefresh = vi.fn()
    stubFetch(
      TRENDING,
      { data: page(1, [item('MOVIE', 1)]), status: 'success' },
      trendingRefresh
    )
    stubFetch(
      RECOMMENDED,
      {
        data: null,
        status: 'error',
        error: new Error('recommended unavailable')
      },
      recommendedRefresh
    )

    const media = await mountHome()
    await media.retryRecommended()

    expect(recommendedRefresh).toHaveBeenCalledTimes(1)
    expect(trendingRefresh).not.toHaveBeenCalled()
    expect(identities(media.trendingItems.value)).toEqual(['MOVIE:1'])
    expect(media.trendingStatus.value).toBe('success')
    expect(media.trendingError.value).toBeNull()
  })
})
