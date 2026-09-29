<!--
  TrendingCard.vue — the wide Figma trending card used inside `TrendingRail`.

  It is a separate presentation from `MediaCard` rather than a variant of it:
  the geometry, the fixed card width, the gradient scrim, and the
  overlaid title/metadata are all different, so sharing one component would only
  add conditional branches. The card keeps a fixed width and never shrinks, so
  the rail scrolls instead of collapsing into a grid.

  Bookmark persistence is delegated to `useBookmarks()` by identity, exactly as
  `MediaCard` does, so a toggle made in either presentation is reflected in
  both.
-->
<script setup lang="ts">
import type { MediaItem } from '~/../shared/contracts'
import {
  tmdbImageSrcset,
  tmdbImageUrl,
  tmdbTrendingImageSizes
} from '~/utils/tmdb-image'

const props = withDefaults(
  defineProps<{
    item: MediaItem
    /** Marks the first above-the-fold card so its backdrop is fetched eagerly. */
    priority?: boolean
  }>(),
  { priority: false }
)

const { seed, isBookmarked, toggle } = useBookmarks()

// Seed the provider's flag for this identity so the shared map carries truth
// for cards mounted before any mutation; `seed` stores identity only and defers
// to an in-flight toggle. Watching the item reference (rather than seeding once)
// keeps a reused card correct when the page swaps its item under it.
watch(
  () => props.item,
  (item) => seed([item]),
  { immediate: true }
)

// Rendering reads the shared flag, never `item.isBookmarked`, so a toggle made
// anywhere for this identity is visible here.
const bookmarked = computed(() =>
  isBookmarked({
    mediaType: props.item.mediaType,
    externalId: props.item.externalId
  })
)

// Only the identity crosses the mutation boundary: `useBookmarks` owns the
// provider, request shape, per-identity pending lock, and optimistic rollback.
// Returning the promise lets Vue route a failed mutation through its error
// handling instead of an unhandled rejection.
function handleBookmarkToggle() {
  return toggle({
    mediaType: props.item.mediaType,
    externalId: props.item.externalId
  })
}

// `w780` is the only (and therefore largest) entry of
// `tmdbTrendingImageSizes`; it is the `src` used by browsers that ignore
// `srcset`.
const imageSrc = computed(() => tmdbImageUrl(props.item.backdropPath, 'w780'))

const imageSrcset = computed(() =>
  tmdbImageSrcset(props.item.backdropPath, tmdbTrendingImageSizes)
)

// Trending cards have a fixed width per breakpoint, so `sizes` can be exact.
const imageSizes = '(min-width: 768px) 470px, 240px'
</script>

<template>
  <article class="media-trending-card">
    <div class="media-trending-card__thumb">
      <img
        v-if="imageSrc"
        class="media-trending-card__image"
        :src="imageSrc"
        :srcset="imageSrcset"
        :sizes="imageSizes"
        alt=""
        :loading="priority ? 'eager' : 'lazy'"
        :fetchpriority="priority ? 'high' : undefined"
        decoding="async"
      />
      <PlayOverlay class="media-trending-card__play" />
      <BookmarkButton
        class="media-trending-card__bookmark"
        :bookmarked="bookmarked"
        :title="item.title"
        @toggle="handleBookmarkToggle"
      />

      <div class="media-trending-card__info">
        <MediaMeta
          variant="trending"
          :media-type="item.mediaType"
          :year="item.year"
          :content-rating="item.contentRating"
        />
        <h3 class="media-trending-card__title">{{ item.title }}</h3>
      </div>
    </div>
  </article>
</template>
