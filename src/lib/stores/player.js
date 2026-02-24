import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { queue, currentIndex } from './queue.js';

// Current track being played
export const currentTrack = writable(null);

// Playback state
export const isPlaying = writable(false);

// Volume (0-100)
export const volume = writable(80);

// Progress (0-1)
export const progress = writable(0);

// Duration in seconds
export const duration = writable(0);

// Current time in seconds
export const currentTime = writable(0);

// Audio element reference (set by Player component)
let audioElement = null;

// Track the previous index to detect changes
let previousIndex = -1;

/**
 * Set the audio element reference
 * @param {HTMLAudioElement} audio - The audio element
 */
export function setAudioElement(audio) {
  audioElement = audio;
}

/**
 * Set the current track and load it
 * @param {Object} track - Track to play
 */
export function setTrack(track) {
  console.log('[Player Store] setTrack called', track?.title);
  
  if (!track) {
    console.log('[Player Store] No track provided');
    return;
  }
  
  currentTrack.set(track);
  progress.set(0);
  currentTime.set(0);
  duration.set(0);
  
  if (audioElement && browser) {
    const filePath = track.path || track.filePath;
    if (filePath) {
      // Use electronAPI if available, otherwise use direct path
      if (window.electronAPI) {
        audioElement.src = window.electronAPI.toFileUrl(filePath);
      } else {
        audioElement.src = filePath;
      }
      console.log('[Player Store] Audio src set to:', audioElement.src);
      audioElement.load();
    } else {
      console.error('[Player Store] No file path in track:', track);
    }
  } else {
    console.warn('[Player Store] No audio element or not in browser');
  }
}

/**
 * Play the current track
 */
export function play() {
  console.log('[Player Store] play called');
  
  if (!audioElement) {
    console.warn('[Player Store] No audio element, cannot play');
    return;
  }
  
  // Check if we have a source
  if (!audioElement.src) {
    console.warn('[Player Store] No audio source, cannot play');
    return;
  }
  
  const playPromise = audioElement.play();
  if (playPromise !== undefined) {
    playPromise.catch(err => {
      console.error('[Player Store] Play error:', err);
    });
  }
  isPlaying.set(true);
}

/**
 * Pause playback
 */
export function pause() {
  console.log('[Player Store] pause called');
  if (audioElement) {
    audioElement.pause();
  }
  isPlaying.set(false);
}

/**
 * Toggle play/pause
 */
export function toggle() {
  const playing = get(isPlaying);
  if (playing) {
    pause();
  } else {
    play();
  }
}

/**
 * Stop playback and reset
 */
export function stop() {
  console.log('[Player Store] stop called');
  if (audioElement) {
    audioElement.pause();
    audioElement.currentTime = 0;
  }
  currentTrack.set(null);
  isPlaying.set(false);
  progress.set(0);
  currentTime.set(0);
  duration.set(0);
}

/**
 * Set volume (0-100)
 * @param {number} value - Volume level
 */
export function setVolume(value) {
  volume.set(Math.max(0, Math.min(100, value)));
  if (audioElement) {
    audioElement.volume = value / 100;
  }
}

/**
 * Set progress (0-1)
 * @param {number} value - Progress ratio
 */
export function setProgress(value) {
  progress.set(Math.max(0, Math.min(1, value)));
  if (audioElement && audioElement.duration) {
    audioElement.currentTime = value * audioElement.duration;
  }
}

/**
 * Update progress from audio element
 * @param {number} current - Current time in seconds
 * @param {number} dur - Duration in seconds
 */
export function updateProgress(current, dur) {
  currentTime.set(current);
  duration.set(dur);
  if (dur > 0) {
    progress.set(current / dur);
  }
}

/**
 * Handle track ended - dispatch event for queue advancement
 */
export function handleTrackEnded() {
  console.log('[Player Store] Track ended');
  // Dispatch custom event that queue can listen to
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('player:trackEnded'));
  }
}

// Subscribe to queue changes - only reload when currentIndex changes, not when queue array changes
if (browser) {
  // Subscribe to both queue and currentIndex
  let currentQueue = [];
  
  queue.subscribe(q => {
    currentQueue = q;
    // Small delay to ensure state is updated
    setTimeout(() => checkForTrackChange(), 10);
  });
  
  currentIndex.subscribe(idx => {
    setTimeout(() => checkForTrackChange(), 10);
  });
  
  function checkForTrackChange() {
    const idx = get(currentIndex);
    const q = get(queue);
    
    console.log('[Player Store] checkForTrackChange:', { idx, queueLength: q.length, previousIndex });
    
    // Only change track if the index changed AND there's a valid track at that index
    if (idx >= 0 && idx < q.length && idx !== previousIndex) {
      const newTrack = q[idx];
      if (newTrack) {
        console.log('[Player Store] Queue index changed to', idx, ', loading:', newTrack.title);
        previousIndex = idx;
        
        // Check if this is a different track
        const current = get(currentTrack);
        if (!current || (current.path !== newTrack.path && current.id !== newTrack.id)) {
          setTrack(newTrack);
          // Small delay to ensure track is loaded before playing
          setTimeout(() => play(), 100);
        }
      }
    }
  }
}
