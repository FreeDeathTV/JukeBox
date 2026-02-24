/**
 * Identifier Worker - Background identification of unknown tracks
 * Uses Chromaprint/AcoustID to identify tracks with missing metadata
 */

const path = require('path');
const database = require('./database.cjs');
const fingerprint = require('./fingerprint.cjs');

// Track identification state
let isRunning = false;
let shouldStop = false;
let progressCallback = null;
let mainWindow = null;

/**
 * Set the main window reference for sending events
 * @param {BrowserWindow} window - Electron main window
 */
function setMainWindow(window) {
  mainWindow = window;
}

/**
 * Set progress callback
 * @param {Function} callback - Progress callback function
 */
function setProgressCallback(callback) {
  progressCallback = callback;
}

/**
 * Send progress update to renderer
 * @param {Object} data - Progress data
 */
function sendProgress(data) {
  if (progressCallback) {
    progressCallback(data);
  }
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('identify:progress', data);
  }
}

/**
 * Send track updated event to renderer
 * @param {Object} track - Updated track data
 */
function sendTrackUpdated(track) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('track:updated', track);
  }
}

/**
 * Process a single track - fingerprint and lookup
 * @param {Object} track - Track object from database
 * @param {string} apiKey - AcoustID API key
 * @returns {Promise<Object|null>} - Updated track or null
 */
async function processTrack(track, apiKey) {
  console.log('[Identifier] Processing track:', track.path);
  
  // If track already has fingerprint, use it
  let fp = null;
  
  if (track.fingerprint) {
    fp = {
      fingerprint: track.fingerprint,
      duration: track.duration
    };
  } else {
    // Generate fingerprint
    fp = await fingerprint.fingerprintFile(track.path);
    
    if (fp) {
      // Save fingerprint to database
      database.updateTrackFingerprint(track.id, fp.fingerprint, fp.duration);
    }
  }
  
  if (!fp) {
    console.log('[Identifier] Could not generate fingerprint for:', track.path);
    return null;
  }
  
  // Look up metadata from AcoustID
  const metadata = await fingerprint.lookupAcoustID(fp.fingerprint, fp.duration, apiKey);
  
  if (!metadata) {
    console.log('[Identifier] No metadata found for:', track.path);
    return null;
  }
  
  // Skip if metadata has null values (AcoustID found nothing useful)
  if (!metadata.title && !metadata.artist && !metadata.album) {
    console.log('[Identifier] Empty metadata from AcoustID for:', track.path);
    return null;
  }
  
  // If title is null, use a fallback title based on the filename
  if (!metadata.title) {
    const filename = path.basename(track.path, path.extname(track.path));
    metadata.title = filename;
  }
  
  // If artist is null, use Unknown Artist
  if (!metadata.artist) {
    metadata.artist = 'Unknown Artist';
  }
  
  // If album is null, use Unknown Album
  if (!metadata.album) {
    metadata.album = 'Unknown Album';
  }
  
  // Update database with metadata
  database.updateTrackMetadata(track.id, metadata);
  
  // Return updated track
  return {
    id: track.id,
    title: metadata.title,
    artist: metadata.artist,
    album: metadata.album,
    identified: 1
  };
}

/**
 * Run identification on all unidentified tracks
 * @param {string} apiKey - AcoustID API key
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} - { processed, identified, failed }
 */
async function runIdentification(apiKey, onProgress) {
  if (isRunning) {
    console.log('[Identifier] Already running');
    return { processed: 0, identified: 0, failed: 0 };
  }
  
  if (!apiKey) {
    console.log('[Identifier] No API key provided');
    return { processed: 0, identified: 0, failed: 0, error: 'No API key' };
  }
  
  isRunning = true;
  shouldStop = false;
  
  if (onProgress) {
    progressCallback = onProgress;
  }
  
  console.log('[Identifier] Starting identification process');
  
  // Get all unidentified tracks
  const tracks = database.getUnidentifiedTracks();
  const total = tracks.length;
  
  console.log('[Identifier] Found', total, 'unidentified tracks');
  
  sendProgress({ current: 0, total, status: 'starting' });
  
  let processed = 0;
  let identified = 0;
  let failed = 0;
  
  for (let i = 0; i < tracks.length; i++) {
    if (shouldStop) {
      console.log('[Identifier] Stopping identification');
      break;
    }
    
    const track = tracks[i];
    
    sendProgress({ 
      current: i + 1, 
      total, 
      status: 'processing',
      currentTrack: track.path
    });
    
    try {
      const updatedTrack = await processTrack(track, apiKey);
      
      if (updatedTrack) {
        identified++;
        sendTrackUpdated(updatedTrack);
        console.log('[Identifier] Identified:', updatedTrack.title, '-', updatedTrack.artist);
      } else {
        failed++;
      }
    } catch (err) {
      console.log('[Identifier] Error processing track:', err.message);
      failed++;
    }
    
    processed++;
  }
  
  sendProgress({ 
    current: processed, 
    total, 
    status: 'complete',
    identified,
    failed
  });
  
  console.log('[Identifier] Identification complete. Processed:', processed, 'Identified:', identified, 'Failed:', failed);
  
  isRunning = false;
  
  return { processed, identified, failed };
}

/**
 * Stop the identification process
 */
function stopIdentification() {
  shouldStop = true;
  console.log('[Identifier] Stop requested');
}

/**
 * Get identification status
 * @returns {Object} - { isRunning, unidentifiedCount }
 */
function getStatus() {
  const unidentifiedCount = database.getUnidentifiedCount();
  
  return {
    isRunning,
    unidentifiedCount
  };
}

module.exports = {
  runIdentification,
  stopIdentification,
  getStatus,
  setMainWindow,
  setProgressCallback
};
