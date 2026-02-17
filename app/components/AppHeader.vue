<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()

const items = computed<NavigationMenuItem[]>(() => [
  {
    to: '/',
    active: route.path === '/',
    icon: 'i-custom-icon-nav-home'
  },
  {
    to: '/movies',
    active: route.path.startsWith('/movies'),
    icon: 'i-custom-icon-nav-movies'
  },
  {
    to: '/tv-series',
    active: route.path.startsWith('/tv-series'),
    icon: 'i-custom-icon-nav-tv-series'
  }
  // { label: 'Bookmarked', to: '/bookmarked', active: route.path.startsWith('/bookmarked') }
])
</script>

<template>
  <div>
    <UHeader :toggle="false">
      <template #left>
        <UIcon
          name="i-custom-logo"
          class="w-spacing-400 h-[27px] text-red-500"
        />
      </template>
      <UNavigationMenu :items="items" />
      <template #right>
        <NuxtLink to="/login" class="text-sm text-white"> Login </NuxtLink>
      </template>
    </UHeader>
  </div>
</template>
