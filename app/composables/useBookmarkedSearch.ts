import type {
  MediaItem,
  MediaType,
  PaginatedMedia
} from '~/../shared/contracts'

/**
 * Status of one Bookmarked search group.
 *
 * `idle` is the no-committed-query state: Bookmarked search exists only while
 * the URL carries a query, so a blank query never reaches the network and never
 * reports a failure.
 */
export type BookmarkedSearchStatus = 'idle' | 'pending' | 'success' | 'error'

interface TaggedBookmarkPage {
  /** The committed query this page was fetched for. */
  query: string
  page: PaginatedMedia
}

/**
 * The half of the shared bookmark state a search group actually uses: it seeds
 * each arriving result's flag once, then reads the flag back to decide what is
 * still bookmarked. Narrowing the dependency keeps the group from reaching for
 * the mutation surface it never calls.
 */
type ResultBookmarkState = Pick<
  ReturnType<typeof useBookmarks>,
  'seed' | 'isBookmarked'
>

const BOOKMARKS_ENDPOINT = '/api/bookmarks'
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
 * One independently paginated Bookmarked search group (Movies or TV).
 *
 * Both groups share the identical continuation mechanics, so the loop lives
 * here once. The group stays private on purpose: `useBookmarkedSearch` still
 * exposes every Movie/TV value explicitly, so the two result sets are never
 * hidden behind a generic media-list abstraction.
 *
 * Page 1 is tagged with the query it was fetched for. The tag — not the fetch
 * state — decides what belongs to the visible query: Nuxt keeps the previous
 * `data` while a new query is still loading, so without the tag a superseded
 * page could be rendered under the new query.
 *
 * Which results are still bookmarked is not the response's decision: each
 * arriving result is seeded into the shared `useBookmarks()` state once, and
 * the group exposes only the results that state still reports as bookmarked.
 * Removing a bookmark from a card therefore drops the card here at once, and a
 * failed removal restores it.
 *
 * Must be called during setup: it reaches into `useAsyncData`. It deliberately
 * awaits nothing itself, so `useBookmarkedSearch` can create both groups while
 * the setup context is still guaranteed and await them afterwards.
 */
function useBookmarkSearchGroup(
  mediaType: MediaType,
  activeQuery: () => string,
  requestFetch: ReturnType<typeof useRequestFetch>,
  bookmarks: ResultBookmarkState
) {
  const firstPageRead = useAsyncData<TaggedBookmarkPage | null>(
    `bookmarked-search:${mediaType}`,
    () => {
      const q = activeQuery()
      if (q === '') return Promise.resolve(null)
      return requestFetch<PaginatedMedia>(BOOKMARKS_ENDPOINT, {
        query: { q, mediaType }
      }).then((page) => ({ query: q, page }))
    },
    { watch: [activeQuery], default: () => null }
  )

  const {
    data: firstPage,
    status: requestStatus,
    error: requestError,
    refresh: retry
  } = firstPageRead

  const currentPage = computed(() => {
    const value = firstPage.value
    return value && value.query === activeQuery() ? value.page : null
  })

  const extraPages = ref<PaginatedMedia[]>([])
  const isLoadingMore = ref(false)
  const loadError = ref<unknown>(null)
  // Bumped whenever the committed query changes so in-flight continuation
  // responses are discarded instead of appending into the wrong result list.
  let generation = 0

  watch(
    () => activeQuery(),
    () => {
      generation += 1
      extraPages.value = []
      isLoadingMore.value = false
      loadError.value = null
    }
  )

  /** Every result this group has received, regardless of its bookmark flag. */
  const loadedItems = computed<MediaItem[]>(() => [
    ...(currentPage.value?.data ?? []),
    ...extraPages.value.flatMap((page) => page.data)
  ])

  /**
   * External ids this group has already handed to the shared bookmark state.
   *
   * Seeding is a one-time handover per identity: a response's `isBookmarked` is
   * only trustworthy the first time an item arrives. After that the shared map
   * owns the flag, because a removal on this page flips the map, not the
   * response. Re-seeding on a later continuation page — or on a later committed
   * query that repeats the identity — would hand the stale response value back
   * and resurrect an item the user already removed, so the set deliberately
   * outlives the committed query.
   *
   * The id alone suffices: a group reads a single media type, so identity is
   * unique within it. This is instance state rather than `useState` — seeding
   * progress belongs to this composable instance and must not leak across SSR
   * requests.
   */
  const seededExternalIds = new Set<number>()

  /**
   * Seeds only identities arriving for the first time, so ownership moves to
   * the shared map as early as possible and never moves back. `seed` itself
   * also skips identities whose mutation is in flight, so a stale response
   * cannot undo an optimistic flag.
   *
   * The watcher flushes synchronously because `results` below filters by the
   * shared flag: the seed must land in the same tick the page-1 response
   * resolves. Vue's server renderer never flushes scheduled watcher jobs, so a
   * default-flush seed would only be applied on the client — the server would
   * render an empty result group and hydration would then repair the markup,
   * which is a hydration mismatch.
   */
  watch(
    loadedItems,
    (value) => {
      const arrivals = value.filter(
        (item) => !seededExternalIds.has(item.externalId)
      )
      if (arrivals.length === 0) return
      for (const item of arrivals) seededExternalIds.add(item.externalId)
      bookmarks.seed(arrivals)
    },
    { immediate: true, flush: 'sync' }
  )

  /**
   * The loaded results the shared state still reports as bookmarked. A removal
   * flips that flag optimistically, so the card leaves this list in the same
   * tick as the click, and a failed removal restores the flag and the card.
   */
  const results = computed<MediaItem[]>(() =>
    loadedItems.value.filter((item) => bookmarks.isBookmarked(item))
  )

  /** Loaded results removed on this page, i.e. dropped from `results`. */
  const removedCount = computed(
    () => loadedItems.value.length - results.value.length
  )

  /**
   * Backend-reported size of the group, corrected for the results removed on
   * this page: the backend counted them before the removal, so without the
   * correction a group emptied by removals would never look empty. Only loaded
   * results are subtracted, which leaves unloaded pages in the total instead of
   * guessing at them.
   */
  const total = computed(() =>
    Math.max(
      0,
      (currentPage.value?.meta.totalResults ?? 0) - removedCount.value
    )
  )

  const loadedPages = computed(() =>
    currentPage.value === null ? 0 : 1 + extraPages.value.length
  )

  /** False while page 1 is loading/stale and once the last page is loaded. */
  const hasMore = computed(
    () =>
      currentPage.value !== null &&
      loadedPages.value < currentPage.value.meta.totalPages
  )

  const status = computed<BookmarkedSearchStatus>(() => {
    if (activeQuery() === '') return 'idle'
    if (requestStatus.value === 'error') return 'error'
    if (requestStatus.value === 'pending') return 'pending'
    return currentPage.value === null ? 'pending' : 'success'
  })

  /**
   * Appends the next page of this group. Concurrent calls are collapsed so a
   * sentinel that stays in view fires one request per page, and a failure keeps
   * the loaded results: retrying is the sentinel's decision, never a loop here.
   */
  async function loadNext(): Promise<void> {
    if (isLoadingMore.value || !hasMore.value) return

    const request = {
      generation,
      q: activeQuery(),
      page: loadedPages.value + 1
    }
    isLoadingMore.value = true
    loadError.value = null

    try {
      const page = await $fetch<PaginatedMedia>(BOOKMARKS_ENDPOINT, {
        query: { q: request.q, mediaType, page: request.page }
      })
      if (request.generation !== generation) return
      extraPages.value.push(page)
    } catch (cause) {
      if (request.generation === generation) loadError.value = cause
    } finally {
      if (request.generation === generation) isLoadingMore.value = false
    }
  }

  return {
    /** Page-1 read, awaited by the composable so SSR resolves direct links. */
    ready: firstPageRead,
    results,
    status,
    error: computed(() => requestError.value ?? loadError.value),
    total,
    // Retrying page 1 re-runs only this group's page-1 read; retrying a
    // continuation goes through `loadNext`. Keeping them separate is what makes
    // a retry in one group unable to disturb the other.
    retry,
    hasMore,
    isLoadingMore,
    loadNext
  }
}

/**
 * Owner of the Bookmarked page's search lifecycle.
 *
 * A committed query is searched as two independent bookmark queries — one for
 * Movies and one for TV — against `/api/bookmarks`, the authenticated endpoint
 * that filters, counts, and paginates in PostgreSQL. Nothing is preloaded or
 * re-filtered on the client, and no TMDB/provider request is involved.
 *
 * The two groups are independent in every respect: a failure, a stale response,
 * or an in-flight continuation in one never touches the other's results,
 * status, error, total, or pagination state. They are never merged into one
 * mixed request and split again.
 *
 * The URL is the durable source of truth for the committed query, exactly as in
 * `useMediaSearch`: direct links and back/forward work, typing never adds
 * history entries, and `activeQuery` — not the field — decides whether the page
 * is in search mode. Clearing it restores the caller's normal Bookmarked state,
 * which this composable never touches.
 *
 * Bookmark ownership follows the normal Bookmarked mode: each arriving result
 * is seeded into the shared `useBookmarks()` state once, and a group exposes
 * only the results that state still reports as bookmarked. Removing a bookmark
 * from a search result therefore drops the card immediately — through the same
 * optimistic flag and rollback as every other bookmark surface — and each group
 * total is corrected downwards so the combined heading stays honest.
 *
 * Async because page 1 is an `useAsyncData` read: callers must `await` it so
 * direct-link queries are resolved during SSR.
 */
export async function useBookmarkedSearch() {
  const route = useRoute()
  const router = useRouter()
  const requestFetch = useRequestFetch()

  const initialQuery = readQueryValue(route.query.q)
  /** Field value; may run ahead of the committed query while typing. */
  const query = ref(initialQuery)
  /** Committed query the visible results belong to; drives search mode. */
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

  // The shared bookmark map every search result is seeded into, so a removal on
  // the page reaches the search lists through the same state the cards read.
  const bookmarks = useBookmarks()

  // Both groups are created before either is awaited: `useAsyncData` needs the
  // setup context, which is only guaranteed while this function still runs
  // synchronously inside the caller's setup.
  const movies = useBookmarkSearchGroup(
    'MOVIE',
    () => activeQuery.value,
    requestFetch,
    bookmarks
  )
  const tv = useBookmarkSearchGroup(
    'TV',
    () => activeQuery.value,
    requestFetch,
    bookmarks
  )

  // Page 1 of both groups is awaited so a direct link renders its results
  // during SSR instead of an empty pending state.
  await Promise.all([movies.ready, tv.ready])

  return {
    query,
    activeQuery,

    movieResults: movies.results,
    movieStatus: movies.status,
    movieError: movies.error,
    movieTotal: movies.total,
    retryMovies: movies.retry,
    movieHasMore: movies.hasMore,
    movieIsLoadingMore: movies.isLoadingMore,
    loadNextMovies: movies.loadNext,

    tvResults: tv.results,
    tvStatus: tv.status,
    tvError: tv.error,
    tvTotal: tv.total,
    retryTv: tv.retry,
    tvHasMore: tv.hasMore,
    tvIsLoadingMore: tv.isLoadingMore,
    loadNextTv: tv.loadNext,

    /**
     * Combined result count from the two adjusted group totals, so the page
     * never counts rendered cards and a local removal is reflected at once.
     */
    total: computed(() => movies.total.value + tv.total.value)
  }
}
