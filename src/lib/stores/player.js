import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { queue, currentIndex } from './queue.js';
import { AUDIO_CONFIG, STORE_CONFIG } from '../config.js';

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

// Store subscription cleanup
let queueUnsubscribe = null;

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
  
  if (!track || typeof track !== 'object') {
    console.log('[Player Store] No valid track provided');
    return;
  }
  
  currentTrack.set(track);
  progress.set(0);
  currentTime.set(0);
  duration.set(0);
  
  if (audioElement && browser) {
    const filePath = track.path || track.filePath;
    if (filePath && typeof filePath === 'string' && filePath.trim()) {
      try {
        // Use electronAPI if available, otherwise use direct path
        if (window.electronAPI && typeof window.electronAPI.toFileUrl === 'function') {
          audioElement.src = window.electronAPI.toFileUrl(filePath);
        } else {
          audioElement.src = filePath;
        }
        console.log('[Player Store] Audio src set to:', audioElement.src);
        audioElement.load();
      } catch (err) {
        console.error('[Player Store] Error setting audio src:', err);
      }
    } else {
      console.error('[Player Store] No valid file path in track:', track);
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
  
  if (!audioElement || !audioElement.src) {
    console.warn('[Player Store] No audio element or source, cannot play');
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

// Subscribe to queue changes - single subscription to prevent double-firing
if (browser) {
  queueUnsubscribe = queue.subscribe(q => {
    const idx = get(currentIndex);
    if (idx >= 0 && idx < q.length) {
      const newTrack = q[idx];
      if (newTrack) {
        const current = get(currentTrack);
        // Only update if track actually changed
        if (!current || (current.path !== newTrack.path && current.id !== newTrack.id)) {
          previousIndex = idx;
          setTrack(newTrack);
          if (get(isPlaying)) {
            setTimeout(() => play(), 100);
          }
        }
      }
    }
  });
  
  // Also subscribe to currentIndex changes for next/previous buttons
  currentIndex.subscribe(idx => {
    const q = get(queue);
    if (idx >= 0 && idx < q.length && idx !== previousIndex) {
      const newTrack = q[idx];
      if (newTrack) {
        console.log('[Player Store] CurrentIndex changed to', idx, ', loading:', newTrack.title);
        previousIndex = idx;
        setTrack(newTrack);
        // Always start playback when currentIndex changes (for auto-advance)
        setTimeout(() => play(), 100);
      }
    }
  });
  
  // Listen for auto-play events from queue to avoid circular dependency
  window.addEventListener('queue:autoPlay', (event) => {
    const { track } = event.detail;
    console.log('[Player Store] Auto-play event received for:', track?.title);
    setTrack(track);
    play();
  });
}

/**
 * Cleanup store subscriptions
 */
export function cleanup() {
  if (queueUnsubscribe) {
    queueUnsubscribe();
    queueUnsubscribe = null;
  }
}
