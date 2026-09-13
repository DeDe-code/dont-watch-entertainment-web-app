<!--
  app.vue — Root application component.
  Wraps the entire app in UApp (Nuxt UI context provider) so that all
  child components have access to the configured theme and colour tokens.
-->
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
