import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaItem, MediaType } from '../../shared/contracts'
import type { TvSectionStatus } from '../../app/composables/useTvMedia'
import TvSeriesPage from '../../app/pages/tv-series/index.vue'
import MediaCard from '../../app/components/MediaCard.vue'
import MediaCardSkeleton from '../../app/components/MediaCardSkeleton.vue'
import MediaGrid from '../../app/components/MediaGrid.vue'
import ProgressiveSentinel from '../../app/components/ProgressiveSentinel.vue'
import SearchBar from '../../app/components/SearchBar.vue'

// The page is a thin mapping from `useTvMedia()` and `useMediaSearch()` onto
// the media primitives, so both composables are stubbed at their boundaries:
// these tests own the composition, the TV/search mode switch, and the sentinel
// wiring — not the media lifecycles, which `use-tv-media.test.ts` and
// `search.test.ts` cover.
const { tvApi, loadNext } = vi.hoisted(() => ({
  tvApi: { current: null as unknown },
  loadNext: vi.fn()
}))

mockNuxtImport('useTvMedia', () => () => tvApi.current)

// Search mode is driven by `useMediaSearch('tv')`'s committed query, so that
// composable is stubbed at its boundary too: these tests own the TV mode switch
// and the search wiring, while the search lifecycle itself is covered by
// `search.test.ts`.
const { searchApi, loadSearchNext, searchScope } = vi.hoisted(() => ({
  searchApi: { current: null as unknown },
  loadSearchNext: vi.fn(),
  searchScope: { current: null as string | null }
}))

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

interface TvState {
  items?: MediaItem[]
  status?: TvSectionStatus
  error?: unknown
  total?: number
  hasMore?: boolean
  isLoadingMore?: boolean
}

/** Installs the composable's public shape for the next mount. */
function setTv(state: TvState = {}) {
  tvApi.current = {
    items: ref(state.items ?? []),
    status: ref<TvSectionStatus>(state.status ?? 'success'),
    error: ref(state.error ?? null),
    total: ref(state.total ?? 0),
    hasMore: ref(state.hasMore ?? false),
    isLoadingMore: ref(state.isLoadingMore ?? false),
    loadNext
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

function tvItem(externalId: number): MediaItem {
  return item('TV', externalId)
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
    loadNext: loadSearchNext
  }
  searchApi.current = refs
  return refs
}

beforeEach(() => {
  loadNext.mockReset()
  loadSearchNext.mockReset()
  searchScope.current = null
  setTv()
  setSearch()
})

describe('TV Series page — structure', () => {
  it('renders the contextual SearchBar with the Figma TV placeholder', async () => {
    const wrapper = await mountSuspended(TvSeriesPage)

    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    expect(wrapper.get('.search-bar__input').attributes('placeholder')).toBe(
      'Search for TV series'
    )
    wrapper.unmount()
  })

  it('renders the TV Series heading', async () => {
    const wrapper = await mountSuspended(TvSeriesPage)

    expect(wrapper.get('h1').text()).toBe('TV Series')
    wrapper.unmount()
  })

  it('searches the tv scope through useMediaSearch()', async () => {
    await mountSuspended(TvSeriesPage)

    expect(searchScope.current).toBe('tv')
  })
})

describe('TV Series page — list', () => {
  it('renders exactly the items supplied by useTvMedia() through the grid', async () => {
    const series = [tvItem(10), tvItem(11), tvItem(12)]
    setTv({ items: series })

    const wrapper = await mountSuspended(TvSeriesPage)

    // The grid and card primitives are used as-is: no markup is duplicated.
    expect(wrapper.findComponent(MediaGrid).exists()).toBe(true)
    const cards = wrapper.findAllComponents(MediaCard)
    expect(cards).toHaveLength(series.length)
    expect(cards.map((card) => card.props('item').title)).toEqual(
      series.map((entry) => entry.title)
    )
    wrapper.unmount()
  })

  it('reserves the grid geometry with card skeletons while page 1 is pending', async () => {
    setTv({ status: 'pending' })

    const wrapper = await mountSuspended(TvSeriesPage)

    const grid = wrapper.getComponent(MediaGrid)
    const skeletons = grid.findAllComponents(MediaCardSkeleton)
    expect(skeletons.length).toBeGreaterThan(1)
    expect(
      skeletons.every((skeleton) => skeleton.props('variant') === 'card')
    ).toBe(true)
    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(0)

    // The loading state is not a page-wide replacement.
    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    expect(wrapper.get('.search-bar__input').attributes('placeholder')).toBe(
      'Search for TV series'
    )
    expect(wrapper.get('h1').text()).toBe('TV Series')
    wrapper.unmount()
  })

  it('shows a safe error and hides the grid when page 1 fails', async () => {
    setTv({
      status: 'error',
      error: new Error('TMDB 500: provider unavailable')
    })

    const wrapper = await mountSuspended(TvSeriesPage)

    const error = wrapper.get('.tv-page__error[role="alert"]')
    expect(error.text()).toBe(
      'TV series are unavailable right now. Please try again later.'
    )
    expect(error.text()).not.toContain('TMDB')
    expect(error.text()).not.toContain('500')

    expect(wrapper.findComponent(MediaGrid).exists()).toBe(false)
    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(0)
    expect(wrapper.findComponent(ProgressiveSentinel).exists()).toBe(false)

    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    expect(wrapper.get('h1').text()).toBe('TV Series')
    wrapper.unmount()
  })
})

describe('TV Series page — progressive continuation', () => {
  it('wires the sentinel to the composable state', async () => {
    setTv({
      items: [tvItem(10), tvItem(11)],
      hasMore: true,
      isLoadingMore: false,
      total: 42
    })

    const wrapper = await mountSuspended(TvSeriesPage)

    expect(wrapper.getComponent(ProgressiveSentinel).props()).toMatchObject({
      enabled: true,
      busy: false,
      loaded: 2,
      // The backend total, not the rendered card count.
      total: 42
    })
    wrapper.unmount()
  })

  it('reports an in-flight continuation to the sentinel', async () => {
    setTv({ items: [tvItem(10)], hasMore: true, isLoadingMore: true })

    const wrapper = await mountSuspended(TvSeriesPage)

    expect(wrapper.getComponent(ProgressiveSentinel).props('busy')).toBe(true)
    wrapper.unmount()
  })

  it('forwards sentinel load events to loadNext()', async () => {
    setTv({ items: [tvItem(10)], hasMore: true })

    const wrapper = await mountSuspended(TvSeriesPage)

    wrapper.getComponent(ProgressiveSentinel).vm.$emit('load')
    expect(loadNext).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('keeps the loaded cards and reports a continuation failure accessibly', async () => {
    setTv({
      items: [tvItem(10)],
      hasMore: true,
      error: new Error('continuation failed')
    })

    const wrapper = await mountSuspended(TvSeriesPage)

    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(1)
    expect(wrapper.findComponent(MediaGrid).exists()).toBe(true)
    expect(wrapper.findComponent(ProgressiveSentinel).exists()).toBe(true)
    expect(wrapper.get('.tv-page__error[role="status"]').text()).toBe(
      `Couldn't load more TV series.`
    )
    // No automatic retry: a failed continuation never re-triggers `loadNext`.
    expect(loadNext).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('TV Series page — search mode', () => {
  it('binds the SearchBar to the composable query ref', async () => {
    const search = setSearch({
      query: 'ear',
      activeQuery: 'earth',
      status: 'success'
    })

    const wrapper = await mountSuspended(TvSeriesPage)

    const input = wrapper.get('.search-bar__input')
    expect((input.element as HTMLInputElement).value).toBe('ear')

    await input.setValue('eart')
    expect(search.query.value).toBe('eart')
    wrapper.unmount()
  })

  it('uses the committed query, not the typed field, to choose the dataset', async () => {
    setTv({ items: [tvItem(1)] })
    // Field ahead of the URL: still normal TV Series, exactly as the composable
    // reports it while a keystroke is being debounced.
    setSearch({ query: 'earth', activeQuery: '' })

    const wrapper = await mountSuspended(TvSeriesPage)

    expect(wrapper.get('h1').text()).toBe('TV Series')
    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(1)
    wrapper.unmount()
  })

  it('replaces the normal TV content once a query is committed', async () => {
    setTv({ items: [tvItem(1)] })
    setSearch({
      activeQuery: 'earth',
      status: 'success',
      total: 2,
      results: [tvItem(21), tvItem(22)]
    })

    const wrapper = await mountSuspended(TvSeriesPage)

    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    const cards = wrapper.findAllComponents(MediaCard)
    expect(cards.map((card) => card.props('item').title)).toEqual([
      'TV 21',
      'TV 22'
    ])
    // The normal TV heading is gone, not just the normal items.
    expect(wrapper.find('h1').text()).toBe('Found 2 results for ‘earth’')
    wrapper.unmount()
  })

  it('renders the result-count heading from the backend total and committed query', async () => {
    setSearch({ activeQuery: 'Earth', status: 'success', total: 2 })

    const wrapper = await mountSuspended(TvSeriesPage)

    expect(wrapper.get('h1').text()).toBe('Found 2 results for ‘Earth’')
    wrapper.unmount()
  })

  it('uses singular grammar for exactly one result', async () => {
    setSearch({ activeQuery: 'Earth', status: 'success', total: 1 })

    const wrapper = await mountSuspended(TvSeriesPage)

    expect(wrapper.get('h1').text()).toBe('Found 1 result for ‘Earth’')
    wrapper.unmount()
  })

  it('hides the result-count heading while search page 1 is pending', async () => {
    setSearch({ activeQuery: 'earth', status: 'pending', total: 0 })

    const wrapper = await mountSuspended(TvSeriesPage)

    expect(wrapper.find('h1').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps search mode with skeletons instead of falling back to normal TV', async () => {
    setTv({ items: [tvItem(1)], status: 'success' })
    setSearch({ activeQuery: 'earth', status: 'pending' })

    const wrapper = await mountSuspended(TvSeriesPage)

    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    expect(wrapper.findAllComponents(MediaCardSkeleton).length).toBeGreaterThan(
      1
    )
    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(0)
    expect(wrapper.findComponent(MediaGrid).exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders search results through the shared MediaGrid and MediaCard primitives', async () => {
    const results = [tvItem(21), tvItem(22)]
    setSearch({ activeQuery: 'earth', status: 'success', total: 2, results })

    const wrapper = await mountSuspended(TvSeriesPage)

    expect(wrapper.findComponent(MediaGrid).exists()).toBe(true)
    const cards = wrapper.findAllComponents(MediaCard)
    expect(cards.map((card) => card.props('item').title)).toEqual(
      results.map((entry) => entry.title)
    )
    wrapper.unmount()
  })

  it('stays in search mode and shows a safe alert when page 1 fails', async () => {
    setTv({ items: [tvItem(1)] })
    setSearch({
      activeQuery: 'earth',
      status: 'error',
      error: new Error('TMDB 500: provider unavailable')
    })

    const wrapper = await mountSuspended(TvSeriesPage)

    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    const error = wrapper.get('.tv-page__error[role="alert"]')
    expect(error.text()).toBe(
      'Search is unavailable right now. Please try again later.'
    )
    expect(error.text()).not.toContain('TMDB')
    expect(error.text()).not.toContain('500')

    // The normal TV list is not revealed underneath a failed search, and the
    // result-count heading is not shown either.
    expect(wrapper.find('h1').exists()).toBe(false)
    expect(wrapper.findComponent(MediaGrid).exists()).toBe(false)
    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(0)
    expect(wrapper.findComponent(ProgressiveSentinel).exists()).toBe(false)
    wrapper.unmount()
  })

  it('wires the search sentinel to the composable state', async () => {
    setSearch({
      activeQuery: 'earth',
      status: 'success',
      results: [tvItem(21), tvItem(22)],
      hasMore: true,
      isLoadingMore: false,
      total: 42
    })

    const wrapper = await mountSuspended(TvSeriesPage)

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
      results: [tvItem(21)],
      hasMore: true,
      total: 42
    })

    const wrapper = await mountSuspended(TvSeriesPage)

    wrapper.getComponent(ProgressiveSentinel).vm.$emit('load')
    expect(loadSearchNext).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('keeps loaded search results and reports a continuation failure accessibly', async () => {
    setSearch({
      activeQuery: 'earth',
      status: 'success',
      results: [tvItem(21)],
      total: 42,
      hasMore: true,
      error: new Error('continuation failed')
    })

    const wrapper = await mountSuspended(TvSeriesPage)

    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(1)
    expect(wrapper.findComponent(ProgressiveSentinel).exists()).toBe(true)
    expect(wrapper.get('h1').text()).toBe('Found 42 results for ‘earth’')
    expect(wrapper.get('.tv-page__error[role="status"]').text()).toBe(
      `Couldn't load more results.`
    )
    // No automatic retry: a failed continuation never re-triggers the sentinel.
    expect(loadSearchNext).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('restores normal TV Series when the committed query is cleared', async () => {
    setTv({ items: [tvItem(1)] })
    const search = setSearch({
      activeQuery: 'earth',
      status: 'success',
      total: 2,
      results: [tvItem(21)]
    })

    const wrapper = await mountSuspended(TvSeriesPage)
    expect(wrapper.get('h1').text()).toBe('Found 2 results for ‘earth’')

    search.activeQuery.value = ''
    search.status.value = 'idle'
    await nextTick()

    expect(wrapper.get('h1').text()).toBe('TV Series')
    const cards = wrapper.findAllComponents(MediaCard)
    expect(cards).toHaveLength(1)
    expect(cards[0]!.props('item').title).toBe('TV 1')
    wrapper.unmount()
  })
})
