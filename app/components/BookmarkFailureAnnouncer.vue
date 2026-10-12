<!--
  BookmarkFailureAnnouncer — shell-level live regions that speak a rejected
  bookmark mutation.
-->
<script setup lang="ts">
// The shell, not the reporting card, owns these regions so they exist before the
// first failure instead of being inserted together with their content, which
// assistive technology ignores. Which region carries the message is the
// composable's contract; this component only renders the surfaces it names.
const { announcement } = useBookmarkFailureNotice()
</script>

<template>
  <!-- Persistent, visually hidden announcement surface; never aria-hidden -->
  <div class="app-bookmark-announcer sr-only">
    <div
      v-for="region in bookmarkFailureAnnouncementRegions"
      :key="region"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      {{ announcement?.region === region ? announcement.message : '' }}
    </div>
  </div>
</template>
