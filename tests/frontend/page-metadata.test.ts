import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HomePage from '../../app/pages/index.vue'
import MoviesPage from '../../app/pages/movies/index.vue'
import TvSeriesPage from '../../app/pages/tv-series/index.vue'
import BookmarkedPage from '../../app/pages/bookmarked/index.vue'
import LoginPage from '../../app/pages/login/index.vue'
import SignupPage from '../../app/pages/signup/index.vue'

// Metadata is declared through Nuxt's `useSeoMeta()`, so that composable is
// stubbed at its boundary: these tests own what each route declares (title,
// description, and the public-page Open Graph mirror), not how unhead renders
// it. Every media/auth composable a page composes is stubbed to a settled empty
// state for the same reason — metadata must not depend on loaded data.
const { seoMeta, bootstrap, stubs } = vi.hoisted(() => ({
  seoMeta: vi.fn(),
  bootstrap: vi.fn(),
  stubs: {
    home: { current: null as unknown },
    movies: { current: null as unknown },
    tv: { current: null as unknown },
    bookmarkedMedia: { current: null as unknown },
    bookmarkedSearch: { current: null as unknown },
    mediaSearch: { current: null as unknown }
  }
}))

mockNuxtImport('useSeoMeta', () => seoMeta)
mockNuxtImport('useHomeMedia', () => () => stubs.home.current)
mockNuxtImport('useMoviesMedia', () => () => stubs.movies.current)
mockNuxtImport('useTvMedia', () => () => stubs.tv.current)
mockNuxtImport('useBookmarkedMedia', () => () => stubs.bookmarkedMedia.current)
mockNuxtImport(
  'useBookmarkedSearch',
  () => () => stubs.bookmarkedSearch.current
)
mockNuxtImport('useMediaSearch', () => async () => stubs.mediaSearch.current)
mockNuxtImport('useAuth', () => () => ({
  status: { value: 'anonymous' },
  bootstrap
}))

/** A settled, empty paged-search shape shared by the search composable stubs. */
function searchStub() {
  return {
    query: ref(''),
    activeQuery: ref(''),
    results: ref([]),
    total: ref(0),
    status: ref('idle'),
    error: ref(null),
    retry: vi.fn(),
    hasMore: ref(false),
    isLoadingMore: ref(false),
    loadNext: vi.fn()
  }
}

beforeEach(() => {
  seoMeta.mockReset()
  bootstrap.mockReset()
  bootstrap.mockResolvedValue(undefined)

  stubs.mediaSearch.current = searchStub()

  stubs.home.current = {
    trendingItems: ref([]),
    trendingStatus: ref('success'),
    retryTrending: vi.fn(),
    recommendedItems: ref([]),
    recommendedStatus: ref('success'),
    recommendedError: ref(null),
    retryRecommended: vi.fn(),
    recommendedHasMore: ref(false),
    recommendedLoadingMore: ref(false),
    recommendedTotal: ref(0),
    loadRecommendedNext: vi.fn()
  }

  stubs.movies.current = {
    items: ref([]),
    status: ref('success'),
    error: ref(null),
    total: ref(0),
    retryMovies: vi.fn(),
    hasMore: ref(false),
    isLoadingMore: ref(false),
    loadNext: vi.fn()
  }

  stubs.tv.current = {
    items: ref([]),
    status: ref('success'),
    error: ref(null),
    total: ref(0),
    retryTvSeries: vi.fn(),
    hasMore: ref(false),
    isLoadingMore: ref(false),
    loadNext: vi.fn()
  }

  stubs.bookmarkedMedia.current = {
    movieItems: ref([]),
    movieStatus: ref('success'),
    movieError: ref(null),
    movieTotal: ref(0),
    retryMovies: vi.fn(),
    movieHasMore: ref(false),
    movieIsLoadingMore: ref(false),
    loadNextMovies: vi.fn(),
    tvItems: ref([]),
    tvStatus: ref('success'),
    tvError: ref(null),
    tvTotal: ref(0),
    retryTv: vi.fn(),
    tvHasMore: ref(false),
    tvIsLoadingMore: ref(false),
    loadNextTv: vi.fn()
  }

  stubs.bookmarkedSearch.current = {
    query: ref(''),
    activeQuery: ref(''),
    movieResults: ref([]),
    movieStatus: ref('idle'),
    movieError: ref(null),
    movieTotal: ref(0),
    retryMovies: vi.fn(),
    movieHasMore: ref(false),
    movieIsLoadingMore: ref(false),
    loadNextMovies: vi.fn(),
    tvResults: ref([]),
    tvStatus: ref('idle'),
    tvError: ref(null),
    tvTotal: ref(0),
    retryTv: vi.fn(),
    tvHasMore: ref(false),
    tvIsLoadingMore: ref(false),
    loadNextTv: vi.fn(),
    total: ref(0)
  }
})

/** Mounts a page and returns the metadata object it declared. */
async function declaredMetadata(component: unknown, route: string) {
  const wrapper = await mountSuspended(component as never, { route })
  const metadata = seoMeta.mock.calls.at(-1)?.[0] as
    | Record<string, unknown>
    | undefined
  wrapper.unmount()
  return metadata
}

describe('page metadata', () => {
  it('declares the Home title and description with Open Graph mirrors', async () => {
    const metadata = await declaredMetadata(HomePage, '/')
    const description = `Browse trending and recommended movies and TV series on Don't Watch Entertainment.`

    expect(metadata).toMatchObject({
      title: 'Home',
      description,
      ogTitle: 'Home',
      ogDescription: description
    })
  })

  it('declares the Movies title and description with Open Graph mirrors', async () => {
    const metadata = await declaredMetadata(MoviesPage, '/movies')
    const description = `Browse movies and discover what's trending on Don't Watch Entertainment.`

    expect(metadata).toMatchObject({
      title: 'Movies',
      description,
      ogTitle: 'Movies',
      ogDescription: description
    })
  })

  it('declares the TV Series title and description with Open Graph mirrors', async () => {
    const metadata = await declaredMetadata(TvSeriesPage, '/tv-series')
    const description = `Browse TV series and discover what's trending on Don't Watch Entertainment.`

    expect(metadata).toMatchObject({
      title: 'TV Series',
      description,
      ogTitle: 'TV Series',
      ogDescription: description
    })
  })

  it('declares the Bookmarked title and description without Open Graph tags', async () => {
    const metadata = await declaredMetadata(BookmarkedPage, '/bookmarked')

    expect(metadata).toMatchObject({
      title: 'Bookmarked',
      description: 'Your bookmarked movies and TV series in one place.'
    })
    expect(metadata).not.toHaveProperty('ogTitle')
    expect(metadata).not.toHaveProperty('ogDescription')
  })

  it('declares the Login title and description with Open Graph mirrors', async () => {
    const metadata = await declaredMetadata(LoginPage, '/login')
    const description = `Log in to your Don't Watch Entertainment account.`

    expect(metadata).toMatchObject({
      title: 'Login',
      description,
      ogTitle: 'Login',
      ogDescription: description
    })
  })

  it('declares the Sign Up title and description with Open Graph mirrors', async () => {
    const metadata = await declaredMetadata(SignupPage, '/signup')
    const description = `Create a Don't Watch Entertainment account to bookmark movies and TV series.`

    expect(metadata).toMatchObject({
      title: 'Sign Up',
      description,
      ogTitle: 'Sign Up',
      ogDescription: description
    })
  })
})
