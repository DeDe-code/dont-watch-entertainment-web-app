<!--
  AppNavigation.vue — primary application navigation ("app shell").
  Renders as a fixed-width left sidebar on desktop and as a top bar on
  tablet/mobile. The shape change is driven purely by CSS breakpoints
  (see `.app-nav-bar` in assets/css/main.css), so markup and SSR output are
  identical at every viewport width and no resize listener is required.

  The component owns two responsibilities:
  - route navigation (logo + icon links), with Figma's active/default/hover
    icon treatment expressed through `color` (icons render as CSS masks that
    inherit `currentColor`);
  - the account control, a disclosure whose only action is "Log out".
-->
<script setup lang="ts">
// Static Figma-provided avatar, bundled locally by Vite (never a remote URL).
import avatarUrl from '~/assets/images/avatar.png'

// The account menu is a disclosure rather than an ARIA menu widget because it
// contains a single action: full menu/roving-tabindex semantics would add
// complexity without changing how assistive technology announces one button.
const { logout } = useAuth()
const route = useRoute()

interface NavItem {
  label: string
  to: string
  icon: string
}

// Order matches the Figma Navbar component.
const navItems: NavItem[] = [
  { label: 'Home', to: '/', icon: 'i-custom-icon-nav-home' },
  { label: 'Movies', to: '/movies', icon: 'i-custom-icon-nav-movies' },
  { label: 'TV Series', to: '/tv-series', icon: 'i-custom-icon-nav-tv-series' },
  {
    label: 'Bookmarked',
    to: '/bookmarked',
    icon: 'i-custom-icon-nav-bookmark'
  }
]

// Home is only current at the exact root path; section links stay current for
// their whole subtree.
function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}

const menuOpen = ref(false)
const accountRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)

function closeMenu() {
  menuOpen.value = false
}

// Escape must also return focus to the trigger, otherwise focus would be lost
// inside the now-removed popup.
function onEscape() {
  if (!menuOpen.value) return
  closeMenu()
  triggerRef.value?.focus()
}

function onOutsidePointerdown(event: PointerEvent) {
  if (!menuOpen.value) return
  if (accountRef.value && !accountRef.value.contains(event.target as Node))
    closeMenu()
}

onMounted(() => document.addEventListener('pointerdown', onOutsidePointerdown))
onBeforeUnmount(() =>
  document.removeEventListener('pointerdown', onOutsidePointerdown)
)

async function onLogout() {
  closeMenu()
  await logout()
  await navigateTo('/login')
}
</script>

<template>
  <header class="app-nav-bar">
    <NuxtLink to="/" class="app-nav-logo" aria-label="Go to home">
      <UIcon
        name="i-custom-logo"
        class="app-nav-logo-icon"
        aria-hidden="true"
      />
    </NuxtLink>

    <nav class="app-nav-menu" aria-label="Main navigation">
      <NuxtLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="app-nav-link"
        :aria-label="item.label"
        :aria-current="isActive(item.to) ? 'page' : undefined"
      >
        <UIcon :name="item.icon" class="app-nav-icon" aria-hidden="true" />
      </NuxtLink>
    </nav>

    <div ref="accountRef" class="app-account" @keydown.escape="onEscape">
      <button
        ref="triggerRef"
        type="button"
        class="app-account-trigger"
        aria-label="Account menu"
        aria-controls="account-menu"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen"
      >
        <img
          :src="avatarUrl"
          alt=""
          class="app-account-avatar"
          width="80"
          height="80"
        />
      </button>

      <div v-if="menuOpen" id="account-menu" class="app-account-menu">
        <button type="button" class="app-account-menu-item" @click="onLogout">
          Log out
        </button>
      </div>
    </div>
  </header>
</template>
