<script>
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { tracks, filteredTracks, searchQuery, genreFilter, yearFilter, resetFilters } from '$lib/stores/tracks.js';
  import { currentTrack, isPlaying, setTrack, play } from '$lib/stores/player.js';
  import { queue, clear, add, playNow, addToQueue } from '$lib/stores/queue.js';
  import SearchBar from '$lib/components/SearchBar.svelte';

  let trackCount = 0;
  let displayedTracks = [];
  let searchValue = '';
  let currentGenre = '';
  let currentYear = '';
  
  // Multi-select state
  let selectedTracks = new Set();
  let isMultiSelectMode = false;

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
    // If in multi-select mode, toggle selection instead of playing
    if (isMultiSelectMode) {
      toggleTrackSelection(track.id);
      return;
    }
    
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

  // Toggle track selection for multi-select
  function toggleTrackSelection(trackId) {
    if (selectedTracks.has(trackId)) {
      selectedTracks.delete(trackId);
    } else {
      selectedTracks.add(trackId);
    }
    selectedTracks = selectedTracks; // trigger reactivity
  }

  // Select all visible tracks
  function selectAll() {
    displayedTracks.forEach(track => selectedTracks.add(track.id));
    selectedTracks = selectedTracks;
  }

  // Deselect all tracks
  function selectNone() {
    selectedTracks.clear();
    selectedTracks = selectedTracks;
  }

  // Toggle multi-select mode
  function toggleMultiSelectMode() {
    isMultiSelectMode = !isMultiSelectMode;
    if (!isMultiSelectMode) {
      selectNone();
    }
  }

  // Add selected tracks to player queue
  // PLAYER QUEUE FIX: Only auto-start if player is stopped AND playlist is empty
  function addSelectedToQueue() {
    const selectedArray = displayedTracks.filter(t => selectedTracks.has(t.id));
    const q = get(queue);
    const isQueueEmpty = q.length === 0;
    const isCurrentlyPlaying = get(isPlaying);
    
    if (selectedArray.length === 0) return;
    
    console.log('[Library] Adding', selectedArray.length, 'tracks to queue, queue empty:', isQueueEmpty, 'playing:', isCurrentlyPlaying);
    
    // If queue is empty AND player is stopped, play immediately
    // If queue has tracks or player is playing, add without auto-playing
    if (isQueueEmpty && !isCurrentlyPlaying) {
      // Queue is empty and player is stopped - play immediately
      playNow(selectedArray[0]);
      setTimeout(() => {
        setTrack(selectedArray[0]);
        play();
      }, 50);
      
      // Add remaining tracks to queue (without auto-playing)
      if (selectedArray.length > 1) {
        for (let i = 1; i < selectedArray.length; i++) {
          addToQueue(selectedArray[i], false);
        }
      }
    } else {
      // Queue has tracks or player is playing - add all without auto-playing
      selectedArray.forEach(track => {
        addToQueue(track, false);
      });
    }
    
    // Exit multi-select mode after adding
    selectNone();
    isMultiSelectMode = false;
  }

  // Clickable metadata handlers
  function handleArtistClick(artist) {
    if (artist && artist !== 'Unknown Artist') {
      searchValue = `artist:"${artist}"`;
      searchQuery.set(searchValue);
    }
  }

  function handleAlbumClick(album) {
    if (album && album !== 'Unknown Album') {
      searchValue = `album:"${album}"`;
      searchQuery.set(searchValue);
    }
  }

  function formatDuration(seconds) {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
      
      <!-- Multi-select controls -->
      <div class="ms-3">
        <button 
          class="btn btn-sm {isMultiSelectMode ? 'btn-warning' : 'btn-outline-primary'}"
          on:click={toggleMultiSelectMode}
        >
          {isMultiSelectMode ? 'Cancel Multi-Select' : 'Multi-Select'}
        </button>
        
        {#if isMultiSelectMode}
          <button class="btn btn-sm btn-outline-secondary ms-1" on:click={selectAll}>
            Select All
          </button>
          <button class="btn btn-sm btn-outline-secondary ms-1" on:click={selectNone}>
            Select None
          </button>
          <button 
            class="btn btn-sm btn-success ms-1" 
            on:click={addSelectedToQueue}
            disabled={selectedTracks.size === 0}
          >
            Add Selected to Player ({selectedTracks.size})
          </button>
        {/if}
      </div>
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
      
      <!-- Track List with Multi-select -->
      <div class="table-responsive">
        <table class="table table-hover">
          <thead>
            <tr>
              {#if isMultiSelectMode}
                <th style="width: 40px;">✓</th>
              {/if}
              <th>#</th>
              <th>Title</th>
              <th>Artist</th>
              <th>Album</th>
              <th>Duration</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each displayedTracks as track, index}
              <tr class:table-primary={selectedTracks.has(track.id)}>
                {#if isMultiSelectMode}
                  <td>
                    <input 
                      type="checkbox" 
                      checked={selectedTracks.has(track.id)}
                      on:change={() => toggleTrackSelection(track.id)}
                    />
                  </td>
                {/if}
                <td>{index + 1}</td>
                <td>
                  <button class="btn btn-link p-0 text-start" on:click={() => handleTrackClick(track)}>
                    {track.title || 'Unknown'}
                  </button>
                </td>
                <td>
                  <button 
                    class="btn btn-link p-0 text-decoration-none text-primary" 
                    on:click={() => handleArtistClick(track.artist)}
                    title="Search for artist"
                  >
                    {track.artist || 'Unknown Artist'}
                  </button>
                </td>
                <td>
                  <button 
                    class="btn btn-link p-0 text-decoration-none text-primary" 
                    on:click={() => handleAlbumClick(track.album)}
                    title="Search for album"
                  >
                    {track.album || 'Unknown Album'}
                  </button>
                </td>
                <td>{formatDuration(track.duration)}</td>
                <td>
                  <button 
                    class="btn btn-sm btn-outline-primary" 
                    on:click={() => handleTrackClick(track)}
                    title="Play"
                  >
                    ▶
                  </button>
                  <button 
                    class="btn btn-sm btn-outline-secondary ms-1" 
                    on:click={() => addToQueue(track, false)}
                    title="Add to Queue"
                    disabled={isMultiSelectMode}
                  >
                    +
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
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
    flex-wrap: wrap;
  }
</style>
