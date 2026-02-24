/**
 * Music Scanner Module - Recursive Implementation (ADR-01)
 * 
 * High-performance music library scanner supporting 35,000+ files.
 * Uses async file walking and streaming metadata parsing.
 * 
 * Supported formats: .mp3, .wav, .flac, .m4a, .aac, .ogg, .wma
 * Recursive scanning with duplicate awareness
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Supported audio formats (from ADR-01)
const SUPPORTED_AUDIO = new Set([
  '.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.wma'
]);

// Ignored formats
const IGNORED_FORMATS = new Set([
  '.txt', '.log', '.jpg', '.png', '.gif', '.bmp', '.svg', '.ico',
  '.html', '.htm', '.xml', '.json', '.csv', '.pdf', '.doc', '.docx'
]);

// Dynamic import for music-metadata (ESM module)
let musicMetadata;

/**
 * Initialize music-metadata (lazy load)
 */
async function initMusicMetadata() {
  if (!musicMetadata) {
    musicMetadata = await import('music-metadata');
  }
  return musicMetadata;
}

/**
 * Generate a unique ID from file path
 * @param {string} filePath 
 * @returns {string}
 */
function generateId(filePath) {
  return crypto.createHash('md5').update(filePath).digest('hex').substring(0, 16);
}

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
 * Parse filename for fallback metadata
 * @param {string} filename - Filename without extension
 * @returns {Object} - { title, artist }
 */
function parseFilename(filename) {
  // Clean up the filename
  let cleaned = filename
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Check for "Artist - Title" pattern
  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ');
    if (parts.length >= 2) {
      return {
        artist: titleCase(parts[0].trim()),
        title: titleCase(parts.slice(1).join(' - ').trim())
      };
    }
  }

  // Fallback: entire cleaned filename is the title
  return {
    artist: 'Unknown Artist',
    title: titleCase(cleaned)
  };
}

/**
 * Title-case a string
 * @param {string} str 
 * @returns {string}
 */
function titleCase(str) {
  if (!str) return '';
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Check if path is a system folder that should be skipped
 * @param {string} dirPath 
 * @returns {boolean}
 */
function isSystemFolder(dirPath) {
  const systemFolders = [
    'node_modules',
    '.git',
    '.svn',
    '__pycache__',
    '.cache',
    'System Volume Information',
    '$RECYCLE.BIN',
    'Windows',
    'Program Files',
    'Program Files (x86)'
  ];
  
  const name = path.basename(dirPath).toLowerCase();
  return systemFolders.some(f => name.toLowerCase() === f.toLowerCase());
}

/**
 * Check if path is a symlink
 * @param {string} dirPath 
 * @returns {Promise<boolean>}
 */
async function isSymlink(dirPath) {
  try {
    const stats = await fs.promises.lstat(dirPath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Validate if a file is readable and has valid content
 * @param {string} filePath - Full path to the file
 * @returns {Promise<boolean>} - True if file is valid
 */
async function isValidAudioFile(filePath) {
  try {
    const stats = await fs.promises.stat(filePath);
    
    // Check file is not empty
    if (stats.size === 0) {
      console.log(`[Scanner] Skipping empty file: ${filePath}`);
      return false;
    }
    
    // Check file is readable
    await fs.promises.access(filePath, fs.constants.R_OK);
    
    return true;
  } catch (err) {
    console.log(`[Scanner] File validation failed for ${filePath}: ${err.message}`);
    return false;
  }
}

/**
 * Process a single file and extract metadata
 * @param {string} filePath - Full path to the audio file
 * @returns {Promise<Object>} - Track object or null if invalid
 */
async function processFile(filePath) {
  console.log('[Scanner] Processing file:', filePath);
  
  // Validate file is readable and has content
  const isValid = await isValidAudioFile(filePath);
  if (!isValid) {
    return null;
  }
  
  const ext = path.extname(filePath).toLowerCase();
  const filename = path.basename(filePath, ext);
  const rawFilename = filename;

  let title = '';
  let artist = 'Unknown Artist';
  let album = 'Unknown Album';
  let duration = 0;
  let metadataValid = true;

  try {
    // Try to read metadata using music-metadata
    const mm = await initMusicMetadata();
    const metadata = await mm.parseFile(filePath);
    
    const common = metadata.common;
    const format = metadata.format;

    // Extract title
    title = (common.title && common.title.trim()) ? common.title.trim() : '';
    
    // Extract artist
    artist = (common.artist && common.artist.trim()) 
      ? common.artist.trim() 
      : 'Unknown Artist';
    
    // Extract album
    album = (common.album && common.album.trim()) 
      ? common.album.trim() 
      : 'Unknown Album';
    
    // Extract duration (in seconds)
    duration = format.duration ? Math.round(format.duration) : 0;

  } catch (err) {
    // Metadata extraction failed - use filename fallback
    console.log(`[Scanner] Metadata read failed for ${filePath}, using filename fallback`);
    metadataValid = false;
  }

  // If title is still empty or garbage, use filename fallback
  if (!title || title.length < 2) {
    const parsed = parseFilename(filename);
    title = parsed.title;
    artist = parsed.artist;
    metadataValid = false;
  }

  // Build track object with the REAL file path
  const track = {
    id: generateId(filePath),
    path: filePath,
    title: title,
    artist: artist,
    album: album,
    duration: duration,
    rawFilename: rawFilename,
    searchKey: normalizeForSearch(`${title} ${artist} ${album}`),
    _metadataValid: metadataValid
  };

  console.log('[Scanner] Track created with path:', track.path);

  return track;
}

/**
 * Recursively walk a directory and collect audio files (ADR-01 pseudocode implementation)
 * @param {string} dirPath - Directory to walk
 * @param {Array} audioFiles - Array to collect files into
 * @returns {Promise<Array>} - Array of audio file paths
 */
async function walkDirectory(dirPath, audioFiles = []) {
  let entries;
  
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    console.log(`[Scanner] Cannot read directory: ${dirPath}`, err.message);
    return audioFiles;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      // Skip system folders
      if (isSystemFolder(fullPath)) {
        console.log(`[Scanner] Skipping system folder: ${fullPath}`);
        continue;
      }
      
      // Skip symlinks to avoid infinite loops
      const symlink = await isSymlink(fullPath);
      if (symlink) {
        console.log(`[Scanner] Skipping symlink: ${fullPath}`);
        continue;
      }
      
      // Recursively process subdirectories (ADR-01 requirement)
      await walkDirectory(fullPath, audioFiles);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_AUDIO.has(ext)) {
        audioFiles.push(path.resolve(fullPath));
      }
    }
  }

  return audioFiles;
}

/**
 * Clean and deduplicate track results
 * @param {Array} tracks - Array of track objects
 * @returns {Array} - Cleaned array of unique, valid tracks
 */
function cleanResults(tracks) {
  console.log(`[Scanner] Cleaning ${tracks.length} tracks...`);
  
  // Filter out null entries (invalid files)
  let cleaned = tracks.filter(t => t !== null);
  
  // Remove duplicates by path (keep first occurrence)
  const seenPaths = new Set();
  cleaned = cleaned.filter(track => {
    if (seenPaths.has(track.path)) {
      console.log(`[Scanner] Removing duplicate: ${track.path}`);
      return false;
    }
    seenPaths.add(track.path);
    return true;
  });
  
  // Remove tracks with missing essential metadata
  const beforeMetadata = cleaned.length;
  cleaned = cleaned.filter(track => {
    if (!track.title || track.title.trim() === '' || track.title === 'Unknown') {
      console.log(`[Scanner] Removing track with missing title: ${track.path}`);
      return false;
    }
    return true;
  });
  
  console.log(`[Scanner] Cleaned: ${beforeMetadata} -> ${cleaned.length} tracks`);
  
  // Remove internal metadata field before returning
  cleaned = cleaned.map(track => {
    const { _metadataValid, ...cleanTrack } = track;
    return cleanTrack;
  });
  
  return cleaned;
}

/**
 * Scan multiple folders recursively with progress reporting (ADR-01)
 * @param {Array} folderPaths - Array of folder paths to scan
 * @param {Function} onProgress - Progress callback: (scanned, total, folder) => void
 * @param {Set} existingPaths - Set of existing file paths to skip (for duplicate awareness)
 * @returns {Promise<Array>} - Array of track metadata
 */
async function scanFolders(folderPaths, onProgress = null, existingPaths = null) {
  console.log('[Scanner] Starting recursive scan of folders:', folderPaths);
  
  // Initialize existing paths set if not provided
  if (!existingPaths) {
    existingPaths = new Set();
  }
  
  // Collect all audio files from all folders
  let allAudioFiles = [];
  let folderIndex = 0;
  
  for (const folderPath of folderPaths) {
    folderIndex++;
    console.log(`[Scanner] Walking folder ${folderIndex}/${folderPaths.length}: ${folderPath}`);
    
    const audioFiles = await walkDirectory(folderPath);
    console.log(`[Scanner] Found ${audioFiles.length} audio files in ${folderPath}`);
    
    // Add to master list
    allAudioFiles = allAudioFiles.concat(audioFiles);
  }
  
  const total = allAudioFiles.length;
  console.log(`[Scanner] Total audio files found: ${total}`);
  
  // Step 2: Process files with progress updates
  const tracks = [];
  let lastProgressUpdate = Date.now();
  const PROGRESS_INTERVAL = 250; // Update every 250ms

  for (let i = 0; i < allAudioFiles.length; i++) {
    const filePath = allAudioFiles[i];
    
    // ADR-01: Skip files that already exist in DB (duplicate-aware scanning)
    if (existingPaths.has(filePath)) {
      console.log(`[Scanner] Skipping existing file: ${filePath}`);
      // Send progress update for skipped files too
      if (onProgress) {
        onProgress(i + 1, total, 'skip');
      }
      continue;
    }
    
    console.log(`[Scanner] Processing file ${i + 1}/${total}:`, filePath);
    
    try {
      const track = await processFile(filePath);
      if (track) {
        tracks.push(track);
      }
    } catch (err) {
      console.log(`[Scanner] Error processing ${filePath}:`, err.message);
    }

    // Send progress updates periodically
    const now = Date.now();
    if (onProgress && (now - lastProgressUpdate >= PROGRESS_INTERVAL || i === total - 1)) {
      onProgress(i + 1, total);
      lastProgressUpdate = now;
    }
  }

  // Step 3: Clean results (remove duplicates, invalid entries)
  const cleanedTracks = cleanResults(tracks);

  console.log(`[Scanner] Scan complete. Processed ${cleanedTracks.length} valid tracks`);
  
  if (cleanedTracks.length > 0) {
    console.log('[Scanner] First track path:', cleanedTracks[0].path);
  }
  
  return cleanedTracks;
}

/**
 * Scan a single music folder for audio files (backward compatibility)
 * @param {string} folderPath - Path to the music folder
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Array>} - Array of track metadata
 */
async function scanFolder(folderPath, onProgress = null) {
  return scanFolders([folderPath], onProgress);
}

/**
 * Quick search through tracks (for frontend filtering)
 * @param {Array} tracks - Array of track objects
 * @param {string} query - Search query
 * @returns {Array} - Filtered tracks
 */
function searchTracks(tracks, query) {
  if (!query || !query.trim()) {
    return tracks;
  }

  const normalizedQuery = normalizeForSearch(query);
  
  return tracks.filter(track => {
    return track.searchKey.includes(normalizedQuery);
  });
}

module.exports = {
  scanFolder,
  scanFolders,
  processFile,
  searchTracks,
  SUPPORTED_AUDIO,
  walkDirectory
};
