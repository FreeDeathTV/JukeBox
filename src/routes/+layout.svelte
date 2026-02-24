<script>
  import { onMount } from 'svelte';
  import Player from '$lib/components/Player.svelte';
  import { loadFromDB } from '$lib/stores/tracks.js';
  import { uiMode, toggleMode, initModeSync } from '$lib/stores/ui.js';
  import { initTheme } from '$lib/stores/theme.js';
  
  onMount(async () => {
    // Dynamically load Bootstrap JS for interactive components
    await import('bootstrap/dist/js/bootstrap.bundle.min.js');
    
    // Load tracks from SQLite database on startup
    if (typeof window !== 'undefined' && window.dbAPI) {
      loadFromDB();
    }
    
    // Initialize mode sync with Electron
    initModeSync();
    
    // Load saved theme on startup
    if (typeof window !== 'undefined' && window.electronAPI) {
      try {
        const settings = await window.electronAPI.loadSettings();
        if (settings && settings.theme) {
          initTheme(settings.theme);
        }
      } catch (err) {
        console.error('[Layout] Error loading theme:', err);
        initTheme('dark');
      }
    }
  });
  
  function handleModeToggle() {
    const newMode = $uiMode === 'full' ? 'mini' : 'full';
    toggleMode();
    // Send to Electron main process
    if (typeof window !== 'undefined' && window.uiAPI) {
      window.uiAPI.setMode(newMode);
    }
  }

  function handleMinimize() {
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.minimize();
    }
  }

  function handleMaximize() {
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.maximize();
    }
  }

  function handleClose() {
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.close();
    }
  }
</script>

<!-- Custom Window Controls -->
<div class="window-controls">
  <button class="window-btn" on:click={handleMinimize} title="Minimize">—</button>
  <button class="window-btn" on:click={handleMaximize} title="Maximize">⬜</button>
  <button class="window-btn window-btn-close" on:click={handleClose} title="Close">✕</button>
</div>

<!-- Always keep Player mounted - just change its container styling -->
<Player mode={$uiMode} />

{#if $uiMode === 'full'}
  <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
    <div class="container-fluid">
      <a class="navbar-brand" href="/">🎵 Jukebox</a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="navbarNav">
        <ul class="navbar-nav">
          <li class="nav-item">
            <a class="nav-link" href="/">Home</a>
          </li>
          <li class="nav-item">
            <a class="nav-link" href="/library">Library</a>
          </li>
          <li class="nav-item">
            <a class="nav-link" href="/player">Player</a>
          </li>
          <li class="nav-item">
            <a class="nav-link" href="/settings">Settings</a>
          </li>
        </ul>
      </div>
    </div>
  </nav>

  <main class="container my-4">
    <slot />
  </main>
{/if}

<style>
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background-color: var(--bg, #f8f9fa);
    color: var(--text, #212529);
  }
  
  main {
    padding-bottom: 20px;
    padding-top: 20px;
  }

  /* Custom Window Controls - Top Right Corner */
  .window-controls {
    position: fixed;
    top: 0;
    right: 0;
    display: flex;
    z-index: 10000;
    -webkit-app-region: no-drag;
  }

  .window-btn {
    width: 46px;
    height: 32px;
    border: none;
    background: transparent;
    color: #ccc;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.15s;
  }

  .window-btn:hover {
    background-color: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .window-btn-close:hover {
    background-color: #e81123;
    color: white;
  }
</style>
