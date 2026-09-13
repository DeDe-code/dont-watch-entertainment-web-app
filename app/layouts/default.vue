<!--
  layouts/default.vue — Default layout applied to all authenticated pages.
  Renders the top header, the main content slot, and a footer.
-->
<script setup lang="ts">
// No additional setup needed; the layout only composes shared UI shell components
</script>

<template>
  <!-- AppHeader: top navigation bar with logo and nav links -->
  <AppHeader />

  <!-- UMain: semantic <main> wrapper that provides correct spacing around page content -->
  <UMain>
    <!-- Default slot: the current page component is injected here -->
    <slot />
  </UMain>

  <!-- UFooter: site-wide footer bar -->
  <UFooter />
</template>
