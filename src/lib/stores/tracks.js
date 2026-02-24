import { writable, derived } from 'svelte/store';

// Tracks store - holds all scanned tracks
export const tracks = writable([]);

// Search query store
export const searchQuery = writable('');

// Genre filter store
export const genreFilter = writable('');

// Year filter store
export const yearFilter = writable('');

/**
 * Normalize string for search (lowercase, remove punctuation, collapse spaces)
 * @param {string} str 
 * @returns {string}
 */
function normalizeForSearch(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get decade from year
 * @param {number|string} year 
 * @returns {string}
 */
function getDecade(year) {
  if (!year) return '';
  const y = parseInt(year);
  if (isNaN(y)) return '';
  const decade = Math.floor(y / 10) * 10;
  return `${decade}s`;
}

/**
 * Load tracks from SQLite database
 * Called on app startup to hydrate the store
 */
export async function loadFromDB() {
  console.log('[Tracks Store] Loading tracks from database...');
  
  if (typeof window !== 'undefined' && window.dbAPI) {
    try {
      const dbTracks = await window.dbAPI.getTracks();
      console.log('[Tracks Store] Loaded', dbTracks.length, 'tracks from database');
      tracks.set(dbTracks);
      return dbTracks;
    } catch (err) {
      console.error('[Tracks Store] Error loading from DB:', err);
      return [];
    }
  } else {
    console.warn('[Tracks Store] DB API not available');
    return [];
  }
}

/**
 * Load tracks from Electron scanner results
 * @param {Array} tracksArray - Array of track objects
 */
export function loadTracks(tracksArray) {
  console.log('[Tracks Store] Loading', tracksArray.length, 'tracks');
  tracks.set(tracksArray);
}

/**
 * Save tracks to SQLite database
 * @param {Array} tracksArray - Array of track objects
 */
export async function saveToDB(tracksArray) {
  console.log('[Tracks Store] Saving', tracksArray.length, 'tracks to database');
  
  if (typeof window !== 'undefined' && window.dbAPI) {
    try {
      await window.dbAPI.saveTracks(tracksArray);
      console.log('[Tracks Store] Saved tracks to database');
    } catch (err) {
      console.error('[Tracks Store] Error saving to DB:', err);
    }
  }
}

/**
 * Search and filter tracks by query, genre, and year
 * @param {Array} tracksArray - Array of track objects
 * @param {string} query - Search query
 * @param {string} genre - Genre filter
 * @param {string} year - Year filter (decade)
 * @returns {Array} - Filtered tracks
 */
export function searchAndFilter(tracksArray, query, genre, year) {
  let result = tracksArray;

  // Apply search query
  if (query && query.trim()) {
    const normalizedQuery = normalizeForSearch(query);
    result = result.filter(track => {
      return track.searchKey && track.searchKey.includes(normalizedQuery);
    });
  }

  // Apply genre filter
  if (genre && genre.trim()) {
    result = result.filter(track => {
      const trackGenre = track.genre ? track.genre.toLowerCase() : '';
      return trackGenre === genre.toLowerCase();
    });
  }

  // Apply year filter (decade)
  if (year && year.trim()) {
    result = result.filter(track => {
      const trackDecade = getDecade(track.year);
      return trackDecade === year;
    });
  }

  return result;
}

// Derived store for filtered tracks based on search query, genre, and year
export const filteredTracks = derived(
  [tracks, searchQuery, genreFilter, yearFilter],
  ([$tracks, $searchQuery, $genreFilter, $yearFilter]) => 
    searchAndFilter($tracks, $searchQuery, $genreFilter, $yearFilter)
);

/**
 * Reset all filters
 */
export function resetFilters() {
  searchQuery.set('');
  genreFilter.set('');
  yearFilter.set('');
}

/**
 * Add a track to the library
 * @param {Object} track - Track metadata
 */
export function addTrack(track) {
  tracks.update(current => [...current, track]);
}

/**
 * Clear all tracks
 */
export function clearTracks() {
  tracks.set([]);
}

/**
 * Update a single track in the store
 * @param {Object} updatedTrack - Track data to update
 */
export function updateTrack(updatedTrack) {
  console.log('[Tracks Store] Updating track:', updatedTrack);
  tracks.update(current => {
    return current.map(track => {
      if (track.id === updatedTrack.id) {
        // Return updated track with merged data
        return {
          ...track,
          title: updatedTrack.title || track.title,
          artist: updatedTrack.artist || track.artist,
          album: updatedTrack.album || track.album,
          identified: updatedTrack.identified !== undefined ? updatedTrack.identified : track.identified
        };
      }
      return track;
    });
  });
}

/**
 * Initialize track update listener
 * Should be called once on app startup
 */
export function initTrackUpdates() {
  if (typeof window !== 'undefined' && window.identifyAPI) {
    console.log('[Tracks Store] Initializing track update listener');
    
    // Listen for track updates from identifier
    window.identifyAPI.onTrackUpdated((data) => {
      console.log('[Tracks Store] Received track update:', data);
      updateTrack(data);
    });
  }
}
