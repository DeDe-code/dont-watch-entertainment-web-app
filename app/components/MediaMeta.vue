<!--
  MediaMeta.vue — the year • media type • content rating line used by both card
  variants. The media type is always present; the year and rating are optional
  in the shared MediaItem contract, so each optional value also renders its own
  separator dot. That keeps the row free of dangling separators when TMDB (or a
  future provider) supplies a null year or rating.

  Typography and icon sizing are driven by `variant` through the app-owned CSS
  layer rather than Tailwind utilities, because the mobile/desktop text presets
  are plain custom classes that cannot take a responsive variant prefix.
-->
<script setup lang="ts">
import type { MediaType } from '~/../shared/contracts'

const props = withDefaults(
  defineProps<{
    mediaType: MediaType
    year?: number | null
    contentRating?: string | null
    variant?: 'card' | 'trending'
  }>(),
  {
    year: null,
    contentRating: null,
    variant: 'card'
  }
)

const typeLabel = computed(() =>
  props.mediaType === 'MOVIE' ? 'Movie' : 'TV Series'
)

const typeIcon = computed(() =>
  props.mediaType === 'MOVIE'
    ? 'i-custom-icon-media-movie'
    : 'i-custom-icon-media-tv'
)
</script>

<template>
  <p class="media-meta" :class="`media-meta--${variant}`">
    <template v-if="year != null">
      <span class="media-meta__item">{{ year }}</span>
      <span class="media-meta__dot" aria-hidden="true" />
    </template>

    <span class="media-meta__item">
      <UIcon :name="typeIcon" class="media-meta__icon" aria-hidden="true" />
      {{ typeLabel }}
    </span>

    <template v-if="contentRating">
      <span class="media-meta__dot" aria-hidden="true" />
      <span class="media-meta__item">{{ contentRating }}</span>
    </template>
  </p>
</template>
