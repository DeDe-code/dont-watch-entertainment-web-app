import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaItem, MediaType } from '../../shared/contracts'
import type { HomeSectionStatus } from '../../app/composables/useHomeMedia'
import HomePage from '../../app/pages/index.vue'
import MediaCard from '../../app/components/MediaCard.vue'
import MediaCardSkeleton from '../../app/components/MediaCardSkeleton.vue'
import MediaGrid from '../../app/components/MediaGrid.vue'
import ProgressiveSentinel from '../../app/components/ProgressiveSentinel.vue'
import SearchBar from '../../app/components/SearchBar.vue'
import TrendingCard from '../../app/components/TrendingCard.vue'
import TrendingRail from '../../app/components/TrendingRail.vue'

// The page is a thin mapping from `useHomeMedia()` onto the media primitives,
// so the composable is stubbed at its boundary: these tests own the composition,
// the independent degradation, and the sentinel wiring — not the Home media
// lifecycle (covered by `use-home-media.test.ts`).
const { homeApi, loadRecommendedNext } = vi.hoisted(() => ({
  homeApi: { current: null as unknown },
  loadRecommendedNext: vi.fn()
}))

mockNuxtImport('useHomeMedia', () => () => homeApi.current)

// Search mode is driven by `useMediaSearch('all')`'s committed query, so the
// composable is stubbed the same way: these tests own the mode switch and the
// search wiring, while `use-media-search`'s own lifecycle is covered by
// `search.test.ts`.
const { searchApi, loadSearchNext } = vi.hoisted(() => ({
  searchApi: { current: null as unknown },
  loadSearchNext: vi.fn()
}))

mockNuxtImport('useMediaSearch', () => async () => searchApi.current)

// Cards integrate the real `useBookmarks`, which reads auth status.
const { bootstrapMock } = vi.hoisted(() => ({ bootstrapMock: vi.fn() }))

mockNuxtImport('useAuth', () => () => ({
  status: { value: 'authenticated' },
  bootstrap: bootstrapMock
}))

interface HomeState {
  trendingItems?: MediaItem[]
  trendingStatus?: HomeSectionStatus
  recommendedItems?: MediaItem[]
  recommendedStatus?: HomeSectionStatus
  recommendedError?: unknown
  recommendedHasMore?: boolean
  recommendedLoadingMore?: boolean
  recommendedTotal?: number
}

/** Installs the composable's public shape for the next mount. */
function setHome(state: HomeState = {}) {
  homeApi.current = {
    trendingItems: ref(state.trendingItems ?? []),
    trendingStatus: ref(state.trendingStatus ?? 'success'),
    trendingError: ref(null),
    recommendedItems: ref(state.recommendedItems ?? []),
    recommendedStatus: ref(state.recommendedStatus ?? 'success'),
    recommendedError: ref(state.recommendedError ?? null),
    recommendedHasMore: ref(state.recommendedHasMore ?? false),
    recommendedLoadingMore: ref(state.recommendedLoadingMore ?? false),
    recommendedTotal: ref(state.recommendedTotal ?? 0),
    loadRecommendedNext
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
  loadRecommendedNext.mockReset()
  loadSearchNext.mockReset()
  setHome()
  setSearch()
})

describe('Home page — structure', () => {
  it('renders the contextual SearchBar with the Figma Home placeholder', async () => {
    const wrapper = await mountSuspended(HomePage)

    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    expect(wrapper.get('.search-bar__input').attributes('placeholder')).toBe(
      'Search for movies or TV series'
    )
    wrapper.unmount()
  })

  it('renders the Trending and Recommended headings in Figma order', async () => {
    const wrapper = await mountSuspended(HomePage)

    const headings = wrapper.findAll('h2')
    expect(headings.map((heading) => heading.text())).toEqual([
      'Trending',
      'Recommended for you'
    ])
    wrapper.unmount()
  })
})

describe('Home page — Trending section', () => {
  it('renders exactly the Trending items supplied by useHomeMedia()', async () => {
    const trending = [
      item('MOVIE', 1),
      item('MOVIE', 2),
      item('TV', 3),
      item('MOVIE', 4),
      item('TV', 5)
    ]
    setHome({ trendingItems: trending })

    const wrapper = await mountSuspended(HomePage)

    // The rail primitive and the trending card primitive are used as-is: no
    // card markup is duplicated in the page.
    expect(wrapper.findComponent(TrendingRail).exists()).toBe(true)
    const cards = wrapper.findAllComponents(TrendingCard)
    expect(cards).toHaveLength(trending.length)
    expect(cards.map((card) => card.props('item').title)).toEqual(
      trending.map((entry) => entry.title)
    )
    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(0)
    wrapper.unmount()
  })

  it('marks only the first Trending card as priority-loaded', async () => {
    setHome({ trendingItems: [item('MOVIE', 1), item('MOVIE', 2)] })

    const wrapper = await mountSuspended(HomePage)

    const cards = wrapper.findAllComponents(TrendingCard)
    expect(cards[0]!.props('priority')).toBe(true)
    expect(cards[1]!.props('priority')).toBe(false)
    wrapper.unmount()
  })

  it('reserves the rail geometry with trending skeletons while pending', async () => {
    setHome({ trendingStatus: 'pending' })

    const wrapper = await mountSuspended(HomePage)

    const rail = wrapper.getComponent(TrendingRail)
    const skeletons = rail.findAllComponents(MediaCardSkeleton)
    expect(skeletons.length).toBeGreaterThan(0)
    expect(
      skeletons.every((skeleton) => skeleton.props('variant') === 'trending')
    ).toBe(true)
    expect(wrapper.findAllComponents(TrendingCard)).toHaveLength(0)
    wrapper.unmount()
  })
})

describe('Home page — Recommended section', () => {
  it('renders the Recommended grid from the supplied items', async () => {
    const recommended = [item('MOVIE', 10), item('TV', 11)]
    setHome({ recommendedItems: recommended })

    const wrapper = await mountSuspended(HomePage)

    expect(wrapper.findComponent(MediaGrid).exists()).toBe(true)
    const cards = wrapper.findAllComponents(MediaCard)
    expect(cards).toHaveLength(recommended.length)
    expect(cards.map((card) => card.props('item').title)).toEqual(
      recommended.map((entry) => entry.title)
    )
    wrapper.unmount()
  })

  it('reserves the grid geometry with card skeletons while pending', async () => {
    setHome({ recommendedStatus: 'pending' })

    const wrapper = await mountSuspended(HomePage)

    const grid = wrapper.getComponent(MediaGrid)
    const skeletons = grid.findAllComponents(MediaCardSkeleton)
    expect(skeletons.length).toBeGreaterThan(1)
    expect(
      skeletons.every((skeleton) => skeleton.props('variant') === 'card')
    ).toBe(true)
    wrapper.unmount()
  })

  it('wires the continuation sentinel to the composable state', async () => {
    setHome({
      recommendedItems: [item('MOVIE', 10), item('TV', 11)],
      recommendedHasMore: true,
      recommendedLoadingMore: false,
      recommendedTotal: 42
    })

    const wrapper = await mountSuspended(HomePage)

    expect(wrapper.getComponent(ProgressiveSentinel).props()).toMatchObject({
      enabled: true,
      busy: false,
      loaded: 2,
      // The backend total, not the rendered (duplicate-filtered) length.
      total: 42
    })
    wrapper.unmount()
  })

  it('forwards sentinel load events to loadRecommendedNext()', async () => {
    setHome({ recommendedItems: [item('MOVIE', 10)], recommendedHasMore: true })

    const wrapper = await mountSuspended(HomePage)

    wrapper.getComponent(ProgressiveSentinel).vm.$emit('load')
    expect(loadRecommendedNext).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})

describe('Home page — independent section failure', () => {
  it('keeps Recommended visible when Trending fails', async () => {
    setHome({
      trendingStatus: 'error',
      recommendedItems: [item('MOVIE', 10)]
    })

    const wrapper = await mountSuspended(HomePage)

    expect(wrapper.get('.home-section--trending').text()).toContain(
      'Trending is unavailable'
    )
    expect(wrapper.findComponent(TrendingRail).exists()).toBe(false)
    expect(wrapper.findAllComponents(TrendingCard)).toHaveLength(0)

    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    expect(wrapper.get('.home-section--recommended').text()).toContain(
      'Recommended for you'
    )
    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(1)
    wrapper.unmount()
  })

  it('keeps Trending visible when Recommended fails', async () => {
    setHome({
      trendingItems: [item('MOVIE', 1)],
      recommendedStatus: 'error',
      recommendedError: new Error('recommended unavailable')
    })

    const wrapper = await mountSuspended(HomePage)

    expect(wrapper.get('.home-section--recommended').text()).toContain(
      'Recommendations are unavailable'
    )
    expect(wrapper.findComponent(MediaGrid).exists()).toBe(false)
    expect(wrapper.findComponent(ProgressiveSentinel).exists()).toBe(false)

    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    expect(wrapper.findAllComponents(TrendingCard)).toHaveLength(1)
    wrapper.unmount()
  })

  it('keeps already-loaded Recommended items when a continuation fails', async () => {
    setHome({
      recommendedItems: [item('MOVIE', 10)],
      recommendedHasMore: true,
      recommendedError: new Error('continuation failed')
    })

    const wrapper = await mountSuspended(HomePage)

    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(1)
    expect(wrapper.findComponent(ProgressiveSentinel).exists()).toBe(true)
    expect(wrapper.get('.home-section__error[role="status"]').text()).toContain(
      'load more recommendations'
    )
    wrapper.unmount()
  })
})

describe('Home page — search mode', () => {
  it('shows the normal Home sections while no query is committed', async () => {
    setHome({ trendingItems: [item('MOVIE', 1)] })

    const wrapper = await mountSuspended(HomePage)

    expect(wrapper.find('.home-section--search').exists()).toBe(false)
    expect(wrapper.find('.home-section--trending').exists()).toBe(true)
    expect(wrapper.find('.home-section--recommended').exists()).toBe(true)
    wrapper.unmount()
  })

  it('replaces both normal Home sections once a query is committed', async () => {
    setHome({
      trendingItems: [item('MOVIE', 1)],
      recommendedItems: [item('MOVIE', 2)]
    })
    setSearch({ activeQuery: 'earth', status: 'success', total: 1 })

    const wrapper = await mountSuspended(HomePage)

    expect(wrapper.find('.home-section--trending').exists()).toBe(false)
    expect(wrapper.find('.home-section--recommended').exists()).toBe(false)
    expect(wrapper.findComponent(TrendingRail).exists()).toBe(false)
    expect(wrapper.findComponent(TrendingCard).exists()).toBe(false)
    expect(wrapper.find('.home-section--search').exists()).toBe(true)
    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    wrapper.unmount()
  })

  it('uses the committed query, not the typed field, to choose the dataset', async () => {
    setHome({ trendingItems: [item('MOVIE', 1)] })
    // Field ahead of the URL: still the normal Home dataset, exactly as the
    // composable reports it while a keystroke is being debounced.
    setSearch({ query: 'earth', activeQuery: '' })

    const wrapper = await mountSuspended(HomePage)

    expect(wrapper.find('.home-section--trending').exists()).toBe(true)
    expect(wrapper.find('.home-section--search').exists()).toBe(false)
    wrapper.unmount()
  })

  it('binds the SearchBar to the composable query ref', async () => {
    const search = setSearch({
      query: 'ear',
      activeQuery: 'earth',
      status: 'success'
    })

    const wrapper = await mountSuspended(HomePage)

    const input = wrapper.get('.search-bar__input')
    expect((input.element as HTMLInputElement).value).toBe('ear')

    await input.setValue('eart')
    expect(search.query.value).toBe('eart')
    wrapper.unmount()
  })

  it('renders the Figma result-count heading from the committed query and total', async () => {
    setSearch({ activeQuery: 'Earth', status: 'success', total: 2 })

    const wrapper = await mountSuspended(HomePage)

    expect(
      wrapper.get('.home-section--search .home-section__heading').text()
    ).toBe('Found 2 results for ‘Earth’')
    wrapper.unmount()
  })

  it('updates the heading when the committed query changes', async () => {
    const search = setSearch({
      activeQuery: 'Earth',
      status: 'success',
      total: 2
    })

    const wrapper = await mountSuspended(HomePage)

    search.activeQuery.value = 'Mars'
    await nextTick()

    expect(
      wrapper.get('.home-section--search .home-section__heading').text()
    ).toBe('Found 2 results for ‘Mars’')
    wrapper.unmount()
  })

  it('renders search results through the shared MediaGrid and MediaCard primitives', async () => {
    const results = [item('MOVIE', 21), item('TV', 22)]
    setSearch({ activeQuery: 'earth', status: 'success', total: 2, results })

    const wrapper = await mountSuspended(HomePage)

    expect(
      wrapper.find('.home-section--search').findComponent(MediaGrid).exists()
    ).toBe(true)
    const cards = wrapper.findAllComponents(MediaCard)
    expect(cards.map((card) => card.props('item').title)).toEqual(
      results.map((entry) => entry.title)
    )
    wrapper.unmount()
  })

  it('wires the search continuation sentinel to the composable state', async () => {
    setSearch({
      activeQuery: 'earth',
      status: 'success',
      results: [item('MOVIE', 21), item('TV', 22)],
      hasMore: true,
      isLoadingMore: false,
      total: 42
    })

    const wrapper = await mountSuspended(HomePage)

    expect(wrapper.getComponent(ProgressiveSentinel).props()).toMatchObject({
      enabled: true,
      busy: false,
      loaded: 2,
      // The backend total, not the currently loaded length.
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

    const wrapper = await mountSuspended(HomePage)

    wrapper.getComponent(ProgressiveSentinel).vm.$emit('load')
    expect(loadSearchNext).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('keeps search mode while the committed query is pending', async () => {
    setHome({ trendingItems: [item('MOVIE', 1)] })
    setSearch({ activeQuery: 'earth', status: 'pending' })

    const wrapper = await mountSuspended(HomePage)

    expect(wrapper.find('.home-section--search').exists()).toBe(true)
    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    expect(wrapper.find('.home-section--trending').exists()).toBe(false)
    expect(wrapper.find('.home-section--recommended').exists()).toBe(false)
    expect(wrapper.findAllComponents(MediaCardSkeleton).length).toBeGreaterThan(
      1
    )
    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(0)
    wrapper.unmount()
  })

  it('keeps search mode when page 1 fails', async () => {
    setHome({ trendingItems: [item('MOVIE', 1)] })
    setSearch({
      activeQuery: 'earth',
      status: 'error',
      error: new Error('search unavailable')
    })

    const wrapper = await mountSuspended(HomePage)

    expect(wrapper.find('.home-section--search').exists()).toBe(true)
    expect(wrapper.findComponent(SearchBar).exists()).toBe(true)
    expect(wrapper.get('.home-section__error[role="alert"]').text()).toContain(
      'Search is unavailable'
    )
    expect(wrapper.findComponent(MediaGrid).exists()).toBe(false)
    expect(wrapper.find('.home-section--trending').exists()).toBe(false)
    wrapper.unmount()
  })

  it('stays in search mode for a successful zero-result search', async () => {
    setHome({ trendingItems: [item('MOVIE', 1)] })
    setSearch({ activeQuery: 'zzz', status: 'success', total: 0, results: [] })

    const wrapper = await mountSuspended(HomePage)

    expect(
      wrapper.get('.home-section--search .home-section__heading').text()
    ).toBe('Found 0 results for ‘zzz’')
    expect(wrapper.findComponent(MediaGrid).exists()).toBe(true)
    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(0)
    expect(wrapper.find('.home-section--trending').exists()).toBe(false)
    expect(wrapper.find('.home-section--recommended').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps loaded search results when the continuation fails', async () => {
    setSearch({
      activeQuery: 'earth',
      status: 'success',
      results: [item('MOVIE', 21)],
      total: 42,
      hasMore: true,
      error: new Error('continuation failed')
    })

    const wrapper = await mountSuspended(HomePage)

    expect(wrapper.findAllComponents(MediaCard)).toHaveLength(1)
    expect(wrapper.findComponent(ProgressiveSentinel).exists()).toBe(true)
    expect(wrapper.get('.home-section__error[role="status"]').text()).toContain(
      'load more results'
    )
    wrapper.unmount()
  })

  it('restores the normal Home when the committed query is cleared', async () => {
    setHome({
      trendingItems: [item('MOVIE', 1)],
      recommendedItems: [item('MOVIE', 2)]
    })
    const search = setSearch({
      activeQuery: 'earth',
      status: 'success',
      total: 2,
      results: [item('MOVIE', 21)]
    })

    const wrapper = await mountSuspended(HomePage)
    expect(wrapper.find('.home-section--search').exists()).toBe(true)

    search.activeQuery.value = ''
    search.status.value = 'idle'
    await nextTick()

    expect(wrapper.find('.home-section--search').exists()).toBe(false)
    expect(wrapper.find('.home-section--trending').exists()).toBe(true)
    expect(wrapper.find('.home-section--recommended').exists()).toBe(true)
    wrapper.unmount()
  })
})
