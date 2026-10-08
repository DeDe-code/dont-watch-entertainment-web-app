import type {
  MediaItem,
  MediaType,
  PaginatedMedia
} from '~/../shared/contracts'

const BOOKMARKS_ENDPOINT = '/api/bookmarks'

/**
 * Coarse section status. Nuxt distinguishes `idle` from `pending`, a
 * distinction the Bookmarked page never acts on, so the composable collapses it
 * and consumers only branch on loading, loaded, and failed.
 */
export type BookmarkedSectionStatus = 'pending' | 'success' | 'error'

function sectionStatus(status: string): BookmarkedSectionStatus {
  if (status === 'success') return 'success'
  if (status === 'error') return 'error'
  return 'pending'
}

/**
 * The half of the shared bookmark state a loaded group actually uses: it seeds
 * each loaded item's flag once, then reads the flag back to decide what is
 * still bookmarked. Narrowing the dependency keeps the group from reaching for
 * the mutation surface it never calls.
 */
type LoadedBookmarkState = Pick<
  ReturnType<typeof useBookmarks>,
  'seed' | 'isBookmarked'
>

/**
 * One independently paginated bookmarked group (Movies or TV).
 *
 * Both groups share the identical continuation mechanics, so the loop lives
 * here once. The group stays private on purpose: the public interface of
 * `useBookmarkedMedia` still exposes every Movie/TV value explicitly, so the
 * two datasets are never hidden behind a generic media-list abstraction.
 *
 * Must be called during setup: it reaches into `useFetch` and installs a
 * watcher.
 */
function useBookmarkGroup(
  mediaType: MediaType,
  bookmarks: LoadedBookmarkState
) {
  const {
    data: firstPage,
    status: requestStatus,
    error: requestError,
    refresh: retry
  } = useFetch<PaginatedMedia>(BOOKMARKS_ENDPOINT, {
    query: { mediaType }
  })

  const extraPages = ref<PaginatedMedia[]>([])
  const loadingMore = ref(false)
  const continuationError = ref<unknown>(null)

  // Page 1 counts as loaded only once its data actually exists, so a pending or
  // failed page-1 read cannot make the continuation believe a page is in hand.
  const loadedPageCount = computed(() =>
    firstPage.value ? 1 + extraPages.value.length : 0
  )

  /** Every item the group has received, regardless of its bookmark flag. */
  const loadedItems = computed<MediaItem[]>(() => [
    ...(firstPage.value?.data ?? []),
    ...extraPages.value.flatMap((page) => page.data)
  ])

  /**
   * External ids this group has already handed to the shared bookmark state.
   *
   * Seeding is a one-time handover per identity: the response's `isBookmarked`
   * is only trustworthy the first time an item arrives. After that the shared
   * map owns the flag, because a removal on this page flips the map, not the
   * response. Re-seeding on a later continuation page would hand the stale
   * response value back and resurrect an item the user already removed.
   *
   * The id alone suffices: a group reads a single media type, so identity is
   * unique within it. This is instance state rather than `useState` — seeding
   * progress belongs to this composable instance and must not leak across SSR
   * requests.
   */
  const seededExternalIds = new Set<number>()

  /**
   * Seeds only identities arriving for the first time, including the SSR page,
   * so ownership moves to the shared map as early as possible and never moves
   * back. `seed` itself also skips identities whose mutation is in flight, so a
   * stale response cannot undo an optimistic flag.
   *
   * The watcher flushes synchronously because `items` below filters by the
   * shared flag: the seed must land in the same tick the page-1 response
   * resolves. Vue's server renderer never flushes scheduled watcher jobs, so a
   * default-flush seed would only be applied on the client — the server would
   * render an empty group and hydration would then repair the markup, which is
   * a hydration mismatch.
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
   * The loaded items the shared state still reports as bookmarked. A removal
   * flips that flag optimistically, so the card leaves this list in the same
   * tick as the click, and a failed removal restores the flag and the card.
   */
  const items = computed<MediaItem[]>(() =>
    loadedItems.value.filter((item) => bookmarks.isBookmarked(item))
  )

  /** Loaded items removed on this page, i.e. dropped from `items`. */
  const removedCount = computed(
    () => loadedItems.value.length - items.value.length
  )

  /**
   * Backend-reported size of the group, for the continuation sentinel's
   * progress announcement.
   *
   * It is read straight from page 1's metadata and deliberately not derived
   * from `items`: the loaded list only grows as pages arrive, so its length
   * would understate the total the backend actually reports. A missing or
   * failed page 1 has no reported size, hence `0`.
   *
   * The removal on this page happened after that report, so the total is
   * corrected downwards by the loaded items that are gone; otherwise a group
   * emptied by removals would never look empty. Only loaded items are counted,
   * which leaves unloaded pages in the total instead of guessing at them.
   */
  const total = computed(() =>
    Math.max(0, (firstPage.value?.meta.totalResults ?? 0) - removedCount.value)
  )

  /** False while page 1 is missing and once the last page has been loaded. */
  const hasMore = computed(
    () =>
      loadedPageCount.value > 0 &&
      loadedPageCount.value < (firstPage.value?.meta.totalPages ?? 0)
  )

  /**
   * Appends the next page of this group.
   *
   * The in-flight flag is set before the first `await`, so concurrent callers
   * collapse into a single request per page. A failed page leaves the loaded
   * items and `hasMore` untouched: retrying is the continuation sentinel's
   * decision, never an automatic loop inside the composable.
   */
  async function loadNext(): Promise<void> {
    if (loadingMore.value || !hasMore.value) return

    const page = loadedPageCount.value + 1
    loadingMore.value = true
    continuationError.value = null

    try {
      const nextPage = await $fetch<PaginatedMedia>(BOOKMARKS_ENDPOINT, {
        query: { mediaType, page }
      })
      extraPages.value.push(nextPage)
    } catch (cause) {
      continuationError.value = cause
    } finally {
      loadingMore.value = false
    }
  }

  return {
    items,
    status: computed(() => sectionStatus(requestStatus.value)),
    // A page-1 failure dominates: there is no list to show. A continuation
    // failure instead leaves the loaded list visible, so it is reported here
    // while `status` stays `success`.
    error: computed(() => requestError.value ?? continuationError.value),
    total,
    // Retrying page 1 re-runs only this group's page-1 read. The continuation
    // retries through `loadNext`, so the two failures stay separate and neither
    // retry can disturb the other group.
    retry,
    hasMore,
    isLoadingMore: loadingMore,
    loadNext
  }
}

/**
 * Owner of the Bookmarked page's normal (non-search) data lifecycle.
 *
 * The page shows bookmarked Movies and bookmarked TV at the same time, so this
 * composable owns both groups instead of leaving the page to coordinate two
 * pagination loops. Each group is a separate backend read and a separate
 * progressive list; a failure or in-flight load in one group never touches the
 * other's items, status, error, total, or pagination state.
 *
 * Page-1 reads use relative `useFetch`, which keeps them in SSR where Nuxt
 * forwards the request headers so the session cookie drives bookmark
 * ownership. Continuation reads are user-triggered and therefore client-side.
 *
 * The `/api/bookmarks` response already carries PostgreSQL bookmark snapshots,
 * so the returned `MediaItem`s are passed through exactly as supplied: nothing
 * is re-resolved, re-rated, or re-fetched from TMDB.
 *
 * Which items are still bookmarked is not the response's decision: each loaded
 * item is seeded into the shared `useBookmarks()` state, and a group exposes
 * only the items that state still reports as bookmarked. Removing a bookmark
 * from a card therefore removes the card here at once, through the same
 * optimistic flag (and rollback) every other bookmark surface uses.
 *
 * Call it once per Bookmarked page: the continuation's loaded pages are
 * instance state.
 */
export function useBookmarkedMedia() {
  const bookmarks = useBookmarks()
  const movies = useBookmarkGroup('MOVIE', bookmarks)
  const tv = useBookmarkGroup('TV', bookmarks)

  return {
    movieItems: movies.items,
    movieStatus: movies.status,
    movieError: movies.error,
    movieTotal: movies.total,
    retryMovies: movies.retry,
    movieHasMore: movies.hasMore,
    movieIsLoadingMore: movies.isLoadingMore,
    loadNextMovies: movies.loadNext,

    tvItems: tv.items,
    tvStatus: tv.status,
    tvError: tv.error,
    tvTotal: tv.total,
    retryTv: tv.retry,
    tvHasMore: tv.hasMore,
    tvIsLoadingMore: tv.isLoadingMore,
    loadNextTv: tv.loadNext
  }
}
