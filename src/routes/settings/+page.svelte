<script>
  import { onMount } from 'svelte';
  import { initTrackUpdates } from '$lib/stores/tracks.js';
  import { applyTheme } from '$lib/stores/theme.js';

  let settings = {
    musicFolder: '',
    theme: 'dark',
    autoScan: false,
    acoustidApiKey: ''
  };
  let saving = false;
  let isElectron = false;
  let identifying = false;
  let guessing = false;
  let identifyProgress = { current: 0, total: 0, status: '' };
  let unidentifiedCount = 0;
  let guessableCount = 0;

  onMount(() => {
    isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;
    console.log('[Settings] Running in Electron:', isElectron);
    
    if (isElectron) {
      loadSettings();
      initTrackUpdates();
      loadUnidentifiedCount();
      
      if (window.identifyAPI) {
        window.identifyAPI.onProgress((data) => {
          identifyProgress = data;
        });
      }
    }
  });

  async function loadSettings() {
    console.log('[Settings] Page mounted - loading settings');
    try {
      const loadedSettings = await window.electronAPI.loadSettings();
      settings = { ...settings, ...loadedSettings };
      // Apply saved theme on load
      applyTheme(settings.theme);
    } catch (error) {
      console.error('[Settings] Error loading settings:', error);
    }
  }

  async function loadUnidentifiedCount() {
    if (window.identifyAPI) {
      try {
        const status = await window.identifyAPI.getStatus();
        unidentifiedCount = status.unidentifiedCount || 0;
      } catch (err) {
        console.error('[Settings] Error loading unidentified count:', err);
      }
    }
    
    if (window.guessAPI) {
      try {
        const status = await window.guessAPI.getStatus();
        guessableCount = status.guessableCount || 0;
      } catch (err) {
        console.error('[Settings] Error loading guessable count:', err);
      }
    }
  }

  async function saveSettings() {
    saving = true;
    console.log('[Settings] Saving settings:', settings);
    
    if (!isElectron) {
      console.warn('[Settings] Not running in Electron - demo mode');
      setTimeout(() => {
        alert('Settings saved successfully! (Demo mode)');
        saving = false;
      }, 500);
      return;
    }
    
    try {
      await window.electronAPI.saveSettings(settings);
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('[Settings] Error saving settings:', error);
    } finally {
      saving = false;
    }
  }

  function handleThemeChange() {
    applyTheme(settings.theme);
  }

  async function runIdentification() {
    if (!settings.acoustidApiKey) {
      alert('Please enter your AcoustID API key first!');
      return;
    }
    
    identifying = true;
    identifyProgress = { current: 0, total: unidentifiedCount, status: 'starting' };
    
    console.log('[Settings] Starting identification...');
    
    try {
      const result = await window.identifyAPI.run(settings.acoustidApiKey);
      
      if (result.success) {
        alert(`Identification complete!\n\nIdentified: ${result.identified}\nFailed: ${result.failed}`);
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('[Settings] Error running identification:', error);
      alert('Error running identification: ' + error.message);
    } finally {
      identifying = false;
      identifyProgress = { current: 0, total: 0, status: '' };
      loadUnidentifiedCount();
    }
  }
  
  async function runGuesser() {
    guessing = true;
    try {
      const result = await window.guessAPI.run();
      if (result.success) alert('Guessed: ' + result.guessed + ', Skipped: ' + result.skipped);
      else alert('Error: ' + result.error);
    } catch (error) { console.error(error); }
    finally { guessing = false; loadUnidentifiedCount(); }
  }

  let spotifyConnected = false;
  let spotifyTokenExpiry = 0;
  let spotifyEnriching = false;
  let spotifyProgress = { current: 0, total: 0, status: '' };

  async function checkSpotifyStatus() {
    if (window.spotifyAPI) {
      try { const status = await window.spotifyAPI.getToken(); spotifyConnected = status.hasToken && !status.isExpired; spotifyTokenExpiry = status.expiresIn || 0; }
      catch (err) { console.error(err); }
    }
  }

  async function connectSpotify() {
    if (!window.spotifyAPI) return;
    try {
      const result = await window.spotifyAPI.connect();
      if (result.success) { spotifyConnected = true; spotifyTokenExpiry = result.expiresIn || 3600; alert('Connected!'); }
      else { alert('Failed'); }
    } catch (err) { console.error(err); }
  }

  async function disconnectSpotify() {
    if (!window.spotifyAPI) return;
    try { await window.spotifyAPI.disconnect(); spotifyConnected = false; spotifyTokenExpiry = 0; }
    catch (err) { console.error(err); }
  }

  async function enrichLibrary() {
    if (!window.spotifyAPI || !window.dbAPI) return;
    spotifyEnriching = true;
    spotifyProgress = { current: 0, total: 0, status: 'Loading...' };
    let enrichedCount = 0;
    try {
      const allTracks = await window.dbAPI.getTracks();
      spotifyProgress.total = allTracks.length;
      for (let i = 0; i < allTracks.length; i++) {
        const track = allTracks[i];
        spotifyProgress.current = i + 1;
        spotifyProgress.status = 'Processing: ' + (track.title||'Unknown');
        const result = await window.spotifyAPI.enrichTrack(track);
        if (result.success && result.metadata) {
          const merged = {...track, title: result.metadata.title||track.title, artist: result.metadata.artist||track.artist, album: result.metadata.album||track.album, year: result.metadata.year||track.year, genre: result.metadata.genre||track.genre, spotifyId: result.metadata.spotifyId, spotifyAlbumArt: result.metadata.albumArt, metadataEnriched: true };
          await window.dbAPI.saveTracks([merged]); enrichedCount++;
        }
        await new Promise(r => setTimeout(r, 100));
      }
      alert('Enriched ' + enrichedCount + ' tracks!');
    } catch (err) { console.error(err); alert('Error'); }
    finally { spotifyEnriching = false; }
  }
</script>

<div class="settings-page">
  <h1 class="mb-4">⚙️ Settings</h1>
  <div class="card">
    <div class="card-body">
      <h5 class="card-title">General Settings</h5>
      <div class="mb-3">
        <label for="musicFolder" class="form-label">Music Folder</label>
        <input type="text" class="form-control" id="musicFolder" bind:value={settings.musicFolder} readonly />
        <div class="form-text">Click Scan in Home to set music folder.</div>
      </div>
      <div class="mb-3">
        <label for="theme" class="form-label">Theme</label>
        <select class="form-select" id="theme" bind:value={settings.theme} on:change={handleThemeChange}>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="nightclub">Nightclub</option>
          <option value="retro">Retro Jukebox</option>
        </select>
      </div>
      <div class="mb-3 form-check">
        <input type="checkbox" class="form-check-input" id="autoScan" bind:checked={settings.autoScan} />
        <label class="form-check-label" for="autoScan">Auto-scan on startup</label>
      </div>
      <button class="btn btn-primary" on:click={saveSettings} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</button>
    </div>
  </div>

  <div class="card mt-4">
    <div class="card-body">
      <h5 class="card-title">Acoustic Fingerprinting</h5>
      <p class="text-muted">Identify tracks via audio fingerprints.</p>
      <div class="mb-3">
        <label for="acoustidApiKey" class="form-label">AcoustID API Key</label>
        <input type="text" class="form-control" id="acoustidApiKey" bind:value={settings.acoustidApiKey} />
      </div>
      <div class="mb-3"><p class="text-muted">Unidentified: <strong>{unidentifiedCount}</strong></p></div>
      {#if identifying}
        <div class="mb-3">
          <div class="progress"><div class="progress-bar" style="width:{identifyProgress.total>0?identifyProgress.current/identifyProgress.total*100:0}%">{identifyProgress.current}/{identifyProgress.total}</div></div>
        </div>
      {/if}
      <button class="btn btn-success" on:click={runIdentification} disabled={identifying||unidentifiedCount===0}>{identifying?'Identifying...':'Identify Tracks'}</button>
    </div>
  </div>
  
  <div class="card mt-4">
    <div class="card-body">
      <h5 class="card-title">Best-Guess Metadata</h5>
      <p class="text-muted">Guess metadata from filename.</p>
      <div class="mb-3"><p class="text-muted">Guessable: <strong>{guessableCount}</strong></p></div>
      {#if guessing}<div class="mb-3"><div class="spinner-border"></div></div>{/if}
      <button class="btn btn-warning" on:click={runGuesser} disabled={guessing||guessableCount===0}>{guessing?'Analyzing...':'Guess Metadata'}</button>
    </div>
  </div>

  <div class="card mt-4">
    <div class="card-body">
      <h5 class="card-title">Spotify Enrichment</h5>
      <p class="text-muted">Add genre, year from Spotify.</p>
      <div class="mb-3">
        {#if spotifyConnected}<span class="badge bg-success">Connected</span><span class="text-muted ms-2">Expires {Math.floor(spotifyTokenExpiry/60)}min</span>
        {:else}<span class="badge bg-secondary">Not Connected</span>{/if}
      </div>
      {#if spotifyEnriching}
        <div class="mb-3">
          <div class="progress"><div class="progress-bar bg-info" style="width:{spotifyProgress.total>0?spotifyProgress.current/spotifyProgress.total*100:0}%">{spotifyProgress.current}/{spotifyProgress.total}</div></div>
          <div class="form-text">{spotifyProgress.status}</div>
        </div>
      {/if}
      <div class="mb-3">
        {#if spotifyConnected}
          <button class="btn btn-outline-danger me-2" on:click={disconnectSpotify}>Disconnect</button>
          <button class="btn btn-success" on:click={enrichLibrary} disabled={spotifyEnriching}>{spotifyEnriching?'Enriching...':'Enrich Library'}</button>
        {:else}
          <button class="btn btn-primary" on:click={connectSpotify}>Connect to Spotify</button>
        {/if}
      </div>
    </div>
  </div>

  <div class="card mt-4">
    <div class="card-body">
      <h5 class="card-title">Library Maintenance</h5>
      <p class="text-muted">Manage your music library.</p>
      <div class="mb-3">
        <a href="/duplicates" class="btn btn-warning">
          Manage Duplicates
        </a>
      </div>
      <p class="text-muted small">Find and remove duplicate tracks from your library.</p>
    </div>
  </div>
  
  <div class="card mt-4">
    <div class="card-body">
      <h5 class="card-title">About</h5>
      <p class="text-muted">McJukebox v1.0.0 - Desktop jukebox</p>
    </div>
  </div>
</div>
