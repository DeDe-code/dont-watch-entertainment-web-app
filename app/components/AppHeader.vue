<!--
  AppHeader.vue — Top navigation header rendered on all pages that use the default layout.
  Contains the app logo, main navigation links, and the login shortcut.
-->
<script setup lang="ts">
// Import the NavigationMenuItem type from Nuxt UI for strongly-typed nav items
import type { NavigationMenuItem } from '@nuxt/ui'

// Access the current route so we can mark the active navigation item
const route = useRoute()

// Build the navigation menu items, marking the current route as active
// The bookmarked item is commented out until the feature is ready
const items = computed<NavigationMenuItem[]>(() => [
  {
    to: '/',
    // Mark as active when we are exactly on the home route
    active: route.path === '/',
    icon: 'i-custom-icon-nav-home'
  },
  {
    to: '/movies',
    // Mark as active for any sub-route under /movies
    active: route.path.startsWith('/movies'),
    icon: 'i-custom-icon-nav-movies'
  },
  {
    to: '/tv-series',
    // Mark as active for any sub-route under /tv-series
    active: route.path.startsWith('/tv-series'),
    icon: 'i-custom-icon-nav-tv-series'
  }
  // Bookmarks nav item — uncomment when the bookmarked page is implemented
  // { label: 'Bookmarked', to: '/bookmarked', active: route.path.startsWith('/bookmarked') }
])
</script>

<template>
  <!-- Outer wrapper required by UHeader for proper layout containment -->
  <div>
    <!-- UHeader: disable the built-in mobile hamburger toggle since we manage nav ourselves -->
    <UHeader :toggle="false">
      <!-- Left slot: app logo linking back to the home page -->
      <template #left>
        <UIcon name="i-custom-logo" class="w-400 h-[27px] text-red-500" />
      </template>

      <!-- Centre slot (default): horizontal navigation links -->
      <UNavigationMenu :items="items" />

      <!-- Right slot: quick login link shown when the user is not authenticated -->
      <template #right>
        <NuxtLink to="/login" class="text-sm text-white"> Login </NuxtLink>
      </template>
    </UHeader>
  </div>
</template>
