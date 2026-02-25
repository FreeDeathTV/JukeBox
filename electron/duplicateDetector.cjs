/**
 * Duplicate Detector Module
 * Strict priority duplicate detection:
 * 1. If both tracks have fingerprints: match = duplicates, differ = NOT duplicates
 * 2. If fingerprints missing/failed: check duration, then title+artist
 * 3. Bitrate/size/codec/folder ONLY used for "keep best" selection
 */

const fs = require('fs');
const path = require('path');
const database = require('./database.cjs');

/**
 * Get file metadata (bitrate, size, codec, folder)
 * Used ONLY for "keep best" selection, not for duplicate detection
 * @param {string} filePath - Full path to the audio file
 * @returns {Promise<Object>} - File metadata
 */
async function getFileMetadata(filePath) {
  try {
    const stats = await fs.promises.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    
    // Determine codec from extension
    const codecMap = {
      '.mp3': 'MP3',
      '.flac': 'FLAC',
      '.wav': 'WAV',
      '.m4a': 'AAC/M4A',
      '.aac': 'AAC',
      '.ogg': 'OGG',
      '.wma': 'WMA'
    };
    
    return {
      size: stats.size,
      mtime: stats.mtime.getTime(),
      codec: codecMap[ext] || 'Unknown',
      folder: path.dirname(filePath),
      extension: ext,
      bitrate: null
    };
  } catch (err) {
    console.log('[DuplicateDetector] Error getting file metadata:', err.message);
    return {
      size: 0,
      mtime: 0,
      codec: 'Unknown',
      folder: '',
      extension: '',
      bitrate: null
    };
  }
}

/**
 * Check if track is lossless (FLAC/WAV)
 * Used ONLY for "keep best" selection
 * @param {string} codec - Audio codec
 * @returns {boolean}
 */
function isLossless(codec) {
  return codec === 'FLAC' || codec === 'WAV';
}

/**
 * Determine which track is "best" to keep
 * Priority:
 * 1. Lossless (FLAC/WAV)
 * 2. Highest bitrate
 * 3. Largest file size
 * 4. Newest modified date
 * 5. Shortest path
 * @param {Array} tracks - Array of tracks to compare
 * @returns {Object} - The best track to keep
 */
function selectBestTrack(tracks) {
  if (tracks.length === 0) return null;
  if (tracks.length === 1) return tracks[0];
  
  // Sort by the criteria (descending)
  const sorted = [...tracks].sort((a, b) => {
    const aMeta = a.fileMeta;
    const bMeta = b.fileMeta;
    
    // 1. Lossless (FLAC/WAV) - prefer lossless
    const aLossless = isLossless(aMeta.codec) ? 1 : 0;
    const bLossless = isLossless(bMeta.codec) ? 1 : 0;
    if (aLossless !== bLossless) {
      return bLossless - aLossless;
    }
    
    // 2. Highest bitrate
    if (aMeta.bitrate && bMeta.bitrate) {
      if (aMeta.bitrate !== bMeta.bitrate) {
        return bMeta.bitrate - aMeta.bitrate;
      }
    }
    
    // 3. Largest file size
    if (aMeta.size !== bMeta.size) {
      return bMeta.size - aMeta.size;
    }
    
    // 4. Newest modified date
    if (aMeta.mtime !== bMeta.mtime) {
      return bMeta.mtime - aMeta.mtime;
    }
    
    // 5. Shortest path (prefer root-level files)
    return a.path.length - b.path.length;
  });
  
  return sorted[0];
}

/**
 * Check if two tracks are duplicates based on strict priority rules
 * 
 * Rule 1: If both have fingerprints - match = duplicate, differ = NOT duplicate
 * Rule 2: If fingerprints missing/failed:
 *   - Duration diff > 1s = NOT duplicate
 *   - title + artist match = duplicate
 *   - Else = NOT duplicate
 * 
 * @param {Object} track1 - First track
 * @param {Object} track2 - Second track
 * @returns {string} - 'duplicate', 'not_duplicate', or 'unknown'
 */
function areDuplicates(track1, track2) {
  const fp1 = track1.fingerprint;
  const fp2 = track2.fingerprint;
  
  // Rule 1: If both have fingerprints
  if (fp1 && fp2) {
    if (fp1 === fp2) {
      return 'duplicate'; // Fingerprints match
    } else {
      return 'not_duplicate'; // Fingerprints differ - NOT duplicates
    }
  }
  
  // Rule 2: Fingerprints missing or failed
  // Check duration difference
  const d1 = track1.duration;
  const d2 = track2.duration;
  
  if (d1 && d2) {
    const durationDiff = Math.abs(d1 - d2);
    if (durationDiff > 1) {
      return 'not_duplicate'; // Duration differs by more than 1 second
    }
  }
  
  // Check title + artist match (case-insensitive)
  const title1 = (track1.title || '').toLowerCase().trim();
  const title2 = (track2.title || '').toLowerCase().trim();
  const artist1 = (track1.artist || '').toLowerCase().trim();
  const artist2 = (track2.artist || '').toLowerCase().trim();
  
  if (title1 && title2 && artist1 && artist2) {
    if (title1 === title2 && artist1 === artist2) {
      return 'duplicate'; // Title and artist match
    }
  }
  
  // Default: NOT duplicates
  return 'not_duplicate';
}

/**
 * Detect duplicate groups from all tracks
 * Uses strict priority rules:
 * 1. Fingerprint match (both have fingerprints and they match)
 * 2. Fingerprints differ = NOT duplicates (stop checking)
 * 3. Duration diff > 1s = NOT duplicates
 * 4. Title + artist match = duplicates
 * @returns {Promise<Array>} - Array of duplicate groups
 */
async function detectDuplicates() {
  console.log('[DuplicateDetector] Starting duplicate detection...');
  
  // Get all tracks from database
  const tracks = database.getAllTracks();
  console.log('[DuplicateDetector] Total tracks:', tracks.length);
  
  if (tracks.length < 2) {
    console.log('[DuplicateDetector] Not enough tracks to find duplicates');
    return [];
  }
  
  // Get full metadata (file info) for each track
  const tracksWithMeta = await Promise.all(
    tracks.map(async (track) => {
      const fileMeta = await getFileMetadata(track.path);
      return {
        ...track,
        fileMeta
      };
    })
  );
  
  // Track which tracks have been assigned to a group
  const assigned = new Set();
  const groups = [];
  
  // Compare each pair of tracks
  console.log('[DuplicateDetector] Comparing tracks...');
  
  for (let i = 0; i < tracksWithMeta.length; i++) {
    const track1 = tracksWithMeta[i];
    if (assigned.has(track1.id)) continue;
    
    const duplicates = [track1];
    
    for (let j = i + 1; j < tracksWithMeta.length; j++) {
      const track2 = tracksWithMeta[j];
      if (assigned.has(track2.id)) continue;
      
      const result = areDuplicates(track1, track2);
      
      if (result === 'duplicate') {
        duplicates.push(track2);
      }
      // If 'not_duplicate', we don't add it to this group
      // If fingerprints differ, we skip this track2 entirely for this track1
    }
    
    // If we found duplicates (more than just the first track)
    if (duplicates.length >= 2) {
      const bestTrack = selectBestTrack(duplicates);
      const groupId = `dup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Determine match type for display
      let matchType = 'metadata';
      if (track1.fingerprint && duplicates.some(t => t.fingerprint === track1.fingerprint)) {
        matchType = 'fingerprint';
      } else if (track1.duration) {
        matchType = 'duration';
      }
      
      groups.push({
        groupId,
        canonicalName: bestTrack.title || 'Unknown',
        matchType: matchType,
        tracks: duplicates
      });
      
      duplicates.forEach(t => assigned.add(t.id));
    }
  }
  
  console.log('[DuplicateDetector] Found', groups.length, 'duplicate groups');
  
  return groups;
}

/**
 * Delete tracks by IDs
 * @param {Array} trackIds - Array of track IDs to delete
 * @returns {Object} - Result of deletion
 */
function deleteTracks(trackIds) {
  console.log('[DuplicateDetector] Deleting tracks:', trackIds.length);
  
  try {
    database.deleteTracksByIds(trackIds);
    console.log('[DuplicateDetector] Successfully deleted', trackIds.length, 'tracks');
    return { success: true, deletedCount: trackIds.length };
  } catch (err) {
    console.error('[DuplicateDetector] Error deleting tracks:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get full metadata for a track including file info
 * @param {string} trackId - Track ID
 * @returns {Promise<Object>} - Track with full metadata
 */
async function getTrackFullDetails(trackId) {
  const track = database.getTrackById(trackId);
  if (!track) return null;
  
  const fileMeta = await getFileMetadata(track.path);
  return {
    ...track,
    fileMeta
  };
}

module.exports = {
  detectDuplicates,
  deleteTracks,
  getTrackFullDetails,
  getFileMetadata,
  selectBestTrack,
  areDuplicates
};
