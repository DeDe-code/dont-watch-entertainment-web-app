<!--
  MediaCardSkeleton.vue — loading placeholder that reserves the geometry of the
  card it stands in for, so swapping in real data does not shift the layout.

  `variant` mirrors the two card presentations: `card` keeps the thumbnail plus
  the two text lines below it, `trending` keeps only the fixed-width trending
  thumbnail. The blocks are static (no pulse) because the task forbids inventing
  animation that is not in Figma.
-->
<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'card' | 'trending' }>(), {
  variant: 'card'
})
</script>

<template>
  <div
    class="media-skeleton"
    :class="`media-skeleton--${variant}`"
    aria-hidden="true"
  >
    <span class="media-skeleton__thumb" />
    <span v-if="variant === 'card'" class="media-skeleton__lines">
      <span class="media-skeleton__line media-skeleton__line--meta" />
      <span class="media-skeleton__line media-skeleton__line--title" />
    </span>
  </div>
</template>
