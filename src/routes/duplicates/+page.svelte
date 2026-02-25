<script>
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { 
    duplicateGroups, 
    isDetecting, 
    detectDuplicates,
    deleteSelectedTracks,
    markAsNotDuplicate,
    getTotalDuplicateTracks
  } from '$lib/stores/duplicates.js';
  import { tracks, loadFromDB } from '$lib/stores/tracks.js';

  let totalGroups = 0;
  let totalTracks = 0;
  let loading = true;
  let groups = [];
  let error = null;

  // Subscribe to stores
  const unsubscribeGroups = duplicateGroups.subscribe(g => {
    groups = g;
    totalGroups = g.length;
    totalTracks = getTotalDuplicateTracks();
  });

  const unsubscribeDetecting = isDetecting.subscribe(d => {
    loading = d;
  });

  onMount(async () => {
    console.log('[Duplicates Page] Mounting...');
    
    // Load tracks first if not already loaded
    if ($tracks.length === 0) {
      await loadFromDB();
    }
    
    // Run detection
    await detectDuplicates();
  });

  onDestroy(() => {
    unsubscribeGroups();
    unsubscribeDetecting();
  });

  async function handleKeepBest(group) {
    console.log('[Duplicates Page] Keep best for group:', group.groupId);
    
    // Get the best track (first in the array as they're already sorted)
    const bestTrack = group.tracks[0];
    const toDelete = group.tracks.slice(1).map(t => t.id);
    
    if (confirm(`Keep "${bestTrack.title}" and delete ${toDelete.length} duplicate(s)?`)) {
      await deleteSelectedTracks(toDelete);
    }
  }

  async function handleKeepAll(group) {
    console.log('[Duplicates Page] Keep all for group:', group.groupId);
    await markAsNotDuplicate(group.groupId);
  }

  function handleReview(group) {
    console.log('[Duplicates Page] Review group:', group.groupId);
    // Navigate to review page with group info in query param
    goto(`/duplicates/review?groupId=${group.groupId}`);
  }

  async function handleRescan() {
    console.log('[Duplicates Page] Rescanning...');
    await detectDuplicates();
  }

  function getMatchTypeLabel(type) {
    switch (type) {
      case 'fingerprint':
        return 'Fingerprint Match';
      case 'duration':
        return 'Duration Match (±1s)';
      case 'metadata':
        return 'Metadata Match';
      default:
        return 'Duplicate';
    }
  }

  function formatMatchType(type) {
    switch (type) {
      case 'fingerprint':
        return 'bg-success';
      case 'duration':
        return 'bg-warning';
      case 'metadata':
        return 'bg-info';
      default:
        return 'bg-secondary';
    }
  }
</script>

<div class="duplicates-page">
  <div class="d-flex justify-content-between align-items-center mb-4">
    <h1>🔍 Duplicate Detection</h1>
    <button class="btn btn-primary" on:click={handleRescan} disabled={loading}>
      {loading ? 'Scanning...' : 'Rescan'}
    </button>
  </div>

  {#if loading}
    <div class="alert alert-info">
      <div class="spinner-border spinner-border-sm me-2" role="status"></div>
      Scanning for duplicates...
    </div>
  {:else if error}
    <div class="alert alert-danger">
      {error}
    </div>
  {:else if totalGroups === 0}
    <div class="alert alert-success">
      <h4>✅ No duplicates found!</h4>
      <p>Your music library is clean. No duplicate tracks were detected.</p>
    </div>
  {:else}
    <!-- Summary Cards -->
    <div class="row mb-4">
      <div class="col-md-6">
        <div class="card bg-primary text-white">
          <div class="card-body">
            <h5 class="card-title">Duplicate Groups</h5>
            <h2>{totalGroups}</h2>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card bg-warning">
          <div class="card-body">
            <h5 class="card-title">Total Duplicate Tracks</h5>
            <h2>{totalTracks}</h2>
          </div>
        </div>
      </div>
    </div>

    <!-- Groups List -->
    <h3>Duplicate Groups</h3>
    <div class="table-responsive">
      <table class="table table-hover">
        <thead>
          <tr>
            <th>Track Name</th>
            <th>Versions</th>
            <th>Match Type</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each groups as group}
            <tr>
              <td>
                <strong>{group.canonicalName}</strong>
                <br>
                <small class="text-muted">{group.tracks[0]?.artist || 'Unknown Artist'}</small>
              </td>
              <td>
                <span class="badge bg-primary fs-6">{group.tracks.length} versions</span>
              </td>
              <td>
                <span class="badge {formatMatchType(group.matchType)}">
                  {getMatchTypeLabel(group.matchType)}
                </span>
              </td>
              <td>
                <button 
                  class="btn btn-sm btn-success me-1" 
                  on:click={() => handleKeepBest(group)}
                  title="Keep best quality, delete others"
                >
                  Keep Best
                </button>
                <button 
                  class="btn btn-sm btn-outline-secondary me-1" 
                  on:click={() => handleKeepAll(group)}
                  title="Keep all (mark as not duplicates)"
                >
                  Keep All
                </button>
                <button 
                  class="btn btn-sm btn-primary" 
                  on:click={() => handleReview(group)}
                  title="Review and select which to keep"
                >
                  Review
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
  .duplicates-page {
    padding: 1rem;
  }
  
  .card {
    border-radius: 8px;
  }
</style>
