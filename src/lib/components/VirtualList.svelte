<script>
  import { onMount } from 'svelte';

  export let items = [];
  export let itemHeight = 48;
  export let buffer = 100;

  let container;
  let startIndex = 0;
  let endIndex = 0;
  let windowStart = 0;
  let windowEnd = 0;
  let visibleItems = [];
  let topPadding = 0;
  let bottomPadding = 0;

  // Calculate visible items on mount and scroll
  function calculateVisibleItems() {
    if (!container || items.length === 0) return;

    // Use clientHeight as fallback if offsetHeight is 0
    const containerHeight = container.offsetHeight || container.clientHeight || 400;
    const scrollTop = container.scrollTop;

    startIndex = Math.floor(scrollTop / itemHeight);
    endIndex = Math.min(startIndex + Math.ceil(containerHeight / itemHeight), items.length);

    // Ensure at least some items are visible
    if (endIndex <= startIndex) {
      endIndex = startIndex + Math.ceil(containerHeight / itemHeight);
      endIndex = Math.min(endIndex, items.length);
    }

    windowStart = Math.max(0, startIndex - buffer);
    windowEnd = Math.min(items.length, endIndex + buffer);

    visibleItems = items.slice(windowStart, windowEnd);

    topPadding = windowStart * itemHeight;
    bottomPadding = (items.length - windowEnd) * itemHeight;
  }

  // Scroll to specific index - exposed for parent components
  export function scrollToIndex(index) {
    if (!container) return;
    container.scrollTop = index * itemHeight;
  }

  // Handle scroll events
  function handleScroll() {
    calculateVisibleItems();
  }

  // Recalculate when items change
  $: if (items) {
    calculateVisibleItems();
  }

  // Initial calculation
  calculateVisibleItems();

  // Recalculate on resize
  let resizeObserver;
  onMount(() => {
    resizeObserver = new ResizeObserver(calculateVisibleItems);
    resizeObserver.observe(container);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  });
</script>

<div
  class="virtual-container"
  bind:this={container}
  on:scroll={handleScroll}
>
  <div style="height: {topPadding}px"></div>

  {#each visibleItems as item, i}
    <slot name="row" item={item} index={windowStart + i}></slot>
  {/each}

  <div style="height: {bottomPadding}px"></div>
</div>

<style>
  .virtual-container {
    overflow-y: auto;
    height: 100%;
    width: 100%;
  }
</style>

<environment_details>
# Visual Studio Code Visible Files
ADR-01.md

# Visual Studio Code Open Tabs
electron/preload.cjs
src/routes/settings/+page.svelte
electron/discogs.cjs
electron/spotify.cjs
electron/main.cjs
README.md
ADR-01.md
src/routes/library/+page.svelte
src/routes/duplicates/review/+page.svelte
src/lib/components/TrackList.svelte
src/lib/stores/tracks.js
src/lib/components/Queue.svelte
src/lib/components/Player.svelte
package-lock.json

# Current Time
2/26/2026, 1:25:41 AM (Europe/London, UTC+0:00)

# Context Window Usage
22,360 / 131K tokens used (17%)

# Current Mode
ACT MODE
</environment_details>