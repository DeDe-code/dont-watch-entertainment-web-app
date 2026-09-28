<!--
  BookmarkButton.vue — the Figma bookmark control (default / hover / bookmarked).

  Only the visual contract and a typed interaction interface live here. The
  component never calls the API and never reads auth state: FE-007 owns the
  mutation and will handle `toggle`, so the button stays a deep, reusable
  primitive instead of an implicit network boundary.

  The icon swaps with the `bookmarked` prop (outline → filled) and the circle
  colour flips on hover, matching the three Figma states. `aria-pressed` exposes
  the same state to assistive technology, and the accessible name states the
  action, including which title it applies to.
-->
<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    bookmarked?: boolean
    title?: string
  }>(),
  {
    bookmarked: false,
    title: ''
  }
)

const emit = defineEmits<{ toggle: [] }>()

const label = computed(() => {
  const action = props.bookmarked ? 'Remove bookmark' : 'Add bookmark'
  return props.title ? `${action} for ${props.title}` : action
})
</script>

<template>
  <button
    type="button"
    class="media-bookmark"
    :aria-pressed="bookmarked"
    :aria-label="label"
    @click="emit('toggle')"
  >
    <UIcon
      :name="
        bookmarked ? 'i-custom-icon-bookmark-filled' : 'i-custom-icon-bookmark'
      "
      class="media-bookmark__icon"
      aria-hidden="true"
    />
  </button>
</template>
