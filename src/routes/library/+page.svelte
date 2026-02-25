<script>
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { tracks, filteredTracks, searchQuery, genreFilter, yearFilter, resetFilters } from '$lib/stores/tracks.js';
  import { currentTrack, isPlaying, setTrack, play } from '$lib/stores/player.js';
  import { queue, clear, add, playNow, addToQueue } from '$lib/stores/queue.js';
  import SearchBar from '$lib/components/SearchBar.svelte';

  // Random Playlist state
  let randomPlaylistModal = false;
  let customDuration = 60; // default 1 hour
  let generatingPlaylist = false;
  let playlistGenerationResult = null;
  let selectedRandomTracks = [];
  let showPlaylistPreview = false;

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

  // Random Playlist functions
  async function generateRandomPlaylist(durationMinutes) {
    generatingPlaylist = true;
    playlistGenerationResult = null;
    selectedRandomTracks = [];
    showPlaylistPreview = false;
    
    try {
      console.log('[Library] Generating random playlist for', durationMinutes, 'minutes');
      const result = await window.playlistAPI.random(durationMinutes);
      
      if (result.success) {
        console.log('[Library] Random playlist generated:', result.tracks.length, 'tracks');
        playlistGenerationResult = {
          success: true,
          tracks: result.tracks,
          totalDuration: result.totalDuration,
          targetDuration: result.targetDuration,
          trackCount: result.tracks.length
        };
        selectedRandomTracks = result.tracks;
        
        // Show preview instead of auto-starting
        showPlaylistPreview = true;
      } else {
        playlistGenerationResult = {
          success: false,
          error: result.error || 'Failed to generate playlist'
        };
      }
    } catch (error) {
      console.error('[Library] Error generating random playlist:', error);
      playlistGenerationResult = {
        success: false,
        error: 'Error generating playlist: ' + error.message
      };
    } finally {
      generatingPlaylist = false;
    }
  }
  
  async function handleRandomPlaylistAutoStart(tracks) {
    try {
      // Check if player is stopped and playlist is empty
      const isPlayerStopped = !window.playerAPI || !window.playerAPI.isPlaying();
      const queueLength = window.queueAPI ? await window.queueAPI.getLength() : 0;
      const isPlaylistEmpty = queueLength === 0;
      
      console.log('[Library] Auto-start check:', { isPlayerStopped, queueLength, isPlaylistEmpty });
      
      if (isPlayerStopped && isPlaylistEmpty) {
        // Auto-start playback
        console.log('[Library] Auto-starting playback with', tracks.length, 'tracks');
        await window.queueAPI.replaceAndPlay(tracks, 0);
        if (window.playerAPI) {
          window.playerAPI.play();
        }
        alert(`Random playlist generated and started!\n\n${tracks.length} tracks (${Math.round(tracks.reduce((sum, t) => sum + (t.duration || 0), 0) / 60)} minutes)`);
      } else {
        // Add to playlist without auto-start
        console.log('[Library] Adding', tracks.length, 'tracks to playlist');
        await window.queueAPI.addMany(tracks);
        alert(`Random playlist generated!\n\n${tracks.length} tracks (${Math.round(tracks.reduce((sum, t) => sum + (t.duration || 0), 0) / 60)} minutes)\n\nAdded to playlist (not auto-started)`);
      }
    } catch (error) {
      console.error('[Library] Error handling auto-start:', error);
      alert('Playlist generated but failed to start playback: ' + error.message);
    }
  }
  
  function openCustomDurationModal() {
    randomPlaylistModal = true;
    customDuration = 60; // Reset to 1 hour default
  }
  
  function closeCustomDurationModal() {
    randomPlaylistModal = false;
  }
  
  function generateCustomPlaylist() {
    if (customDuration < 1 || customDuration > 1440) {
      alert('Please enter a duration between 1 minute and 1440 minutes (24 hours)');
      return;
    }
    closeCustomDurationModal();
    generateRandomPlaylist(customDuration);
  }
  
  // Playlist preview confirmation functions
  function closePlaylistPreview() {
    showPlaylistPreview = false;
  }
  
  async function confirmPlaylist() {
    if (!selectedRandomTracks || selectedRandomTracks.length === 0) {
      alert('No playlist to confirm');
      return;
    }
    
    try {
      // Get current queue state using get()
      const q = get(queue);
      const isQueueEmpty = q.length === 0;
      const isCurrentlyPlaying = get(isPlaying);
      
      console.log('[Library] Confirm playlist check:', { isQueueEmpty, isCurrentlyPlaying });
      
      if (isQueueEmpty && !isCurrentlyPlaying) {
        // Auto-start playback - play first track and add rest to queue
        console.log('[Library] Confirming playlist, auto-starting with', selectedRandomTracks.length, 'tracks');
        
        // Play first track immediately
        playNow(selectedRandomTracks[0]);
        setTimeout(() => {
          setTrack(selectedRandomTracks[0]);
          play();
        }, 50);
        
        // Add remaining tracks to queue
        if (selectedRandomTracks.length > 1) {
          for (let i = 1; i < selectedRandomTracks.length; i++) {
            addToQueue(selectedRandomTracks[i], false);
          }
        }
        
        alert(`Random playlist started!\n\n${selectedRandomTracks.length} tracks (${Math.round(selectedRandomTracks.reduce((sum, t) => sum + (t.duration || 0), 0) / 60)} minutes)`);
      } else {
        // Add to playlist without auto-start
        console.log('[Library] Confirming playlist, adding', selectedRandomTracks.length, 'tracks to playlist');
        
        // Add all tracks to queue
        selectedRandomTracks.forEach(track => {
          addToQueue(track, false);
        });
        
        alert(`Random playlist added to queue!\n\n${selectedRandomTracks.length} tracks (${Math.round(selectedRandomTracks.reduce((sum, t) => sum + (t.duration || 0), 0) / 60)} minutes)`);
      }
      
      // Close preview
      showPlaylistPreview = false;
    } catch (error) {
      console.error('[Library] Error confirming playlist:', error);
      alert('Failed to add playlist: ' + error.message);
    }
  }
  
  function rejectPlaylist() {
    // User doesn't like the selection, close preview and allow new generation
    showPlaylistPreview = false;
    selectedRandomTracks = [];
    playlistGenerationResult = null;
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

  <!-- Random Playlist Generator -->
  <div class="card mt-4">
    <div class="card-body">
      <h5 class="card-title">🎲 Random Playlist Generator</h5>
      <p class="text-muted">Generate a random playlist with a specific duration.</p>
      <div class="mb-3">
        <div class="btn-group" role="group">
          <button class="btn btn-success" on:click={() => generateRandomPlaylist(60)} disabled={generatingPlaylist}>
            {generatingPlaylist ? 'Generating...' : '1 hour'}
          </button>
          <button class="btn btn-success" on:click={() => generateRandomPlaylist(120)} disabled={generatingPlaylist}>
            {generatingPlaylist ? 'Generating...' : '2 hours'}
          </button>
          <button class="btn btn-success" on:click={() => generateRandomPlaylist(180)} disabled={generatingPlaylist}>
            {generatingPlaylist ? 'Generating...' : '3 hours'}
          </button>
          <button class="btn btn-success" on:click={openCustomDurationModal} disabled={generatingPlaylist}>
            {generatingPlaylist ? 'Generating...' : 'Custom'}
          </button>
        </div>
      </div>
      {#if playlistGenerationResult}
        <div class="alert {playlistGenerationResult.success ? 'alert-success' : 'alert-danger'}">
          {#if playlistGenerationResult.success}
            <strong>Success!</strong> Generated {playlistGenerationResult.trackCount} tracks ({Math.round(playlistGenerationResult.totalDuration / 60)} minutes)
          {:else}
            <strong>Error:</strong> {playlistGenerationResult.error}
          {/if}
        </div>
      {/if}
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

<!-- Custom Duration Modal -->
{#if randomPlaylistModal}
  <div class="modal show d-block" tabindex="-1" style="background: rgba(0,0,0,0.5)">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Custom Duration</h5>
          <button type="button" class="btn-close" on:click={closeCustomDurationModal}></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label for="customDurationInput" class="form-label">Duration (minutes)</label>
            <input 
              type="number" 
              class="form-control" 
              id="customDurationInput"
              bind:value={customDuration}
              min="1"
              max="1440"
              step="1"
            />
            <div class="form-text">Enter duration between 1 minute and 1440 minutes (24 hours)</div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" on:click={closeCustomDurationModal}>Cancel</button>
          <button type="button" class="btn btn-primary" on:click={generateCustomPlaylist}>Generate Playlist</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Playlist Preview Modal -->
{#if showPlaylistPreview && selectedRandomTracks.length > 0}
  <div class="modal show d-block" tabindex="-1" style="background: rgba(0,0,0,0.5)">
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">🎵 Random Playlist Preview</h5>
          <button type="button" class="btn-close" on:click={closePlaylistPreview}></button>
        </div>
        <div class="modal-body">
          <div class="row mb-3">
            <div class="col-md-6">
              <div class="card bg-light">
                <div class="card-body">
                  <h6 class="card-title">Playlist Summary</h6>
                  <p class="card-text">
                    <strong>Tracks:</strong> {selectedRandomTracks.length}<br/>
                    <strong>Duration:</strong> {Math.round(selectedRandomTracks.reduce((sum, t) => sum + (t.duration || 0), 0) / 60)} minutes<br/>
                    <strong>Target:</strong> {Math.round(selectedRandomTracks.reduce((sum, t) => sum + (t.duration || 0), 0) / 60)} minutes
                  </p>
                </div>
              </div>
            </div>
            <div class="col-md-6">
              <div class="card bg-light">
                <div class="card-body">
                  <h6 class="card-title">Auto-Start Logic</h6>
                  <p class="card-text">
                    <strong>Condition:</strong> Player stopped AND playlist empty<br/>
                    <strong>Result:</strong> Will auto-start playback<br/>
                    <strong>Otherwise:</strong> Will add to existing playlist
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <div class="table-responsive">
            <table class="table table-hover">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Title</th>
                  <th>Artist</th>
                  <th>Album</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {#each selectedRandomTracks as track, index}
                  <tr>
                    <td>{index + 1}</td>
                    <td>{track.title || 'Unknown'}</td>
                    <td>{track.artist || 'Unknown Artist'}</td>
                    <td>{track.album || 'Unknown Album'}</td>
                    <td>{formatDuration(track.duration)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-danger" on:click={rejectPlaylist}>
            ❌ No, generate new playlist
          </button>
          <button type="button" class="btn btn-success" on:click={confirmPlaylist}>
            ✅ Yes, add to player
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

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
