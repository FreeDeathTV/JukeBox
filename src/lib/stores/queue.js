import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';

// Queue array
export const queue = writable([]);

// Current index in queue
export const currentIndex = writable(-1);

/**
 * Get the current track from the queue
 */
export const current = derived(
  [queue, currentIndex],
  ([$queue, $currentIndex]) => {
    if ($currentIndex >= 0 && $currentIndex < $queue.length) {
      return $queue[$currentIndex];
    }
    return null;
  }
);

/**
 * Add a single track to the queue
 * @param {Object} track - Track object to add to queue
 * @returns {void}
 */
export function add(track) {
  console.log('[Queue Store] add called', track?.title);
  if (!track || typeof track !== 'object') return;
  
  const q = get(queue);
  
  // If queue is empty, set currentIndex to 0 to start playback
  if (q.length === 0) {
    currentIndex.set(0);
  }
  
  queue.update(current => [...current, track]);
}

/**
 * Add multiple tracks to the queue
 * @param {Array} tracks - Array of tracks to add
 */
export function addMany(tracks) {
  console.log('[Queue Store] addMany called', tracks.length, 'tracks');
  const q = get(queue);
  
  // If queue is empty, set currentIndex to 0 to start playback
  if (q.length === 0 && tracks.length > 0) {
    currentIndex.set(0);
  }
  
  queue.update(current => [...current, ...tracks]);
}

/**
 * Remove a track from the queue by index
 * @param {number} index - Index of track to remove
 */
export function remove(index) {
  console.log('[Queue Store] remove called', index);
  queue.update(current => {
    const updated = current.filter((_, i) => i !== index);
    // Adjust currentIndex if needed
    const idx = get(currentIndex);
    if (index < idx) {
      currentIndex.update(i => i - 1);
    } else if (index === idx) {
      currentIndex.set(-1);
    }
    return updated;
  });
}

// Alias for Queue.svelte compatibility
export const removeFromQueue = remove;

/**
 * Clear the entire queue
 */
export function clear() {
  console.log('[Queue Store] clear called');
  queue.set([]);
  currentIndex.set(-1);
}

// Alias for Queue.svelte compatibility
export const clearQueue = clear;

/**
 * Play a track immediately (replaces queue with single track)
 * @param {Object} track - Track to play now
 */
export function playNow(track) {
  console.log('[Queue Store] playNow called', track?.title);
  queue.set([track]);
  currentIndex.set(0);
}

/**
 * Add a track to the end of the queue
 * @param {Object} track - Track to add to queue
 * @param {boolean} autoPlay - Whether to auto-play if queue was empty
 */
export function addToQueue(track, autoPlay = true) {
  console.log('[Queue Store] addToQueue called', track?.title);
  const q = get(queue);
  const wasEmpty = q.length === 0;
  const newIndex = q.length;
  
  queue.update(current => [...current, track]);
  
  // If queue was empty and autoPlay is true, dispatch event for player to handle
  if (wasEmpty && autoPlay && browser) {
    currentIndex.set(0);
    // Dispatch event instead of direct import to avoid circular dependency
    window.dispatchEvent(new CustomEvent('queue:autoPlay', { 
      detail: { track, index: 0 } 
    }));
  }
}

/**
 * Move to the next track
 * @returns {Object|null} - The next track or null
 */
export function next() {
  const q = get(queue);
  const idx = get(currentIndex);
  
  console.log('[Queue Store] next called', { currentIndex: idx, queueLength: q.length });
  
  if (q.length === 0) return null;
  
  // If we're at the end, don't do anything
  if (idx >= q.length - 1) {
    console.log('[Queue Store] At end of queue, cannot go next');
    return null;
  }
  
  const nextIndex = idx + 1;
  currentIndex.set(nextIndex);
  return q[nextIndex];
}

/**
 * Move to the previous track
 * @returns {Object|null} - The previous track or null
 */
export function previous() {
  const q = get(queue);
  const idx = get(currentIndex);
  
  console.log('[Queue Store] previous called', { currentIndex: idx });
  
  if (q.length === 0) return null;
  
  // If more than 3 seconds in, restart current track
  if (typeof window !== 'undefined' && idx >= 0) {
    window.dispatchEvent(new CustomEvent('player:restart'));
  }
  
  // If at the beginning, stay there
  if (idx <= 0) {
    currentIndex.set(0);
    return q[0];
  }
  
  const prevIndex = idx - 1;
  currentIndex.set(prevIndex);
  return q[prevIndex];
}

/**
 * Set the current index directly
 * @param {number} index - Index to set as current
 */
export function setIndex(index) {
  const q = get(queue);
  // Add bounds checking to prevent desync
  if (index < 0) index = 0;
  if (index >= q.length) index = q.length - 1;
  
  if (index >= 0 && index < q.length) {
    currentIndex.set(index);
    return q[index];
  }
  return null;
}

/**
 * Play a specific track from the queue
 * @param {Object} track - Track to play
 */
export function playTrack(track) {
  console.log('[Queue Store] playTrack called', track?.title);
  const q = get(queue);
  const index = q.findIndex(t => t.path === track.path || t.id === track.id);
  
  if (index >= 0) {
    currentIndex.set(index);
  } else {
    // Track not in queue, add and play
    queue.update(current => [...current, track]);
    currentIndex.set(get(queue).length - 1);
  }
}

/**
 * Replace queue with new tracks and start playing
 * @param {Array} tracks - New tracks to play
 * @param {number} startIndex - Index to start playing from
 */
export function replaceAndPlay(tracks, startIndex = 0) {
  console.log('[Queue Store] replaceAndPlay called', tracks.length, 'tracks, start:', startIndex);
  queue.set(tracks);
  if (startIndex >= 0 && startIndex < tracks.length) {
    currentIndex.set(startIndex);
  } else {
    currentIndex.set(0);
  }
}

/**
 * Shuffle the queue
 */
export function shuffle() {
  queue.update(current => {
    const shuffled = [...current].sort(() => Math.random() - 0.5);
    return shuffled;
  });
}

// Listen for track ended events to auto-advance
if (browser) {
  window.addEventListener('player:trackEnded', () => {
    const nextTrack = next();
    if (!nextTrack) {
      // No more tracks, stop playback
      if (typeof window !== 'undefined' && window.playerAPI && window.playerAPI.pause) {
        window.playerAPI.pause();
      }
    }
  });
}
