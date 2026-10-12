<!--
  SearchBar.vue — the reusable contextual search field (Figma Search
  component, node 2050:2282).

  It owns only the input itself: the query value (via `v-model`) and the
  visual states from Figma — empty placeholder, filled text, and the focused
  active state with the Blue 500 underline and red caret. The contextual
  placeholder is a prop because the page that owns the search context also
  owns its copy (Home / Movies / TV / Bookmarked).

  There is no submit affordance: search is live/debounced, so the form only
  exists to absorb Enter and keep the control a labelled search landmark.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const model = defineModel<string>({ required: true })

withDefaults(
  defineProps<{
    /** Accessible name for the input; the design has no visible label. */
    label?: string
    /** Contextual copy; defaults to the Figma all-media placeholder. */
    placeholder?: string
  }>(),
  {
    label: 'Search',
    placeholder: 'Search for movies or TV series'
  }
)

/**
 * Whether the keyboard is how focus entered this field.
 *
 * A text input matches `:focus-visible` after a mouse click too, so the
 * selector cannot separate pointer focus (the thin Figma underline) from
 * keyboard focus (the thick one) and the field has to record the modality
 * itself. Tab is the whole signal: every other key means the user was already
 * typing into a field the pointer had entered.
 *
 * The listener sits on the document because the Tab that moves focus into the
 * input is dispatched on the element that held focus before it. It is kept
 * here rather than shared because this is the only control whose focus
 * affordance depends on the modality.
 */
const keyboardFocus = ref(false)

function trackFocusModality(event: KeyboardEvent) {
  if (event.key === 'Tab') keyboardFocus.value = true
}

function trackPointerModality() {
  keyboardFocus.value = false
}

onMounted(() => {
  document.addEventListener('keydown', trackFocusModality, true)
  document.addEventListener('pointerdown', trackPointerModality, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', trackFocusModality, true)
  document.removeEventListener('pointerdown', trackPointerModality, true)
})
</script>

<template>
  <form class="search-bar" role="search" @submit.prevent>
    <UIcon
      name="i-custom-icon-search"
      class="search-bar__icon"
      aria-hidden="true"
    />
    <!-- Wrapper exists so the focus underline can sit below the text row
         (Figma Active state) without shifting layout when focus moves. The
         data attribute is the modality the underline styling keys off. -->
    <span
      class="search-bar__field"
      :data-focus-modality="keyboardFocus ? 'keyboard' : 'pointer'"
    >
      <input
        v-model="model"
        class="search-bar__input"
        type="text"
        inputmode="search"
        enterkeyhint="search"
        autocomplete="off"
        spellcheck="false"
        :aria-label="label"
        :placeholder="placeholder"
      />
    </span>
  </form>
</template>
