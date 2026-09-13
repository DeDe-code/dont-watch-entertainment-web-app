<!--
  layouts/login.vue — Minimal layout used by the Login and Signup pages.
  Omits the AppHeader so unauthenticated users see only the auth form.
-->
<script setup lang="ts">
// No additional setup needed; this layout intentionally excludes the navigation header
</script>

<template>
  <!-- UMain: semantic <main> wrapper; provides correct vertical padding around the auth form -->
  <UMain>
    <!-- Default slot: the login or signup page component is injected here -->
    <slot />
  </UMain>

  <!-- UFooter: site-wide footer shown even on auth pages -->
  <UFooter />
</template>
