import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { clearNuxtState } from '#app'
import { defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  MediaItem,
  MediaType,
  PaginatedMedia
} from '../../shared/contracts'
import { useBookmarkedMedia } from '../../app/composables/useBookmarkedMedia'
import { useBookmarks } from '../../app/composables/useBookmarks'

// The groups read the shared bookmark state, so removal is exercised through
// the real `useBookmarks()`. Only its auth dependency is stubbed: an
// authenticated session keeps `toggle` on the optimistic path without an /me
// request.
const { bootstrapMock, auth } = vi.hoisted(() => ({
  bootstrapMock: vi.fn(),
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

const BOOKMARKS = '/api/bookmarks'

interface FetchStub {
  data: Ref<PaginatedMedia | undefined>
  status: Ref<string>
  error: Ref<unknown>
  refresh: ReturnType<typeof vi.fn>
}

interface PageOneCall {
  url: string
  query: Record<string, unknown> | undefined
}

// The page-1 reads are stubbed at the `useFetch` boundary: these tests own the
// Bookmarked data lifecycle, not Nuxt's fetch/SSR mechanics. Calls are recorded
// so the tests can prove each group asks for its own media type.
const { pageOneCalls, pageOneByMediaType } = vi.hoisted(() => ({
  pageOneCalls: [] as PageOneCall[],
  pageOneByMediaType: {} as Record<string, FetchStub>
}))

mockNuxtImport(
  'useFetch',
  () => (url: string, options?: { query?: Record<string, unknown> }) => {
    pageOneCalls.push({ url, query: options?.query })
    return pageOneByMediaType[options?.query?.mediaType as string]
  }
)

// The composable under test is captured directly from setup so the tests read
// raw refs instead of the public-instance proxy. The shared bookmark state is
// captured the same way so a test can drive a removal through it.
let bookmarked: ReturnType<typeof useBookmarkedMedia>
let bookmarks: ReturnType<typeof useBookmarks>

const Harness = defineComponent({
  setup() {
    bookmarked = useBookmarkedMedia()
    bookmarks = useBookmarks()
    return {}
  },
  render: () => h('div')
})

type MountedHarness = Awaited<ReturnType<typeof mountSuspended>>

// Retained so each mount can be torn down before the shared test globals are
// restored: Nuxt's app-level async work must not run against a removed $fetch.
let wrapper: MountedHarness | undefined

async function mountBookmarked() {
  wrapper = await mountSuspended(Harness)
  return bookmarked
}

function stubPageOne(
  mediaType: MediaType,
  value: { data: PaginatedMedia | undefined; status: string; error?: unknown }
) {
  pageOneByMediaType[mediaType] = {
    data: ref(value.data),
    status: ref(value.status),
    error: ref(value.error ?? null),
    refresh: vi.fn()
  }
}

function bookmarkItem(mediaType: MediaType, externalId: number): MediaItem {
  return {
    externalId,
    mediaType,
    title: `${mediaType} Snapshot ${externalId}`,
    year: 2019,
    posterPath: `/poster-${externalId}.jpg`,
    backdropPath: `/backdrop-${externalId}.jpg`,
    overview: null,
    contentRating: 'PG-13',
    isTrending: false,
    isBookmarked: true
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

const { movieFetch, tvFetch, deleteFetch } = vi.hoisted(() => ({
  movieFetch: vi.fn(),
  tvFetch: vi.fn(),
  deleteFetch: vi.fn()
}))

// `$fetch` is an auto-import in Nuxt 4.5, not a global, so the bookmark
// requests are intercepted at the auto-import boundary. Anything else Nuxt
// fetches during a mount keeps the real implementation. Continuations are
// dispatched by media type so a group's request can never be answered by the
// other's, and bookmark removals are routed separately so a test can hold one
// open or make it fail.
mockNuxtImport(
  '$fetch',
  (original: typeof globalThis.$fetch) =>
    (
      request: string,
      options?: { query?: { mediaType?: string }; method?: string }
    ) => {
      if (options?.method === 'DELETE') return deleteFetch(request, options)
      if (request !== BOOKMARKS) {
        return original(request as never, options as never)
      }
      return options?.query?.mediaType === 'TV'
        ? tvFetch(request, options)
        : movieFetch(request, options)
    }
)

beforeEach(async () => {
  // The bookmark map is app-wide state: without clearing it a removal from one
  // test would decide another test's flags.
  await clearNuxtState()

  pageOneCalls.length = 0
  stubPageOne('MOVIE', { data: undefined, status: 'pending' })
  stubPageOne('TV', { data: undefined, status: 'pending' })

  movieFetch.mockReset()
  tvFetch.mockReset()
  deleteFetch.mockReset()
})

afterEach(async () => {
  wrapper?.unmount()
  wrapper = undefined
  // Flush any pending Nuxt work against the mocked fetch so it cannot leak
  // into the next test's reset mocks.
  await nextTick()
})

describe('useBookmarkedMedia', () => {
  describe('initial reads', () => {
    it('reads bookmarked Movies and TV page 1 with their own media type', async () => {
      stubPageOne('MOVIE', {
        data: page(1, [bookmarkItem('MOVIE', 1)]),
        status: 'success'
      })
      stubPageOne('TV', {
        data: page(1, [bookmarkItem('TV', 5)]),
        status: 'success'
      })

      await mountBookmarked()

      expect(pageOneCalls).toEqual([
        { url: BOOKMARKS, query: { mediaType: 'MOVIE' } },
        { url: BOOKMARKS, query: { mediaType: 'TV' } }
      ])
    })

    it('keeps the Movie and TV reads independent', async () => {
      stubPageOne('MOVIE', {
        data: page(1, [bookmarkItem('MOVIE', 1), bookmarkItem('MOVIE', 2)]),
        status: 'success'
      })
      stubPageOne('TV', {
        data: page(1, [bookmarkItem('TV', 9)]),
        status: 'success'
      })

      const media = await mountBookmarked()

      expect(identities(media.movieItems.value)).toEqual(['MOVIE:1', 'MOVIE:2'])
      expect(identities(media.tvItems.value)).toEqual(['TV:9'])
    })
  })

  describe('success', () => {
    it('exposes each group’s page-1 items, total, and status', async () => {
      stubPageOne('MOVIE', {
        data: page(1, [bookmarkItem('MOVIE', 1)], 3, 40),
        status: 'success'
      })
      stubPageOne('TV', {
        data: page(1, [bookmarkItem('TV', 7), bookmarkItem('TV', 8)], 2, 12),
        status: 'success'
      })

      const media = await mountBookmarked()

      expect(identities(media.movieItems.value)).toEqual(['MOVIE:1'])
      expect(identities(media.tvItems.value)).toEqual(['TV:7', 'TV:8'])
      expect(media.movieTotal.value).toBe(40)
      expect(media.tvTotal.value).toBe(12)
      expect(media.movieStatus.value).toBe('success')
      expect(media.tvStatus.value).toBe('success')
      expect(media.movieError.value).toBeNull()
      expect(media.tvError.value).toBeNull()
    })

    it('passes bookmark snapshots through unchanged', async () => {
      const snapshot = bookmarkItem('MOVIE', 1)
      snapshot.backdropPath = '/snapshot-backdrop.jpg'
      snapshot.contentRating = 'R'
      stubPageOne('MOVIE', {
        data: page(1, [snapshot]),
        status: 'success'
      })

      const media = await mountBookmarked()

      expect(media.movieItems.value[0]).toEqual(snapshot)
      expect(media.movieItems.value[0]?.isBookmarked).toBe(true)
    })

    it('defaults each total to 0 while its page 1 is missing', async () => {
      const media = await mountBookmarked()

      expect(media.movieTotal.value).toBe(0)
      expect(media.tvTotal.value).toBe(0)
      expect(media.movieHasMore.value).toBe(false)
      expect(media.tvHasMore.value).toBe(false)
    })
  })

  describe('initial failure', () => {
    it('keeps TV intact when the Movie read fails', async () => {
      const failure = new Error('movies unavailable')
      stubPageOne('MOVIE', { data: undefined, status: 'error', error: failure })
      stubPageOne('TV', {
        data: page(1, [bookmarkItem('TV', 7)], 1, 1),
        status: 'success'
      })

      const media = await mountBookmarked()

      expect(media.movieStatus.value).toBe('error')
      expect(media.movieError.value).toBe(failure)
      expect(media.movieItems.value).toEqual([])
      expect(media.movieTotal.value).toBe(0)
      expect(media.movieHasMore.value).toBe(false)

      expect(media.tvStatus.value).toBe('success')
      expect(identities(media.tvItems.value)).toEqual(['TV:7'])
      expect(media.tvTotal.value).toBe(1)
    })

    it('keeps Movies intact when the TV read fails', async () => {
      const failure = new Error('tv unavailable')
      stubPageOne('MOVIE', {
        data: page(1, [bookmarkItem('MOVIE', 1)], 1, 1),
        status: 'success'
      })
      stubPageOne('TV', { data: undefined, status: 'error', error: failure })

      const media = await mountBookmarked()

      expect(media.tvStatus.value).toBe('error')
      expect(media.tvError.value).toBe(failure)
      expect(media.tvItems.value).toEqual([])
      expect(media.tvTotal.value).toBe(0)
      expect(media.tvHasMore.value).toBe(false)

      expect(media.movieStatus.value).toBe('success')
      expect(identities(media.movieItems.value)).toEqual(['MOVIE:1'])
      expect(media.movieTotal.value).toBe(1)
    })

    it('offers no continuation for a failed group', async () => {
      stubPageOne('MOVIE', {
        data: undefined,
        status: 'error',
        error: new Error('movies unavailable')
      })

      const media = await mountBookmarked()
      await media.loadNextMovies()

      expect(movieFetch).not.toHaveBeenCalled()
    })

    it('retries only the failed Movie page-1 read', async () => {
      stubPageOne('MOVIE', {
        data: undefined,
        status: 'error',
        error: new Error('movies unavailable')
      })
      stubPageOne('TV', {
        data: page(1, [bookmarkItem('TV', 7)], 1, 1),
        status: 'success'
      })

      const media = await mountBookmarked()
      await media.retryMovies()

      // Only the Movie page-1 read re-runs; the TV group and the continuation
      // request are never involved.
      expect(pageOneByMediaType['MOVIE']!.refresh).toHaveBeenCalledTimes(1)
      expect(pageOneByMediaType['TV']!.refresh).not.toHaveBeenCalled()
      expect(movieFetch).not.toHaveBeenCalled()
      expect(tvFetch).not.toHaveBeenCalled()
    })

    it('retries only the failed TV page-1 read', async () => {
      stubPageOne('MOVIE', {
        data: page(1, [bookmarkItem('MOVIE', 1)], 1, 1),
        status: 'success'
      })
      stubPageOne('TV', {
        data: undefined,
        status: 'error',
        error: new Error('tv unavailable')
      })

      const media = await mountBookmarked()
      await media.retryTv()

      expect(pageOneByMediaType['TV']!.refresh).toHaveBeenCalledTimes(1)
      expect(pageOneByMediaType['MOVIE']!.refresh).not.toHaveBeenCalled()
      expect(movieFetch).not.toHaveBeenCalled()
      expect(tvFetch).not.toHaveBeenCalled()
    })
  })

  describe('Movie continuation', () => {
    it('appends the next Movie page with the Movie media type', async () => {
      stubPageOne('MOVIE', {
        data: page(1, [bookmarkItem('MOVIE', 1)], 2, 3),
        status: 'success'
      })
      stubPageOne('TV', {
        data: page(1, [bookmarkItem('TV', 7)], 1, 1),
        status: 'success'
      })
      movieFetch.mockResolvedValueOnce(
        page(2, [bookmarkItem('MOVIE', 2)], 2, 3)
      )

      const media = await mountBookmarked()
      expect(media.movieHasMore.value).toBe(true)

      await media.loadNextMovies()

      expect(movieFetch).toHaveBeenCalledWith(BOOKMARKS, {
        query: { mediaType: 'MOVIE', page: 2 }
      })
      expect(identities(media.movieItems.value)).toEqual(['MOVIE:1', 'MOVIE:2'])
      expect(media.movieIsLoadingMore.value).toBe(false)
      expect(media.movieHasMore.value).toBe(false)
    })

    it('collapses concurrent Movie continuation calls into one request', async () => {
      stubPageOne('MOVIE', {
        data: page(1, [bookmarkItem('MOVIE', 1)], 2, 3),
        status: 'success'
      })
      let release!: (value: PaginatedMedia) => void
      movieFetch.mockImplementationOnce(
        () =>
          new Promise<PaginatedMedia>((resolve) => {
            release = resolve
          })
      )

      const media = await mountBookmarked()
      const first = media.loadNextMovies()
      const second = media.loadNextMovies()

      expect(movieFetch).toHaveBeenCalledTimes(1)
      expect(media.movieIsLoadingMore.value).toBe(true)

      release(page(2, [bookmarkItem('MOVIE', 2)], 2, 3))
      await Promise.all([first, second])

      expect(identities(media.movieItems.value)).toEqual(['MOVIE:1', 'MOVIE:2'])
      expect(media.movieIsLoadingMore.value).toBe(false)
    })

    it('stops after the Movie last page', async () => {
      stubPageOne('MOVIE', {
        data: page(1, [bookmarkItem('MOVIE', 1)], 2, 3),
        status: 'success'
      })
      movieFetch.mockResolvedValueOnce(
        page(2, [bookmarkItem('MOVIE', 2)], 2, 3)
      )

      const media = await mountBookmarked()
      await media.loadNextMovies()
      await media.loadNextMovies()

      expect(movieFetch).toHaveBeenCalledTimes(1)
    })

    it('preserves Movie items, exposes the error, and stays retryable on a Movie continuation failure', async () => {
      stubPageOne('MOVIE', {
        data: page(1, [bookmarkItem('MOVIE', 1)], 2, 3),
        status: 'success'
      })
      stubPageOne('TV', {
        data: page(1, [bookmarkItem('TV', 7)], 1, 1),
        status: 'success'
      })
      const failure = new Error('movie page 2 failed')
      movieFetch.mockRejectedValueOnce(failure)

      const media = await mountBookmarked()
      await media.loadNextMovies()

      expect(identities(media.movieItems.value)).toEqual(['MOVIE:1'])
      expect(media.movieError.value).toBe(failure)
      expect(media.movieStatus.value).toBe('success')
      expect(media.movieIsLoadingMore.value).toBe(false)
      // Another backend page is still available, so a manual retry can run.
      expect(media.movieHasMore.value).toBe(true)

      // No automatic retry: the caller drives the next attempt.
      await nextTick()
      expect(movieFetch).toHaveBeenCalledTimes(1)

      movieFetch.mockResolvedValueOnce(
        page(2, [bookmarkItem('MOVIE', 2)], 2, 3)
      )
      await media.loadNextMovies()

      expect(movieFetch).toHaveBeenCalledTimes(2)
      expect(identities(media.movieItems.value)).toEqual(['MOVIE:1', 'MOVIE:2'])

      // The TV group was never involved.
      expect(identities(media.tvItems.value)).toEqual(['TV:7'])
      expect(media.tvStatus.value).toBe('success')
      expect(media.tvTotal.value).toBe(1)
    })
  })

  describe('TV continuation', () => {
    it('appends the next TV page with the TV media type', async () => {
      stubPageOne('MOVIE', {
        data: page(1, [bookmarkItem('MOVIE', 1)], 1, 1),
        status: 'success'
      })
      stubPageOne('TV', {
        data: page(1, [bookmarkItem('TV', 7)], 2, 3),
        status: 'success'
      })
      tvFetch.mockResolvedValueOnce(page(2, [bookmarkItem('TV', 8)], 2, 3))

      const media = await mountBookmarked()
      expect(media.tvHasMore.value).toBe(true)

      await media.loadNextTv()

      expect(tvFetch).toHaveBeenCalledWith(BOOKMARKS, {
        query: { mediaType: 'TV', page: 2 }
      })
      expect(identities(media.tvItems.value)).toEqual(['TV:7', 'TV:8'])
      expect(media.tvIsLoadingMore.value).toBe(false)
      expect(media.tvHasMore.value).toBe(false)
    })

    it('collapses concurrent TV continuation calls into one request', async () => {
      stubPageOne('TV', {
        data: page(1, [bookmarkItem('TV', 7)], 2, 3),
        status: 'success'
      })
      let release!: (value: PaginatedMedia) => void
      tvFetch.mockImplementationOnce(
        () =>
          new Promise<PaginatedMedia>((resolve) => {
            release = resolve
          })
      )

      const media = await mountBookmarked()
      const first = media.loadNextTv()
      const second = media.loadNextTv()

      expect(tvFetch).toHaveBeenCalledTimes(1)
      expect(media.tvIsLoadingMore.value).toBe(true)

      release(page(2, [bookmarkItem('TV', 8)], 2, 3))
      await Promise.all([first, second])

      expect(identities(media.tvItems.value)).toEqual(['TV:7', 'TV:8'])
      expect(media.tvIsLoadingMore.value).toBe(false)
    })

    it('stops after the TV last page', async () => {
      stubPageOne('TV', {
        data: page(1, [bookmarkItem('TV', 7)], 2, 3),
        status: 'success'
      })
      tvFetch.mockResolvedValueOnce(page(2, [bookmarkItem('TV', 8)], 2, 3))

      const media = await mountBookmarked()
      await media.loadNextTv()
      await media.loadNextTv()

      expect(tvFetch).toHaveBeenCalledTimes(1)
    })

    it('preserves TV items, exposes the error, and stays retryable on a TV continuation failure', async () => {
      stubPageOne('MOVIE', {
        data: page(1, [bookmarkItem('MOVIE', 1)], 1, 1),
        status: 'success'
      })
      stubPageOne('TV', {
        data: page(1, [bookmarkItem('TV', 7)], 2, 3),
        status: 'success'
      })
      const failure = new Error('tv page 2 failed')
      tvFetch.mockRejectedValueOnce(failure)

      const media = await mountBookmarked()
      await media.loadNextTv()

      expect(identities(media.tvItems.value)).toEqual(['TV:7'])
      expect(media.tvError.value).toBe(failure)
      expect(media.tvStatus.value).toBe('success')
      expect(media.tvIsLoadingMore.value).toBe(false)
      expect(media.tvHasMore.value).toBe(true)

      await nextTick()
      expect(tvFetch).toHaveBeenCalledTimes(1)

      tvFetch.mockResolvedValueOnce(page(2, [bookmarkItem('TV', 8)], 2, 3))
      await media.loadNextTv()

      expect(tvFetch).toHaveBeenCalledTimes(2)
      expect(identities(media.tvItems.value)).toEqual(['TV:7', 'TV:8'])

      // The Movie group was never involved.
      expect(identities(media.movieItems.value)).toEqual(['MOVIE:1'])
      expect(media.movieStatus.value).toBe('success')
      expect(media.movieTotal.value).toBe(1)
    })
  })

  describe('independent loading', () => {
    it('lets a Movie continuation run without blocking a TV continuation', async () => {
      stubPageOne('MOVIE', {
        data: page(1, [bookmarkItem('MOVIE', 1)], 2, 3),
        status: 'success'
      })
      stubPageOne('TV', {
        data: page(1, [bookmarkItem('TV', 7)], 2, 3),
        status: 'success'
      })
      let releaseMovie!: (value: PaginatedMedia) => void
      movieFetch.mockImplementationOnce(
        () =>
          new Promise<PaginatedMedia>((resolve) => {
            releaseMovie = resolve
          })
      )
      tvFetch.mockResolvedValueOnce(page(2, [bookmarkItem('TV', 8)], 2, 3))

      const media = await mountBookmarked()
      const moviesLoad = media.loadNextMovies()

      // Movie is still in flight; TV must not be blocked by it.
      expect(media.movieIsLoadingMore.value).toBe(true)
      expect(media.tvIsLoadingMore.value).toBe(false)

      await media.loadNextTv()
      expect(identities(media.tvItems.value)).toEqual(['TV:7', 'TV:8'])
      expect(media.movieIsLoadingMore.value).toBe(true)

      releaseMovie(page(2, [bookmarkItem('MOVIE', 2)], 2, 3))
      await moviesLoad

      expect(identities(media.movieItems.value)).toEqual(['MOVIE:1', 'MOVIE:2'])
    })

    it('lets a TV continuation run without blocking a Movie continuation', async () => {
      stubPageOne('MOVIE', {
        data: page(1, [bookmarkItem('MOVIE', 1)], 2, 3),
        status: 'success'
      })
      stubPageOne('TV', {
        data: page(1, [bookmarkItem('TV', 7)], 2, 3),
        status: 'success'
      })
      let releaseTv!: (value: PaginatedMedia) => void
      tvFetch.mockImplementationOnce(
        () =>
          new Promise<PaginatedMedia>((resolve) => {
            releaseTv = resolve
          })
      )
      movieFetch.mockResolvedValueOnce(
        page(2, [bookmarkItem('MOVIE', 2)], 2, 3)
      )

      const media = await mountBookmarked()
      const tvLoad = media.loadNextTv()

      expect(media.tvIsLoadingMore.value).toBe(true)
      expect(media.movieIsLoadingMore.value).toBe(false)

      await media.loadNextMovies()
      expect(identities(media.movieItems.value)).toEqual(['MOVIE:1', 'MOVIE:2'])
      expect(media.tvIsLoadingMore.value).toBe(true)

      releaseTv(page(2, [bookmarkItem('TV', 8)], 2, 3))
      await tvLoad

      expect(identities(media.tvItems.value)).toEqual(['TV:7', 'TV:8'])
    })
  })

  describe('local removal', () => {
    it('drops a removed Movie from the exposed list before the request settles', async () => {
      stubPageOne('MOVIE', {
        data: page(
          1,
          [bookmarkItem('MOVIE', 1), bookmarkItem('MOVIE', 2)],
          1,
          40
        ),
        status: 'success'
      })
      stubPageOne('TV', {
        data: page(1, [bookmarkItem('TV', 7)], 1, 1),
        status: 'success'
      })
      let release!: () => void
      deleteFetch.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve
          })
      )

      const media = await mountBookmarked()

      const removal = bookmarks.toggle({
        mediaType: 'MOVIE',
        externalId: 1
      })

      // The optimistic flag is written synchronously, so the card is already
      // gone while the request is still open.
      expect(identities(media.movieItems.value)).toEqual(['MOVIE:2'])
      expect(deleteFetch).toHaveBeenCalledWith(
        '/api/bookmarks/TMDB/1/MOVIE',
        expect.objectContaining({ method: 'DELETE' })
      )

      release()
      await removal

      expect(identities(media.movieItems.value)).toEqual(['MOVIE:2'])
      expect(identities(media.tvItems.value)).toEqual(['TV:7'])
      expect(media.movieStatus.value).toBe('success')
    })

    it('drops a removed TV item without touching the Movie group', async () => {
      stubPageOne('MOVIE', {
        data: page(1, [bookmarkItem('MOVIE', 1)], 1, 1),
        status: 'success'
      })
      stubPageOne('TV', {
        data: page(1, [bookmarkItem('TV', 7), bookmarkItem('TV', 8)], 1, 2),
        status: 'success'
      })
      deleteFetch.mockResolvedValue(undefined)

      const media = await mountBookmarked()
      await bookmarks.toggle({ mediaType: 'TV', externalId: 8 })

      expect(identities(media.tvItems.value)).toEqual(['TV:7'])
      expect(identities(media.movieItems.value)).toEqual(['MOVIE:1'])
      expect(media.movieTotal.value).toBe(1)
    })

    it('restores the item when the removal fails', async () => {
      stubPageOne('MOVIE', {
        data: page(1, [bookmarkItem('MOVIE', 1)], 1, 1),
        status: 'success'
      })
      deleteFetch.mockRejectedValueOnce(new Error('delete failed'))

      const media = await mountBookmarked()
      const removal = bookmarks.toggle({
        mediaType: 'MOVIE',
        externalId: 1
      })

      expect(identities(media.movieItems.value)).toEqual([])

      await expect(removal).rejects.toThrow('delete failed')

      // Rollback restores both the flag and the corrected total.
      expect(identities(media.movieItems.value)).toEqual(['MOVIE:1'])
      expect(media.movieTotal.value).toBe(1)
    })

    it('reduces the exposed total by the removed loaded item', async () => {
      stubPageOne('MOVIE', {
        data: page(1, [bookmarkItem('MOVIE', 1)], 3, 40),
        status: 'success'
      })
      stubPageOne('TV', {
        data: page(1, [bookmarkItem('TV', 7)], 1, 12),
        status: 'success'
      })
      deleteFetch.mockResolvedValue(undefined)

      const media = await mountBookmarked()
      expect(media.movieTotal.value).toBe(40)
      expect(media.tvTotal.value).toBe(12)

      await bookmarks.toggle({ mediaType: 'MOVIE', externalId: 1 })

      // Unloaded pages stay in the total; only what this page removed is
      // subtracted, and the other group is untouched.
      expect(media.movieTotal.value).toBe(39)
      expect(media.tvTotal.value).toBe(12)
      expect(media.movieHasMore.value).toBe(true)
    })

    it('leaves the Movie group empty once its last item is removed', async () => {
      stubPageOne('MOVIE', {
        data: page(1, [bookmarkItem('MOVIE', 1)], 1, 1),
        status: 'success'
      })
      stubPageOne('TV', {
        data: page(1, [bookmarkItem('TV', 7)], 1, 1),
        status: 'success'
      })
      deleteFetch.mockResolvedValue(undefined)

      const media = await mountBookmarked()
      await bookmarks.toggle({ mediaType: 'MOVIE', externalId: 1 })

      // A successful group with no items and no remaining total is what the
      // page reads as an empty section.
      expect(media.movieItems.value).toEqual([])
      expect(media.movieTotal.value).toBe(0)
      expect(media.movieStatus.value).toBe('success')
      expect(identities(media.tvItems.value)).toEqual(['TV:7'])

      // Removing the last bookmark too empties both groups at once.
      await bookmarks.toggle({ mediaType: 'TV', externalId: 7 })

      expect(media.tvItems.value).toEqual([])
      expect(media.tvTotal.value).toBe(0)
      expect(media.tvStatus.value).toBe('success')
    })

    it('does not re-seed a removed item when a continuation page arrives', async () => {
      stubPageOne('MOVIE', {
        data: page(1, [bookmarkItem('MOVIE', 1)], 2, 2),
        status: 'success'
      })
      stubPageOne('TV', {
        data: page(1, [], 1, 0),
        status: 'success'
      })
      deleteFetch.mockResolvedValue(undefined)
      movieFetch.mockResolvedValueOnce(
        page(2, [bookmarkItem('MOVIE', 2)], 2, 2)
      )

      const media = await mountBookmarked()
      await bookmarks.toggle({ mediaType: 'MOVIE', externalId: 1 })

      expect(identities(media.movieItems.value)).toEqual([])
      expect(media.movieTotal.value).toBe(1)

      await media.loadNextMovies()

      // Page 1's stale `isBookmarked: true` for Movie A must not be seeded
      // again: the removed card stays gone while Movie B joins the list, and
      // the corrected total still reflects only the removal.
      expect(identities(media.movieItems.value)).toEqual(['MOVIE:2'])
      expect(media.movieTotal.value).toBe(1)
    })
  })
})
