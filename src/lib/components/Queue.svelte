<script>
  import { createEventDispatcher } from 'svelte';
  import { removeFromQueue, clearQueue } from '../stores/queue.js';

  export let tracks = [];

  const dispatch = createEventDispatcher();

  function handleRemove(index) {
    removeFromQueue(index);
  }

  function handleClear() {
    clearQueue();
  }

  function playTrack(track) {
    dispatch('play', track);
  }

  function formatDuration(seconds) {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
</script>

<div class="queue card">
  <div class="card-header d-flex justify-content-between align-items-center">
    <h5 class="mb-0">📋 Queue</h5>
    {#if tracks.length > 0}
      <button class="btn btn-sm btn-outline-danger" on:click={handleClear}>
        Clear All
      </button>
    {/if}
  </div>
  <div class="card-body">
    {#if tracks.length === 0}
      <p class="text-muted small">Queue is empty. Add tracks from the library.</p>
    {:else}
      <ul class="list-group list-group-flush">
        {#each tracks as track, index}
          <li class="list-group-item d-flex justify-content-between align-items-center">
            <div class="flex-grow-1">
              <button 
                class="btn btn-link p-0 text-decoration-none" 
                on:click={() => playTrack(track)}
              >
                {track.title || 'Unknown'}
              </button>
              <br/>
              <small class="text-muted">{track.artist || 'Unknown Artist'}</small>
            </div>
            <div class="text-end">
              <small class="text-muted">{formatDuration(track.duration)}</small>
              <button 
                class="btn btn-sm btn-outline-danger ms-2" 
                on:click={() => handleRemove(index)}
                title="Remove"
              >
                ✕
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .queue {
    background: white;
  }
</style>
