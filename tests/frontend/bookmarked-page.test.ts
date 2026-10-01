import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { nextTick, ref } from 'vue'
import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaItem, MediaType } from '../../shared/contracts'
import type { BookmarkedSectionStatus } from '../../app/composables/useBookmarkedMedia'
import type { BookmarkedSearchStatus } from '../../app/composables/useBookmarkedSearch'
import BookmarkedPage from '../../app/pages/bookmarked/index.vue'
import MediaCard from '../../app/components/MediaCard.vue'
import MediaCardSkeleton from '../../app/components/MediaCardSkeleton.vue'
import MediaGrid from '../../app/components/MediaGrid.vue'
import ProgressiveSentinel from '../../app/components/ProgressiveSentinel.vue'
import SearchBar from '../../app/components/SearchBar.vue'

// The page is a thin mapping from `useBookmarkedMedia()` onto the media
// primitives, so the composable is stubbed at its boundary: these tests own the
// composition, the two groups' independence, and the sentinel wiring — not the
// bookmark lifecycles, which `use-bookmarked-media.test.ts` covers.
const { bookmarkedApi, loadNextMovies, loadNextTv } = vi.hoisted(() => ({
  bookmarkedApi: { current: null as unknown },
  loadNextMovies: vi.fn(),
  loadNextTv: vi.fn()
}))

mockNuxtImport('useBookmarkedMedia', () => () => bookmarkedApi.current)

// The page never uses the general media search; the stub only exists so the
// tests can prove the page does not reach for it.
const { mediaSearchSpy } = vi.hoisted(() => ({ mediaSearchSpy: vi.fn() }))

mockNuxtImport('useMediaSearch', () => mediaSearchSpy)

// Bookmarked search is stubbed at its boundary too: this file owns the two
// modes' composition, the combined heading, and the sentinel wiring, while the
// search lifecycles belong to `use-bookmarked-search.test.ts`.
const {
  searchApi,
  bookmarkedSearchSpy,
  loadNextSearchMovies,
  loadNextSearchTv
} = vi.hoisted(() => {
  const api = { current: null as unknown }
  return {
    searchApi: api,
    bookmarkedSearchSpy: vi.fn(() => api.current),
    loadNextSearchMovies: vi.fn(),
    loadNextSearchTv: vi.fn()
  }
})

mockNuxtImport('useBookmarkedSearch', () => bookmarkedSearchSpy)

// Cards integrate the real `useBookmarks`, which reads auth status.
const { bootstrapMock } = vi.hoisted(() => ({ bootstrapMock: vi.fn() }))

mockNuxtImport('useAuth', () => () => ({
  status: { value: 'authenticated' },
  bootstrap: bootstrapMock
}))

const MOVIE_HEADING = 'Bookmarked Movies'
const TV_HEADING = 'Bookmarked TV Series'

type MountedPage = VueWrapper

interface GroupState {
  items?: MediaItem[]
  status?: BookmarkedSectionStatus
  error?: unknown
  total?: number
  hasMore?: boolean
  isLoadingMore?: boolean
}

/** Installs the composable's public shape for the next mount. */
function setBookmarked(state: { movies?: GroupState; tv?: GroupState } = {}) {
  normalBookmarks = createNormalState(state)
  bookmarkedApi.current = normalBookmarks
}

/** The stub exposed by the last `setBookmarked()`, for direct mutation. */
let normalBookmarks: ReturnType<typeof createNormalState>

function createNormalState(
  state: { movies?: GroupState; tv?: GroupState } = {}
) {
  const movies = state.movies ?? {}
  const tv = state.tv ?? {}

  return {
    movieItems: ref(movies.items ?? []),
    movieStatus: ref<BookmarkedSectionStatus>(movies.status ?? 'success'),
    movieError: ref(movies.error ?? null),
    movieTotal: ref(movies.total ?? 0),
    movieHasMore: ref(movies.hasMore ?? false),
    movieIsLoadingMore: ref(movies.isLoadingMore ?? false),
    loadNextMovies,

    tvItems: ref(tv.items ?? []),
    tvStatus: ref<BookmarkedSectionStatus>(tv.status ?? 'success'),
    tvError: ref(tv.error ?? null),
    tvTotal: ref(tv.total ?? 0),
    tvHasMore: ref(tv.hasMore ?? false),
    tvIsLoadingMore: ref(tv.isLoadingMore ?? false),
    loadNextTv
  }
}

interface SearchGroupState {
  results?: MediaItem[]
  status?: BookmarkedSearchStatus
  error?: unknown
  total?: number
  hasMore?: boolean
  isLoadingMore?: boolean
}

interface SearchStateOptions {
  query?: string
  activeQuery?: string
  movies?: SearchGroupState
  tv?: SearchGroupState
  total?: number
}

/** The stub exposed by the last `setBookmarkedSearch()`, for direct mutation. */
let bookmarkedSearch: ReturnType<typeof createSearchState>

function createSearchState(options: SearchStateOptions = {}) {
  const movies = options.movies ?? {}
  const tv = options.tv ?? {}
  const movieTotal = movies.total ?? 0
  const tvTotal = tv.total ?? 0

  return {
    query: ref(options.query ?? ''),
    activeQuery: ref(options.activeQuery ?? ''),

    movieResults: ref(movies.results ?? []),
    movieStatus: ref<BookmarkedSearchStatus>(movies.status ?? 'idle'),
    movieError: ref(movies.error ?? null),
    movieTotal: ref(movieTotal),
    movieHasMore: ref(movies.hasMore ?? false),
    movieIsLoadingMore: ref(movies.isLoadingMore ?? false),
    loadNextMovies: loadNextSearchMovies,

    tvResults: ref(tv.results ?? []),
    tvStatus: ref<BookmarkedSearchStatus>(tv.status ?? 'idle'),
    tvError: ref(tv.error ?? null),
    tvTotal: ref(tvTotal),
    tvHasMore: ref(tv.hasMore ?? false),
    tvIsLoadingMore: ref(tv.isLoadingMore ?? false),
    loadNextTv: loadNextSearchTv,

    total: ref(options.total ?? movieTotal + tvTotal)
  }
}

/** Installs the search composable's public shape for the next mount. */
function setBookmarkedSearch(options: SearchStateOptions = {}) {
  bookmarkedSearch = createSearchState(options)
  searchApi.current = bookmarkedSearch
}

/**
 * Both searches succeeded, with the combined total the composable would report.
 * `total` stays derived here so a test never has to keep two numbers in step.
 */
function setSearchResults(options: {
  activeQuery?: string
  movies?: MediaItem[]
  tv?: MediaItem[]
  movieTotal?: number
  tvTotal?: number
}) {
  const movieTotal = options.movieTotal ?? options.movies?.length ?? 0
  const tvTotal = options.tvTotal ?? options.tv?.length ?? 0

  setBookmarkedSearch({
    activeQuery: options.activeQuery ?? 'earth',
    movies: {
      results: options.movies ?? [],
      status: 'success',
      total: movieTotal
    },
    tv: { results: options.tv ?? [], status: 'success', total: tvTotal },
    total: movieTotal + tvTotal
  })
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
    isBookmarked: true
  }
}

/** A search result, titled so normal and search cards are never confused. */
function searchItem(mediaType: MediaType, externalId: number): MediaItem {
  return {
    ...item(mediaType, externalId),
    title: `Search ${mediaType} ${externalId}`
  }
}

/** The rendered section whose heading matches, or a failure if it is absent. */
function section(wrapper: MountedPage, heading: string): DOMWrapper<Element> {
  const found = wrapper
    .findAll('.bookmarked-section')
    .find((node) => node.get('.bookmarked-section__heading').text() === heading)

  if (!found) throw new Error(`The "${heading}" section is not rendered`)
  return found
}

function headings(wrapper: MountedPage): string[] {
  return wrapper
    .findAll('.bookmarked-section__heading')
    .map((heading) => heading.text())
}

/** Only the group headings, so the combined search heading is never counted. */
function sectionHeadings(wrapper: MountedPage): string[] {
  return wrapper
    .findAll('h2.bookmarked-section__heading')
    .map((heading) => heading.text())
}

/** The rendered card titles, in document order. */
function cardTitles(wrapper: MountedPage): string[] {
  return wrapper.findAll('.media-card__title').map((title) => title.text())
}

beforeEach(() => {
  loadNextMovies.mockReset()
  loadNextTv.mockReset()
  mediaSearchSpy.mockReset()
  bookmarkedSearchSpy.mockClear()
  loadNextSearchMovies.mockReset()
  loadNextSearchTv.mockReset()
  setBookmarked()
  setBookmarkedSearch()
})

describe('Bookmarked page — structure', () => {
  /*
   * `definePageMeta` is a compile-time macro: Nuxt extracts it into the route
   * record and strips it from the component module, so mounting the page cannot
   * observe it. The guard is therefore asserted where it is declared.
   */
  it('keeps the auth middleware on the route', () => {
    // Resolved from the Vitest project root rather than `import.meta.url`,
    // which the Nuxt test environment does not expose as a `file:` URL.
    const source = readFileSync(
      resolve(process.cwd(), 'app/pages/bookmarked/index.vue'),
      'utf8'
    )

    expect(source).toMatch(
      /definePageMeta\(\s*\{\s*middleware: 'auth'\s*\}\s*\)/
    )
  })

  it('renders the contextual SearchBar with the Figma Bookmarked placeholder', async () => {
    const wrapper = await mountSuspended(BookmarkedPage)

    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    expect(wrapper.get('.search-bar__input').attributes('placeholder')).toBe(
      'Search for bookmarked shows'
    )
    wrapper.unmount()
  })

  it('does not use useMediaSearch() in normal mode', async () => {
    setBookmarked({
      movies: { items: [item('MOVIE', 1)] },
      tv: { items: [item('TV', 2)] }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(mediaSearchSpy).not.toHaveBeenCalled()
    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(2)
    wrapper.unmount()
  })

  it('keeps typing in the SearchBar local to the field', async () => {
    setBookmarked({
      movies: { items: [item('MOVIE', 1)] },
      tv: { items: [item('TV', 2)] }
    })

    const wrapper = await mountSuspended(BookmarkedPage)
    await wrapper.get('.search-bar__input').setValue('matrix')

    expect(cardTitles(wrapper)).toEqual(['MOVIE 1', 'TV 2'])
    expect(mediaSearchSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('Bookmarked page — both groups', () => {
  it('renders both section headings in Figma order', async () => {
    setBookmarked({
      movies: { items: [item('MOVIE', 1)] },
      tv: { items: [item('TV', 2)] }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(headings(wrapper)).toEqual([MOVIE_HEADING, TV_HEADING])
    wrapper.unmount()
  })

  it('renders exactly the items supplied by useBookmarkedMedia(), Movies first', async () => {
    const movies = [item('MOVIE', 10), item('MOVIE', 11)]
    const tv = [item('TV', 20), item('TV', 21), item('TV', 22)]

    setBookmarked({
      movies: { items: movies },
      tv: { items: tv }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    // The grid and card primitives are used as-is: no markup is duplicated.
    expect(wrapper.findAllComponents(MediaGrid)).toHaveLength(2)
    expect(cardTitles(wrapper)).toEqual([
      ...movies.map((entry) => entry.title),
      ...tv.map((entry) => entry.title)
    ])
    wrapper.unmount()
  })
})

describe('Bookmarked page — pending', () => {
  it('reserves each grid with skeletons while both groups are pending', async () => {
    setBookmarked({
      movies: { status: 'pending' },
      tv: { status: 'pending' }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(headings(wrapper)).toEqual([MOVIE_HEADING, TV_HEADING])
    const skeletons = wrapper.findAllComponents(MediaCardSkeleton)
    expect(skeletons.length).toBeGreaterThan(1)
    expect(
      skeletons.every((skeleton) => skeleton.props('variant') === 'card')
    ).toBe(true)
    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(0)

    // The loading state is not a page-wide replacement.
    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    expect(wrapper.text()).not.toContain(
      `You haven't bookmarked any shows yet.`
    )
    wrapper.unmount()
  })

  it('keeps the successful group while the other is pending', async () => {
    setBookmarked({
      movies: { status: 'pending' },
      tv: { items: [item('TV', 20)] }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(headings(wrapper)).toEqual([MOVIE_HEADING, TV_HEADING])
    expect(
      section(wrapper, MOVIE_HEADING).findAllComponents(MediaCardSkeleton)
        .length
    ).toBeGreaterThan(1)
    expect(cardTitles(wrapper)).toEqual(['TV 20'])
    wrapper.unmount()
  })
})

describe('Bookmarked page — initial failure', () => {
  it('shows a safe Movie error and preserves the TV group', async () => {
    setBookmarked({
      movies: { status: 'error', error: new Error('DB 500: unavailable') },
      tv: { items: [item('TV', 20)] }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    const error = section(wrapper, MOVIE_HEADING).get(
      '.bookmarked-section__error[role="alert"]'
    )
    expect(error.text()).toBe(
      'Bookmarked movies are unavailable right now. Please try again later.'
    )
    expect(error.text()).not.toContain('DB')
    expect(error.text()).not.toContain('500')

    // The failed group keeps its heading but shows no cards, and the other
    // group stays fully usable.
    expect(
      section(wrapper, MOVIE_HEADING).findComponent(MediaGrid).exists()
    ).toBe(false)
    expect(cardTitles(wrapper)).toEqual(['TV 20'])
    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows a safe TV error and preserves the Movie group', async () => {
    setBookmarked({
      movies: { items: [item('MOVIE', 10)] },
      tv: { status: 'error', error: new Error('DB 500: unavailable') }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    const error = section(wrapper, TV_HEADING).get(
      '.bookmarked-section__error[role="alert"]'
    )
    expect(error.text()).toBe(
      'Bookmarked TV series are unavailable right now. Please try again later.'
    )
    expect(error.text()).not.toContain('DB')

    expect(section(wrapper, TV_HEADING).findComponent(MediaGrid).exists()).toBe(
      false
    )
    expect(cardTitles(wrapper)).toEqual(['MOVIE 10'])
    wrapper.unmount()
  })

  it('never treats a failed group as an empty successful one', async () => {
    setBookmarked({
      movies: { status: 'error', error: new Error('failed') },
      tv: { status: 'success', items: [], total: 0 }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(wrapper.text()).not.toContain(
      `You haven't bookmarked any shows yet.`
    )
    expect(headings(wrapper)).toContain(MOVIE_HEADING)
    expect(
      section(wrapper, MOVIE_HEADING)
        .find('.bookmarked-section__error[role="alert"]')
        .exists()
    ).toBe(true)
    wrapper.unmount()
  })
})

describe('Bookmarked page — removed bookmarks', () => {
  it('drops the Movie section once its last card is removed while TV remains', async () => {
    setBookmarked({
      movies: { items: [item('MOVIE', 10)], total: 1 },
      tv: { items: [item('TV', 20)], total: 3 }
    })

    const wrapper = await mountSuspended(BookmarkedPage)
    expect(headings(wrapper)).toEqual([MOVIE_HEADING, TV_HEADING])

    // `useBookmarkedMedia()` drops the card and corrects the total together.
    normalBookmarks.movieItems.value = []
    normalBookmarks.movieTotal.value = 0
    await nextTick()

    expect(headings(wrapper)).toEqual([TV_HEADING])
    expect(cardTitles(wrapper)).toEqual(['TV 20'])
    wrapper.unmount()
  })

  it('shows the whole-page empty state once the last bookmark is removed', async () => {
    setBookmarked({
      movies: { items: [item('MOVIE', 10)], total: 1 },
      tv: { items: [item('TV', 20)], total: 1 }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    normalBookmarks.movieItems.value = []
    normalBookmarks.movieTotal.value = 0
    normalBookmarks.tvItems.value = []
    normalBookmarks.tvTotal.value = 0
    await nextTick()

    expect(wrapper.get('.bookmarked-page__empty').text()).toBe(
      `You haven't bookmarked any shows yet.`
    )
    expect(headings(wrapper)).toEqual([])
    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(0)
    wrapper.unmount()
  })
})

describe('Bookmarked page — empty groups', () => {
  it('omits the empty Movie section when TV has results', async () => {
    setBookmarked({
      movies: { items: [], total: 0 },
      tv: { items: [item('TV', 20)] }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(headings(wrapper)).toEqual([TV_HEADING])
    expect(cardTitles(wrapper)).toEqual(['TV 20'])
    wrapper.unmount()
  })

  it('omits the empty TV section when Movies have results', async () => {
    setBookmarked({
      movies: { items: [item('MOVIE', 10)] },
      tv: { items: [], total: 0 }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(headings(wrapper)).toEqual([MOVIE_HEADING])
    expect(cardTitles(wrapper)).toEqual(['MOVIE 10'])
    wrapper.unmount()
  })

  it('shows the whole-page empty state when both groups are empty successes', async () => {
    setBookmarked({
      movies: { items: [], total: 0 },
      tv: { items: [], total: 0 }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(wrapper.get('.bookmarked-page__empty').text()).toBe(
      `You haven't bookmarked any shows yet.`
    )
    expect(headings(wrapper)).toEqual([])
    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(0)
    // The empty state replaces the sections, not the search control.
    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not show the empty state while a group is still pending', async () => {
    setBookmarked({
      movies: { items: [], total: 0 },
      tv: { status: 'pending' }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(wrapper.find('.bookmarked-page__empty').exists()).toBe(false)
    expect(headings(wrapper)).toContain(TV_HEADING)
    wrapper.unmount()
  })

  it('does not show the empty state when a group failed', async () => {
    setBookmarked({
      movies: { items: [], total: 0 },
      tv: { status: 'error', error: new Error('failed') }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(wrapper.find('.bookmarked-page__empty').exists()).toBe(false)
    expect(
      section(wrapper, TV_HEADING)
        .find('.bookmarked-section__error[role="alert"]')
        .exists()
    ).toBe(true)
    wrapper.unmount()
  })
})

describe('Bookmarked page — Movie continuation', () => {
  it('wires the Movie sentinel to the Movie state', async () => {
    setBookmarked({
      movies: {
        items: [item('MOVIE', 10), item('MOVIE', 11)],
        hasMore: true,
        isLoadingMore: false,
        total: 42
      },
      tv: { items: [item('TV', 20)] }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(
      section(wrapper, MOVIE_HEADING).getComponent(ProgressiveSentinel).props()
    ).toMatchObject({
      enabled: true,
      busy: false,
      loaded: 2,
      // The backend total, not the rendered card count.
      total: 42
    })
    wrapper.unmount()
  })

  it('forwards the Movie sentinel load event to loadNextMovies()', async () => {
    setBookmarked({
      movies: { items: [item('MOVIE', 10)], hasMore: true },
      tv: { items: [item('TV', 20)] }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    section(wrapper, MOVIE_HEADING)
      .getComponent(ProgressiveSentinel)
      .vm.$emit('load')

    expect(loadNextMovies).toHaveBeenCalledTimes(1)
    expect(loadNextTv).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps the Movie cards and reports a Movie continuation failure', async () => {
    setBookmarked({
      movies: {
        items: [item('MOVIE', 10)],
        hasMore: true,
        error: new Error('continuation failed')
      },
      tv: { items: [item('TV', 20)] }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    const movie = section(wrapper, MOVIE_HEADING)
    expect(movie.findAllComponents(MediaCard)).toHaveLength(1)
    expect(movie.findComponent(MediaGrid).exists()).toBe(true)
    expect(movie.findComponent(ProgressiveSentinel).exists()).toBe(true)
    expect(movie.get('.bookmarked-section__error[role="status"]').text()).toBe(
      `Couldn't load more bookmarked movies.`
    )

    // The TV group is untouched, and nothing retries automatically.
    expect(cardTitles(wrapper)).toEqual(['MOVIE 10', 'TV 20'])
    expect(
      section(wrapper, TV_HEADING).find('.bookmarked-section__error').exists()
    ).toBe(false)
    expect(loadNextMovies).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('Bookmarked page — TV continuation', () => {
  it('wires the TV sentinel to the TV state', async () => {
    setBookmarked({
      movies: { items: [item('MOVIE', 10)] },
      tv: {
        items: [item('TV', 20)],
        hasMore: false,
        isLoadingMore: true,
        total: 7
      }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(
      section(wrapper, TV_HEADING).getComponent(ProgressiveSentinel).props()
    ).toMatchObject({
      enabled: false,
      busy: true,
      loaded: 1,
      total: 7
    })
    wrapper.unmount()
  })

  it('forwards the TV sentinel load event to loadNextTv()', async () => {
    setBookmarked({
      movies: { items: [item('MOVIE', 10)] },
      tv: { items: [item('TV', 20)], hasMore: true }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    section(wrapper, TV_HEADING)
      .getComponent(ProgressiveSentinel)
      .vm.$emit('load')

    expect(loadNextTv).toHaveBeenCalledTimes(1)
    expect(loadNextMovies).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps the TV cards and reports a TV continuation failure', async () => {
    setBookmarked({
      movies: { items: [item('MOVIE', 10)] },
      tv: {
        items: [item('TV', 20)],
        hasMore: true,
        error: new Error('continuation failed')
      }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    const tv = section(wrapper, TV_HEADING)
    expect(tv.findAllComponents(MediaCard)).toHaveLength(1)
    expect(tv.get('.bookmarked-section__error[role="status"]').text()).toBe(
      `Couldn't load more bookmarked TV series.`
    )

    // The Movie group is untouched, and nothing retries automatically.
    expect(cardTitles(wrapper)).toEqual(['MOVIE 10', 'TV 20'])
    expect(
      section(wrapper, MOVIE_HEADING)
        .find('.bookmarked-section__error')
        .exists()
    ).toBe(false)
    expect(loadNextTv).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('Bookmarked page — search mode', () => {
  it('uses useBookmarkedSearch()', async () => {
    const wrapper = await mountSuspended(BookmarkedPage)

    expect(bookmarkedSearchSpy).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('binds the SearchBar to the Bookmarked search query', async () => {
    setBookmarkedSearch({ query: 'matrix' })

    const wrapper = await mountSuspended(BookmarkedPage)
    const input = wrapper.get('.search-bar__input')

    expect((input.element as HTMLInputElement).value).toBe('matrix')

    await input.setValue('dune')
    expect(bookmarkedSearch.query.value).toBe('dune')
    wrapper.unmount()
  })

  it('keeps the normal Bookmarked sections while no query is committed', async () => {
    setBookmarked({ movies: { items: [item('MOVIE', 10)] } })
    setBookmarkedSearch({ query: 'matrix', activeQuery: '' })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(headings(wrapper)).toEqual([MOVIE_HEADING])
    expect(cardTitles(wrapper)).toEqual(['MOVIE 10'])
    expect(wrapper.find('h1').exists()).toBe(false)
    wrapper.unmount()
  })

  it('replaces the normal Bookmarked sections with the committed search', async () => {
    setBookmarked({
      movies: { items: [item('MOVIE', 10)] },
      tv: { items: [item('TV', 20)] }
    })
    setSearchResults({
      movies: [searchItem('MOVIE', 1)],
      tv: [searchItem('TV', 2)]
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(cardTitles(wrapper)).toEqual(['Search MOVIE 1', 'Search TV 2'])
    expect(wrapper.text()).not.toContain('MOVIE 10')
    expect(wrapper.text()).not.toContain('TV 20')
    wrapper.unmount()
  })

  it('restores the previous normal state when the committed query is cleared', async () => {
    setBookmarked({
      movies: { items: [item('MOVIE', 10)] },
      tv: { items: [item('TV', 20)] }
    })
    setSearchResults({
      movies: [searchItem('MOVIE', 1)],
      tv: [searchItem('TV', 2)]
    })

    const wrapper = await mountSuspended(BookmarkedPage)
    expect(cardTitles(wrapper)).toEqual(['Search MOVIE 1', 'Search TV 2'])

    bookmarkedSearch.activeQuery.value = ''
    await nextTick()

    expect(headings(wrapper)).toEqual([MOVIE_HEADING, TV_HEADING])
    expect(cardTitles(wrapper)).toEqual(['MOVIE 10', 'TV 20'])
    wrapper.unmount()
  })
})

describe('Bookmarked page — combined search heading', () => {
  it('reports a single combined result with typographic quotes', async () => {
    setSearchResults({
      movies: [searchItem('MOVIE', 1)],
      movieTotal: 1,
      tvTotal: 0
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(wrapper.get('h1').text()).toBe('Found 1 result for ‘earth’')
    wrapper.unmount()
  })

  it('reports the combined backend total rather than the rendered cards', async () => {
    setSearchResults({
      movies: [searchItem('MOVIE', 1)],
      tv: [searchItem('TV', 2)],
      movieTotal: 4,
      tvTotal: 7
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(wrapper.get('h1').text()).toBe('Found 11 results for ‘earth’')
    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(2)
    wrapper.unmount()
  })

  it('reports a zero combined result without section headings', async () => {
    setSearchResults({})

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(wrapper.get('h1').text()).toBe('Found 0 results for ‘earth’')
    expect(sectionHeadings(wrapper)).toEqual([])
    expect(cardTitles(wrapper)).toEqual([])
    wrapper.unmount()
  })

  it('uses the committed query rather than the transient field value', async () => {
    setBookmarkedSearch({
      query: 'typ',
      activeQuery: 'earth',
      movies: {
        results: [searchItem('MOVIE', 1)],
        status: 'success',
        total: 1
      },
      tv: { results: [], status: 'success', total: 0 },
      total: 1
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(wrapper.get('h1').text()).toBe('Found 1 result for ‘earth’')
    wrapper.unmount()
  })

  it('shows no combined heading while either search is still pending', async () => {
    setBookmarkedSearch({
      activeQuery: 'earth',
      movies: {
        results: [searchItem('MOVIE', 1)],
        status: 'success',
        total: 1
      },
      tv: { status: 'pending' },
      total: 1
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(wrapper.find('h1').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows no combined heading when either search failed', async () => {
    setBookmarkedSearch({
      activeQuery: 'earth',
      movies: {
        results: [searchItem('MOVIE', 1)],
        status: 'success',
        total: 1
      },
      tv: { status: 'error', error: new Error('failed') },
      total: 1
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(wrapper.find('h1').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('Bookmarked page — search result grouping', () => {
  it('keeps Movie and TV search results under their own headings', async () => {
    setSearchResults({
      movies: [searchItem('MOVIE', 1)],
      tv: [searchItem('TV', 2)]
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(sectionHeadings(wrapper)).toEqual([MOVIE_HEADING, TV_HEADING])
    expect(
      section(wrapper, MOVIE_HEADING).findAllComponents(MediaCard)
    ).toHaveLength(1)
    expect(cardTitles(wrapper)).toEqual(['Search MOVIE 1', 'Search TV 2'])
    wrapper.unmount()
  })

  it('omits an empty Movie search group when TV has results', async () => {
    setSearchResults({ movies: [], tv: [searchItem('TV', 2)] })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(sectionHeadings(wrapper)).toEqual([TV_HEADING])
    expect(cardTitles(wrapper)).toEqual(['Search TV 2'])
    wrapper.unmount()
  })

  it('omits an empty TV search group when Movies have results', async () => {
    setSearchResults({ movies: [searchItem('MOVIE', 1)], tv: [] })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(sectionHeadings(wrapper)).toEqual([MOVIE_HEADING])
    expect(cardTitles(wrapper)).toEqual(['Search MOVIE 1'])
    wrapper.unmount()
  })
})

describe('Bookmarked page — search group emptiness', () => {
  // D2 adjusts the backend total when a loaded page is exhausted by removals,
  // so a group can legitimately hold no loaded cards while later pages still
  // exist. Zero loaded results alone must not be read as an empty group.
  it('keeps the Movie search section and its continuation when only later pages remain', async () => {
    setBookmarkedSearch({
      activeQuery: 'earth',
      movies: { results: [], status: 'success', total: 3, hasMore: true },
      tv: {
        results: [searchItem('TV', 2)],
        status: 'success',
        total: 1
      },
      total: 4
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    const movie = section(wrapper, MOVIE_HEADING)
    expect(movie.findAllComponents(MediaCard)).toHaveLength(0)
    expect(movie.getComponent(ProgressiveSentinel).props()).toMatchObject({
      enabled: true,
      loaded: 0,
      total: 3
    })
    expect(wrapper.get('h1').text()).toBe('Found 4 results for ‘earth’')
    wrapper.unmount()
  })

  it('keeps the TV search section and its continuation when only later pages remain', async () => {
    setBookmarkedSearch({
      activeQuery: 'earth',
      movies: {
        results: [searchItem('MOVIE', 1)],
        status: 'success',
        total: 1
      },
      tv: { results: [], status: 'success', total: 3, hasMore: true },
      total: 4
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    const tv = section(wrapper, TV_HEADING)
    expect(tv.findAllComponents(MediaCard)).toHaveLength(0)
    expect(tv.getComponent(ProgressiveSentinel).props()).toMatchObject({
      enabled: true,
      loaded: 0,
      total: 3
    })
    expect(wrapper.get('h1').text()).toBe('Found 4 results for ‘earth’')
    wrapper.unmount()
  })

  it('still drops a group whose loaded results and total are both zero', async () => {
    setSearchResults({ movies: [], tv: [searchItem('TV', 2)] })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(sectionHeadings(wrapper)).toEqual([TV_HEADING])
    expect(wrapper.get('h1').text()).toBe('Found 1 result for ‘earth’')

    // Both groups exhausted: the combined heading reports the zero count and
    // neither empty section heading is shown.
    bookmarkedSearch.tvResults.value = []
    bookmarkedSearch.tvTotal.value = 0
    bookmarkedSearch.total.value = 0
    await nextTick()

    expect(wrapper.get('h1').text()).toBe('Found 0 results for ‘earth’')
    expect(sectionHeadings(wrapper)).toEqual([])
    wrapper.unmount()
  })
})

describe('Bookmarked page — search removals', () => {
  it('hides the Movie search section once its last result is removed while TV remains', async () => {
    setSearchResults({
      movies: [searchItem('MOVIE', 1)],
      tv: [searchItem('TV', 2)],
      movieTotal: 1,
      tvTotal: 1
    })

    const wrapper = await mountSuspended(BookmarkedPage)
    expect(sectionHeadings(wrapper)).toEqual([MOVIE_HEADING, TV_HEADING])

    // `useBookmarkedSearch()` drops the card and corrects the group total and
    // the combined total together.
    bookmarkedSearch.movieResults.value = []
    bookmarkedSearch.movieTotal.value = 0
    bookmarkedSearch.total.value = 1
    await nextTick()

    expect(sectionHeadings(wrapper)).toEqual([TV_HEADING])
    expect(cardTitles(wrapper)).toEqual(['Search TV 2'])
    expect(wrapper.get('h1').text()).toBe('Found 1 result for ‘earth’')
    wrapper.unmount()
  })

  it('hides the TV search section once its last result is removed while Movies remain', async () => {
    setSearchResults({
      movies: [searchItem('MOVIE', 1)],
      tv: [searchItem('TV', 2)],
      movieTotal: 1,
      tvTotal: 1
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    bookmarkedSearch.tvResults.value = []
    bookmarkedSearch.tvTotal.value = 0
    bookmarkedSearch.total.value = 1
    await nextTick()

    expect(sectionHeadings(wrapper)).toEqual([MOVIE_HEADING])
    expect(cardTitles(wrapper)).toEqual(['Search MOVIE 1'])
    expect(wrapper.get('h1').text()).toBe('Found 1 result for ‘earth’')
    wrapper.unmount()
  })

  it('reports zero results without section headings once the final search result is removed', async () => {
    setSearchResults({
      movies: [searchItem('MOVIE', 1)],
      tv: [searchItem('TV', 2)],
      movieTotal: 1,
      tvTotal: 1
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    bookmarkedSearch.movieResults.value = []
    bookmarkedSearch.movieTotal.value = 0
    bookmarkedSearch.tvResults.value = []
    bookmarkedSearch.tvTotal.value = 0
    bookmarkedSearch.total.value = 0
    await nextTick()

    expect(wrapper.get('h1').text()).toBe('Found 0 results for ‘earth’')
    expect(sectionHeadings(wrapper)).toEqual([])
    expect(cardTitles(wrapper)).toEqual([])
    wrapper.unmount()
  })
})

describe('Bookmarked page — search pending', () => {
  it('reserves the Movie search grid with skeletons', async () => {
    setBookmarkedSearch({
      activeQuery: 'earth',
      movies: { status: 'pending' },
      tv: {
        results: [searchItem('TV', 2)],
        status: 'success',
        total: 1
      },
      total: 1
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(
      section(wrapper, MOVIE_HEADING).findAllComponents(MediaCardSkeleton)
        .length
    ).toBeGreaterThan(1)
    // The successful TV group is not hidden by the pending Movie search.
    expect(cardTitles(wrapper)).toEqual(['Search TV 2'])
    wrapper.unmount()
  })

  it('reserves the TV search grid with skeletons', async () => {
    setBookmarkedSearch({
      activeQuery: 'earth',
      movies: {
        results: [searchItem('MOVIE', 1)],
        status: 'success',
        total: 1
      },
      tv: { status: 'pending' },
      total: 1
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(
      section(wrapper, TV_HEADING).findAllComponents(MediaCardSkeleton).length
    ).toBeGreaterThan(1)
    expect(cardTitles(wrapper)).toEqual(['Search MOVIE 1'])
    wrapper.unmount()
  })

  it('hides the normal Bookmarked content during a committed search', async () => {
    setBookmarked({
      movies: { items: [item('MOVIE', 10)] },
      tv: { items: [item('TV', 20)] }
    })
    setBookmarkedSearch({
      activeQuery: 'earth',
      movies: { status: 'pending' },
      tv: { status: 'pending' }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(wrapper.text()).not.toContain('MOVIE 10')
    expect(wrapper.text()).not.toContain('TV 20')
    expect(wrapper.text()).not.toContain(
      `You haven't bookmarked any shows yet.`
    )
    expect(sectionHeadings(wrapper)).toEqual([MOVIE_HEADING, TV_HEADING])
    wrapper.unmount()
  })
})

describe('Bookmarked page — search failure', () => {
  it('shows the safe Movie search error and preserves the TV search results', async () => {
    setBookmarkedSearch({
      activeQuery: 'earth',
      movies: { status: 'error', error: new Error('DB 500: unavailable') },
      tv: {
        results: [searchItem('TV', 2)],
        status: 'success',
        total: 1
      },
      total: 1
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    const error = section(wrapper, MOVIE_HEADING).get(
      '.bookmarked-section__error[role="alert"]'
    )
    expect(error.text()).toBe(
      'Bookmarked movie search is unavailable right now. Please try again later.'
    )
    expect(error.text()).not.toContain('DB')
    expect(error.text()).not.toContain('500')
    expect(cardTitles(wrapper)).toEqual(['Search TV 2'])
    expect(wrapper.find('h1').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the safe TV search error and preserves the Movie search results', async () => {
    setBookmarkedSearch({
      activeQuery: 'earth',
      movies: {
        results: [searchItem('MOVIE', 1)],
        status: 'success',
        total: 1
      },
      tv: { status: 'error', error: new Error('DB 500: unavailable') },
      total: 1
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    const error = section(wrapper, TV_HEADING).get(
      '.bookmarked-section__error[role="alert"]'
    )
    expect(error.text()).toBe(
      'Bookmarked TV search is unavailable right now. Please try again later.'
    )
    expect(error.text()).not.toContain('DB')
    expect(error.text()).not.toContain('500')
    expect(cardTitles(wrapper)).toEqual(['Search MOVIE 1'])
    expect(wrapper.find('h1').exists()).toBe(false)
    wrapper.unmount()
  })

  it('never reveals the normal Bookmarked content behind a failed search', async () => {
    setBookmarked({
      movies: { items: [item('MOVIE', 10)] },
      tv: { items: [item('TV', 20)] }
    })
    setBookmarkedSearch({
      activeQuery: 'earth',
      movies: { status: 'error', error: new Error('failed') },
      tv: { status: 'error', error: new Error('failed') }
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(cardTitles(wrapper)).toEqual([])
    expect(
      wrapper.findAll('.bookmarked-section__error[role="alert"]')
    ).toHaveLength(2)
    expect(wrapper.text()).not.toContain(
      `You haven't bookmarked any shows yet.`
    )
    wrapper.unmount()
  })
})

describe('Bookmarked page — search continuation', () => {
  it('wires the Movie search sentinel to the Movie search state', async () => {
    setBookmarkedSearch({
      activeQuery: 'earth',
      movies: {
        results: [searchItem('MOVIE', 1), searchItem('MOVIE', 2)],
        status: 'success',
        total: 42,
        hasMore: true
      },
      tv: {
        results: [searchItem('TV', 3)],
        status: 'success',
        total: 1
      },
      total: 43
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(
      section(wrapper, MOVIE_HEADING).getComponent(ProgressiveSentinel).props()
    ).toMatchObject({
      enabled: true,
      busy: false,
      loaded: 2,
      // The search backend total, not the rendered card count.
      total: 42
    })
    wrapper.unmount()
  })

  it('forwards the Movie search sentinel load event to the Movie search next page', async () => {
    setBookmarkedSearch({
      activeQuery: 'earth',
      movies: {
        results: [searchItem('MOVIE', 1)],
        status: 'success',
        total: 5,
        hasMore: true
      },
      tv: {
        results: [searchItem('TV', 2)],
        status: 'success',
        total: 1
      },
      total: 6
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    section(wrapper, MOVIE_HEADING)
      .getComponent(ProgressiveSentinel)
      .vm.$emit('load')

    expect(loadNextSearchMovies).toHaveBeenCalledTimes(1)
    expect(loadNextSearchTv).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('wires the TV search sentinel to the TV search state', async () => {
    setBookmarkedSearch({
      activeQuery: 'earth',
      movies: {
        results: [searchItem('MOVIE', 1)],
        status: 'success',
        total: 1
      },
      tv: {
        results: [searchItem('TV', 2)],
        status: 'success',
        total: 7,
        hasMore: false,
        isLoadingMore: true
      },
      total: 8
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    expect(
      section(wrapper, TV_HEADING).getComponent(ProgressiveSentinel).props()
    ).toMatchObject({
      enabled: false,
      busy: true,
      loaded: 1,
      total: 7
    })
    wrapper.unmount()
  })

  it('forwards the TV search sentinel load event to the TV search next page', async () => {
    setBookmarkedSearch({
      activeQuery: 'earth',
      movies: {
        results: [searchItem('MOVIE', 1)],
        status: 'success',
        total: 1
      },
      tv: {
        results: [searchItem('TV', 2)],
        status: 'success',
        total: 5,
        hasMore: true
      },
      total: 6
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    section(wrapper, TV_HEADING)
      .getComponent(ProgressiveSentinel)
      .vm.$emit('load')

    expect(loadNextSearchTv).toHaveBeenCalledTimes(1)
    expect(loadNextSearchMovies).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps the Movie search cards and reports a Movie continuation failure', async () => {
    setBookmarkedSearch({
      activeQuery: 'earth',
      movies: {
        results: [searchItem('MOVIE', 1)],
        status: 'success',
        error: new Error('continuation failed'),
        total: 5,
        hasMore: true
      },
      tv: {
        results: [searchItem('TV', 2)],
        status: 'success',
        total: 1
      },
      total: 6
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    const movie = section(wrapper, MOVIE_HEADING)
    expect(movie.findAllComponents(MediaCard)).toHaveLength(1)
    expect(movie.findAllComponents(MediaGrid)).toHaveLength(1)
    expect(movie.findComponent(ProgressiveSentinel).exists()).toBe(true)
    expect(movie.get('.bookmarked-section__error[role="status"]').text()).toBe(
      `Couldn't load more bookmarked movie results.`
    )

    // The TV search is untouched, and nothing retries automatically.
    expect(cardTitles(wrapper)).toEqual(['Search MOVIE 1', 'Search TV 2'])
    expect(
      section(wrapper, TV_HEADING).find('.bookmarked-section__error').exists()
    ).toBe(false)
    expect(loadNextSearchMovies).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps the TV search cards and reports a TV continuation failure', async () => {
    setBookmarkedSearch({
      activeQuery: 'earth',
      movies: {
        results: [searchItem('MOVIE', 1)],
        status: 'success',
        total: 1
      },
      tv: {
        results: [searchItem('TV', 2)],
        status: 'success',
        error: new Error('continuation failed'),
        total: 5,
        hasMore: true
      },
      total: 6
    })

    const wrapper = await mountSuspended(BookmarkedPage)

    const tv = section(wrapper, TV_HEADING)
    expect(tv.findAllComponents(MediaCard)).toHaveLength(1)
    expect(tv.findComponent(ProgressiveSentinel).exists()).toBe(true)
    expect(tv.get('.bookmarked-section__error[role="status"]').text()).toBe(
      `Couldn't load more bookmarked TV results.`
    )

    expect(cardTitles(wrapper)).toEqual(['Search MOVIE 1', 'Search TV 2'])
    expect(
      section(wrapper, MOVIE_HEADING)
        .find('.bookmarked-section__error')
        .exists()
    ).toBe(false)
    expect(loadNextSearchTv).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
