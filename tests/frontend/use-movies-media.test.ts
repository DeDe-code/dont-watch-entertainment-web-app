import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  MediaItem,
  MediaType,
  PaginatedMedia
} from '../../shared/contracts'
import { useMoviesMedia } from '../../app/composables/useMoviesMedia'

const MOVIES = '/api/media/movies'

interface FetchStub {
  data: Ref<PaginatedMedia | undefined>
  status: Ref<string>
  error: Ref<unknown>
}

// The page-1 read is stubbed at the `useFetch` boundary: these tests own the
// Movies media lifecycle, not Nuxt's fetch/SSR mechanics.
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
let movies: ReturnType<typeof useMoviesMedia>

const Harness = defineComponent({
  setup() {
    movies = useMoviesMedia()
    return {}
  },
  render: () => h('div')
})

async function mountMovies() {
  await mountSuspended(Harness)
  return movies
}

function stubFetch(
  url: string,
  value: { data: PaginatedMedia | undefined; status: string; error?: unknown }
) {
  fetchByUrl[url] = {
    data: ref(value.data),
    status: ref(value.status),
    error: ref(value.error ?? null)
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
  stubFetch(MOVIES, { data: undefined, status: 'pending' })

  apiFetch = vi.fn()
  const originalFetch = globalThis.$fetch
  // Only the continuation request is intercepted; anything else Nuxt fetches
  // during a mount keeps its real implementation.
  vi.stubGlobal('$fetch', (request: string, options?: unknown) =>
    request === MOVIES
      ? apiFetch(request, options)
      : originalFetch(request as never, options as never)
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('useMoviesMedia', () => {
  it('reads page 1 from the Movies endpoint', async () => {
    stubFetch(MOVIES, {
      data: page(1, [item('MOVIE', 1)]),
      status: 'success'
    })

    await mountMovies()

    expect(requestedUrls).toEqual([MOVIES])
  })

  it('exposes the successful page-1 items and status', async () => {
    stubFetch(MOVIES, {
      data: page(1, [item('MOVIE', 1), item('MOVIE', 2)]),
      status: 'success'
    })

    const media = await mountMovies()

    expect(identities(media.items.value)).toEqual(['MOVIE:1', 'MOVIE:2'])
    expect(media.status.value).toBe('success')
    expect(media.error.value).toBeNull()
  })

  it('exposes the backend totalResults as total, not the loaded item count', async () => {
    stubFetch(MOVIES, {
      data: page(1, [item('MOVIE', 1), item('MOVIE', 2)], 3, 40),
      status: 'success'
    })

    const media = await mountMovies()

    expect(media.items.value).toHaveLength(2)
    expect(media.total.value).toBe(40)
  })

  it('defaults total to 0 before a successful page 1', async () => {
    stubFetch(MOVIES, { data: undefined, status: 'pending' })

    const media = await mountMovies()

    expect(media.total.value).toBe(0)
    expect(media.hasMore.value).toBe(false)
  })

  it('defaults total to 0 when page 1 fails', async () => {
    stubFetch(MOVIES, {
      data: undefined,
      status: 'error',
      error: new Error('movies unavailable')
    })

    const media = await mountMovies()

    expect(media.total.value).toBe(0)
    expect(media.hasMore.value).toBe(false)
  })

  it('exposes an error status when page 1 fails', async () => {
    const failure = new Error('movies unavailable')
    stubFetch(MOVIES, { data: undefined, status: 'error', error: failure })

    const media = await mountMovies()

    expect(media.status.value).toBe('error')
    expect(media.error.value).toBe(failure)
    expect(media.items.value).toEqual([])
    expect(media.hasMore.value).toBe(false)
  })

  it('appends the next page', async () => {
    stubFetch(MOVIES, {
      data: page(1, [item('MOVIE', 1)], 2),
      status: 'success'
    })
    apiFetch.mockResolvedValueOnce(page(2, [item('MOVIE', 2)], 2))

    const media = await mountMovies()
    expect(media.hasMore.value).toBe(true)

    await media.loadNext()

    expect(apiFetch).toHaveBeenCalledWith(MOVIES, { query: { page: 2 } })
    expect(identities(media.items.value)).toEqual(['MOVIE:1', 'MOVIE:2'])
    expect(media.isLoadingMore.value).toBe(false)
    expect(media.hasMore.value).toBe(false)
  })

  it('collapses concurrent next-page calls into one request', async () => {
    stubFetch(MOVIES, {
      data: page(1, [item('MOVIE', 1)], 2),
      status: 'success'
    })
    let release!: (value: PaginatedMedia) => void
    apiFetch.mockImplementationOnce(
      () =>
        new Promise<PaginatedMedia>((resolve) => {
          release = resolve
        })
    )

    const media = await mountMovies()
    const first = media.loadNext()
    const second = media.loadNext()

    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(media.isLoadingMore.value).toBe(true)

    release(page(2, [item('MOVIE', 2)], 2))
    await Promise.all([first, second])

    expect(identities(media.items.value)).toEqual(['MOVIE:1', 'MOVIE:2'])
    expect(media.isLoadingMore.value).toBe(false)
  })

  it('does not request a next page when page 1 already reports a single page', async () => {
    stubFetch(MOVIES, {
      data: page(1, [item('MOVIE', 1)]),
      status: 'success'
    })

    const media = await mountMovies()

    expect(media.hasMore.value).toBe(false)
    await media.loadNext()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('stops once the last page has been appended', async () => {
    stubFetch(MOVIES, {
      data: page(1, [item('MOVIE', 1)], 2),
      status: 'success'
    })
    apiFetch.mockResolvedValueOnce(page(2, [item('MOVIE', 2)], 2))

    const media = await mountMovies()
    await media.loadNext()
    await media.loadNext()

    expect(apiFetch).toHaveBeenCalledTimes(1)
  })

  it('preserves loaded items and exposes the error when a continuation fails', async () => {
    stubFetch(MOVIES, {
      data: page(1, [item('MOVIE', 1)], 2),
      status: 'success'
    })
    const failure = new Error('page 2 failed')
    apiFetch.mockRejectedValueOnce(failure)

    const media = await mountMovies()
    await media.loadNext()

    expect(identities(media.items.value)).toEqual(['MOVIE:1'])
    expect(media.error.value).toBe(failure)
    expect(media.isLoadingMore.value).toBe(false)
    // Page 1 stays successful; only the continuation failed.
    expect(media.status.value).toBe('success')
    // Still retryable, but only when the caller decides to.
    expect(media.hasMore.value).toBe(true)
  })

  it('does not automatically retry after a continuation failure', async () => {
    stubFetch(MOVIES, {
      data: page(1, [item('MOVIE', 1)], 2),
      status: 'success'
    })
    apiFetch.mockRejectedValueOnce(new Error('page 2 failed'))

    const media = await mountMovies()
    await media.loadNext()

    expect(apiFetch).toHaveBeenCalledTimes(1)

    await nextTick()
    expect(apiFetch).toHaveBeenCalledTimes(1)
  })
})
