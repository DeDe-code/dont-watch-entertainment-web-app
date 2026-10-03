<!--
  app.vue — Root application component.
  Wraps the entire app in UApp (Nuxt UI context provider) so that all
  child components have access to the configured theme and colour tokens.
-->
<script setup lang="ts">
// Title composition belongs here rather than in nuxt.config because the rule
// depends on whether the current route declared a title — a runtime fact the
// static config cannot express. Pages declare a bare title ("Movies") and the
// product name is appended exactly once. The config fallback title still covers
// the routes that never render this component, such as the error boundary.
useHead({
  titleTemplate: (title?: string) =>
    title ? `${title} | Don't Watch Entertainment` : `Don't Watch Entertainment`
})
</script>

<template>
  <!-- UApp provides the Nuxt UI context (theme, toasts, modals) to the whole app -->
  <UApp>
    <!-- NuxtLayout renders the active layout (default or login) around the current page -->
    <NuxtLayout>
      <!-- NuxtPage renders the matched route component -->
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
