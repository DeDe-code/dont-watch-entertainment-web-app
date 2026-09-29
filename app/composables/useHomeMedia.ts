import type { MediaItem, PaginatedMedia } from '~/../shared/contracts'

const TRENDING_ENDPOINT = '/api/media/trending'
const RECOMMENDED_ENDPOINT = '/api/media/recommended'

/**
 * Trending rail window. The rail is a small "now trending" highlight, not a
 * browsing surface, so the cap is part of its contract rather than a
 * presentation detail a caller could widen.
 */
const VISIBLE_TRENDING_COUNT = 5

/**
 * Coarse section status. Nuxt distinguishes `idle` from `pending`, a
 * distinction the Home page never acts on, so the composable collapses it and
 * consumers only branch on loading, loaded, and failed.
 */
export type HomeSectionStatus = 'pending' | 'success' | 'error'

/** Canonical media identity: mediaType namespaces externalId. */
type MediaIdentity = Pick<MediaItem, 'mediaType' | 'externalId'>

function identityKey(identity: MediaIdentity): string {
  return `${identity.mediaType}:${identity.externalId}`
}

function sectionStatus(status: string): HomeSectionStatus {
  if (status === 'success') return 'success'
  if (status === 'error') return 'error'
  return 'pending'
}

/**
 * Owner of the normal Home media lifecycle.
 *
 * Home is the only page that presents two independent media sections side by
 * side, so this composable is deliberately Home-specific instead of a generic
 * page/data framework. It owns three responsibilities a page would otherwise
 * have to coordinate by hand:
 *
 * - two independent page-1 reads. Relative `useFetch` keeps both reads in SSR,
 *   where Nuxt forwards the request headers, so the session cookie still drives
 *   bookmark enrichment. Because the reads are separate, one endpoint failing
 *   leaves the other section's data, status, and error untouched.
 * - the Trending rail's visible window, capped at the first
 *   `VISIBLE_TRENDING_COUNT` items. Recommended hides items that duplicate a
 *   *visible* Trending identity, so filtering has to happen after the cap. It
 *   compares identities - never titles - so two distinct works that share a
 *   name both survive.
 * - the Progressive Recommended continuation, which appends pages on demand
 *   while keeping page-1 and continuation failures independent.
 *
 * Call it once per Home page: the continuation's loaded pages are instance
 * state, exactly like one `useMediaSearch` per search scope.
 */
export function useHomeMedia() {
  const {
    data: trendingPage,
    status: trendingRequestStatus,
    error: trendingRequestError
  } = useFetch<PaginatedMedia>(TRENDING_ENDPOINT)

  const {
    data: firstRecommendedPage,
    status: recommendedRequestStatus,
    error: recommendedRequestError
  } = useFetch<PaginatedMedia>(RECOMMENDED_ENDPOINT)

  // `slice` (not `splice`) keeps the shared page-1 response immutable: Nuxt
  // caches it and may surface the same object to other readers, so trimming it
  // in place would be an invisible side effect.
  const trendingItems = computed(() =>
    (trendingPage.value?.data ?? []).slice(0, VISIBLE_TRENDING_COUNT)
  )

  const extraRecommendedPages = ref<PaginatedMedia[]>([])
  const recommendedLoadingMore = ref(false)
  const recommendedContinuationError = ref<unknown>(null)

  const loadedRecommendedPageCount = computed(() =>
    firstRecommendedPage.value ? 1 + extraRecommendedPages.value.length : 0
  )

  const visibleTrendingIdentities = computed(
    () => new Set(trendingItems.value.map(identityKey))
  )

  const recommendedItems = computed(() => {
    const items = [
      ...(firstRecommendedPage.value?.data ?? []),
      ...extraRecommendedPages.value.flatMap((page) => page.data)
    ]

    // Filtering happens at expose time, so the raw pages keep their backend
    // totals: hiding a duplicate from the rail is a presentation decision, not
    // a reason to rewrite the provider's page metadata.
    const hidden = visibleTrendingIdentities.value
    if (hidden.size === 0) return items
    return items.filter((item) => !hidden.has(identityKey(item)))
  })

  const recommendedHasMore = computed(
    () =>
      loadedRecommendedPageCount.value > 0 &&
      loadedRecommendedPageCount.value <
        (firstRecommendedPage.value?.meta.totalPages ?? 0)
  )

  /**
   * Backend-reported size of the Recommended result set, for the continuation
   * sentinel's progress announcement.
   *
   * It is read straight from page 1's metadata and deliberately not derived from
   * `recommendedItems`: that list drops identities already visible in the rail,
   * so its length would understate the total the backend actually reports.
   */
  const recommendedTotal = computed(
    () => firstRecommendedPage.value?.meta.totalResults ?? 0
  )

  /**
   * Appends the next Recommended page.
   *
   * The in-flight flag is set before the first `await`, so concurrent callers
   * collapse into a single request per page. A failed page leaves the loaded
   * items and `recommendedHasMore` untouched: retrying is the continuation
   * sentinel's decision, never an automatic loop inside the composable.
   */
  async function loadRecommendedNext(): Promise<void> {
    if (recommendedLoadingMore.value || !recommendedHasMore.value) return

    const page = loadedRecommendedPageCount.value + 1
    recommendedLoadingMore.value = true
    recommendedContinuationError.value = null

    try {
      const nextPage = await $fetch<PaginatedMedia>(RECOMMENDED_ENDPOINT, {
        query: { page }
      })
      extraRecommendedPages.value.push(nextPage)
    } catch (cause) {
      recommendedContinuationError.value = cause
    } finally {
      recommendedLoadingMore.value = false
    }
  }

  return {
    trendingItems,
    trendingStatus: computed(() => sectionStatus(trendingRequestStatus.value)),
    trendingError: computed(() => trendingRequestError.value),
    recommendedItems,
    recommendedStatus: computed(() =>
      sectionStatus(recommendedRequestStatus.value)
    ),
    // A page-1 failure dominates: there is no Recommended list to show. A
    // continuation failure instead leaves the loaded list visible, so it is
    // reported here while `recommendedStatus` stays `success`.
    recommendedError: computed(
      () => recommendedRequestError.value ?? recommendedContinuationError.value
    ),
    recommendedHasMore,
    recommendedLoadingMore,
    recommendedTotal,
    loadRecommendedNext
  }
}
