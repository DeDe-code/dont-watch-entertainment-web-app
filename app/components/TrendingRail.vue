<!--
  TrendingRail.vue — horizontal rail for fixed-width `TrendingCard`s.

  Overflow is native CSS (`overflow-x: auto`), so touch, trackpad, and wheel all
  work without a carousel library, and the cards keep their Figma width instead
  of shrinking into a grid. The rail itself is focusable and labelled so keyboard
  users can reach and arrow-scroll it; the cards inside stay reachable through
  their own bookmark buttons.
-->
<script setup lang="ts">
defineProps<{
  /** Accessible name for the scroll region, e.g. "Trending". */
  label: string
}>()
</script>

<template>
  <div class="media-rail" role="group" :aria-label="label" tabindex="0">
    <slot />
  </div>
</template>
