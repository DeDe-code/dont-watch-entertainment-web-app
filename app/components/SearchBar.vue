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
</script>

<template>
  <form class="search-bar" role="search" @submit.prevent>
    <UIcon
      name="i-custom-icon-search"
      class="search-bar__icon"
      aria-hidden="true"
    />
    <!-- Wrapper exists so the focus underline can sit below the text row
         (Figma Active state) without shifting layout when focus moves. -->
    <span class="search-bar__field">
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
