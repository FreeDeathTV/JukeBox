<script>
  import { onMount, onDestroy } from 'svelte';
  import { currentTrack } from '$lib/stores/player.js';
  import { queue } from '$lib/stores/queue.js';
  import Queue from '$lib/components/Queue.svelte';

  let unsubscribeQueue;
  let queueTracks = [];

  // Subscribe to queue store
  onMount(() => {
    console.log('[Player] Page mounted');
    unsubscribeQueue = queue.subscribe(q => {
      console.log('[Player] Queue updated:', q.length, 'tracks');
      queueTracks = q;
    });
  });

  onDestroy(() => {
    if (unsubscribeQueue) {
      unsubscribeQueue();
    }
  });
</script>

<div class="player-page">
  <h1 class="mb-4">▶️ Now Playing</h1>
  
  <div class="row">
    <div class="col-md-8">
      <!-- Player is now in +layout.svelte as persistent -->
      {#if $currentTrack}
        <div class="card">
          <div class="card-body text-center">
            <h3>{$currentTrack.title}</h3>
            <p class="text-muted">{$currentTrack.artist}</p>
            <p class="text-muted">{$currentTrack.album}</p>
          </div>
        </div>
      {:else}
        <div class="alert alert-warning">
          <p>No track currently playing.</p>
          <p>Go to <a href="/library">Library</a> to select a track.</p>
        </div>
      {/if}
    </div>
    <div class="col-md-4">
      <Queue tracks={queueTracks} />
    </div>
  </div>
</div>

<style>
  .player-page {
    padding: 1rem;
  }
</style>
