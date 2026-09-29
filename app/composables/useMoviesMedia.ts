import type { MediaItem, PaginatedMedia } from '~/../shared/contracts'

const MOVIES_ENDPOINT = '/api/media/movies'

/**
 * Coarse section status. Nuxt distinguishes `idle` from `pending`, a
 * distinction the Movies page never acts on, so the composable collapses it and
 * consumers only branch on loading, loaded, and failed.
 */
export type MoviesSectionStatus = 'pending' | 'success' | 'error'

function sectionStatus(status: string): MoviesSectionStatus {
  if (status === 'success') return 'success'
  if (status === 'error') return 'error'
  return 'pending'
}

/**
 * Owner of the normal, non-search Movies listing lifecycle.
 *
 * Movies is a single progressive list, so this composable is deliberately
 * Movies-specific instead of a generic page/data framework. It owns two
 * responsibilities a page would otherwise coordinate by hand:
 *
 * - the page-1 read. Relative `useFetch` keeps the read in SSR, where Nuxt
 *   forwards the request headers so the session cookie still drives bookmark
 *   enrichment. Page 1 participates in SSR; continuation reads are
 *   user-triggered and therefore client-side.
 * - the progressive continuation, which appends pages on demand while keeping
 *   page-1 and continuation failures independent.
 *
 * Call it once per Movies page: the continuation's loaded pages are instance
 * state, exactly like one `useMediaSearch` per search scope.
 */
export function useMoviesMedia() {
  const {
    data: firstPage,
    status: requestStatus,
    error: requestError
  } = useFetch<PaginatedMedia>(MOVIES_ENDPOINT)

  const extraPages = ref<PaginatedMedia[]>([])
  const loadingMore = ref(false)
  const continuationError = ref<unknown>(null)

  const loadedPageCount = computed(() =>
    firstPage.value ? 1 + extraPages.value.length : 0
  )

  const items = computed<MediaItem[]>(() => [
    ...(firstPage.value?.data ?? []),
    ...extraPages.value.flatMap((page) => page.data)
  ])

  /**
   * Backend-reported size of the Movies result set, for the continuation
   * sentinel's progress announcement.
   *
   * It is read straight from page 1's metadata and deliberately not derived
   * from `items`: the loaded list only grows as pages arrive, so its length
   * would understate the total the backend actually reports.
   */
  const total = computed(() => firstPage.value?.meta.totalResults ?? 0)

  /** False while page 1 is missing and once the last page has been loaded. */
  const hasMore = computed(
    () =>
      loadedPageCount.value > 0 &&
      loadedPageCount.value < (firstPage.value?.meta.totalPages ?? 0)
  )

  /**
   * Appends the next Movies page.
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
      const nextPage = await $fetch<PaginatedMedia>(MOVIES_ENDPOINT, {
        query: { page }
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
    hasMore,
    isLoadingMore: loadingMore,
    loadNext
  }
}
