<!--
  pages/bookmarked/index.vue — authenticated Bookmarked page.

  Two mutually exclusive modes share one SearchBar. The normal Bookmarked
  experience is owned by `useBookmarkedMedia()`: the Bookmarked Movies and
  Bookmarked TV Series groups, each an independent progressive list. A committed
  search query replaces it with `useBookmarkedSearch()`, whose Movie and TV
  bookmark searches are independent progressive lists of their own.

  Which mode is displayed is decided by the committed `activeQuery` (the URL),
  never by the transient field value, so the page cannot swap datasets
  mid-keystroke, and clearing the query restores the normal Bookmarked state the
  other composable already holds.

  The page is a mapping from those two composables onto the shared media
  primitives; it owns no fetching, no pagination loop, and no bookmark mutation.

  In both modes the two groups fail and continue independently, so neither a
  Movie page-1 failure nor a Movie continuation failure can hide or block the TV
  group (and the reverse). Empty and failed are never conflated: only a success
  response with no items and no reported total counts as empty, and the
  whole-page empty state requires both normal groups to satisfy that at once.

  Every failure — normal or search — offers its own Retry: a failed page 1
  re-runs only that group's page-1 read, a failed continuation only that
  group's next page, so retrying one group never resets or retries the other.
-->
<script setup lang="ts">
import type { MediaItem } from '~/../shared/contracts'

definePageMeta({
  middleware: 'auth'
})

const {
  movieItems,
  movieStatus,
  movieError,
  movieTotal,
  retryMovies,
  movieHasMore,
  movieIsLoadingMore,
  loadNextMovies,

  tvItems,
  tvStatus,
  tvError,
  tvTotal,
  retryTv,
  tvHasMore,
  tvIsLoadingMore,
  loadNextTv
} = useBookmarkedMedia()

// Bookmarked search is its own lifecycle: it owns the field, debounces it into
// the URL, and reads both groups from the authenticated bookmark endpoint.
// Page 1 is an SSR read, so it is awaited to resolve direct-link queries.
const {
  query: searchQuery,
  activeQuery: searchActiveQuery,

  movieResults: searchMovieResults,
  movieStatus: searchMovieStatus,
  movieError: searchMovieError,
  movieTotal: searchMovieTotal,
  retryMovies: retrySearchMovies,
  movieHasMore: searchMovieHasMore,
  movieIsLoadingMore: searchMovieIsLoadingMore,
  loadNextMovies: loadNextSearchMovies,

  tvResults: searchTvResults,
  tvStatus: searchTvStatus,
  tvError: searchTvError,
  tvTotal: searchTvTotal,
  retryTv: retrySearchTv,
  tvHasMore: searchTvHasMore,
  tvIsLoadingMore: searchTvIsLoadingMore,
  loadNextTv: loadNextSearchTv,

  total: searchTotal
} = await useBookmarkedSearch()

// Only the committed query switches modes. While the user types, the field may
// run ahead without the page having anything to show for the new query yet.
const isSearchMode = computed(() => searchActiveQuery.value !== '')

// One full desktop grid (two rows of four), the same reservation the Movies and
// TV Series pages use, so the loading state reserves the grid geometry the
// Figma Bookmarked frames render.
const GRID_SKELETON_COUNT = 8

/**
 * Stable list key for a media item. Only uniqueness per provider identity and
 * stability across appended pages matter here, so the separator is local to
 * keying rather than the composable's canonical identity format.
 */
function itemKey(item: MediaItem): string {
  return `${item.mediaType}-${item.externalId}`
}

// `status` reports a page-1 failure, which leaves no list to show and replaces
// the grid. A continuation failure keeps `status` at `success` and surfaces
// only through `error`, which is what keeps the loaded cards on screen and is
// reported beside them instead.
const movieLoadFailed = computed(() => movieStatus.value === 'error')
const movieContinuationFailed = computed(
  () => !movieLoadFailed.value && movieError.value !== null
)

const tvLoadFailed = computed(() => tvStatus.value === 'error')
const tvContinuationFailed = computed(
  () => !tvLoadFailed.value && tvError.value !== null
)

/**
 * Empty success: the group loaded and has nothing to show. Pending and failed
 * groups deliberately do not qualify — they have no result set yet, so their
 * section must stay visible.
 */
const movieEmpty = computed(
  () =>
    movieStatus.value === 'success' &&
    movieItems.value.length === 0 &&
    movieTotal.value === 0
)
const tvEmpty = computed(
  () =>
    tvStatus.value === 'success' &&
    tvItems.value.length === 0 &&
    tvTotal.value === 0
)

const movieHasResults = computed(() => movieItems.value.length > 0)
const tvHasResults = computed(() => tvItems.value.length > 0)

// The whole-page empty state needs both groups to be empty successes, so it can
// never appear while one group is still loading or has failed.
const wholePageEmpty = computed(() => movieEmpty.value && tvEmpty.value)

// An empty section is dropped only when the other group actually has results;
// otherwise the section stays so the page never looks silently broken.
const showMovieSection = computed(
  () => !wholePageEmpty.value && (!movieEmpty.value || !tvHasResults.value)
)
const showTvSection = computed(
  () => !wholePageEmpty.value && (!tvEmpty.value || !movieHasResults.value)
)

// Search failures follow the same split as the normal groups: a failed page 1
// has no list to show, while a failed continuation keeps every loaded card and
// only reports itself beside them.
const searchMovieLoadFailed = computed(
  () => searchMovieStatus.value === 'error'
)
const searchMovieContinuationFailed = computed(
  () => !searchMovieLoadFailed.value && searchMovieError.value !== null
)

const searchTvLoadFailed = computed(() => searchTvStatus.value === 'error')
const searchTvContinuationFailed = computed(
  () => !searchTvLoadFailed.value && searchTvError.value !== null
)

/**
 * The combined result count is only honest once both page-1 searches have
 * succeeded: while either group is pending the backend total is unknown, and
 * when either has failed the page cannot describe the whole result set.
 */
const searchHeadingVisible = computed(
  () =>
    searchMovieStatus.value === 'success' && searchTvStatus.value === 'success'
)

// The Figma result-count line, including its typographic quotes. It reads the
// committed query and the combined backend total, never the transient field or
// the number of rendered cards.
const searchHeading = computed(() => {
  const count =
    searchTotal.value === 1 ? '1 result' : `${searchTotal.value} results`
  return `Found ${count} for ‘${searchActiveQuery.value}’`
})

// A search group is empty only when its loaded results AND the adjusted backend
// total are both zero. An empty loaded list with a positive total means the
// remaining matches live on later pages, so the section and its continuation
// control must stay. A successful group with no results is dropped only when
// the other group has results; when both are empty the combined heading already
// reports the zero count, so neither empty section heading is shown.
const searchMovieEmpty = computed(
  () =>
    searchMovieStatus.value === 'success' &&
    searchMovieResults.value.length === 0 &&
    searchMovieTotal.value === 0
)
const searchTvEmpty = computed(
  () =>
    searchTvStatus.value === 'success' &&
    searchTvResults.value.length === 0 &&
    searchTvTotal.value === 0
)
const searchBothEmpty = computed(
  () => searchMovieEmpty.value && searchTvEmpty.value
)

const searchMovieHasResults = computed(
  () => searchMovieResults.value.length > 0
)
const searchTvHasResults = computed(() => searchTvResults.value.length > 0)

const showSearchMovieSection = computed(
  () =>
    !searchBothEmpty.value &&
    (!searchMovieEmpty.value || !searchTvHasResults.value)
)
const showSearchTvSection = computed(
  () =>
    !searchBothEmpty.value &&
    (!searchTvEmpty.value || !searchMovieHasResults.value)
)
</script>

<template>
  <div class="bookmarked-page">
    <div class="bookmarked-search">
      <SearchBar
        v-model="searchQuery"
        placeholder="Search for bookmarked shows"
      />
    </div>

    <template v-if="isSearchMode">
      <!-- The combined heading reuses the section-heading class: Figma renders
           it with the same responsive Text Preset as the section headings. -->
      <h1 v-if="searchHeadingVisible" class="bookmarked-section__heading">
        {{ searchHeading }}
      </h1>

      <section
        v-if="showSearchMovieSection"
        class="bookmarked-section"
        aria-labelledby="bookmarked-search-movies-heading"
      >
        <h2
          id="bookmarked-search-movies-heading"
          class="bookmarked-section__heading"
        >
          Bookmarked Movies
        </h2>

        <div class="bookmarked-section__content">
          <p
            v-if="searchMovieLoadFailed"
            class="bookmarked-section__error"
            role="alert"
          >
            Bookmarked movie search is unavailable right now. Please try again
            later.
            <button
              type="button"
              class="bookmarked-section__retry"
              @click="retrySearchMovies()"
            >
              Retry
            </button>
          </p>
          <template v-else>
            <MediaGrid>
              <template v-if="searchMovieStatus === 'pending'">
                <MediaCardSkeleton
                  v-for="index in GRID_SKELETON_COUNT"
                  :key="index"
                />
              </template>
              <MediaCard
                v-for="item in searchMovieResults"
                :key="itemKey(item)"
                :item="item"
              />
            </MediaGrid>

            <p
              v-if="searchMovieContinuationFailed"
              class="bookmarked-section__error"
              role="status"
            >
              Couldn't load more bookmarked movie results.
              <button
                type="button"
                class="bookmarked-section__retry"
                :disabled="searchMovieIsLoadingMore"
                @click="loadNextSearchMovies()"
              >
                Retry
              </button>
            </p>

            <ProgressiveSentinel
              :enabled="searchMovieHasMore"
              :busy="searchMovieIsLoadingMore"
              :loaded="searchMovieResults.length"
              :total="searchMovieTotal"
              @load="loadNextSearchMovies"
            />
          </template>
        </div>
      </section>

      <section
        v-if="showSearchTvSection"
        class="bookmarked-section"
        aria-labelledby="bookmarked-search-tv-heading"
      >
        <h2
          id="bookmarked-search-tv-heading"
          class="bookmarked-section__heading"
        >
          Bookmarked TV Series
        </h2>

        <div class="bookmarked-section__content">
          <p
            v-if="searchTvLoadFailed"
            class="bookmarked-section__error"
            role="alert"
          >
            Bookmarked TV search is unavailable right now. Please try again
            later.
            <button
              type="button"
              class="bookmarked-section__retry"
              @click="retrySearchTv()"
            >
              Retry
            </button>
          </p>
          <template v-else>
            <MediaGrid>
              <template v-if="searchTvStatus === 'pending'">
                <MediaCardSkeleton
                  v-for="index in GRID_SKELETON_COUNT"
                  :key="index"
                />
              </template>
              <MediaCard
                v-for="item in searchTvResults"
                :key="itemKey(item)"
                :item="item"
              />
            </MediaGrid>

            <p
              v-if="searchTvContinuationFailed"
              class="bookmarked-section__error"
              role="status"
            >
              Couldn't load more bookmarked TV results.
              <button
                type="button"
                class="bookmarked-section__retry"
                :disabled="searchTvIsLoadingMore"
                @click="loadNextSearchTv()"
              >
                Retry
              </button>
            </p>

            <ProgressiveSentinel
              :enabled="searchTvHasMore"
              :busy="searchTvIsLoadingMore"
              :loaded="searchTvResults.length"
              :total="searchTvTotal"
              @load="loadNextSearchTv"
            />
          </template>
        </div>
      </section>
    </template>

    <template v-else>
      <p v-if="wholePageEmpty" class="bookmarked-page__empty">
        You haven't bookmarked any shows yet.
      </p>

      <template v-else>
        <section
          v-if="showMovieSection"
          class="bookmarked-section"
          aria-labelledby="bookmarked-movies-heading"
        >
          <h2
            id="bookmarked-movies-heading"
            class="bookmarked-section__heading"
          >
            Bookmarked Movies
          </h2>

          <div class="bookmarked-section__content">
            <p
              v-if="movieLoadFailed"
              class="bookmarked-section__error"
              role="alert"
            >
              Bookmarked movies are unavailable right now. Please try again
              later.
              <button
                type="button"
                class="bookmarked-section__retry"
                @click="retryMovies()"
              >
                Retry
              </button>
            </p>
            <template v-else>
              <MediaGrid>
                <template v-if="movieStatus === 'pending'">
                  <MediaCardSkeleton
                    v-for="index in GRID_SKELETON_COUNT"
                    :key="index"
                  />
                </template>
                <MediaCard
                  v-for="item in movieItems"
                  :key="itemKey(item)"
                  :item="item"
                />
              </MediaGrid>

              <p
                v-if="movieContinuationFailed"
                class="bookmarked-section__error"
                role="status"
              >
                Couldn't load more bookmarked movies.
                <button
                  type="button"
                  class="bookmarked-section__retry"
                  :disabled="movieIsLoadingMore"
                  @click="loadNextMovies()"
                >
                  Retry
                </button>
              </p>

              <ProgressiveSentinel
                :enabled="movieHasMore"
                :busy="movieIsLoadingMore"
                :loaded="movieItems.length"
                :total="movieTotal"
                @load="loadNextMovies"
              />
            </template>
          </div>
        </section>

        <section
          v-if="showTvSection"
          class="bookmarked-section"
          aria-labelledby="bookmarked-tv-heading"
        >
          <h2 id="bookmarked-tv-heading" class="bookmarked-section__heading">
            Bookmarked TV Series
          </h2>

          <div class="bookmarked-section__content">
            <p
              v-if="tvLoadFailed"
              class="bookmarked-section__error"
              role="alert"
            >
              Bookmarked TV series are unavailable right now. Please try again
              later.
              <button
                type="button"
                class="bookmarked-section__retry"
                @click="retryTv()"
              >
                Retry
              </button>
            </p>
            <template v-else>
              <MediaGrid>
                <template v-if="tvStatus === 'pending'">
                  <MediaCardSkeleton
                    v-for="index in GRID_SKELETON_COUNT"
                    :key="index"
                  />
                </template>
                <MediaCard
                  v-for="item in tvItems"
                  :key="itemKey(item)"
                  :item="item"
                />
              </MediaGrid>

              <p
                v-if="tvContinuationFailed"
                class="bookmarked-section__error"
                role="status"
              >
                Couldn't load more bookmarked TV series.
                <button
                  type="button"
                  class="bookmarked-section__retry"
                  :disabled="tvIsLoadingMore"
                  @click="loadNextTv()"
                >
                  Retry
                </button>
              </p>

              <ProgressiveSentinel
                :enabled="tvHasMore"
                :busy="tvIsLoadingMore"
                :loaded="tvItems.length"
                :total="tvTotal"
                @load="loadNextTv"
              />
            </template>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>
