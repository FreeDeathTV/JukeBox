<script>
  import { createEventDispatcher } from 'svelte';

  export let tracks = [];

  const dispatch = createEventDispatcher();

  function playTrack(track) {
    dispatch('play', track);
  }

  function addToQueue(track) {
    dispatch('queue', track);
  }

  function formatDuration(seconds) {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
</script>

<div class="track-list">
  {#if tracks.length === 0}
    <p class="text-muted">No tracks to display.</p>
  {:else}
    <div class="table-responsive">
      <table class="table table-hover">
        <thead>
          <tr>
            <th>#</th>
            <th>Title</th>
            <th>Artist</th>
            <th>Album</th>
            <th>Duration</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each tracks as track, index}
            <tr>
              <td>{index + 1}</td>
              <td>
                <button class="btn btn-link p-0" on:click={() => playTrack(track)}>
                  {track.title || 'Unknown'}
                </button>
              </td>
              <td>{track.artist || 'Unknown Artist'}</td>
              <td>{track.album || 'Unknown Album'}</td>
              <td>{formatDuration(track.duration)}</td>
              <td>
                <button 
                  class="btn btn-sm btn-outline-primary" 
                  on:click={() => playTrack(track)}
                  title="Play"
                >
                  ▶
                </button>
                <button 
                  class="btn btn-sm btn-outline-secondary ms-1" 
                  on:click={() => addToQueue(track)}
                  title="Add to Queue"
                >
                  +
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .track-list {
    background: white;
    border-radius: 8px;
    padding: 1rem;
  }
</style>
