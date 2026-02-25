<script>
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { 
    currentTrack, 
    isPlaying, 
    progress, 
    volume,
    currentTime,
    duration,
    setAudioElement,
    play,
    pause,
    toggle,
    stop,
    setVolume,
    setProgress,
    updateProgress,
    handleTrackEnded
  } from '../stores/player.js';
  
  import { current as queueCurrent, next, previous, setIndex, queue } from '../stores/queue.js';
  import { uiMode } from '../stores/ui.js';
  import { toggleModeWithSync } from '../utils/modeToggle.js';
  import { AUDIO_CONFIG, TIME_CONFIG } from '../config.js';

  // Mode prop - 'full' or 'mini'
  export let mode = 'full';

  let audio;
  let mounted = false;
  
  // Reactive queue subscriptions - combined for performance
  $: currentQueue = $queue;
  $: queueLength = $queue.length;

  onMount(() => {
    console.log('[Player] Component mounted, mode:', mode);
    mounted = true;
    
    // Register audio element with store
    if (audio) {
      setAudioElement(audio);
    }
    
    // Listen for track ended to auto-advance - only in browser
    if (browser) {
      window.addEventListener('player:trackEnded', handleTrackEndedCustom);
      window.addEventListener('player:restart', handleRestart);
    }
  });

onDestroy(() => {
  // Only cleanup in browser - don't destroy audio element!
  if (browser) {
    window.removeEventListener('player:trackEnded', handleTrackEndedCustom);
    window.removeEventListener('player:restart', handleRestart);
  }
  
  // Clean up player store subscriptions
  if (typeof window !== 'undefined' && window.playerAPI) {
    window.playerAPI.cleanup();
  }
});

  function handleTrackEndedCustom() {
    console.log('[Player] Track ended, advancing to next');
    try {
      const nextTrack = next();
      if (!nextTrack) {
        pause();
        stop();
      } else {
        // Ensure the next track starts playing automatically
        // The player store should handle this via currentIndex subscription
        console.log('[Player] Next track queued:', nextTrack.title);
      }
    } catch (err) {
      console.error('[Player] Error handling track ended:', err);
    }
  }

  function handleRestart() {
    if (audio) {
      audio.currentTime = 0;
    }
  }

  function handleTimeUpdate() {
    if (audio && audio.duration) {
      updateProgress(audio.currentTime, audio.duration);
    }
  }

  function handleLoadedMetadata() {
    if (audio) {
      duration.set(audio.duration);
      console.log('[Player] Duration:', audio.duration);
    }
  }

  function handlePlay() {
    isPlaying.set(true);
  }

  function handlePause() {
    isPlaying.set(false);
  }

  function handleEnded() {
    handleTrackEnded();
  }

  function handleSeek(event) {
    const value = parseFloat(event.target.value);
    setProgress(value);
  }

  function handleVolume(event) {
    const value = parseInt(event.target.value);
    setVolume(value);
  }

  function handleNext() {
    console.log('[Player] Next button clicked');
    next();
  }

  function handlePrevious() {
    console.log('[Player] Previous button clicked');
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    previous();
  }

  function handleStop() {
    stop();
    if (audio) {
      audio.src = '';
    }
  }
  
  function handleToggleMode() {
    // Use shared mode toggle utility
    toggleModeWithSync();
  }

  function handleDrag(event) {
    // Handle dragging the mini player window
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.drag();
    }
  }

  function formatTime(seconds) {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Sync play state with audio element - only in browser
  $: if (browser && mounted && audio && $currentTrack) {
    if ($isPlaying && audio.paused) {
      audio.play().catch(err => console.error('[Player] Play error:', err));
    } else if (!$isPlaying && !audio.paused) {
      audio.pause();
    }
  }

  // Sync volume - only in browser
  $: if (browser && mounted && audio) {
    audio.volume = $volume / 100;
  }
</script>

<!-- Player container - always mounted -->
<div class="player-wrapper" class:mini-mode={$uiMode === 'mini'}>
  {#if $uiMode === 'mini'}
    <!-- Drag region for mini player - click to drag window -->
    <div class="drag-region" on:mousedown={handleDrag}></div>
  {/if}
  <!-- Hidden audio element -->
  <audio
    bind:this={audio}
    on:timeupdate={handleTimeUpdate}
    on:loadedmetadata={handleLoadedMetadata}
    on:play={handlePlay}
    on:pause={handlePause}
    on:ended={handleEnded}
    preload="metadata"
  ></audio>

  {#if $currentTrack}
    <!-- Track Info -->
    <div class="track-info">
      <div class="album-art-small">
        <span>🎵</span>
      </div>
      <div class="track-details">
        <div class="track-title">{$currentTrack.title || 'Unknown Title'}</div>
        <div class="track-artist">{$currentTrack.artist || 'Unknown Artist'}</div>
      </div>
    </div>

    <!-- Playback Controls -->
    <div class="playback-controls">
      <button class="btn-control" on:click={handlePrevious} title="Previous">
        ⏮
      </button>
      <button 
        class="btn-control btn-play" 
        on:click={toggle}
        title={$isPlaying ? 'Pause' : 'Play'}
      >
        {$isPlaying ? '⏸' : '▶'}
      </button>
      <button class="btn-control" on:click={handleNext} title="Next">
        ⏭
      </button>
    </div>

    <!-- Progress -->
    <div class="progress-section">
      <span class="time">{formatTime($currentTime)}</span>
      <input 
        type="range" 
        class="progress-slider"
        min="0" 
        max="1" 
        step="0.01"
        value={$progress}
        on:input={handleSeek}
      />
      <span class="time">{formatTime($duration)}</span>
    </div>

    <!-- Volume & Queue -->
    <div class="extra-controls">
      <button class="btn-control btn-small" on:click={handleStop} title="Stop">
        ⏹
      </button>
      <div class="volume-control">
        <span>🔊</span>
        <input 
          type="range" 
          class="volume-slider"
          min="0" 
          max="100" 
          value={$volume}
          on:input={handleVolume}
        />
      </div>
      <!-- Mode toggle button -->
      <button 
        class="btn btn-sm btn-outline-light mode-toggle-btn" 
        on:click={handleToggleMode}
        title={$uiMode === 'full' ? 'Switch to Mini Player' : 'Switch to Full Mode'}
      >
        {$uiMode === 'full' ? '⬇ Mini' : '⬆ Full'}
      </button>
    </div>
  {:else}
    <div class="no-track">
      <span>No track selected - Select from library</span>
      {#if $uiMode === 'mini'}
        <button 
          class="btn btn-sm btn-outline-light mode-toggle-btn ms-3" 
          on:click={handleToggleMode}
          title="Switch to Full Mode"
        >
          ⬆ Full
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .player-wrapper {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 80px;
    color: white;
    gap: 16px;
    padding: 0 16px;
    background: #1a1a2e;
    border-top: 1px solid #16213e;
    width: 100%;
    box-sizing: border-box;
  }
  
  .player-wrapper.mini-mode {
    position: relative;
    z-index: 9999;
  }
  
  /* Drag region for mini player - blends with background */
  .drag-region {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 20px;
    background: #1a1a2e;
    -webkit-app-region: drag;
    cursor: move;
    z-index: 10000;
  }
  
  .track-info {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 160px;
    max-width: 180px;
  }
  
  .album-art-small {
    width: 48px;
    height: 48px;
    background: #16213e;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    flex-shrink: 0;
  }
  
  .track-details {
    overflow: hidden;
  }
  
  .track-title {
    font-weight: 500;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0;
  }
  
  .track-artist {
    font-size: 11px;
    color: #a0a0a0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0;
  }
  
  .playback-controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  
  .btn-control {
    background: transparent;
    border: none;
    color: white;
    font-size: 1rem;
    cursor: pointer;
    padding: 6px;
    border-radius: 50%;
    transition: background 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .btn-control:hover {
    background: rgba(255,255,255,0.1);
  }
  
  .btn-play {
    width: 36px;
    height: 36px;
    background: #e94560;
    font-size: 0.9rem;
  }
  
  .btn-play:hover {
    background: #ff6b6b;
  }
  
  .progress-section {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    max-width: 300px;
  }
  
  .time {
    font-size: 10px;
    color: #a0a0a0;
    min-width: 30px;
  }
  
  .progress-slider {
    flex: 1;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: #333;
    border-radius: 2px;
    cursor: pointer;
  }
  
  .progress-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 10px;
    height: 10px;
    background: #e94560;
    border-radius: 50%;
    cursor: pointer;
  }
  
  .extra-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .volume-control {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  
  .volume-slider {
    width: 50px;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: #333;
    border-radius: 2px;
    cursor: pointer;
  }
  
  .volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 8px;
    height: 8px;
    background: #e94560;
    border-radius: 50%;
    cursor: pointer;
  }
  
  .no-track {
    flex: 1;
    text-align: center;
    color: #a0a0a0;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .btn-small {
    font-size: 0.8rem;
  }
  
  .mode-toggle-btn {
    flex-shrink: 0;
    margin-left: 8px;
  }
</style>
