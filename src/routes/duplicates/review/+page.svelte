<script>
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { 
    duplicateGroups, 
    currentGroup,
    selectedForDeletion,
    deleteSelectedTracks,
    markAsNotDuplicate,
    toggleTrackSelection,
    selectAllExceptBest,
    clearSelections
  } from '$lib/stores/duplicates.js';

  let group = null;
  let selected = [];
  let bestTrack = null;
  let showConfirmDialog = false;
  let deleting = false;

  // Subscribe to stores
  const unsubscribeGroup = currentGroup.subscribe(g => {
    group = g;
    if (g && g.tracks.length > 0) {
      // Best track is already sorted to first position
      bestTrack = g.tracks[0];
    }
  });

  const unsubscribeSelected = selectedForDeletion.subscribe(s => {
    selected = s;
  });

  onMount(() => {
    console.log('[Duplicate Review Page] Mounting...');
    
    // Get groupId from query param
    const groupId = $page.url.searchParams.get('groupId');
    
    if (groupId) {
      // Find the group in the store
      duplicateGroups.subscribe(groups => {
        const found = groups.find(g => g.groupId === groupId);
        if (found) {
          currentGroup.set(found);
        } else {
          // Group not found, go back
          goto('/duplicates');
        }
      })();
    } else {
      goto('/duplicates');
    }
  });

  onDestroy(() => {
    unsubscribeGroup();
    unsubscribeSelected();
    clearSelections();
  });

  function formatDuration(seconds) {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function formatFileSize(bytes) {
    if (!bytes) return 'Unknown';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) {
      return `${mb.toFixed(2)} MB`;
    }
    const kb = bytes / 1024;
    return `${kb.toFixed(2)} KB`;
  }

  function handleToggleTrack(trackId) {
    toggleTrackSelection(trackId);
  }

  function handleSelectAllExceptBest() {
    if (group && bestTrack) {
      selectAllExceptBest(group.tracks, bestTrack);
    }
  }

  function handleMarkNotDuplicates() {
    if (group && confirm('Mark these tracks as NOT duplicates? This will remove them from the duplicate list.')) {
      markAsNotDuplicate(group.groupId).then(() => {
        goto('/duplicates');
      });
    }
  }

  function handleDeleteSelected() {
    if (selected.length > 0) {
      showConfirmDialog = true;
    }
  }

  async function confirmDelete() {
    showConfirmDialog = false;
    deleting = true;
    
    const result = await deleteSelectedTracks(selected);
    
    deleting = false;
    
    if (result.success) {
      // Check if group still has enough tracks
      if (group && group.tracks.length - selected.length < 2) {
        // Group no longer has duplicates, go back
        goto('/duplicates');
      } else {
        // Refresh current group
        duplicateGroups.subscribe(groups => {
          const found = groups.find(g => g.groupId === group.groupId);
          if (found) {
            currentGroup.set(found);
          }
        })();
      }
    } else {
      alert('Error deleting tracks: ' + result.error);
    }
  }

  function handleCancelDelete() {
    showConfirmDialog = false;
  }

  function handleGoBack() {
    goto('/duplicates');
  }

  function isLossless(codec) {
    return codec === 'FLAC' || codec === 'WAV';
  }
</script>

<div class="review-page">
  <div class="d-flex justify-content-between align-items-center mb-4">
    <div>
      <button class="btn btn-outline-secondary btn-sm me-2" on:click={handleGoBack}>
        ← Back to Duplicates
      </button>
      <h2 class="d-inline">Review: {group?.canonicalName || 'Loading...'}</h2>
    </div>
  </div>

  {#if group}
    <div class="mb-3">
      <span class="badge bg-primary me-2">{group.tracks.length} versions</span>
      <span class="badge bg-info">
        {group.matchType === 'fingerprint' ? 'Fingerprint Match' : 
         group.matchType === 'duration' ? 'Duration Match' : 'Metadata Match'}
      </span>
    </div>

    <!-- Action Buttons -->
    <div class="mb-4">
      <button 
        class="btn btn-success me-2" 
        on:click={handleSelectAllExceptBest}
        title="Auto-select all except best quality"
      >
        Select All Except Best
      </button>
      <button 
        class="btn btn-danger me-2" 
        on:click={handleDeleteSelected}
        disabled={selected.length === 0}
      >
        Delete Selected ({selected.length})
      </button>
      <button 
        class="btn btn-outline-secondary" 
        on:click={handleMarkNotDuplicates}
      >
        Mark as Not Duplicates
      </button>
    </div>

    <!-- Tracks Table -->
    <div class="table-responsive">
      <table class="table table-hover">
        <thead>
          <tr>
            <th style="width: 40px;">Select</th>
            <th>Track Info</th>
            <th>Duration</th>
            <th>Codec</th>
            <th>Bitrate</th>
            <th>Size</th>
            <th>Folder</th>
            <th>Best</th>
          </tr>
        </thead>
        <tbody>
          {#each group.tracks as track, index}
            {@const fileMeta = track.fileMeta || {}}
            {@const isBest = index === 0}
            {@const isSelected = selected.includes(track.id)}
            <tr class:table-danger={isSelected} class:table-success={isBest && !isSelected}>
              <td>
                <input 
                  type="checkbox" 
                  checked={isSelected}
                  on:change={() => handleToggleTrack(track.id)}
                  disabled={isBest}
                />
              </td>
              <td>
                <strong>{track.title || 'Unknown'}</strong>
                <br>
                <small class="text-muted">{track.artist || 'Unknown Artist'}</small>
                <br>
                <small class="text-muted">{track.album || 'Unknown Album'}</small>
              </td>
              <td>{formatDuration(track.duration)}</td>
              <td>
                <span class="badge {isLossless(fileMeta.codec) ? 'bg-success' : 'bg-secondary'}">
                  {fileMeta.codec || 'Unknown'}
                </span>
              </td>
              <td>
                {fileMeta.bitrate ? `${Math.round(fileMeta.bitrate / 1000)} kbps` : 'Unknown'}
              </td>
              <td>{formatFileSize(fileMeta.size)}</td>
              <td>
                <small class="text-muted" title={fileMeta.folder}>
                  {fileMeta.folder ? fileMeta.folder.split(/[/\\]/).pop() : 'Unknown'}
                </small>
              </td>
              <td>
                {#if isBest}
                  <span class="badge bg-success">⭐ Best</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Selected Count -->
    {#if selected.length > 0}
      <div class="alert alert-warning mt-3">
        <strong>{selected.length}</strong> track(s) selected for deletion
      </div>
    {/if}
  {:else}
    <div class="alert alert-info">
      Loading group details...
    </div>
  {/if}

  <!-- Confirmation Dialog -->
  {#if showConfirmDialog}
    <div class="modal d-block" tabindex="-1" style="background: rgba(0,0,0,0.5);">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Confirm Delete</h5>
            <button type="button" class="btn-close" on:click={handleCancelDelete}></button>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to delete <strong>{selected.length}</strong> selected track(s)?</p>
            <p class="text-danger">This action cannot be undone.</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" on:click={handleCancelDelete}>
              Cancel
            </button>
            <button 
              type="button" 
              class="btn btn-danger" 
              on:click={confirmDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : `Delete ${selected.length} Track(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .review-page {
    padding: 1rem;
  }
  
  .table td {
    vertical-align: middle;
  }
</style>
