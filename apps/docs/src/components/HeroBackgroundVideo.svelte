<script lang="ts">
  import { SlopVideo } from "@slopmachine/svelte";
</script>

<div
  class="hero-bg-video-container pointer-events-none absolute -top-8 bottom-0 left-1/2 -translate-x-1/2 w-screen -z-20 overflow-hidden select-none"
>
  <!-- Dark theme background video -->
  <div class="hidden dark:block w-full h-full">
    <SlopVideo
      bucketId="wlIDWJmzXcTRZob8yKq6"
      aspectRatio="16:9"
      duration={10}
      variables={{
        color: "dark",
      }}
      class="hero-bg-video-wrapper w-full h-full opacity-25 scale-105"
    />
  </div>

  <!-- Light theme background video -->
  <div class="block dark:hidden w-full h-full">
    <SlopVideo
      bucketId="wlIDWJmzXcTRZob8yKq6"
      aspectRatio="16:9"
      duration={10}
      variables={{
        color: "light",
      }}
      class="hero-bg-video-wrapper w-full h-full opacity-25 scale-105"
    />
  </div>

  <!-- Ambient gradient mask to softly fade video into page content -->
  <div
    class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white dark:to-[#0b0f19] pointer-events-none"
  ></div>
</div>

<style>
  :global(.hero-bg-video-wrapper) {
    width: 100% !important;
    height: 100% !important;
  }

  :global(.hero-bg-video-wrapper .slop-wrapper) {
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
    aspect-ratio: auto !important;
  }

  :global(.hero-bg-video-wrapper video) {
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
    object-fit: cover !important;
    object-position: center !important;
  }
</style>
