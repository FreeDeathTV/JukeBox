<script>
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { tracks, filteredTracks, searchQuery, genreFilter, yearFilter, resetFilters } from '$lib/stores/tracks.js';
  import { currentTrack, isPlaying, setTrack, play } from '$lib/stores/player.js';
  import { queue, clear, add, playNow, addToQueue } from '$lib/stores/queue.js';
  import SearchBar from '$lib/components/SearchBar.svelte';
  import TrackList from '$lib/components/TrackList.svelte';

  let trackCount = 0;
  let displayedTracks = [];
  let searchValue = '';
  let currentGenre = '';
  let currentYear = '';

  const genres = ['Rock', 'Dance', 'Reggae', 'Blues', 'Pop', 'Hip-Hop', 'Electronic'];
  const decades = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];

  // Subscribe to stores
  const unsubscribeTracks = tracks.subscribe(t => {
    trackCount = t.length;
  });

  const unsubscribeFiltered = filteredTracks.subscribe(t => {
    displayedTracks = t;
  });

  // Handle search input
  function handleSearch(event) {
    searchValue = event.detail;
    searchQuery.set(searchValue);
  }

  // Handle genre filter
  function handleGenreClick(genre) {
    if (currentGenre === genre) {
      genreFilter.set('');
      currentGenre = '';
    } else {
      genreFilter.set(genre);
      currentGenre = genre;
    }
  }

  // Handle year filter
  function handleYearChange(event) {
    const value = event.target.value;
    yearFilter.set(value);
    currentYear = value;
  }

  // Handle reset
  function handleReset() {
    resetFilters();
    searchValue = '';
    currentGenre = '';
    currentYear = '';
  }

  // Handle track click - play immediately if queue is empty, otherwise add to queue
  function handleTrackClick(track) {
    console.log('[Library] Track clicked:', track.title);
    console.log('[Library] Track path:', track.path);
    console.log('[Library] Track ID:', track.id);
    
    // Get current queue state using get()
    const q = get(queue);
    const queueLength = q.length;
    
    if (queueLength === 0) {
      // Queue is empty - play immediately
      console.log('[Library] Queue empty, playing now');
      playNow(track);
      // Small delay to ensure queue is updated before setting track
      setTimeout(() => {
        setTrack(track);
        play();
      }, 50);
    } else {
      // Queue has tracks - add to queue with autoPlay enabled
      console.log('[Library] Queue has tracks, adding to queue');
      addToQueue(track, true);
    }
  }

  onDestroy(() => {
    unsubscribeTracks();
    unsubscribeFiltered();
  });
</script>

<div class="library-page">
  <div class="d-flex justify-content-between align-items-center mb-4">
    <h1>📚 Music Library</h1>
    <span class="badge bg-primary fs-6">{trackCount} tracks</span>
  </div>
  
  <SearchBar on:search={handleSearch} />
  
  <!-- Filter Controls -->
  <div class="filter-controls mt-3 mb-3">
    <div class="genre-buttons">
      {#each genres as genre}
        <button 
          class="btn btn-sm me-1 mb-1 {currentGenre === genre ? 'btn-primary' : 'btn-outline-secondary'}"
          on:click={() => handleGenreClick(genre)}
        >
          {genre}
        </button>
      {/each}
    </div>
    
    <div class="filter-row mt-2">
      <select class="form-select form-select-sm me-2" style="width: auto;" bind:value={currentYear} on:change={handleYearChange}>
        <option value="">All Years</option>
        {#each decades as decade}
          <option value={decade}>{decade}</option>
        {/each}
      </select>
      
      <button class="btn btn-sm btn-outline-danger" on:click={handleReset}>
        Reset
      </button>
    </div>
  </div>
  
  <div class="mt-4">
    {#if trackCount > 0}
      <p class="text-muted">
        Showing {displayedTracks.length} of {trackCount} tracks
        {#if searchValue}for "{searchValue}"{/if}
        {#if currentGenre} in {currentGenre}{/if}
        {#if currentYear} from {currentYear}{/if}
      </p>
      <TrackList tracks={displayedTracks} on:play={(e) => handleTrackClick(e.detail)} />
    {:else}
      <div class="alert alert-info">
        <p>Your library is empty.</p>
        <p>Go to <a href="/">Home</a> to scan your music folder.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .library-page {
    padding: 1rem;
  }
  
  .filter-controls {
    display: flex;
    flex-direction: column;
  }
  
  .genre-buttons {
    display: flex;
    flex-wrap: wrap;
  }
  
  .filter-row {
    display: flex;
    align-items: center;
  }
</style>
