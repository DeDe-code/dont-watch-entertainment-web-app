<!--
  MediaCard.vue — the regular Figma media card: backdrop thumbnail with a
  bookmark control and hover/play presentation, then the metadata row and title
  below the image.

  The card owns no data fetching, bookmark mutation policy, or navigation: it
  renders a `MediaItem` from the shared contract and delegates bookmark
  persistence to `useBookmarks()`, passing only the item identity so every card
  for the same provider identity reflects the same mutation immediately.
  Geometry (image aspect ratio, bookmark inset, typography) is driven by the
  app-owned CSS layer so the card stays a small, deep module and the responsive
  rules live in one place.

  The backdrop is decorative because the title is rendered as text next to it,
  so `alt=""` avoids announcing the same title twice.
-->
<script setup lang="ts">
import type { MediaItem } from '~/../shared/contracts'
import {
  tmdbCardImageSizes,
  tmdbImageSrcset,
  tmdbImageUrl
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

// `w500` is the largest entry of `tmdbCardImageSizes`; it is the `src` used by
// browsers that ignore `srcset`.
const imageSrc = computed(() => tmdbImageUrl(props.item.backdropPath, 'w500'))

const imageSrcset = computed(() =>
  tmdbImageSrcset(props.item.backdropPath, tmdbCardImageSizes)
)

// The grid's column count drives the rendered width, so viewport-relative
// `sizes` stays accurate between the 375 / 768 / 1440 reference widths.
const imageSizes = '(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw'
</script>

<template>
  <article class="media-card">
    <div class="media-card__thumb">
      <img
        v-if="imageSrc"
        class="media-card__image"
        :src="imageSrc"
        :srcset="imageSrcset"
        :sizes="imageSizes"
        alt=""
        :loading="priority ? 'eager' : 'lazy'"
        :fetchpriority="priority ? 'high' : undefined"
        decoding="async"
      />
      <PlayOverlay class="media-card__play" />
      <BookmarkButton
        class="media-card__bookmark"
        :bookmarked="bookmarked"
        :title="item.title"
        @toggle="handleBookmarkToggle"
      />
    </div>

    <div class="media-card__info">
      <MediaMeta
        :media-type="item.mediaType"
        :year="item.year"
        :content-rating="item.contentRating"
      />
      <h3 class="media-card__title">{{ item.title }}</h3>
    </div>
  </article>
</template>
