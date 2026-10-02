<!--
  error.vue — Nuxt application error page.

  Nuxt renders this component *instead of* the normal page (and outside the
  regular layouts) whenever a route is unmatched or a runtime error escapes, so
  it owns its own full-viewport presentation. It intentionally shows only
  fixed, user-facing copy: `error.message`, stack traces, and `error.data` can
  carry provider, database, or stack internals and must never reach the browser.
  A 404 is an everyday "wrong URL" outcome; every other status is a genuine
  failure, so only those two presentations exist.
-->
<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const isNotFound = computed(() => props.error.statusCode === 404)
const title = computed(() =>
  isNotFound.value ? 'Page not found' : 'Something went wrong'
)
const description = computed(() =>
  isNotFound.value
    ? 'We couldn’t find the page you were looking for.'
    : 'Something went wrong on our side. Please try again.'
)

// clearError tears down the error state *before* navigating; a plain link would
// leave the router sitting on the error boundary and re-render this page.
function goHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <main class="error-page">
    <div class="error-card">
      <h1 class="error-title">{{ title }}</h1>
      <p class="error-message">{{ description }}</p>
      <button type="button" class="error-action" @click="goHome">
        Back to Home
      </button>
    </div>
  </main>
</template>
