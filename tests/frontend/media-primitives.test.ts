import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { clearNuxtState } from '#app'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaItem } from '../../shared/contracts'
import BookmarkButton from '../../app/components/BookmarkButton.vue'
import MediaCard from '../../app/components/MediaCard.vue'
import MediaCardSkeleton from '../../app/components/MediaCardSkeleton.vue'
import MediaGrid from '../../app/components/MediaGrid.vue'
import MediaMeta from '../../app/components/MediaMeta.vue'
import PlayOverlay from '../../app/components/PlayOverlay.vue'
import TrendingCard from '../../app/components/TrendingCard.vue'
import TrendingRail from '../../app/components/TrendingRail.vue'

// Cards integrate the real `useBookmarks`, which reads auth status. Auth is
// mocked at the composable boundary so these tests exercise bookmark wiring
// rather than /me bootstrapping (covered by the use-auth tests).
const { bootstrapMock } = vi.hoisted(() => ({ bootstrapMock: vi.fn() }))

mockNuxtImport('useAuth', () => () => ({
  status: { value: 'authenticated' },
  bootstrap: bootstrapMock
}))

function makeItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    externalId: 1,
    mediaType: 'MOVIE',
    title: 'The Great Lands',
    year: 2019,
    posterPath: '/poster.jpg',
    backdropPath: '/backdrop.jpg',
    overview: null,
    contentRating: 'PG',
    isTrending: false,
    isBookmarked: false,
    ...overrides
  }
}

describe('MediaMeta', () => {
  it('separates year, media type and rating with dots', async () => {
    const wrapper = await mountSuspended(MediaMeta, {
      props: { mediaType: 'MOVIE', year: 2019, contentRating: 'PG' }
    })

    expect(wrapper.text()).toContain('2019')
    expect(wrapper.text()).toContain('Movie')
    expect(wrapper.text()).toContain('PG')
    expect(wrapper.findAll('.media-meta__dot')).toHaveLength(2)
    expect(wrapper.get('.media-meta__icon').exists()).toBe(true)
    wrapper.unmount()
  })

  it('drops the year and its separator when the year is missing', async () => {
    const wrapper = await mountSuspended(MediaMeta, {
      props: { mediaType: 'MOVIE', year: null, contentRating: 'PG' }
    })

    expect(wrapper.text()).not.toContain('null')
    expect(wrapper.text()).toContain('Movie')
    expect(wrapper.findAll('.media-meta__dot')).toHaveLength(1)
    wrapper.unmount()
  })

  it('drops the rating and its separator when the rating is missing', async () => {
    const wrapper = await mountSuspended(MediaMeta, {
      props: { mediaType: 'MOVIE', year: 2019, contentRating: null }
    })

    expect(wrapper.text()).toContain('2019')
    expect(wrapper.findAll('.media-meta__dot')).toHaveLength(1)
    wrapper.unmount()
  })

  it('renders only the media type when year and rating are both missing', async () => {
    const wrapper = await mountSuspended(MediaMeta, {
      props: { mediaType: 'TV', year: null, contentRating: null }
    })

    expect(wrapper.text()).toContain('TV Series')
    expect(wrapper.findAll('.media-meta__dot')).toHaveLength(0)
    wrapper.unmount()
  })
})

describe('BookmarkButton', () => {
  it('exposes the unbookmarked state and emits toggle on click', async () => {
    const wrapper = await mountSuspended(BookmarkButton, {
      props: { bookmarked: false, title: 'The Great Lands' }
    })

    const button = wrapper.get('button')
    expect(button.attributes('aria-pressed')).toBe('false')
    expect(button.attributes('aria-label')).toBe(
      'Add bookmark for The Great Lands'
    )

    await button.trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
    wrapper.unmount()
  })

  it('exposes the bookmarked state and swaps the icon', async () => {
    const unbookmarked = await mountSuspended(BookmarkButton, {
      props: { bookmarked: false }
    })
    const bookmarked = await mountSuspended(BookmarkButton, {
      props: { bookmarked: true }
    })

    expect(bookmarked.get('button').attributes('aria-pressed')).toBe('true')
    expect(bookmarked.get('button').attributes('aria-label')).toBe(
      'Remove bookmark'
    )
    // The outline → filled swap must actually change the rendered icon.
    expect(bookmarked.get('.media-bookmark__icon').html()).not.toBe(
      unbookmarked.get('.media-bookmark__icon').html()
    )

    unbookmarked.unmount()
    bookmarked.unmount()
  })
})

describe('PlayOverlay', () => {
  it('is inert presentation: hidden from AT, not focusable, not a button', async () => {
    const wrapper = await mountSuspended(PlayOverlay)

    const overlay = wrapper.get('.media-play')
    expect(overlay.attributes('aria-hidden')).toBe('true')
    expect(overlay.attributes('tabindex')).toBeUndefined()
    expect(overlay.find('button').exists()).toBe(false)
    expect(overlay.find('a').exists()).toBe(false)
    expect(wrapper.text()).toContain('Play')
    wrapper.unmount()
  })
})

describe('MediaCard', () => {
  it('renders the card content, metadata, bookmark and play overlay', async () => {
    const wrapper = await mountSuspended(MediaCard, {
      props: { item: makeItem() }
    })

    expect(wrapper.get('.media-card__title').text()).toBe('The Great Lands')
    expect(wrapper.get('.media-meta').text()).toContain('Movie')
    expect(wrapper.find('.media-card__bookmark').exists()).toBe(true)
    // The play treatment lives inside the clipped thumbnail and stays inert.
    const play = wrapper.get('.media-card__thumb .media-card__play')
    expect(play.attributes('aria-hidden')).toBe('true')
    expect(play.find('button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('builds a responsive, lazy backdrop that preserves its box', async () => {
    const wrapper = await mountSuspended(MediaCard, {
      props: { item: makeItem() }
    })

    const image = wrapper.get('img')
    expect(image.attributes('src')).toBe(
      'https://image.tmdb.org/t/p/w500/backdrop.jpg'
    )
    expect(image.attributes('srcset')).toBe(
      [
        'https://image.tmdb.org/t/p/w300/backdrop.jpg 300w',
        'https://image.tmdb.org/t/p/w500/backdrop.jpg 500w'
      ].join(', ')
    )
    expect(image.attributes('sizes')).toBeTruthy()
    expect(image.attributes('loading')).toBe('lazy')
    expect(image.attributes('alt')).toBe('')
    wrapper.unmount()
  })

  it('loads the backdrop eagerly when the card is above the fold', async () => {
    const wrapper = await mountSuspended(MediaCard, {
      props: { item: makeItem(), priority: true }
    })

    const image = wrapper.get('img')
    expect(image.attributes('loading')).toBe('eager')
    expect(image.attributes('fetchpriority')).toBe('high')
    wrapper.unmount()
  })

  it('falls back to the neutral placeholder when there is no backdrop', async () => {
    const wrapper = await mountSuspended(MediaCard, {
      props: { item: makeItem({ backdropPath: null }) }
    })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.media-card__thumb').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('TrendingCard', () => {
  it('renders the overlaid metadata, title and bookmark', async () => {
    const wrapper = await mountSuspended(TrendingCard, {
      props: { item: makeItem({ mediaType: 'TV', title: 'Beyond Earth' }) }
    })

    const info = wrapper.get(
      '.media-trending-card__thumb .media-trending-card__info'
    )
    expect(info.text()).toContain('Beyond Earth')
    expect(info.text()).toContain('TV Series')
    expect(
      wrapper.get('.media-trending-card__info .media-meta').classes()
    ).toContain('media-meta--trending')
    expect(wrapper.find('.media-trending-card__bookmark').exists()).toBe(true)
    expect(wrapper.find('.media-trending-card__play').exists()).toBe(true)
    wrapper.unmount()
  })

  it('requests the large trending image candidate', async () => {
    const wrapper = await mountSuspended(TrendingCard, {
      props: { item: makeItem() }
    })

    const image = wrapper.get('img')
    expect(image.attributes('src')).toBe(
      'https://image.tmdb.org/t/p/w780/backdrop.jpg'
    )
    expect(image.attributes('srcset')).toBe(
      'https://image.tmdb.org/t/p/w780/backdrop.jpg 780w'
    )
    wrapper.unmount()
  })
})

describe('TrendingRail', () => {
  it('is a labelled, focusable scroll region that renders its cards', async () => {
    const wrapper = await mountSuspended(TrendingRail, {
      props: { label: 'Trending' },
      slots: { default: '<p class="rail-item">card</p>' }
    })

    const rail = wrapper.get('.media-rail')
    expect(rail.attributes('role')).toBe('group')
    expect(rail.attributes('aria-label')).toBe('Trending')
    expect(rail.attributes('tabindex')).toBe('0')
    expect(rail.get('.rail-item').text()).toBe('card')
    wrapper.unmount()
  })
})

describe('MediaGrid', () => {
  it('renders its items inside the responsive grid container', async () => {
    const wrapper = await mountSuspended(MediaGrid, {
      slots: { default: '<p class="grid-item">card</p>' }
    })

    expect(wrapper.get('.media-grid').get('.grid-item').text()).toBe('card')
    wrapper.unmount()
  })
})

describe('MediaCardSkeleton', () => {
  it('reserves the regular card geometry with metadata and title lines', async () => {
    const wrapper = await mountSuspended(MediaCardSkeleton)

    expect(wrapper.get('.media-skeleton').classes()).toContain(
      'media-skeleton--card'
    )
    expect(wrapper.find('.media-skeleton__thumb').exists()).toBe(true)
    expect(wrapper.findAll('.media-skeleton__line')).toHaveLength(2)
    wrapper.unmount()
  })

  it('reserves only the trending thumbnail for a trending placeholder', async () => {
    const wrapper = await mountSuspended(MediaCardSkeleton, {
      props: { variant: 'trending' }
    })

    expect(wrapper.get('.media-skeleton').classes()).toContain(
      'media-skeleton--trending'
    )
    expect(wrapper.find('.media-skeleton__thumb').exists()).toBe(true)
    expect(wrapper.find('.media-skeleton__lines').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('card bookmark integration', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    // The bookmark map is shared app state that outlives a mounted card, so
    // each case starts empty to keep seeding and sync assertions unambiguous.
    await clearNuxtState()
    fetchMock = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('$fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('seeds and renders an initially bookmarked item as bookmarked', async () => {
    const wrapper = await mountSuspended(MediaCard, {
      props: { item: makeItem({ isBookmarked: true }) }
    })

    expect(
      wrapper.get('.media-card__bookmark').attributes('aria-pressed')
    ).toBe('true')
    wrapper.unmount()
  })

  it('seeds and renders an initially unbookmarked item as unbookmarked', async () => {
    const wrapper = await mountSuspended(MediaCard, {
      props: { item: makeItem({ isBookmarked: false }) }
    })

    expect(
      wrapper.get('.media-card__bookmark').attributes('aria-pressed')
    ).toBe('false')
    wrapper.unmount()
  })

  it('sends one identity-only mutation when its bookmark button is clicked', async () => {
    const wrapper = await mountSuspended(MediaCard, {
      props: { item: makeItem() }
    })

    const bookmark = wrapper.get('.media-card__bookmark')
    expect(bookmark.attributes('aria-pressed')).toBe('false')

    await bookmark.trigger('click')

    // The optimistic flip is already visible before the request settles.
    expect(bookmark.attributes('aria-pressed')).toBe('true')
    expect(bookmark.attributes('aria-label')).toBe(
      'Remove bookmark for The Great Lands'
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/bookmarks', {
      method: 'POST',
      body: { provider: 'TMDB', externalId: 1, mediaType: 'MOVIE' }
    })
    wrapper.unmount()
  })

  it('updates every MediaCard rendering the same identity', async () => {
    const first = await mountSuspended(MediaCard, {
      props: { item: makeItem() }
    })
    const second = await mountSuspended(MediaCard, {
      props: { item: makeItem() }
    })

    await first.get('.media-card__bookmark').trigger('click')

    expect(first.get('.media-card__bookmark').attributes('aria-pressed')).toBe(
      'true'
    )
    expect(second.get('.media-card__bookmark').attributes('aria-pressed')).toBe(
      'true'
    )
    first.unmount()
    second.unmount()
  })

  it('keeps MediaCard and TrendingCard for the same identity in sync', async () => {
    const card = await mountSuspended(MediaCard, {
      props: { item: makeItem() }
    })
    const trending = await mountSuspended(TrendingCard, {
      props: { item: makeItem() }
    })

    await card.get('.media-card__bookmark').trigger('click')

    expect(
      trending.get('.media-trending-card__bookmark').attributes('aria-pressed')
    ).toBe('true')

    await trending.get('.media-trending-card__bookmark').trigger('click')

    expect(card.get('.media-card__bookmark').attributes('aria-pressed')).toBe(
      'false'
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/bookmarks/TMDB/1/MOVIE', {
      method: 'DELETE'
    })
    card.unmount()
    trending.unmount()
  })

  it('issues a single request for rapid duplicate clicks', async () => {
    let resolveRequest!: () => void
    const inFlight = new Promise<void>((resolve) => {
      resolveRequest = resolve
    })
    fetchMock.mockReturnValue(inFlight)

    const wrapper = await mountSuspended(MediaCard, {
      props: { item: makeItem() }
    })
    const bookmark = wrapper.get('.media-card__bookmark')

    await bookmark.trigger('click')
    await bookmark.trigger('click')
    await bookmark.trigger('click')

    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveRequest()
    await flushPromises()
    wrapper.unmount()
  })

  it('preserves the card presentation while the bookmark is wired', async () => {
    const wrapper = await mountSuspended(MediaCard, {
      props: { item: makeItem({ isBookmarked: true }) }
    })

    expect(wrapper.get('.media-card__title').text()).toBe('The Great Lands')
    expect(wrapper.get('.media-card__image').attributes('src')).toBe(
      'https://image.tmdb.org/t/p/w500/backdrop.jpg'
    )
    expect(wrapper.find('.media-card__thumb .media-card__play').exists()).toBe(
      true
    )
    wrapper.unmount()
  })
})
