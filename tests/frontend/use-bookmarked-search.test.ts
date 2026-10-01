import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { clearNuxtData, clearNuxtState } from '#app'
import { defineComponent, h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  MediaItem,
  MediaType,
  PaginatedMedia
} from '../../shared/contracts'
import ProgressiveSentinel from '../../app/components/ProgressiveSentinel.vue'
import SearchBar from '../../app/components/SearchBar.vue'
import { useBookmarkedSearch } from '../../app/composables/useBookmarkedSearch'
import { useBookmarks } from '../../app/composables/useBookmarks'

const BOOKMARKS = '/api/bookmarks'

// Page 1 goes through `useRequestFetch` (the authenticated SSR read), so that
// boundary is stubbed: these tests own the Bookmarked search lifecycle, not
// Nuxt's fetch mechanics.
const { requestFetch } = vi.hoisted(() => ({ requestFetch: vi.fn() }))

mockNuxtImport('useRequestFetch', () => () => requestFetch)

// Results are seeded into and filtered by the real `useBookmarks()`, so removal
// is exercised through it. Only its auth dependency is stubbed: an
// authenticated session keeps `toggle` on the optimistic path without an /me
// request.
const { authBootstrap } = vi.hoisted(() => ({ authBootstrap: vi.fn() }))

mockNuxtImport('useAuth', () => () => ({
  status: { value: 'authenticated' },
  bootstrap: authBootstrap
}))

/** Answers a page-1 read; the tests decide per media type and query. */
type PageOneResponse = (
  mediaType: MediaType,
  query: string
) => Promise<PaginatedMedia>

function pageOneFrom(
  pages: Partial<Record<MediaType, PaginatedMedia>>
): PageOneResponse {
  return (mediaType) => Promise.resolve(pages[mediaType] ?? page(1, [], 1, 0))
}

let pageOneResponse: PageOneResponse

function bookmark(
  mediaType: MediaType,
  externalId: number,
  title: string
): MediaItem {
  return {
    externalId,
    mediaType,
    title,
    year: 2020,
    posterPath: null,
    backdropPath: null,
    overview: null,
    contentRating: null,
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

// The composable under test is captured from setup so the tests mount the real
// page-1 and continuation lifecycles instead of the public-instance proxy. The
// shared bookmark state is captured the same way so a test can drive a removal
// through it.
let bookmarks: ReturnType<typeof useBookmarks>

const Harness = defineComponent({
  setup: async () => {
    bookmarks = useBookmarks()
    const search = await useBookmarkedSearch()

    // The v-model handler keeps its own literal: the `update:modelValue` event
    // name must stay quoted, and mixing quoted and unquoted keys in one literal
    // conflicts between Prettier and the quote-props lint rule.
    const bindQuery = {
      'onUpdate:modelValue': (value: string) => {
        search.query.value = value
      }
    }

    const list = (items: MediaItem[], className: string) =>
      h(
        'ul',
        { class: className },
        items.map((entry) =>
          h(
            'li',
            { key: `${entry.mediaType}-${entry.externalId}` },
            entry.title
          )
        )
      )

    return () =>
      h('div', [
        h(SearchBar, { modelValue: search.query.value, ...bindQuery }),
        h('p', { 'data-test': 'active-query' }, search.activeQuery.value),
        h('p', { 'data-test': 'movie-status' }, search.movieStatus.value),
        h('p', { 'data-test': 'tv-status' }, search.tvStatus.value),
        h('p', { 'data-test': 'movie-total' }, String(search.movieTotal.value)),
        h('p', { 'data-test': 'tv-total' }, String(search.tvTotal.value)),
        h('p', { 'data-test': 'total' }, String(search.total.value)),
        h(
          'p',
          { 'data-test': 'movie-error' },
          search.movieError.value ? 'failed' : ''
        ),
        h(
          'p',
          { 'data-test': 'tv-error' },
          search.tvError.value ? 'failed' : ''
        ),
        list(search.movieResults.value, 'movie-result'),
        list(search.tvResults.value, 'tv-result'),
        // Movie first, TV second: the tests address the sentinels by position.
        h(ProgressiveSentinel, {
          enabled: search.movieHasMore.value,
          busy: search.movieIsLoadingMore.value,
          loaded: search.movieResults.value.length,
          total: search.movieTotal.value,
          onLoad: () => {
            void search.loadNextMovies()
          }
        }),
        h(ProgressiveSentinel, {
          enabled: search.tvHasMore.value,
          busy: search.tvIsLoadingMore.value,
          loaded: search.tvResults.value.length,
          total: search.tvTotal.value,
          onLoad: () => {
            void search.loadNextTv()
          }
        })
      ])
  }
})

type MountedHarness = Awaited<ReturnType<typeof mountSuspended>>

function mountSearch(route: string) {
  return mountSuspended(Harness, { route })
}

function testText(wrapper: MountedHarness, name: string): string {
  return wrapper.get(`[data-test="${name}"]`).text()
}

function inputValue(wrapper: MountedHarness): string {
  return (wrapper.get('input').element as HTMLInputElement).value
}

function titles(wrapper: MountedHarness, className: string): string[] {
  return wrapper
    .get(`ul.${className}`)
    .findAll('li')
    .map((node) => node.text())
}

function movieTitles(wrapper: MountedHarness): string[] {
  return titles(wrapper, 'movie-result')
}

function tvTitles(wrapper: MountedHarness): string[] {
  return titles(wrapper, 'tv-result')
}

function sentinel(wrapper: MountedHarness, mediaType: MediaType) {
  const index = mediaType === 'MOVIE' ? 0 : 1
  const found = wrapper.findAllComponents(ProgressiveSentinel)[index]
  if (!found) throw new Error(`No ${mediaType} sentinel was rendered`)
  return found
}

/** Fires the sentinel's continuation the way a visible sentinel would. */
function emitLoad(wrapper: MountedHarness, mediaType: MediaType) {
  sentinel(wrapper, mediaType).vm.$emit('load')
}

/**
 * Only the bookmark reads. Navigating to `/bookmarked` runs the page's auth
 * route guard, which bootstraps `/api/auth/me` through the same request-scoped
 * fetch; that is auth, not search.
 */
function bookmarkRequestCalls() {
  return requestFetch.mock.calls.filter(([url]) => url === BOOKMARKS)
}

type TestFetch = (request: string, options?: unknown) => unknown

let movieFetch = vi.fn<TestFetch>()
let tvFetch = vi.fn<TestFetch>()
let deleteFetch = vi.fn<TestFetch>()
let originalFetch: TestFetch

beforeEach(async () => {
  await clearNuxtState()
  // useAsyncData keeps page 1 in the payload cache; clear it so each test
  // starts from its own handler response.
  clearNuxtData()

  pageOneResponse = pageOneFrom({
    MOVIE: page(1, [], 1, 0),
    TV: page(1, [], 1, 0)
  })
  requestFetch.mockReset()
  requestFetch.mockImplementation(
    (
      url: string,
      options?: { query?: { q?: string; mediaType?: MediaType } }
    ) => {
      // The route guard's auth bootstrap is not part of the search
      // lifecycle; a plausible user keeps the guard out of the way.
      return url === BOOKMARKS
        ? pageOneResponse(
            options?.query?.mediaType as MediaType,
            options?.query?.q ?? ''
          )
        : Promise.resolve({ id: 'user-1' })
    }
  )

  movieFetch = vi.fn<TestFetch>()
  tvFetch = vi.fn<TestFetch>()
  deleteFetch = vi.fn<TestFetch>()
  originalFetch = Reflect.get(globalThis, '$fetch') as TestFetch
  // Only the bookmark requests are intercepted; anything else Nuxt fetches
  // during a mount keeps its real implementation. Continuations are dispatched
  // by media type so a group's request can never be answered by the other's,
  // and removals are routed separately so a test can hold one open or make it
  // fail.
  vi.stubGlobal(
    '$fetch',
    (request: string, options?: { query?: unknown; method?: string }) => {
      if (options?.method === 'DELETE') return deleteFetch(request, options)
      if (request !== BOOKMARKS) {
        return originalFetch(request as never, options as never)
      }
      return (options?.query as { mediaType?: string } | undefined)
        ?.mediaType === 'TV'
        ? tvFetch(request, options)
        : movieFetch(request, options)
    }
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('useBookmarkedSearch — query and URL', () => {
  it('seeds the field and both groups from a direct-link query', async () => {
    pageOneResponse = pageOneFrom({
      MOVIE: page(1, [bookmark('MOVIE', 1, 'Earth')], 1, 1),
      TV: page(1, [bookmark('TV', 2, 'Earth TV')], 1, 1)
    })

    const wrapper = await mountSearch('/bookmarked?q=earth')

    expect(inputValue(wrapper)).toBe('earth')
    expect(testText(wrapper, 'active-query')).toBe('earth')
    expect(movieTitles(wrapper)).toEqual(['Earth'])
    expect(tvTitles(wrapper)).toEqual(['Earth TV'])
    wrapper.unmount()
  })

  it('debounces typing before committing the trimmed query', async () => {
    pageOneResponse = pageOneFrom({
      MOVIE: page(1, [bookmark('MOVIE', 1, 'Earth')], 1, 1)
    })

    const wrapper = await mountSearch('/bookmarked')
    await wrapper.get('input').setValue('  earth  ')

    expect(testText(wrapper, 'active-query')).toBe('')
    expect(bookmarkRequestCalls()).toEqual([])

    await vi.waitFor(() =>
      expect(testText(wrapper, 'active-query')).toBe('earth')
    )
    expect(wrapper.vm.$router.currentRoute.value.query.q).toBe('earth')
    expect(movieTitles(wrapper)).toEqual(['Earth'])
    wrapper.unmount()
  })

  it('commits queries with router.replace so typing adds no history entries', async () => {
    pageOneResponse = pageOneFrom({
      MOVIE: page(1, [bookmark('MOVIE', 1, 'Earth')], 1, 1)
    })

    const wrapper = await mountSearch('/bookmarked')
    const push = vi.spyOn(wrapper.vm.$router, 'push')

    await wrapper.get('input').setValue('  earth  ')
    await vi.waitFor(() =>
      expect(testText(wrapper, 'active-query')).toBe('earth')
    )

    expect(push).not.toHaveBeenCalled()
    expect(wrapper.vm.$router.currentRoute.value.query.q).toBe('earth')
    wrapper.unmount()
  })

  it('removes q and returns both groups to idle when the query is cleared', async () => {
    pageOneResponse = pageOneFrom({
      MOVIE: page(1, [bookmark('MOVIE', 1, 'Earth')], 1, 1)
    })

    const wrapper = await mountSearch('/bookmarked?q=earth')
    expect(movieTitles(wrapper)).toEqual(['Earth'])

    await wrapper.get('input').setValue('')

    await vi.waitFor(() =>
      expect(testText(wrapper, 'movie-status')).toBe('idle')
    )
    expect(testText(wrapper, 'tv-status')).toBe('idle')
    expect(wrapper.vm.$router.currentRoute.value.query.q).toBeUndefined()
    expect(movieTitles(wrapper)).toEqual([])
    expect(testText(wrapper, 'movie-total')).toBe('0')
    expect(testText(wrapper, 'total')).toBe('0')
    wrapper.unmount()
  })

  it('follows a URL change that did not come from the field', async () => {
    pageOneResponse = (mediaType, query) =>
      Promise.resolve(
        page(1, [bookmark(mediaType, 1, `${query} ${mediaType}`)], 1, 1)
      )

    const wrapper = await mountSearch('/bookmarked?q=earth')
    expect(movieTitles(wrapper)).toEqual(['earth MOVIE'])

    // Simulates back/forward landing on another committed query.
    await wrapper.vm.$router.replace({ query: { q: 'mars' } })

    await vi.waitFor(() => expect(movieTitles(wrapper)).toEqual(['mars MOVIE']))
    expect(testText(wrapper, 'active-query')).toBe('mars')
    expect(inputValue(wrapper)).toBe('mars')
    wrapper.unmount()
  })

  it('makes no bookmark-search request while the committed query is blank', async () => {
    const wrapper = await mountSearch('/bookmarked')

    expect(bookmarkRequestCalls()).toEqual([])
    expect(testText(wrapper, 'movie-status')).toBe('idle')
    expect(testText(wrapper, 'tv-status')).toBe('idle')
    expect(testText(wrapper, 'total')).toBe('0')
    expect(movieTitles(wrapper)).toEqual([])
    expect(sentinel(wrapper, 'MOVIE').props()).toMatchObject({
      enabled: false,
      loaded: 0
    })
    wrapper.unmount()
  })
})

describe('useBookmarkedSearch — page-1 reads', () => {
  it('reads each group page 1 from /api/bookmarks with the same committed query', async () => {
    const wrapper = await mountSearch('/bookmarked?q=earth')

    expect(bookmarkRequestCalls()).toEqual([
      [BOOKMARKS, { query: { q: 'earth', mediaType: 'MOVIE' } }],
      [BOOKMARKS, { query: { q: 'earth', mediaType: 'TV' } }]
    ])
    wrapper.unmount()
  })

  it('reads page 1 through useRequestFetch so SSR forwards the session cookie', async () => {
    const wrapper = await mountSearch('/bookmarked?q=earth')

    // Page 1 is an authenticated SSR read: it goes through the request-scoped
    // fetch that forwards the incoming session cookie, never through the plain
    // client `$fetch` used for user-triggered work.
    expect(bookmarkRequestCalls()).toHaveLength(2)
    expect(movieFetch).not.toHaveBeenCalled()
    expect(tvFetch).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('useBookmarkedSearch — results and totals', () => {
  it('exposes each group’s results, status, and backend total', async () => {
    pageOneResponse = pageOneFrom({
      MOVIE: page(
        1,
        [bookmark('MOVIE', 1, 'Movie A'), bookmark('MOVIE', 2, 'Movie B')],
        2,
        7
      ),
      TV: page(1, [bookmark('TV', 9, 'Show A')], 1, 3)
    })

    const wrapper = await mountSearch('/bookmarked?q=earth')

    expect(movieTitles(wrapper)).toEqual(['Movie A', 'Movie B'])
    expect(tvTitles(wrapper)).toEqual(['Show A'])
    expect(testText(wrapper, 'movie-status')).toBe('success')
    expect(testText(wrapper, 'tv-status')).toBe('success')
    expect(testText(wrapper, 'movie-error')).toBe('')
    expect(testText(wrapper, 'tv-error')).toBe('')
    // The backend totals, not the number of rendered results.
    expect(testText(wrapper, 'movie-total')).toBe('7')
    expect(testText(wrapper, 'tv-total')).toBe('3')
    expect(sentinel(wrapper, 'MOVIE').props()).toMatchObject({
      enabled: true,
      loaded: 2,
      total: 7
    })
    expect(sentinel(wrapper, 'TV').props()).toMatchObject({
      enabled: false,
      loaded: 1,
      total: 3
    })
    wrapper.unmount()
  })

  it('combines the two backend totals', async () => {
    pageOneResponse = pageOneFrom({
      MOVIE: page(1, [bookmark('MOVIE', 1, 'Movie A')], 1, 4),
      TV: page(1, [bookmark('TV', 9, 'Show A')], 1, 6)
    })

    const wrapper = await mountSearch('/bookmarked?q=earth')

    expect(testText(wrapper, 'total')).toBe('10')
    wrapper.unmount()
  })
})

describe('useBookmarkedSearch — group independence', () => {
  it('keeps the TV search intact when the Movie search fails', async () => {
    pageOneResponse = (mediaType) =>
      mediaType === 'MOVIE'
        ? Promise.reject(new Error('bookmark search failed'))
        : Promise.resolve(page(1, [bookmark('TV', 9, 'Show A')], 1, 3))

    const wrapper = await mountSearch('/bookmarked?q=earth')

    await vi.waitFor(() =>
      expect(testText(wrapper, 'movie-status')).toBe('error')
    )
    expect(testText(wrapper, 'movie-error')).toBe('failed')
    expect(movieTitles(wrapper)).toEqual([])

    // The TV search is untouched by the Movie failure.
    expect(testText(wrapper, 'tv-status')).toBe('success')
    expect(testText(wrapper, 'tv-error')).toBe('')
    expect(tvTitles(wrapper)).toEqual(['Show A'])
    expect(testText(wrapper, 'tv-total')).toBe('3')
    wrapper.unmount()
  })

  it('keeps the Movie search intact when the TV search fails', async () => {
    pageOneResponse = (mediaType) =>
      mediaType === 'TV'
        ? Promise.reject(new Error('bookmark search failed'))
        : Promise.resolve(page(1, [bookmark('MOVIE', 1, 'Movie A')], 1, 2))

    const wrapper = await mountSearch('/bookmarked?q=earth')

    await vi.waitFor(() => expect(testText(wrapper, 'tv-status')).toBe('error'))
    expect(testText(wrapper, 'tv-error')).toBe('failed')
    expect(tvTitles(wrapper)).toEqual([])

    expect(testText(wrapper, 'movie-status')).toBe('success')
    expect(movieTitles(wrapper)).toEqual(['Movie A'])
    expect(testText(wrapper, 'movie-total')).toBe('2')
    wrapper.unmount()
  })
})

describe('useBookmarkedSearch — continuation', () => {
  it('appends the Movie next page with the committed query', async () => {
    pageOneResponse = pageOneFrom({
      MOVIE: page(1, [bookmark('MOVIE', 1, 'Movie A')], 2, 2),
      TV: page(1, [bookmark('TV', 9, 'Show A')], 1, 1)
    })
    movieFetch.mockResolvedValue(
      page(2, [bookmark('MOVIE', 2, 'Movie B')], 2, 2)
    )

    const wrapper = await mountSearch('/bookmarked?q=earth')
    emitLoad(wrapper, 'MOVIE')

    await vi.waitFor(() =>
      expect(movieTitles(wrapper)).toEqual(['Movie A', 'Movie B'])
    )
    expect(movieFetch).toHaveBeenCalledWith(BOOKMARKS, {
      query: { q: 'earth', mediaType: 'MOVIE', page: 2 }
    })
    expect(tvFetch).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('appends the TV next page with the committed query', async () => {
    pageOneResponse = pageOneFrom({
      MOVIE: page(1, [bookmark('MOVIE', 1, 'Movie A')], 1, 1),
      TV: page(1, [bookmark('TV', 9, 'Show A')], 2, 2)
    })
    tvFetch.mockResolvedValue(page(2, [bookmark('TV', 10, 'Show B')], 2, 2))

    const wrapper = await mountSearch('/bookmarked?q=earth')
    emitLoad(wrapper, 'TV')

    await vi.waitFor(() =>
      expect(tvTitles(wrapper)).toEqual(['Show A', 'Show B'])
    )
    expect(tvFetch).toHaveBeenCalledWith(BOOKMARKS, {
      query: { q: 'earth', mediaType: 'TV', page: 2 }
    })
    expect(movieFetch).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('collapses concurrent next-page calls per group', async () => {
    pageOneResponse = pageOneFrom({
      MOVIE: page(1, [bookmark('MOVIE', 1, 'Movie A')], 2, 2),
      TV: page(1, [bookmark('TV', 9, 'Show A')], 2, 2)
    })
    let resolveMovie!: (value: PaginatedMedia) => void
    let resolveTv!: (value: PaginatedMedia) => void
    movieFetch.mockReturnValue(
      new Promise<PaginatedMedia>((resolve) => {
        resolveMovie = resolve
      })
    )
    tvFetch.mockReturnValue(
      new Promise<PaginatedMedia>((resolve) => {
        resolveTv = resolve
      })
    )

    const wrapper = await mountSearch('/bookmarked?q=earth')
    emitLoad(wrapper, 'MOVIE')
    emitLoad(wrapper, 'MOVIE')
    emitLoad(wrapper, 'TV')
    emitLoad(wrapper, 'TV')

    expect(movieFetch).toHaveBeenCalledTimes(1)
    expect(tvFetch).toHaveBeenCalledTimes(1)

    resolveMovie(page(2, [bookmark('MOVIE', 2, 'Movie B')], 2, 2))
    resolveTv(page(2, [bookmark('TV', 10, 'Show B')], 2, 2))
    await vi.waitFor(() =>
      expect(movieTitles(wrapper)).toEqual(['Movie A', 'Movie B'])
    )
    expect(tvTitles(wrapper)).toEqual(['Show A', 'Show B'])
    wrapper.unmount()
  })

  it('keeps the loaded results when a continuation fails and retries on demand', async () => {
    pageOneResponse = pageOneFrom({
      MOVIE: page(1, [bookmark('MOVIE', 1, 'Movie A')], 2, 2),
      TV: page(1, [bookmark('TV', 9, 'Show A')], 1, 1)
    })
    movieFetch.mockRejectedValueOnce(new Error('continuation failed'))

    const wrapper = await mountSearch('/bookmarked?q=earth')
    emitLoad(wrapper, 'MOVIE')

    await vi.waitFor(() =>
      expect(testText(wrapper, 'movie-error')).toBe('failed')
    )
    // Page 1 is unaffected: the failure is reported beside the loaded cards and
    // nothing retries by itself.
    expect(testText(wrapper, 'movie-status')).toBe('success')
    expect(movieTitles(wrapper)).toEqual(['Movie A'])
    expect(movieFetch).toHaveBeenCalledTimes(1)

    movieFetch.mockResolvedValueOnce(
      page(2, [bookmark('MOVIE', 2, 'Movie B')], 2, 2)
    )
    emitLoad(wrapper, 'MOVIE')

    await vi.waitFor(() =>
      expect(movieTitles(wrapper)).toEqual(['Movie A', 'Movie B'])
    )
    expect(movieFetch).toHaveBeenCalledTimes(2)
    expect(testText(wrapper, 'movie-error')).toBe('')
    wrapper.unmount()
  })

  it('does not block one group while the other is loading more', async () => {
    pageOneResponse = pageOneFrom({
      MOVIE: page(1, [bookmark('MOVIE', 1, 'Movie A')], 2, 2),
      TV: page(1, [bookmark('TV', 9, 'Show A')], 2, 2)
    })
    let resolveMovie!: (value: PaginatedMedia) => void
    movieFetch.mockReturnValue(
      new Promise<PaginatedMedia>((resolve) => {
        resolveMovie = resolve
      })
    )
    tvFetch.mockResolvedValue(page(2, [bookmark('TV', 10, 'Show B')], 2, 2))

    const wrapper = await mountSearch('/bookmarked?q=earth')
    emitLoad(wrapper, 'MOVIE')
    await nextTick()
    expect(sentinel(wrapper, 'MOVIE').props('busy')).toBe(true)

    emitLoad(wrapper, 'TV')

    await vi.waitFor(() =>
      expect(tvTitles(wrapper)).toEqual(['Show A', 'Show B'])
    )
    // The Movie request is still in flight and its group is untouched.
    expect(sentinel(wrapper, 'MOVIE').props('busy')).toBe(true)
    expect(movieTitles(wrapper)).toEqual(['Movie A'])

    resolveMovie(page(2, [bookmark('MOVIE', 2, 'Movie B')], 2, 2))
    await vi.waitFor(() =>
      expect(movieTitles(wrapper)).toEqual(['Movie A', 'Movie B'])
    )
    wrapper.unmount()
  })
})

describe('useBookmarkedSearch — query changes', () => {
  it('clears the previous query’s continuation pages', async () => {
    pageOneResponse = (mediaType, query) =>
      Promise.resolve(
        query === 'earth'
          ? page(1, [bookmark(mediaType, 1, `Earth ${mediaType}`)], 2, 2)
          : page(1, [bookmark(mediaType, 5, `Mars ${mediaType}`)], 1, 1)
      )
    movieFetch.mockResolvedValue(
      page(2, [bookmark('MOVIE', 2, 'Earth page 2')], 2, 2)
    )

    const wrapper = await mountSearch('/bookmarked?q=earth')
    emitLoad(wrapper, 'MOVIE')
    await vi.waitFor(() =>
      expect(movieTitles(wrapper)).toEqual(['Earth MOVIE', 'Earth page 2'])
    )

    await wrapper.vm.$router.replace({ query: { q: 'mars' } })

    // The previous query's continuation pages are dropped, so the new page 1 is
    // the only thing left to show.
    await vi.waitFor(() => expect(movieTitles(wrapper)).toEqual(['Mars MOVIE']))
    expect(movieTitles(wrapper)).not.toContain('Earth page 2')
    expect(tvTitles(wrapper)).toEqual(['Mars TV'])
    wrapper.unmount()
  })

  it('never surfaces a page-1 response from a superseded query', async () => {
    pageOneResponse = (mediaType, query) =>
      query === 'earth'
        ? Promise.resolve(
            page(1, [bookmark(mediaType, 1, `Earth ${mediaType}`)], 1, 1)
          )
        : new Promise<PaginatedMedia>(() => {})

    const wrapper = await mountSearch('/bookmarked?q=earth')
    expect(movieTitles(wrapper)).toEqual(['Earth MOVIE'])

    // Nuxt keeps the previous page while the new query loads; the query tag is
    // what stops the superseded Earth page from being shown under `mars`.
    await wrapper.vm.$router.replace({ query: { q: 'mars' } })

    await vi.waitFor(() =>
      expect(testText(wrapper, 'movie-status')).toBe('pending')
    )
    expect(movieTitles(wrapper)).toEqual([])
    expect(testText(wrapper, 'movie-total')).toBe('0')
    wrapper.unmount()
  })

  it('discards a continuation response that arrives after the query changed', async () => {
    pageOneResponse = (mediaType, query) =>
      Promise.resolve(
        query === 'earth'
          ? page(1, [bookmark(mediaType, 1, `Earth ${mediaType}`)], 2, 2)
          : page(1, [bookmark(mediaType, 5, `Mars ${mediaType}`)], 1, 1)
      )
    let resolvePage!: (value: PaginatedMedia) => void
    movieFetch.mockReturnValue(
      new Promise<PaginatedMedia>((resolve) => {
        resolvePage = resolve
      })
    )

    const wrapper = await mountSearch('/bookmarked?q=earth')
    emitLoad(wrapper, 'MOVIE')
    await nextTick()

    await wrapper.vm.$router.replace({ query: { q: 'mars' } })
    await vi.waitFor(() =>
      expect(testText(wrapper, 'active-query')).toBe('mars')
    )

    resolvePage(page(2, [bookmark('MOVIE', 2, 'Earth page 2')], 2, 2))

    await vi.waitFor(() => expect(movieTitles(wrapper)).toEqual(['Mars MOVIE']))
    wrapper.unmount()
  })
})

describe('useBookmarkedSearch — local removal', () => {
  it('drops a removed Movie result before the removal request settles', async () => {
    pageOneResponse = pageOneFrom({
      MOVIE: page(
        1,
        [bookmark('MOVIE', 1, 'Movie A'), bookmark('MOVIE', 2, 'Movie B')],
        1,
        40
      ),
      TV: page(1, [bookmark('TV', 9, 'Show A')], 1, 6)
    })
    let release!: () => void
    deleteFetch.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )

    const wrapper = await mountSearch('/bookmarked?q=earth')

    const removal = bookmarks.toggle({ mediaType: 'MOVIE', externalId: 1 })
    await nextTick()

    // The optimistic flag is written synchronously, so the card is already gone
    // while the removal is still in flight.
    expect(movieTitles(wrapper)).toEqual(['Movie B'])
    expect(deleteFetch).toHaveBeenCalledWith(
      '/api/bookmarks/TMDB/1/MOVIE',
      expect.objectContaining({ method: 'DELETE' })
    )

    release()
    await removal

    expect(movieTitles(wrapper)).toEqual(['Movie B'])
    expect(tvTitles(wrapper)).toEqual(['Show A'])
    wrapper.unmount()
  })

  it('drops a removed TV result without touching the Movie results', async () => {
    pageOneResponse = pageOneFrom({
      MOVIE: page(1, [bookmark('MOVIE', 1, 'Movie A')], 1, 4),
      TV: page(1, [bookmark('TV', 9, 'Show A')], 1, 6)
    })
    deleteFetch.mockResolvedValue(undefined)

    const wrapper = await mountSearch('/bookmarked?q=earth')
    await bookmarks.toggle({ mediaType: 'TV', externalId: 9 })

    expect(tvTitles(wrapper)).toEqual([])
    expect(movieTitles(wrapper)).toEqual(['Movie A'])
    expect(testText(wrapper, 'tv-total')).toBe('5')
    expect(testText(wrapper, 'movie-total')).toBe('4')
    wrapper.unmount()
  })

  it('restores the removed result when the removal fails', async () => {
    pageOneResponse = pageOneFrom({
      MOVIE: page(1, [bookmark('MOVIE', 1, 'Movie A')], 1, 1)
    })
    deleteFetch.mockRejectedValueOnce(new Error('delete failed'))

    const wrapper = await mountSearch('/bookmarked?q=earth')
    const removal = bookmarks.toggle({ mediaType: 'MOVIE', externalId: 1 })
    await nextTick()

    expect(movieTitles(wrapper)).toEqual([])

    await expect(removal).rejects.toThrow('delete failed')

    // Rollback restores both the flag and the corrected total.
    expect(movieTitles(wrapper)).toEqual(['Movie A'])
    expect(testText(wrapper, 'movie-total')).toBe('1')
    expect(testText(wrapper, 'total')).toBe('1')
    wrapper.unmount()
  })

  it('reduces each group total and the combined total by the removed results', async () => {
    pageOneResponse = pageOneFrom({
      MOVIE: page(1, [bookmark('MOVIE', 1, 'Movie A')], 3, 40),
      TV: page(1, [bookmark('TV', 9, 'Show A')], 1, 12)
    })
    deleteFetch.mockResolvedValue(undefined)

    const wrapper = await mountSearch('/bookmarked?q=earth')
    expect(testText(wrapper, 'movie-total')).toBe('40')
    expect(testText(wrapper, 'tv-total')).toBe('12')
    expect(testText(wrapper, 'total')).toBe('52')

    await bookmarks.toggle({ mediaType: 'MOVIE', externalId: 1 })

    // Unloaded pages stay in the total; only what this page removed is
    // subtracted, and the other group is untouched.
    expect(testText(wrapper, 'movie-total')).toBe('39')
    expect(testText(wrapper, 'tv-total')).toBe('12')
    expect(testText(wrapper, 'total')).toBe('51')

    await bookmarks.toggle({ mediaType: 'TV', externalId: 9 })

    expect(testText(wrapper, 'movie-total')).toBe('39')
    expect(testText(wrapper, 'tv-total')).toBe('11')
    expect(testText(wrapper, 'total')).toBe('50')
    wrapper.unmount()
  })

  it('does not re-seed a removed result when a continuation page repeats it', async () => {
    pageOneResponse = pageOneFrom({
      MOVIE: page(1, [bookmark('MOVIE', 1, 'Movie A')], 2, 2),
      TV: page(1, [bookmark('TV', 9, 'Show A')], 1, 1)
    })
    deleteFetch.mockResolvedValue(undefined)
    movieFetch.mockResolvedValueOnce(
      page(
        2,
        [bookmark('MOVIE', 1, 'Movie A'), bookmark('MOVIE', 2, 'Movie B')],
        2,
        2
      )
    )

    const wrapper = await mountSearch('/bookmarked?q=earth')
    await bookmarks.toggle({ mediaType: 'MOVIE', externalId: 1 })
    expect(movieTitles(wrapper)).toEqual([])

    emitLoad(wrapper, 'MOVIE')

    // The repeated identity must not be seeded again: the removed result stays
    // gone while the genuinely new result joins the list.
    await vi.waitFor(() => expect(movieTitles(wrapper)).toEqual(['Movie B']))
    expect(movieTitles(wrapper)).not.toContain('Movie A')
    wrapper.unmount()
  })

  it('does not re-seed a removed identity when a later query repeats it', async () => {
    pageOneResponse = (mediaType, query) =>
      Promise.resolve(
        page(1, [bookmark(mediaType, 1, `${query} ${mediaType}`)], 1, 1)
      )
    deleteFetch.mockResolvedValue(undefined)

    const wrapper = await mountSearch('/bookmarked?q=earth')
    expect(movieTitles(wrapper)).toEqual(['earth MOVIE'])

    await bookmarks.toggle({ mediaType: 'MOVIE', externalId: 1 })
    expect(movieTitles(wrapper)).toEqual([])

    await wrapper.vm.$router.replace({ query: { q: 'mars' } })
    await vi.waitFor(() => expect(tvTitles(wrapper)).toEqual(['mars TV']))

    // `mars` repeats MOVIE:1 with a stale `isBookmarked: true`; the shared state
    // stays authoritative, so the removed result does not come back.
    expect(movieTitles(wrapper)).toEqual([])
    expect(testText(wrapper, 'movie-total')).toBe('0')
    wrapper.unmount()
  })
})
