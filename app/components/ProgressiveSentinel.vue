<!--
  ProgressiveSentinel.vue — reusable progressive-continuation sentinel.

  Place it after a result list. It watches itself with an IntersectionObserver
  and emits `load` while it is visible, the list still has pages left, and no
  request is in flight, so long lists grow without pagination controls.

  It also owns the assistive-technology announcement for appended results
  (`role="status"`), because that message is a property of the continuation
  itself rather than of any particular page.
-->
<script setup lang="ts">
const props = defineProps<{
  /** More pages are available. */
  enabled: boolean
  /** A page request is in flight. */
  busy: boolean
  /** Results currently rendered. */
  loaded: number
  /** Total results reported by the backend. */
  total: number
  /**
   * Announce the rendered result count instead of the backend total.
   *
   * Set this when the list hides results the backend still counts (Home's
   * Recommended grid drops identities already visible in Trending), because
   * `total` would then overstate what the user can actually reach. The
   * continuation behaviour is unaffected.
   */
  countDisplayed?: boolean
}>()

const emit = defineEmits<{ load: [] }>()

// Preload slightly before the sentinel scrolls into view so the next page is
// usually ready by the time the user reaches it.
const ROOT_MARGIN = '200px'

const target = ref<HTMLElement | null>(null)
const visible = ref(false)
let observer: IntersectionObserver | undefined

function requestNextPage() {
  if (visible.value && props.enabled && !props.busy) emit('load')
}

// Re-check when more pages become available or new results are appended.
// Do not watch `busy`: a failed request ending while the sentinel remains
// visible must not immediately retry itself.
watch(() => [props.enabled, props.loaded], requestNextPage)

function onIntersect(entries: IntersectionObserverEntry[]) {
  visible.value = entries.some((entry) => entry.isIntersecting)
  requestNextPage()
}

onMounted(() => {
  if (!target.value || typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver(onIntersect, { rootMargin: ROOT_MARGIN })
  observer.observe(target.value)
})

onBeforeUnmount(() => observer?.disconnect())

function describeCount(count: number) {
  return count === 1 ? '1 result' : `${count} results`
}

const statusText = computed(() => {
  if (props.busy) return 'Loading more results…'
  if (!props.enabled) {
    const count = props.countDisplayed ? props.loaded : props.total
    return count > 0 ? `All ${describeCount(count)} loaded` : ''
  }
  // A list that hides backend results must not quote a total while more pages
  // remain, so it reports only what is currently on screen.
  if (props.countDisplayed) return `Showing ${describeCount(props.loaded)}`
  return `Showing ${props.loaded} of ${describeCount(props.total)}`
})
</script>

<template>
  <div ref="target" class="progressive-sentinel">
    <p class="sr-only" role="status">{{ statusText }}</p>
  </div>
</template>
