import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { clearNuxtState, useNuxtApp } from '#app'
import { useToast } from '#imports'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaItem } from '../../shared/contracts'
import App from '../../app/app.vue'
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
const { bootstrapMock, fetchMock } = vi.hoisted(() => ({
  bootstrapMock: vi.fn(),
  fetchMock: vi.fn()
}))

mockNuxtImport('useAuth', () => () => ({
  status: { value: 'authenticated' },
  bootstrap: bootstrapMock
}))

// `$fetch` is an auto-import in Nuxt 4.5, not a global, so bookmark requests
// are intercepted at the auto-import boundary. Anything else Nuxt fetches
// during a mount keeps the real implementation.
mockNuxtImport(
  '$fetch',
  (original: typeof globalThis.$fetch) =>
    (request: string, options?: unknown) =>
      request.startsWith('/api/bookmarks')
        ? fetchMock(request, options)
        : original(request as never, options as never)
)

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
  beforeEach(async () => {
    // The bookmark map is shared app state that outlives a mounted card, so
    // each case starts empty to keep seeding and sync assertions unambiguous.
    // Clearing all state also drops notices added by an earlier case.
    await clearNuxtState()
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(undefined)
  })

  // Notices are read through the public toast composable rather than Nuxt UI's
  // state key; `runWithContext` supplies the app context `inject` needs outside
  // of a component setup.
  function currentNotices() {
    return useNuxtApp().runWithContext(() => useToast().toasts.value)
  }

  // The shell, not the card, owns the regions that announce bookmark failures,
  // so these cases mount the real `App` with the card in the page slot. The
  // stubs keep the mount on that path: `NuxtLayout` only forwards its slot and
  // `NuxtPage` stands in for the page that renders the card.
  const SlotPassthrough = defineComponent({
    render() {
      return h('div', this.$slots.default?.())
    }
  })

  function mountAppShell() {
    return mountSuspended(App, {
      global: {
        stubs: {
          NuxtLayout: SlotPassthrough,
          NuxtPage: defineComponent({
            render: () => h(MediaCard, { item: makeItem() })
          })
        }
      }
    })
  }

  function announcedTexts(shell: VueWrapper) {
    return shell
      .findAll('.app-bookmark-announcer [role="alert"]')
      .map((region) => region.text())
  }

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

  it('keeps an empty failure live region in the shell before any failure', async () => {
    const shell = await mountAppShell()
    const announcer = shell.get('.app-bookmark-announcer')
    const regions = announcer.findAll('[role="alert"]')

    // The region is present and exposed from the first paint, before any toast
    // exists: assistive technology ignores a live region that is inserted with
    // its content, so the announcement must not depend on the toast's arrival.
    expect(currentNotices()).toHaveLength(0)
    expect(regions).toHaveLength(2)
    expect(regions.map((region) => region.text())).toEqual(['', ''])
    expect(announcer.classes()).toContain('sr-only')
    expect(announcer.attributes('aria-hidden')).toBeUndefined()
    expect(regions.map((region) => region.attributes('aria-live'))).toEqual([
      'assertive',
      'assertive'
    ])
    expect(regions.map((region) => region.attributes('aria-atomic'))).toEqual([
      'true',
      'true'
    ])
    shell.unmount()
  })

  it('shows the toast and announces the failure through the shell', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Bookmark service unavailable'))
    const shell = await mountAppShell()
    const bookmark = shell.get('.media-card__bookmark')

    await bookmark.trigger('click')
    await flushPromises()

    // The rollback completed before the notice was added, so the card never
    // claims a bookmark the API rejected.
    expect(bookmark.attributes('aria-pressed')).toBe('false')
    expect(currentNotices()).toHaveLength(1)
    expect(currentNotices()[0]).toMatchObject({
      title: 'Bookmark update failed',
      description: 'Please try again.',
      color: 'error'
    })
    expect(JSON.stringify(currentNotices()[0])).not.toContain(
      'Bookmark service unavailable'
    )

    // The visible toast is unchanged; the shell region carries the same
    // user-friendly wording as one spoken sentence.
    expect(document.body.textContent).toContain('Bookmark update failed')
    expect(announcedTexts(shell)).toContain(
      'Bookmark update failed Please try again.'
    )
    shell.unmount()
  })

  it('announces repeated identical failures in a fresh region each time', async () => {
    fetchMock.mockRejectedValue(new Error('down'))
    const shell = await mountAppShell()
    const bookmark = shell.get('.media-card__bookmark')

    await bookmark.trigger('click')
    await flushPromises()
    expect(announcedTexts(shell)).toEqual([
      'Bookmark update failed Please try again.',
      ''
    ])

    await bookmark.trigger('click')
    await flushPromises()

    // The second failure moves the identical message to the other region, so
    // writing over announced text cannot make the repeat silent.
    expect(announcedTexts(shell)).toEqual([
      '',
      'Bookmark update failed Please try again.'
    ])
    shell.unmount()
  })

  it('reports a rejected TrendingCard removal without losing its bookmark', async () => {
    fetchMock.mockRejectedValueOnce(new Error('remove failed'))
    const wrapper = await mountSuspended(TrendingCard, {
      props: { item: makeItem({ isBookmarked: true }) }
    })
    const bookmark = wrapper.get('.media-trending-card__bookmark')

    await bookmark.trigger('click')
    await flushPromises()

    expect(bookmark.attributes('aria-pressed')).toBe('true')
    expect(currentNotices()).toHaveLength(1)
    wrapper.unmount()
  })

  it('reports a failed mutation once, not once per ignored duplicate click', async () => {
    let rejectRequest!: (error: unknown) => void
    fetchMock.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRequest = reject
      })
    )

    const wrapper = await mountSuspended(MediaCard, {
      props: { item: makeItem() }
    })
    const bookmark = wrapper.get('.media-card__bookmark')

    await bookmark.trigger('click')
    await bookmark.trigger('click')

    expect(fetchMock).toHaveBeenCalledTimes(1)

    rejectRequest(new Error('nope'))
    await flushPromises()

    expect(currentNotices()).toHaveLength(1)
    expect(bookmark.attributes('aria-pressed')).toBe('false')
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
