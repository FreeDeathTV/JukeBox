<script>
  import { onMount, onDestroy } from 'svelte';
  import { tracks } from '$lib/stores/tracks.js';

  let scanning = false;
  let isElectron = false;
  let scanFolders = [];
  let scanProgress = { scanned: 0, total: 0, status: '' };

  onMount(() => {
    // Check if running in Electron
    isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;
    console.log('[UI] Running in Electron:', isElectron);

    // Load existing folder list
    if (window.scanAPI) {
      loadFolders();
      
      // Listen for scan progress
      window.scanAPI.onProgress((data) => {
        console.log('[UI] Scan progress:', data);
        scanProgress = { 
          scanned: data.scanned, 
          total: data.total, 
          status: data.status 
        };
      });

      // Listen for scan complete
      window.scanAPI.onComplete((data) => {
        console.log('[UI] Scan complete received:', data.count, 'tracks');
        scanning = false;
        
        if (data.tracks) {
          // Merge new tracks with existing store
          const currentTracks = $tracks;
          const newTracks = [...currentTracks, ...data.tracks];
          tracks.set(newTracks);
          
          // Save to database
          if (window.dbAPI) {
            window.dbAPI.saveTracks(data.tracks).then(result => {
              console.log('[UI] Saved new tracks to database:', result);
            });
          }
        }
      });
    }

    // Listen for scan complete from old API (backward compatibility)
    if (window.electronAPI) {
      window.electronAPI.onScanComplete((data) => {
        console.log('[UI] Old scan complete received:', data.tracks?.length, 'tracks');
        if (data.tracks) {
          tracks.set(data.tracks);
          
          if (window.dbAPI) {
            window.dbAPI.saveTracks(data.tracks).then(result => {
              console.log('[UI] Saved tracks to database:', result);
            });
          }
        }
      });

      window.electronAPI.onScanProgress((data) => {
        console.log('[UI] Old scan progress:', data.scanned, '/', data.total);
      });
    }
  });

  async function loadFolders() {
    if (window.scanAPI) {
      const result = await window.scanAPI.getFolders();
      scanFolders = result.folders || [];
      scanning = result.isScanning;
    }
  }

  async function addFolder() {
    if (!isElectron || !window.scanAPI) {
      console.warn('[UI] Not running in Electron - demo mode');
      return;
    }
    
    try {
      const result = await window.scanAPI.addFolder();
      if (result.success) {
        scanFolders = result.folders;
        console.log('[UI] Folder added:', result.folderPath);
      } else if (result.error) {
        console.error('[UI] Error adding folder:', result.error);
      }
    } catch (error) {
      console.error('[UI] Error adding folder:', error);
    }
  }

  async function removeFolder(folderPath) {
    if (!isElectron || !window.scanAPI) return;
    
    try {
      const result = await window.scanAPI.removeFolder(folderPath);
      if (result.success) {
        scanFolders = result.folders;
        console.log('[UI] Folder removed:', folderPath);
      }
    } catch (error) {
      console.error('[UI] Error removing folder:', error);
    }
  }

  async function startScan() {
    if (!isElectron || !window.scanAPI) {
      console.warn('[UI] Not running in Electron - demo mode');
      return;
    }
    
    if (scanFolders.length === 0) {
      console.warn('[UI] No folders to scan');
      return;
    }
    
    scanning = true;
    console.log('[UI] Starting scan...');
    
    try {
      const result = await window.scanAPI.start();
      if (!result.success) {
        console.error('[UI] Scan error:', result.error);
        scanning = false;
      }
      // Results handled by onComplete callback
    } catch (error) {
      console.error('[UI] Error starting scan:', error);
      scanning = false;
    }
  }
</script>

<div class="text-center py-5">
  <h1 class="display-4 mb-4">🎵 Welcome to Jukebox</h1>
  <p class="lead mb-4">
    Your personal music library and player for Windows 10
  </p>
  
  <div class="card mx-auto" style="max-width: 600px;">
    <div class="card-body">
      <h5 class="card-title">Scan Music (Recursive)</h5>
      <p class="card-text text-muted">
        Add folders to scan. All subfolders will be included.
      </p>
      
      <!-- Two-button workflow (ADR-01) -->
      <div class="scan-controls mb-3">
        <button 
          class="btn btn-outline-primary me-2" 
          on:click={addFolder}
          disabled={scanning}
        >
          ➕ Add Folder
        </button>
        
        <button 
          class="btn btn-primary" 
          on:click={startScan}
          disabled={scanning || scanFolders.length === 0}
        >
          {scanning ? '⏳ Scanning...' : '▶️ Start Scan'}
        </button>
      </div>
      
      <!-- Folder list display -->
      {#if scanFolders.length > 0}
        <div class="folder-list text-start mb-3">
          <p class="mb-2"><strong>Folders to scan:</strong></p>
          <ul class="list-group">
            {#each scanFolders as folder}
              <li class="list-group-item d-flex justify-content-between align-items-center">
                <small class="text-truncate" style="max-width: 400px;">{folder}</small>
                <button 
                  class="btn btn-sm btn-outline-danger" 
                  on:click={() => removeFolder(folder)}
                  disabled={scanning}
                >
                  ✕
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {:else}
        <p class="text-muted">No folders added yet. Click "Add Folder" to begin.</p>
      {/if}
      
      <!-- Progress display -->
      {#if scanning}
        <div class="progress-info mt-3">
          <div class="progress" style="height: 20px;">
            <div 
              class="progress-bar" 
              role="progressbar" 
              style="width: {scanProgress.total > 0 ? (scanProgress.scanned / scanProgress.total * 100) : 0}%"
            >
              {scanProgress.scanned} / {scanProgress.total}
            </div>
          </div>
          <p class="text-muted mt-2">
            {scanProgress.status || 'Scanning...'}
          </p>
        </div>
      {/if}
    </div>
  </div>

  <div class="row mt-5">
    <div class="col-md-4">
      <div class="card">
        <div class="card-body">
          <h5>📚 Library</h5>
          <p class="text-muted">Browse your music collection</p>
          <a href="/library" class="btn btn-outline-primary">Open Library</a>
        </div>
      </div>
    </div>
    <div class="col-md-4">
      <div class="card">
        <div class="card-body">
          <h5>▶️ Player</h5>
          <p class="text-muted">Play and manage your queue</p>
          <a href="/player" class="btn btn-outline-primary">Open Player</a>
        </div>
      </div>
    </div>
    <div class="col-md-4">
      <div class="card">
        <div class="card-body">
          <h5>⚙️ Settings</h5>
          <p class="text-muted">Configure your jukebox</p>
          <a href="/settings" class="btn btn-outline-primary">Open Settings</a>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .scan-controls {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
  }
  
  .folder-list ul {
    max-height: 200px;
    overflow-y: auto;
  }
</style>
