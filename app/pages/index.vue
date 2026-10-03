<!--
  pages/index.vue — Home page.

  Two mutually exclusive modes on one SearchBar. The normal Home experience
  composes the Trending rail and the progressive Recommended grid, both owned
  by `useHomeMedia()`. A committed search query replaces that entirely with the
  search-results experience, owned by `useMediaSearch('all')`.

  Which dataset is displayed is decided by the committed query (the composable's
  `activeQuery`, i.e. the URL), never by the transient field value, so a query
  being typed — or one that is still loading — cannot swap the dataset halfway.

  The page only maps composable state onto presentation, and every dataset
  degrades on its own: Trending and Recommended fail independently, and neither
  a search failure nor a search continuation failure restores normal Home while
  a query is still committed. There is deliberately no page-wide error state;
  each failed section instead offers its own Retry, which re-runs only that
  section's read.
-->
<script setup lang="ts">
import type { MediaItem } from '~/../shared/contracts'

// Home is a public page, so the Open Graph tags mirror the route metadata so a
// shared link previews with the same title and description.
const title = 'Home'
const description = `Browse trending and recommended movies and TV series on Don't Watch Entertainment.`
useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description
})

const {
  trendingItems,
  trendingStatus,
  retryTrending,
  recommendedItems,
  recommendedStatus,
  recommendedError,
  retryRecommended,
  recommendedHasMore,
  recommendedLoadingMore,
  recommendedTotal,
  loadRecommendedNext
} = useHomeMedia()

// The URL is the durable source of the search, so the mode is read from
// `activeQuery` rather than from `query`: the field runs ahead of the committed
// value while the debounce is pending, and using it would swap the section out
// mid-keystroke.
const {
  query: searchQuery,
  activeQuery: searchActiveQuery,
  results: searchResults,
  total: searchTotal,
  status: searchStatus,
  error: searchError,
  retry: retrySearch,
  hasMore: searchHasMore,
  isLoadingMore: searchIsLoadingMore,
  loadNext: loadSearchNext
} = await useMediaSearch('all')

const isSearchMode = computed(() => searchActiveQuery.value !== '')

// Skeleton counts reserve the Figma geometry while page 1 is in flight: the
// Trending rail's documented window and one full grid (two desktop rows), which
// the Recommended grid and the search results share.
const TRENDING_SKELETON_COUNT = 5
const GRID_SKELETON_COUNT = 8

/**
 * Stable list key for a media item. Only uniqueness per provider identity and
 * stability across appended pages matter here, so the separator is local to
 * keying rather than the composable's canonical identity format.
 */
function itemKey(item: MediaItem): string {
  return `${item.mediaType}-${item.externalId}`
}

// A page-1 Recommended failure replaces the grid. A continuation failure keeps
// the loaded items, so it is reported alongside them instead of hiding them.
const recommendedLoadFailed = computed(
  () => recommendedStatus.value === 'error'
)
const recommendedContinuationFailed = computed(
  () => !recommendedLoadFailed.value && recommendedError.value !== null
)

// `status` reports a page-1 failure; a continuation failure leaves the page-1
// status untouched and surfaces only through `error`. Comparing the two is
// therefore enough to tell the failures apart, and it keeps the loaded results
// on screen when only the continuation failed.
const searchLoadFailed = computed(() => searchStatus.value === 'error')
const searchContinuationFailed = computed(
  () => !searchLoadFailed.value && searchError.value !== null
)

// The heading is the Figma result-count line (Search frames 16081:1361 /
// 16081:4449 / 16081:6722: `Found 2 results for ‘Earth’`, including the
// design's typographic quotes). It needs the backend total, which only exists
// once page 1 has resolved; while pending or after a failure the same sentence
// would read "Found 0 results" and misreport the search.
const searchHeadingVisible = computed(() => searchStatus.value === 'success')

const searchHeading = computed(() => {
  // Only the placeholder count differs from the reference frames.
  const count =
    searchTotal.value === 1 ? '1 result' : `${searchTotal.value} results`
  return `Found ${count} for ‘${searchActiveQuery.value}’`
})
</script>

<template>
  <div class="home-page">
    <div class="home-search">
      <SearchBar
        v-model="searchQuery"
        placeholder="Search for movies or TV series"
      />
    </div>

    <section
      v-if="isSearchMode"
      class="home-section home-section--search"
      aria-label="Search results"
    >
      <h2 v-if="searchHeadingVisible" class="home-section__heading">
        {{ searchHeading }}
      </h2>

      <div class="home-section__content">
        <p v-if="searchLoadFailed" class="home-section__error" role="alert">
          Search is unavailable right now. Please try again later.
          <button
            type="button"
            class="home-section__retry"
            @click="retrySearch()"
          >
            Retry
          </button>
        </p>
        <template v-else>
          <MediaGrid>
            <template v-if="searchStatus === 'pending'">
              <MediaCardSkeleton
                v-for="index in GRID_SKELETON_COUNT"
                :key="index"
              />
            </template>
            <MediaCard
              v-for="item in searchResults"
              :key="itemKey(item)"
              :item="item"
            />
          </MediaGrid>

          <p
            v-if="searchContinuationFailed"
            class="home-section__error"
            role="status"
          >
            Couldn't load more results.
            <button
              type="button"
              class="home-section__retry"
              :disabled="searchIsLoadingMore"
              @click="loadSearchNext()"
            >
              Retry
            </button>
          </p>

          <ProgressiveSentinel
            :enabled="searchHasMore"
            :busy="searchIsLoadingMore"
            :loaded="searchResults.length"
            :total="searchTotal"
            @load="loadSearchNext"
          />
        </template>
      </div>
    </section>

    <template v-else>
      <section
        class="home-section home-section--trending"
        aria-labelledby="home-trending-heading"
      >
        <h2 id="home-trending-heading" class="home-section__heading">
          Trending
        </h2>

        <div class="home-section__content">
          <p
            v-if="trendingStatus === 'error'"
            class="home-section__error"
            role="alert"
          >
            Trending is unavailable right now. Please try again later.
            <button
              type="button"
              class="home-section__retry"
              @click="retryTrending()"
            >
              Retry
            </button>
          </p>
          <TrendingRail v-else label="Trending">
            <template v-if="trendingStatus === 'pending'">
              <MediaCardSkeleton
                v-for="index in TRENDING_SKELETON_COUNT"
                :key="index"
                variant="trending"
              />
            </template>
            <TrendingCard
              v-for="(item, index) in trendingItems"
              :key="itemKey(item)"
              :item="item"
              :priority="index === 0"
            />
          </TrendingRail>
        </div>
      </section>

      <section
        class="home-section home-section--recommended"
        aria-labelledby="home-recommended-heading"
      >
        <h2 id="home-recommended-heading" class="home-section__heading">
          Recommended for you
        </h2>

        <div class="home-section__content">
          <p
            v-if="recommendedLoadFailed"
            class="home-section__error"
            role="alert"
          >
            Recommendations are unavailable right now. Please try again later.
            <button
              type="button"
              class="home-section__retry"
              @click="retryRecommended()"
            >
              Retry
            </button>
          </p>
          <template v-else>
            <MediaGrid>
              <template v-if="recommendedStatus === 'pending'">
                <MediaCardSkeleton
                  v-for="index in GRID_SKELETON_COUNT"
                  :key="index"
                />
              </template>
              <MediaCard
                v-for="item in recommendedItems"
                :key="itemKey(item)"
                :item="item"
              />
            </MediaGrid>

            <p
              v-if="recommendedContinuationFailed"
              class="home-section__error"
              role="status"
            >
              Couldn't load more recommendations.
              <button
                type="button"
                class="home-section__retry"
                :disabled="recommendedLoadingMore"
                @click="loadRecommendedNext()"
              >
                Retry
              </button>
            </p>

            <ProgressiveSentinel
              :enabled="recommendedHasMore"
              :busy="recommendedLoadingMore"
              :loaded="recommendedItems.length"
              :total="recommendedTotal"
              @load="loadRecommendedNext"
            />
          </template>
        </div>
      </section>
    </template>
  </div>
</template>
