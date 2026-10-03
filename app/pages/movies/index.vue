<!--
  pages/movies/index.vue — Movies listing page.

  Two mutually exclusive modes share one SearchBar. The normal Movies listing is
  owned by `useMoviesMedia()`; a committed search query replaces it entirely with
  the movie-scoped results owned by `useMediaSearch('movie')`. The search field
  belongs to that search composable (which debounces it into the URL), so the
  page no longer keeps a field of its own.

  Which dataset is displayed is decided by the committed `activeQuery` (the URL),
  never by the transient field value, so a query being typed — or one that is
  still loading — cannot swap the dataset mid-keystroke, and clearing the query
  restores the normal Movies state the composable already holds.

  Page-1 failure and continuation failure are deliberately different in both
modes: a failed page 1 has no list to show, so it replaces the grid while the
SearchBar stays; a failed continuation keeps every loaded card and reports
itself beside them. Each failure offers its own Retry: page 1 re-runs only the
page-1 read, the continuation re-runs only the failed next page. In normal mode
the static `Movies` heading remains visible during a page-1 failure; in search
mode the result-count heading is intentionally visible only after a successful
search page 1. Neither failure ever falls back to the other mode, and there is
no page-wide spinner or error state.
-->
<script setup lang="ts">
// Movies is a public page, so the Open Graph tags mirror the route metadata so a
// shared link previews with the same title and description.
const title = 'Movies'
const description = `Browse movies and discover what's trending on Don't Watch Entertainment.`
useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description
})

const {
  items,
  status,
  error,
  total,
  retryMovies,
  hasMore,
  isLoadingMore,
  loadNext
} = useMoviesMedia()

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
} = await useMediaSearch('movie')

const isSearchMode = computed(() => searchActiveQuery.value !== '')

// One full desktop grid (two rows of four) while page 1 is in flight, so the
// loading state reserves the grid geometry the Figma Movies frame renders.
// Normal Movies and search results share the same grid, so the reservation does.
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
  <div class="movies-page">
    <div class="movies-search">
      <SearchBar v-model="searchQuery" placeholder="Search for movies" />
    </div>

    <template v-if="isSearchMode">
      <h1 v-if="searchHeadingVisible" class="movies-page__heading">
        {{ searchHeading }}
      </h1>

      <p v-if="searchLoadFailed" class="movies-page__error" role="alert">
        Search is unavailable right now. Please try again later.
        <button type="button" class="movies-page__retry" @click="retrySearch()">
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
            :key="`${item.mediaType}-${item.externalId}`"
            :item="item"
          />
        </MediaGrid>

        <p
          v-if="searchContinuationFailed"
          class="movies-page__error"
          role="status"
        >
          Couldn't load more results.
          <button
            type="button"
            class="movies-page__retry"
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
    </template>

    <template v-else>
      <h1 class="movies-page__heading">Movies</h1>

      <p v-if="loadFailed" class="movies-page__error" role="alert">
        Movies are unavailable right now. Please try again later.
        <button type="button" class="movies-page__retry" @click="retryMovies()">
          Retry
        </button>
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

        <p v-if="continuationFailed" class="movies-page__error" role="status">
          Couldn't load more movies.
          <button
            type="button"
            class="movies-page__retry"
            :disabled="isLoadingMore"
            @click="loadNext()"
          >
            Retry
          </button>
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
