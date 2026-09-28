<!--
  layouts/default.vue — application shell for pages that show the main
  navigation. Composes the responsive AppNavigation, a single semantic <main>
  landmark that clears the shell, a skip link, and Nuxt's route announcer.
  All responsive behavior lives in CSS (see `.app-shell` in main.css), so the
  markup is identical on server and client and no resize handling is needed.
-->
<template>
  <div class="app-shell">
    <!-- Skip link: first focusable element so keyboard users can bypass the nav -->
    <a class="app-skip-link" href="#main-content">Skip to main content</a>

    <!-- AppNavigation: left sidebar on desktop, top bar on tablet/mobile -->
    <AppNavigation />

    <!-- Single main landmark; the id is the skip-link target -->
    <main id="main-content" class="app-main">
      <slot />
    </main>

    <!-- Announces client-side route changes to assistive technology -->
    <NuxtRouteAnnouncer />
  </div>
</template>
