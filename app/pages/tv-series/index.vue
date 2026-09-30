<!--
  pages/tv-series/index.vue — TV Series listing page.

  Two mutually exclusive modes share one SearchBar. The normal TV Series listing
  is owned by `useTvMedia()`; a committed search query replaces it entirely with
  the TV-scoped results owned by `useMediaSearch('tv')`. The search field
  belongs to that search composable (which debounces it into the URL), so the
  page no longer keeps a field of its own.

  Which dataset is displayed is decided by the committed `activeQuery` (the URL),
  never by the transient field value, so a query being typed — or one that is
  still loading — cannot swap the dataset mid-keystroke, and clearing the query
  restores the normal TV Series state the composable already holds.

  Page-1 failure and continuation failure are deliberately different in both
  modes: a failed page 1 has no list to show, so it replaces the grid while the
  SearchBar stays; a failed continuation keeps every loaded card and reports
  itself beside them. In normal mode, the static `TV Series` heading remains
  visible during a page-1 failure. In search mode, the result-count heading is
  intentionally visible only after a successful search page 1. Neither failure
  ever falls back to the other mode, and there is no page-wide spinner or error
  state.
-->
<script setup lang="ts">
const { items, status, error, total, hasMore, isLoadingMore, loadNext } =
  useTvMedia()

const {
  query: searchQuery,
  activeQuery: searchActiveQuery,
  results: searchResults,
  total: searchTotal,
  status: searchStatus,
  error: searchError,
  hasMore: searchHasMore,
  isLoadingMore: searchIsLoadingMore,
  loadNext: loadSearchNext
} = await useMediaSearch('tv')

const isSearchMode = computed(() => searchActiveQuery.value !== '')

// One full desktop grid (two rows of four) while page 1 is in flight, matching
// the reservation the Figma TV Series frame renders and the Movies page uses,
// since both lists are the same shared grid. Normal TV and search results share
// that grid, so the reservation does too.
const GRID_SKELETON_COUNT = 8

// `status` reports a page-1 failure. A continuation failure leaves it at
// `success` and surfaces only through `error`, which is what keeps the loaded
// cards on screen when the follow-up request fails.
const loadFailed = computed(() => status.value === 'error')
const continuationFailed = computed(
  () => !loadFailed.value && error.value !== null
)

// The search failures follow the same split, and comparing `status` with `error`
// is enough to tell them apart without a second lifecycle signal.
const searchLoadFailed = computed(() => searchStatus.value === 'error')
const searchContinuationFailed = computed(
  () => !searchLoadFailed.value && searchError.value !== null
)

// The Figma result-count line (`Found 2 results for ‘Earth’`, including the
// design's typographic quotes) needs the backend total, which only exists once
// page 1 has resolved; before that the same sentence would read
// "Found 0 results" and misreport the search. The committed query is used, not
// the field, so the heading never describes results the grid is not showing.
const searchHeadingVisible = computed(() => searchStatus.value === 'success')
const searchHeading = computed(() => {
  const count =
    searchTotal.value === 1 ? '1 result' : `${searchTotal.value} results`
  return `Found ${count} for ‘${searchActiveQuery.value}’`
})
</script>

<template>
  <div class="tv-page">
    <div class="tv-search">
      <SearchBar v-model="searchQuery" placeholder="Search for TV series" />
    </div>

    <template v-if="isSearchMode">
      <h1 v-if="searchHeadingVisible" class="tv-page__heading">
        {{ searchHeading }}
      </h1>

      <p v-if="searchLoadFailed" class="tv-page__error" role="alert">
        Search is unavailable right now. Please try again later.
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
            :key="`${item.mediaType}-${item.externalId}`"
            :item="item"
          />
        </MediaGrid>

        <p v-if="searchContinuationFailed" class="tv-page__error" role="status">
          Couldn't load more results.
        </p>

        <ProgressiveSentinel
          :enabled="searchHasMore"
          :busy="searchIsLoadingMore"
          :loaded="searchResults.length"
          :total="searchTotal"
          @load="loadSearchNext"
        />
      </template>
    </template>

    <template v-else>
      <h1 class="tv-page__heading">TV Series</h1>

      <p v-if="loadFailed" class="tv-page__error" role="alert">
        TV series are unavailable right now. Please try again later.
      </p>
      <template v-else>
        <MediaGrid>
          <template v-if="status === 'pending'">
            <MediaCardSkeleton
              v-for="index in GRID_SKELETON_COUNT"
              :key="index"
            />
          </template>
          <MediaCard
            v-for="item in items"
            :key="`${item.mediaType}-${item.externalId}`"
            :item="item"
          />
        </MediaGrid>

        <p v-if="continuationFailed" class="tv-page__error" role="status">
          Couldn't load more TV series.
        </p>

        <ProgressiveSentinel
          :enabled="hasMore"
          :busy="isLoadingMore"
          :loaded="items.length"
          :total="total"
          @load="loadNext"
        />
      </template>
    </template>
  </div>
</template>
