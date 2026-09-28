<!--
  TrendingCard.vue — the wide Figma trending card used inside `TrendingRail`.

  It is a separate presentation from `MediaCard` rather than a variant of it:
  the geometry, the fixed card width, the gradient scrim, and the
  overlaid title/metadata are all different, so sharing one component would only
  add conditional branches. The card keeps a fixed width and never shrinks, so
  the rail scrolls instead of collapsing into a grid.
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

const emit = defineEmits<{ 'bookmark-toggle': [] }>()

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
        :bookmarked="item.isBookmarked"
        :title="item.title"
        @toggle="emit('bookmark-toggle')"
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
