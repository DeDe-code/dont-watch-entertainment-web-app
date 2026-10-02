import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaItem, MediaType } from '../../shared/contracts'
import type { MoviesSectionStatus } from '../../app/composables/useMoviesMedia'
import MoviesPage from '../../app/pages/movies/index.vue'
import MediaCard from '../../app/components/MediaCard.vue'
import MediaCardSkeleton from '../../app/components/MediaCardSkeleton.vue'
import MediaGrid from '../../app/components/MediaGrid.vue'
import ProgressiveSentinel from '../../app/components/ProgressiveSentinel.vue'
import SearchBar from '../../app/components/SearchBar.vue'

// The page is a thin mapping from `useMoviesMedia()` and `useMediaSearch()`
// onto the media primitives, so both composables are stubbed at their
// boundaries: these tests own the composition, the Movies/search mode switch,
// and the sentinel wiring — not the media lifecycles, which
// `use-movies-media.test.ts` and `search.test.ts` cover.
const { moviesApi, loadNext, retryMovies } = vi.hoisted(() => ({
  moviesApi: { current: null as unknown },
  loadNext: vi.fn(),
  retryMovies: vi.fn()
}))

mockNuxtImport('useMoviesMedia', () => () => moviesApi.current)

// Search mode is driven by `useMediaSearch('movie')`'s committed query, so that
// composable is stubbed at its boundary too: these tests own the Movies mode
// switch and the search wiring, while the search lifecycle itself is covered by
// `search.test.ts`.
const { searchApi, loadSearchNext, retrySearch, searchScope } = vi.hoisted(
  () => ({
    searchApi: { current: null as unknown },
    loadSearchNext: vi.fn(),
    retrySearch: vi.fn(),
    searchScope: { current: null as string | null }
  })
)

mockNuxtImport('useMediaSearch', () => async (scope: string) => {
  searchScope.current = scope
  return searchApi.current
})

// Cards integrate the real `useBookmarks`, which reads auth status.
const { bootstrapMock } = vi.hoisted(() => ({ bootstrapMock: vi.fn() }))

mockNuxtImport('useAuth', () => () => ({
  status: { value: 'authenticated' },
  bootstrap: bootstrapMock
}))

interface MoviesState {
  items?: MediaItem[]
  status?: MoviesSectionStatus
  error?: unknown
  total?: number
  hasMore?: boolean
  isLoadingMore?: boolean
}

/** Installs the composable's public shape for the next mount. */
function setMovies(state: MoviesState = {}) {
  moviesApi.current = {
    items: ref(state.items ?? []),
    status: ref<MoviesSectionStatus>(state.status ?? 'success'),
    error: ref(state.error ?? null),
    total: ref(state.total ?? 0),
    retryMovies,
    hasMore: ref(state.hasMore ?? false),
    isLoadingMore: ref(state.isLoadingMore ?? false),
    loadNext
  }
}

type SearchStatus = 'idle' | 'pending' | 'success' | 'error'

interface SearchState {
  /** The typed field value, which may run ahead of the committed query. */
  query?: string
  /** The committed query: the URL value the visible dataset belongs to. */
  activeQuery?: string
  results?: MediaItem[]
  total?: number
  status?: SearchStatus
  error?: unknown
  hasMore?: boolean
  isLoadingMore?: boolean
}

/**
 * Installs the search composable's public shape and returns its refs, so a test
 * can commit or clear a query after mount and observe the mode switch.
 */
function setSearch(state: SearchState = {}) {
  const refs = {
    query: ref(state.query ?? ''),
    activeQuery: ref(state.activeQuery ?? ''),
    results: ref<MediaItem[]>(state.results ?? []),
    total: ref(state.total ?? 0),
    status: ref<SearchStatus>(state.status ?? 'idle'),
    error: ref<unknown>(state.error ?? null),
    hasMore: ref(state.hasMore ?? false),
    isLoadingMore: ref(state.isLoadingMore ?? false),
    retry: retrySearch,
    loadNext: loadSearchNext
  }
  searchApi.current = refs
  return refs
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

beforeEach(() => {
  loadNext.mockReset()
  retryMovies.mockReset()
  loadSearchNext.mockReset()
  retrySearch.mockReset()
  searchScope.current = null
  setMovies()
  setSearch()
})

describe('Movies page — structure', () => {
  it('renders the contextual SearchBar with the Figma Movies placeholder', async () => {
    const wrapper = await mountSuspended(MoviesPage)

    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    expect(wrapper.get('.search-bar__input').attributes('placeholder')).toBe(
      'Search for movies'
    )
    wrapper.unmount()
  })

  it('renders the Movies heading', async () => {
    const wrapper = await mountSuspended(MoviesPage)

    expect(wrapper.get('h1').text()).toBe('Movies')
    wrapper.unmount()
  })

  it('searches the movie scope through useMediaSearch()', async () => {
    await mountSuspended(MoviesPage)

    expect(searchScope.current).toBe('movie')
  })
})

describe('Movies page — list', () => {
  it('renders exactly the items supplied by useMoviesMedia() through the grid', async () => {
    const movies = [item('MOVIE', 10), item('MOVIE', 11), item('MOVIE', 12)]
    setMovies({ items: movies })

    const wrapper = await mountSuspended(MoviesPage)

    // The grid and card primitives are used as-is: no markup is duplicated.
    expect(wrapper.findComponent(MediaGrid).exists()).toBe(true)
    const cards = wrapper.findAllComponents(MediaCard)
    expect(cards).toHaveLength(movies.length)
    expect(cards.map((card) => card.props('item').title)).toEqual(
      movies.map((entry) => entry.title)
    )
    wrapper.unmount()
  })

  it('reserves the grid geometry with card skeletons while page 1 is pending', async () => {
    setMovies({ status: 'pending' })

    const wrapper = await mountSuspended(MoviesPage)

    const grid = wrapper.getComponent(MediaGrid)
    const skeletons = grid.findAllComponents(MediaCardSkeleton)
    expect(skeletons.length).toBeGreaterThan(1)
    expect(
      skeletons.every((skeleton) => skeleton.props('variant') === 'card')
    ).toBe(true)
    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(0)

    // The loading state is not a page-wide replacement.
    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    expect(wrapper.get('h1').text()).toBe('Movies')
    wrapper.unmount()
  })

  it('shows a safe error with a Retry action and hides the grid when page 1 fails', async () => {
    setMovies({
      status: 'error',
      error: new Error('TMDB 500: provider unavailable')
    })

    const wrapper = await mountSuspended(MoviesPage)

    const error = wrapper.get('.movies-page__error[role="alert"]')
    expect(error.text()).toContain(
      'Movies are unavailable right now. Please try again later.'
    )
    expect(error.text()).not.toContain('TMDB')
    expect(error.text()).not.toContain('500')

    // Retry re-runs only the normal Movies request.
    await error.get('.movies-page__retry').trigger('click')
    expect(retryMovies).toHaveBeenCalledTimes(1)
    expect(loadNext).not.toHaveBeenCalled()

    expect(wrapper.findComponent(MediaGrid).exists()).toBe(false)
    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(0)
    expect(wrapper.findComponent(ProgressiveSentinel).exists()).toBe(false)

    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    expect(wrapper.get('h1').text()).toBe('Movies')
    wrapper.unmount()
  })
})

describe('Movies page — progressive continuation', () => {
  it('wires the sentinel to the composable state', async () => {
    setMovies({
      items: [item('MOVIE', 10), item('MOVIE', 11)],
      hasMore: true,
      isLoadingMore: false,
      total: 42
    })

    const wrapper = await mountSuspended(MoviesPage)

    expect(wrapper.getComponent(ProgressiveSentinel).props()).toMatchObject({
      enabled: true,
      busy: false,
      loaded: 2,
      // The backend total, not the rendered card count.
      total: 42
    })
    wrapper.unmount()
  })

  it('forwards sentinel load events to loadNext()', async () => {
    setMovies({ items: [item('MOVIE', 10)], hasMore: true })

    const wrapper = await mountSuspended(MoviesPage)

    wrapper.getComponent(ProgressiveSentinel).vm.$emit('load')
    expect(loadNext).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('keeps the loaded cards and reports a continuation failure accessibly', async () => {
    setMovies({
      items: [item('MOVIE', 10)],
      hasMore: true,
      error: new Error('continuation failed')
    })

    const wrapper = await mountSuspended(MoviesPage)

    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(1)
    expect(wrapper.findComponent(ProgressiveSentinel).exists()).toBe(true)
    const error = wrapper.get('.movies-page__error[role="status"]')
    expect(error.text()).toContain(`Couldn't load more movies.`)
    // No automatic retry: a failed continuation never re-triggers `loadNext`.
    expect(loadNext).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('retries the failed continuation page without clearing the loaded cards', async () => {
    setMovies({
      items: [item('MOVIE', 10)],
      hasMore: true,
      error: new Error('continuation failed')
    })

    const wrapper = await mountSuspended(MoviesPage)

    await wrapper.get('.movies-page__retry').trigger('click')

    // Retry reuses the continuation request, not the page-1 refresh, and the
    // loaded cards stay on screen while it is in flight.
    expect(loadNext).toHaveBeenCalledTimes(1)
    expect(retryMovies).not.toHaveBeenCalled()
    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(1)
    wrapper.unmount()
  })
})

describe('Movies page — search mode', () => {
  it('binds the SearchBar to the composable query ref', async () => {
    const search = setSearch({
      query: 'ear',
      activeQuery: 'earth',
      status: 'success'
    })

    const wrapper = await mountSuspended(MoviesPage)

    const input = wrapper.get('.search-bar__input')
    expect((input.element as HTMLInputElement).value).toBe('ear')

    await input.setValue('eart')
    expect(search.query.value).toBe('eart')
    wrapper.unmount()
  })

  it('uses the committed query, not the typed field, to choose the dataset', async () => {
    setMovies({ items: [item('MOVIE', 1)] })
    // Field ahead of the URL: still normal Movies, exactly as the composable
    // reports it while a keystroke is being debounced.
    setSearch({ query: 'earth', activeQuery: '' })

    const wrapper = await mountSuspended(MoviesPage)

    expect(wrapper.get('h1').text()).toBe('Movies')
    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(1)
    wrapper.unmount()
  })

  it('replaces the normal Movies content once a query is committed', async () => {
    setMovies({ items: [item('MOVIE', 1)] })
    setSearch({
      activeQuery: 'earth',
      status: 'success',
      total: 2,
      results: [item('MOVIE', 21), item('MOVIE', 22)]
    })

    const wrapper = await mountSuspended(MoviesPage)

    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    const cards = wrapper.findAllComponents(MediaCard)
    expect(cards.map((card) => card.props('item').title)).toEqual([
      'MOVIE 21',
      'MOVIE 22'
    ])
    // The normal Movies heading is gone, not just the normal items.
    expect(wrapper.find('h1').text()).toBe('Found 2 results for ‘earth’')
    wrapper.unmount()
  })

  it('renders the result-count heading from the backend total and committed query', async () => {
    setSearch({ activeQuery: 'Earth', status: 'success', total: 2 })

    const wrapper = await mountSuspended(MoviesPage)

    expect(wrapper.get('h1').text()).toBe('Found 2 results for ‘Earth’')
    wrapper.unmount()
  })

  it('uses singular grammar for exactly one result', async () => {
    setSearch({ activeQuery: 'Earth', status: 'success', total: 1 })

    const wrapper = await mountSuspended(MoviesPage)

    expect(wrapper.get('h1').text()).toBe('Found 1 result for ‘Earth’')
    wrapper.unmount()
  })

  it('hides the result-count heading while search page 1 is pending', async () => {
    setSearch({ activeQuery: 'earth', status: 'pending', total: 0 })

    const wrapper = await mountSuspended(MoviesPage)

    expect(wrapper.find('h1').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps search mode with skeletons instead of falling back to normal Movies', async () => {
    setMovies({ items: [item('MOVIE', 1)], status: 'success' })
    setSearch({ activeQuery: 'earth', status: 'pending' })

    const wrapper = await mountSuspended(MoviesPage)

    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    expect(wrapper.findAllComponents(MediaCardSkeleton).length).toBeGreaterThan(
      1
    )
    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(0)
    expect(wrapper.findComponent(MediaGrid).exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders search results through the shared MediaGrid and MediaCard primitives', async () => {
    const results = [item('MOVIE', 21), item('MOVIE', 22)]
    setSearch({ activeQuery: 'earth', status: 'success', total: 2, results })

    const wrapper = await mountSuspended(MoviesPage)

    expect(wrapper.findComponent(MediaGrid).exists()).toBe(true)
    const cards = wrapper.findAllComponents(MediaCard)
    expect(cards.map((card) => card.props('item').title)).toEqual(
      results.map((entry) => entry.title)
    )
    wrapper.unmount()
  })

  it('stays in search mode and shows a safe alert when page 1 fails', async () => {
    setMovies({ items: [item('MOVIE', 1)] })
    setSearch({
      activeQuery: 'earth',
      status: 'error',
      error: new Error('TMDB 500: provider unavailable')
    })

    const wrapper = await mountSuspended(MoviesPage)

    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    const error = wrapper.get('.movies-page__error[role="alert"]')
    expect(error.text()).toContain(
      'Search is unavailable right now. Please try again later.'
    )
    expect(error.text()).not.toContain('TMDB')
    expect(error.text()).not.toContain('500')

    // Retry re-runs only the search page-1 read, not the continuation.
    await error.get('.movies-page__retry').trigger('click')
    expect(retrySearch).toHaveBeenCalledTimes(1)
    expect(loadSearchNext).not.toHaveBeenCalled()

    // The normal Movies list is not revealed underneath a failed search.
    expect(wrapper.findComponent(MediaGrid).exists()).toBe(false)
    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(0)
    expect(wrapper.findComponent(ProgressiveSentinel).exists()).toBe(false)
    wrapper.unmount()
  })

  it('wires the search sentinel to the composable state', async () => {
    setSearch({
      activeQuery: 'earth',
      status: 'success',
      results: [item('MOVIE', 21), item('MOVIE', 22)],
      hasMore: true,
      isLoadingMore: false,
      total: 42
    })

    const wrapper = await mountSuspended(MoviesPage)

    expect(wrapper.getComponent(ProgressiveSentinel).props()).toMatchObject({
      enabled: true,
      busy: false,
      loaded: 2,
      // The backend search total, not the rendered card count.
      total: 42
    })
    wrapper.unmount()
  })

  it('forwards sentinel load events to the search loadNext()', async () => {
    setSearch({
      activeQuery: 'earth',
      status: 'success',
      results: [item('MOVIE', 21)],
      hasMore: true,
      total: 42
    })

    const wrapper = await mountSuspended(MoviesPage)

    wrapper.getComponent(ProgressiveSentinel).vm.$emit('load')
    expect(loadSearchNext).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('keeps loaded search results and reports a continuation failure accessibly', async () => {
    setSearch({
      activeQuery: 'earth',
      status: 'success',
      results: [item('MOVIE', 21)],
      total: 42,
      hasMore: true,
      error: new Error('continuation failed')
    })

    const wrapper = await mountSuspended(MoviesPage)

    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(1)
    expect(wrapper.findComponent(ProgressiveSentinel).exists()).toBe(true)
    const error = wrapper.get('.movies-page__error[role="status"]')
    expect(error.text()).toContain(`Couldn't load more results.`)
    // No automatic retry: a failed continuation never re-triggers the sentinel.
    expect(loadSearchNext).not.toHaveBeenCalled()

    // Retry reuses the continuation request, not the page-1 refresh, and the
    // loaded results stay on screen while it is in flight.
    await error.get('.movies-page__retry').trigger('click')
    expect(loadSearchNext).toHaveBeenCalledTimes(1)
    expect(retrySearch).not.toHaveBeenCalled()
    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(1)
    wrapper.unmount()
  })

  it('restores normal Movies when the committed query is cleared', async () => {
    setMovies({ items: [item('MOVIE', 1)] })
    const search = setSearch({
      activeQuery: 'earth',
      status: 'success',
      total: 2,
      results: [item('MOVIE', 21)]
    })

    const wrapper = await mountSuspended(MoviesPage)
    expect(wrapper.get('h1').text()).toBe('Found 2 results for ‘earth’')

    search.activeQuery.value = ''
    search.status.value = 'idle'
    await nextTick()

    expect(wrapper.get('h1').text()).toBe('Movies')
    const cards = wrapper.findAllComponents(MediaCard)
    expect(cards).toHaveLength(1)
    expect(cards[0]!.props('item').title).toBe('MOVIE 1')
    wrapper.unmount()
  })
})
