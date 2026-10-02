import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { clearNuxtData, clearNuxtState } from '#app'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick, type PropType } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaItem, PaginatedMedia } from '../../shared/contracts'
import ProgressiveSentinel from '../../app/components/ProgressiveSentinel.vue'
import SearchBar from '../../app/components/SearchBar.vue'
import {
  useMediaSearch,
  type MediaSearchScope
} from '../../app/composables/useMediaSearch'

const { requestFetch } = vi.hoisted(() => ({ requestFetch: vi.fn() }))

mockNuxtImport('useRequestFetch', () => () => requestFetch)

/**
 * Deterministic stand-in for the browser observer: tests decide when the
 * sentinel is visible instead of relying on real layout.
 */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  private elements: Element[] = []

  constructor(private callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this)
  }

  observe(element: Element) {
    this.elements.push(element)
  }

  unobserve() {}

  disconnect() {
    this.elements = []
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  trigger(isIntersecting: boolean) {
    this.callback(
      this.elements.map(
        (target) =>
          ({ isIntersecting, target }) as unknown as IntersectionObserverEntry
      ),
      this as unknown as IntersectionObserver
    )
  }
}

function latestSentinel() {
  const observer = FakeIntersectionObserver.instances.at(-1)
  if (!observer) throw new Error('No sentinel was observed')
  return observer
}

function item(id: number, title: string): MediaItem {
  return {
    externalId: id,
    mediaType: 'MOVIE',
    title,
    year: 2019,
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
  totalPages: number,
  totalResults = data.length
): PaginatedMedia {
  return { data, meta: { page: pageNumber, totalPages, totalResults } }
}

let apiFetch: ReturnType<typeof vi.fn>
let originalFetch: typeof globalThis.$fetch

beforeEach(async () => {
  await clearNuxtState()
  // useAsyncData keeps its page-1 response in the payload cache; clear it so
  // each mount starts from the handler instead of a previous test's response.
  clearNuxtData()
  FakeIntersectionObserver.instances = []
  requestFetch.mockReset()
  vi.stubGlobal(
    'IntersectionObserver',
    FakeIntersectionObserver as unknown as typeof IntersectionObserver
  )
  originalFetch = globalThis.$fetch
  apiFetch = vi.fn()
  vi.stubGlobal('$fetch', (request: string, options?: unknown) =>
    request === '/api/media/search'
      ? apiFetch(request, options)
      : originalFetch(request as never, options as never)
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('SearchBar', () => {
  it('exposes the contextual placeholder and an accessible name', async () => {
    const wrapper = await mountSuspended(SearchBar, {
      props: {
        modelValue: '',
        label: 'Search movies',
        placeholder: 'Search for movies'
      }
    })

    const input = wrapper.get('input')
    expect(wrapper.get('[role="search"]').exists()).toBe(true)
    expect(input.attributes('placeholder')).toBe('Search for movies')
    expect(input.attributes('aria-label')).toBe('Search movies')
    expect(input.attributes('tabindex')).toBeUndefined()
    expect(wrapper.get('.search-bar__field').exists()).toBe(true)
    // The search glyph is decorative; the accessible name lives on the input.
    expect(wrapper.get('.search-bar__icon').attributes('aria-hidden')).toBe(
      'true'
    )
    wrapper.unmount()
  })

  it('round-trips the value through v-model', async () => {
    const wrapper = await mountSuspended(SearchBar, {
      props: { modelValue: 'earth' }
    })

    const input = wrapper.get('input')
    expect((input.element as HTMLInputElement).value).toBe('earth')

    await input.setValue('mars')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['mars'])
    wrapper.unmount()
  })

  it('is keyboard focusable and swallows Enter instead of submitting', async () => {
    const wrapper = await mountSuspended(SearchBar, {
      props: { modelValue: '' },
      attachTo: document.body
    })

    const input = wrapper.get('input')
    ;(input.element as HTMLInputElement).focus()
    expect(document.activeElement).toBe(input.element)

    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
    wrapper.unmount()
  })
})

const SearchHarness = defineComponent({
  props: {
    scope: { type: String as PropType<MediaSearchScope>, required: true }
  },
  setup: async (props) => {
    const search = await useMediaSearch(props.scope)

    // The v-model handler keeps its own literal: the `update:modelValue` event
    // name must stay quoted, and mixing quoted and unquoted keys in one literal
    // conflicts between Prettier and the quote-props lint rule.
    const bindQuery = {
      'onUpdate:modelValue': (value: string) => {
        search.query.value = value
      }
    }

    // `data-test` must stay quoted while `onClick` stays unquoted, so the
    // quoted key lives in its own literal to satisfy both tools.
    const retryAttrs = { 'data-test': 'retry' }
    const loadNextAttrs = { 'data-test': 'load-next' }

    return () =>
      h('div', [
        h(SearchBar, { modelValue: search.query.value, ...bindQuery }),
        h('p', { 'data-test': 'status' }, search.status.value),
        h('p', { 'data-test': 'active-query' }, search.activeQuery.value),
        h('p', { 'data-test': 'total' }, String(search.total.value)),
        h(
          'ul',
          search.results.value.map((result) =>
            h(
              'li',
              {
                key: `${result.mediaType}-${result.externalId}`,
                class: 'search-result'
              },
              result.title
            )
          )
        ),
        h(ProgressiveSentinel, {
          enabled: search.hasMore.value,
          busy: search.isLoadingMore.value,
          loaded: search.results.value.length,
          total: search.total.value,
          onLoad: () => {
            void search.loadNext()
          }
        }),
        // Explicit retry affordances: page 1 is retried through the
        // composable's `retry`, a failed continuation through `loadNext`.
        h(
          'button',
          {
            ...retryAttrs,
            onClick: () => {
              void search.retry()
            }
          },
          'Retry'
        ),
        h(
          'button',
          {
            ...loadNextAttrs,
            onClick: () => {
              void search.loadNext()
            }
          },
          'Load next'
        )
      ])
  }
})

function resultTitles(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  return wrapper.findAll('li.search-result').map((node) => node.text())
}

describe('useMediaSearch', () => {
  it('debounces the committed query and trims whitespace', async () => {
    requestFetch.mockResolvedValue(page(1, [item(1, 'Earth')], 1))
    const wrapper = await mountSuspended(SearchHarness, {
      props: { scope: 'all' },
      route: '/'
    })

    await wrapper.get('input').setValue('  earth  ')

    expect(wrapper.get('[data-test="active-query"]').text()).toBe('')
    expect(requestFetch).not.toHaveBeenCalled()

    await vi.waitFor(() =>
      expect(wrapper.get('[data-test="active-query"]').text()).toBe('earth')
    )

    expect(requestFetch).toHaveBeenCalledWith('/api/media/search', {
      query: { q: 'earth', type: 'all' }
    })
    expect(wrapper.vm.$router.currentRoute.value.query.q).toBe('earth')
    wrapper.unmount()
  })

  it('commits queries with router.replace so typing adds no history entries', async () => {
    requestFetch.mockResolvedValue(page(1, [item(1, 'Earth')], 1))
    const wrapper = await mountSuspended(SearchHarness, {
      props: { scope: 'all' },
      route: '/'
    })

    const push = vi.spyOn(wrapper.vm.$router, 'push')
    await wrapper.get('input').setValue('earth')
    await vi.waitFor(() =>
      expect(wrapper.get('[data-test="active-query"]').text()).toBe('earth')
    )
    await wrapper.get('input').setValue('earths')
    await vi.waitFor(() =>
      expect(wrapper.get('[data-test="active-query"]').text()).toBe('earths')
    )

    expect(push).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('seeds the field and results from a direct-link query', async () => {
    requestFetch.mockResolvedValue(page(1, [item(1, 'Earth')], 1))
    const wrapper = await mountSuspended(SearchHarness, {
      props: { scope: 'movie' },
      route: '/movies?q=earth'
    })

    expect((wrapper.get('input').element as HTMLInputElement).value).toBe(
      'earth'
    )
    expect(wrapper.get('[data-test="status"]').text()).toBe('success')
    expect(resultTitles(wrapper)).toEqual(['Earth'])
    expect(requestFetch).toHaveBeenCalledWith('/api/media/search', {
      query: { q: 'earth', type: 'movie' }
    })
    wrapper.unmount()
  })

  it.each(['all', 'movie', 'tv'] as const)(
    'requests the %s scope for its page',
    async (scope) => {
      requestFetch.mockResolvedValue(page(1, [item(1, 'Earth')], 1))
      const wrapper = await mountSuspended(SearchHarness, {
        props: { scope },
        route: '/?q=earth'
      })

      expect(requestFetch).toHaveBeenCalledWith('/api/media/search', {
        query: { q: 'earth', type: scope }
      })
      wrapper.unmount()
    }
  )

  it('follows a URL change that did not come from the field', async () => {
    requestFetch
      .mockResolvedValueOnce(page(1, [item(1, 'Earth')], 1, 1))
      .mockResolvedValueOnce(page(1, [item(2, 'Mars')], 1, 1))
    const wrapper = await mountSuspended(SearchHarness, {
      props: { scope: 'all' },
      route: '/?q=earth'
    })
    expect(resultTitles(wrapper)).toEqual(['Earth'])

    // Simulates back/forward landing on another committed query.
    await wrapper.vm.$router.replace({ query: { q: 'mars' } })

    await vi.waitFor(() => expect(resultTitles(wrapper)).toEqual(['Mars']))
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe(
      'mars'
    )
    wrapper.unmount()
  })

  it('retries a failed page-1 search for the same committed query', async () => {
    requestFetch
      .mockRejectedValueOnce(new Error('search unavailable'))
      .mockResolvedValueOnce(page(1, [item(1, 'Earth')], 1))
    const wrapper = await mountSuspended(SearchHarness, {
      props: { scope: 'all' },
      route: '/?q=earth'
    })

    expect(wrapper.get('[data-test="status"]').text()).toBe('error')

    await wrapper.get('[data-test="retry"]').trigger('click')

    await vi.waitFor(() =>
      expect(wrapper.get('[data-test="status"]').text()).toBe('success')
    )
    expect(resultTitles(wrapper)).toEqual(['Earth'])
    // The committed query is unchanged, so the retry repeats it exactly.
    expect(requestFetch).toHaveBeenCalledTimes(2)
    expect(requestFetch).toHaveBeenLastCalledWith('/api/media/search', {
      query: { q: 'earth', type: 'all' }
    })
    wrapper.unmount()
  })

  it('resumes the failed next page when loadNext runs again', async () => {
    requestFetch.mockResolvedValue(page(1, [item(1, 'Earth')], 2, 2))
    apiFetch
      .mockRejectedValueOnce(new Error('page 2 failed'))
      .mockResolvedValueOnce(page(2, [item(2, 'Mars')], 2, 2))
    const wrapper = await mountSuspended(SearchHarness, {
      props: { scope: 'all' },
      route: '/?q=earth'
    })

    await wrapper.get('[data-test="load-next"]').trigger('click')
    await flushPromises()
    // The loaded page-1 card stays on screen after the continuation failure.
    expect(resultTitles(wrapper)).toEqual(['Earth'])

    await wrapper.get('[data-test="load-next"]').trigger('click')
    await vi.waitFor(() =>
      expect(resultTitles(wrapper)).toEqual(['Earth', 'Mars'])
    )

    // The retry repeats the page that failed, so nothing is skipped.
    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(apiFetch).toHaveBeenLastCalledWith('/api/media/search', {
      query: { q: 'earth', type: 'all', page: 2 }
    })
    wrapper.unmount()
  })

  it('restores the normal state when the query is cleared', async () => {
    requestFetch.mockResolvedValue(page(1, [item(1, 'Earth')], 1))
    const wrapper = await mountSuspended(SearchHarness, {
      props: { scope: 'all' },
      route: '/?q=earth'
    })
    expect(wrapper.get('[data-test="status"]').text()).toBe('success')

    await wrapper.get('input').setValue('')

    await vi.waitFor(() =>
      expect(wrapper.get('[data-test="status"]').text()).toBe('idle')
    )
    expect(resultTitles(wrapper)).toEqual([])
    expect(wrapper.get('[data-test="total"]').text()).toBe('0')
    expect(wrapper.vm.$router.currentRoute.value.query.q).toBeUndefined()
    wrapper.unmount()
  })

  it('appends the next page without dropping existing results', async () => {
    requestFetch.mockResolvedValue(page(1, [item(1, 'Earth')], 2, 2))
    apiFetch.mockResolvedValue(page(2, [item(2, 'Mars')], 2, 2))
    const wrapper = await mountSuspended(SearchHarness, {
      props: { scope: 'all' },
      route: '/?q=earth'
    })
    expect(resultTitles(wrapper)).toEqual(['Earth'])

    latestSentinel().trigger(true)

    await vi.waitFor(() =>
      expect(resultTitles(wrapper)).toEqual(['Earth', 'Mars'])
    )
    expect(apiFetch).toHaveBeenCalledWith('/api/media/search', {
      query: { q: 'earth', type: 'all', page: 2 }
    })
    expect(wrapper.get('[role="status"]').text()).toBe('All 2 results loaded')
    wrapper.unmount()
  })

  it('never starts a second next-page request while one is in flight', async () => {
    requestFetch.mockResolvedValue(page(1, [item(1, 'Earth')], 2, 2))
    let resolvePage!: (value: PaginatedMedia) => void
    apiFetch.mockReturnValue(
      new Promise<PaginatedMedia>((resolve) => {
        resolvePage = resolve
      })
    )
    const wrapper = await mountSuspended(SearchHarness, {
      props: { scope: 'all' },
      route: '/?q=earth'
    })

    latestSentinel().trigger(true)
    await nextTick()
    latestSentinel().trigger(false)
    latestSentinel().trigger(true)

    expect(apiFetch).toHaveBeenCalledTimes(1)

    resolvePage(page(2, [item(2, 'Mars')], 2, 2))
    await vi.waitFor(() =>
      expect(resultTitles(wrapper)).toEqual(['Earth', 'Mars'])
    )
    expect(apiFetch).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('stops at the last page', async () => {
    requestFetch.mockResolvedValue(page(1, [item(1, 'Earth')], 1, 1))
    const wrapper = await mountSuspended(SearchHarness, {
      props: { scope: 'all' },
      route: '/?q=earth'
    })

    latestSentinel().trigger(true)
    await nextTick()

    expect(apiFetch).not.toHaveBeenCalled()
    expect(wrapper.get('[role="status"]').text()).toBe('All 1 result loaded')
    wrapper.unmount()
  })

  it('discards a next-page response that arrives after the query changed', async () => {
    requestFetch
      .mockResolvedValueOnce(page(1, [item(1, 'Earth')], 2, 2))
      .mockResolvedValueOnce(page(1, [item(3, 'Moon')], 1, 1))
    let resolvePage!: (value: PaginatedMedia) => void
    apiFetch.mockReturnValue(
      new Promise<PaginatedMedia>((resolve) => {
        resolvePage = resolve
      })
    )
    const wrapper = await mountSuspended(SearchHarness, {
      props: { scope: 'all' },
      route: '/?q=earth'
    })

    latestSentinel().trigger(true)
    await wrapper.get('input').setValue('moon')
    await vi.waitFor(() =>
      expect(wrapper.get('[data-test="active-query"]').text()).toBe('moon')
    )

    resolvePage(page(2, [item(2, 'Mars')], 2, 2))
    await nextTick()

    expect(resultTitles(wrapper)).toEqual(['Moon'])
    wrapper.unmount()
  })
})

describe('ProgressiveSentinel', () => {
  it('emits load only while visible, enabled and idle', async () => {
    const wrapper = await mountSuspended(ProgressiveSentinel, {
      props: { enabled: true, busy: false, loaded: 20, total: 100 }
    })
    expect(wrapper.get('[role="status"]').text()).toBe(
      'Showing 20 of 100 results'
    )

    latestSentinel().trigger(false)
    await nextTick()
    expect(wrapper.emitted('load')).toBeUndefined()

    latestSentinel().trigger(true)
    await nextTick()
    expect(wrapper.emitted('load')).toHaveLength(1)
    wrapper.unmount()
  })
  it('does not retry when a failed request becomes idle while still visible', async () => {
    const wrapper = await mountSuspended(ProgressiveSentinel, {
      props: { enabled: true, busy: true, loaded: 20, total: 100 }
    })

    latestSentinel().trigger(true)
    await nextTick()

    expect(wrapper.emitted('load')).toBeUndefined()

    await wrapper.setProps({ busy: false })
    await nextTick()

    expect(wrapper.emitted('load')).toBeUndefined()

    wrapper.unmount()
  })
  it('stays quiet while busy and reports the finished state', async () => {
    const busy = await mountSuspended(ProgressiveSentinel, {
      props: { enabled: true, busy: true, loaded: 20, total: 100 }
    })
    latestSentinel().trigger(true)
    await nextTick()
    expect(busy.emitted('load')).toBeUndefined()
    expect(busy.get('[role="status"]').text()).toBe('Loading more results…')
    busy.unmount()

    FakeIntersectionObserver.instances = []
    const finished = await mountSuspended(ProgressiveSentinel, {
      props: { enabled: false, busy: false, loaded: 25, total: 25 }
    })
    latestSentinel().trigger(true)
    await nextTick()
    expect(finished.emitted('load')).toBeUndefined()
    expect(finished.get('[role="status"]').text()).toBe('All 25 results loaded')
    finished.unmount()
  })
})
