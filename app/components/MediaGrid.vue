<!--
  MediaGrid.vue — responsive grid for `MediaCard`s (and matching skeletons).

  Only the layout lives here: two columns on mobile, three on tablet, four on
  desktop, with the Figma gaps. Pages own their headings, fetching, and empty
  states, so the grid stays a small reusable primitive rather than a page
  template.
-->
<template>
  <div class="media-grid">
    <slot />
  </div>
</template>
