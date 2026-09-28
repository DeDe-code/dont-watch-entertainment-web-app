<!--
  pages/bookmarked/index.vue — authenticated Bookmarked route.
  FE-004 only needs the guarded route to exist so unauthenticated navigation
  redirects to login with a return path; the Figma page content is FE-011.
-->
<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})
</script>

<template>
  <!-- Placeholder until the Figma Bookmarked page (FE-011) is implemented -->
  <div>
    <h1>Bookmarked</h1>
  </div>
</template>
