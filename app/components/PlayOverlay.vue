<!--
  PlayOverlay.vue — the Figma hover treatment for a media thumbnail:
  a 50% dark scrim plus a white 25%-opacity "Play" pill.

  This is deliberately presentation only. It is not a button, is not focusable,
  and ignores pointer events, so it can never become an interaction target or a
  duplicate stop in the tab order. Media playback is out of scope for this task;
  the overlay only reproduces the Figma hover state and is hidden until the
  owning card's thumbnail is hovered or focused.
-->
<template>
  <div class="media-play" aria-hidden="true">
    <span class="media-play__pill">
      <UIcon name="i-custom-icon-play" class="media-play__icon" />
      <span class="media-play__label">Play</span>
    </span>
  </div>
</template>
