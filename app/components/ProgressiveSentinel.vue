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
    return props.total > 0 ? `All ${describeCount(props.total)} loaded` : ''
  }
  return `Showing ${props.loaded} of ${describeCount(props.total)}`
})
</script>

<template>
  <div ref="target" class="progressive-sentinel">
    <p class="sr-only" role="status">{{ statusText }}</p>
  </div>
</template>
