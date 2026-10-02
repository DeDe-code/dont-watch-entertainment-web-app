import type { MediaItem, PaginatedMedia } from '~/../shared/contracts'

/**
 * Backend search scope (`/api/media/search?type=`): Home searches every media
 * type, Movies/TV narrow the same endpoint to one type.
 */
export type MediaSearchScope = 'all' | 'movie' | 'tv'

export type MediaSearchStatus = 'idle' | 'pending' | 'success' | 'error'

interface TaggedSearchPage {
  /** The query this page was fetched for. */
  query: string
  page: PaginatedMedia
}

const SEARCH_ENDPOINT = '/api/media/search'
const SEARCH_DEBOUNCE_MS = 300

/**
 * Route query values are `string | string[] | undefined`; the search field only
 * understands a single, whitespace-trimmed string.
 */
function readQueryValue(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' ? raw.trim() : ''
}

/**
 * Contextual media search for one page scope.
 *
 * The composable is the single owner of the search lifecycle: the field value,
 * the debounced URL synchronization, page-1 fetching, and progressive
 * continuation. Consumers only wire `query` to `SearchBar` and render
 * `results` / `status`; `loadNext` is driven by the continuation sentinel.
 *
 * The URL is the durable source of truth for the committed query, so direct
 * links and back/forward navigation work while typing never adds history
 * entries. Call it once per page (not once per component) so both the field and
 * the results share one state.
 *
 * Async because page 1 is an `useAsyncData` read: callers must `await` it so
 * direct-link queries are resolved during SSR.
 */
export async function useMediaSearch(scope: MediaSearchScope) {
  const route = useRoute()
  const router = useRouter()
  const requestFetch = useRequestFetch()

  const initialQuery = readQueryValue(route.query.q)
  /** Field value; may run ahead of the committed query while typing. */
  const query = ref(initialQuery)
  /** Query the visible results belong to. */
  const activeQuery = ref(initialQuery)

  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  // Keystrokes are debounced into the URL. `router.replace` keeps a single
  // history entry, so back/forward moves between pages instead of between every
  // intermediate query.
  watch(query, (value) => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      const next = value.trim()
      if (next === readQueryValue(route.query.q)) return
      // `undefined` drops the param in vue-router, so a blank query restores the
      // page's normal (non-search) URL.
      void router.replace({ query: { ...route.query, q: next || undefined } })
    }, SEARCH_DEBOUNCE_MS)
  })

  // The URL seeds direct links and drives back/forward: when it changes without
  // the field, mirror it so the input always shows the committed query.
  watch(
    () => readQueryValue(route.query.q),
    (next) => {
      if (next === activeQuery.value) return
      activeQuery.value = next
      if (next !== query.value) query.value = next
    }
  )

  onBeforeUnmount(() => clearTimeout(debounceTimer))

  // Page 1 is tagged with the query it was fetched for. Keeping the tag means a
  // response (or hydrated payload) from a superseded query is never surfaced
  // while the current one is still loading.
  //
  // `retry` re-runs exactly this read against `activeQuery`, so a retry can
  // only ever repeat the query the URL currently commits to. A failed
  // continuation is retried through `loadNext` instead, so the two retries
  // stay separate and neither discards already-loaded pages.
  const {
    data: firstPage,
    status: requestStatus,
    error: requestError,
    refresh: retry
  } = await useAsyncData<TaggedSearchPage | null>(
    `media-search:${scope}`,
    () => {
      const q = activeQuery.value
      if (q === '') return Promise.resolve(null)
      return requestFetch<PaginatedMedia>(SEARCH_ENDPOINT, {
        query: { q, type: scope }
      }).then((page) => ({ query: q, page }))
    },
    { watch: [activeQuery], default: () => null }
  )

  const currentPage = computed(() => {
    const value = firstPage.value
    return value && value.query === activeQuery.value ? value.page : null
  })

  const extraPages = ref<PaginatedMedia[]>([])
  const loadingMore = ref(false)
  const loadError = ref<unknown>(null)
  // Bumped whenever a new search starts so in-flight continuation responses are
  // discarded instead of appending into the wrong result list.
  let generation = 0

  watch(activeQuery, () => {
    generation += 1
    extraPages.value = []
    loadingMore.value = false
    loadError.value = null
  })

  const results = computed<MediaItem[]>(() => [
    ...(currentPage.value?.data ?? []),
    ...extraPages.value.flatMap((page) => page.data)
  ])

  const total = computed(() => currentPage.value?.meta.totalResults ?? 0)

  const loadedPages = computed(() =>
    currentPage.value === null ? 0 : 1 + extraPages.value.length
  )

  /** False while page 1 is loading/stale and once the last page is loaded. */
  const hasMore = computed(
    () =>
      currentPage.value !== null &&
      loadedPages.value < currentPage.value.meta.totalPages
  )

  const status = computed<MediaSearchStatus>(() => {
    if (activeQuery.value === '') return 'idle'
    if (requestStatus.value === 'error') return 'error'
    if (requestStatus.value === 'pending') return 'pending'
    return currentPage.value === null ? 'pending' : 'success'
  })

  const error = computed(() => requestError.value ?? loadError.value)

  /**
   * Appends the next page. Concurrent calls are collapsed so a sentinel that
   * stays in view fires one request per page.
   */
  async function loadNext() {
    if (loadingMore.value || !hasMore.value) return

    const request = {
      generation,
      q: activeQuery.value,
      page: loadedPages.value + 1
    }
    loadingMore.value = true
    loadError.value = null

    try {
      const page = await $fetch<PaginatedMedia>(SEARCH_ENDPOINT, {
        query: { q: request.q, type: scope, page: request.page }
      })
      if (request.generation !== generation) return
      extraPages.value.push(page)
    } catch (cause) {
      if (request.generation === generation) loadError.value = cause
    } finally {
      if (request.generation === generation) loadingMore.value = false
    }
  }

  return {
    query,
    activeQuery,
    results,
    total,
    status,
    error,
    retry,
    hasMore,
    isLoadingMore: loadingMore,
    loadNext
  }
}
