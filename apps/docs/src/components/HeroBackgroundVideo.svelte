<script lang="ts">
  import { SlopVideo } from "@slopmachine/svelte";
</script>

<div class="pointer-events-none absolute inset-0 -z-20 overflow-hidden select-none">
  <!-- Dark theme background video -->
  <div class="hidden dark:block w-full h-full">
    <SlopVideo
      bucketId="wlIDWJmzXcTRZob8yKq6"
      aspectRatio="16:9"
      duration={10}
      variables={{
        color: "dark",
      }}
      class="w-full h-full opacity-25 scale-105"
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
      class="w-full h-full opacity-25 scale-105"
    />
  </div>

  <!-- Ambient gradient mask to softly fade video into page content -->
  <div
    class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white dark:to-[#0b0f19] pointer-events-none"
  ></div>
</div>
