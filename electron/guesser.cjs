/**
 * Guesser Module - Metadata guessing from filename/folder
 * Parses filenames and folder structures to guess metadata
 */

const path = require('path');
const { app } = require('electron');
const Database = require('better-sqlite3');
const database = require('./database.cjs');

// Get database instance for direct queries
function getDb() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'tracks.db');
  return new Database(dbPath);
}

/**
 * Parse artist/title from filename
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
        title: titleCase(parts.slice(1).join(' - ').trim()),
        artist: titleCase(parts[0].trim())
      };
    }
  }
  
  // Check for "01 Title" pattern (track number prefix)
  const trackNumMatch = cleaned.match(/^(\d{1,3})\s+(.+)/);
  if (trackNumMatch) {
    return {
      title: titleCase(trackNumMatch[2].trim()),
      artist: 'Unknown Artist'
    };
  }

  // Fallback: entire cleaned filename is the title
  return {
    title: titleCase(cleaned),
    artist: 'Unknown Artist'
  };
}

/**
 * Parse folder structure to infer metadata
 * @param {string} filePath - Full file path
 * @returns {Object} - { artist, album }
 */
function parseFolderStructure(filePath) {
  const parts = filePath.split(path.sep);
  
  // Get parent folders (assuming: .../Artist/Album/track.mp3)
  // Or: .../Artist - Album/track.mp3
  const parentIndex = parts.length - 2;
  const grandparentIndex = parts.length - 3;
  
  let artist = null;
  let album = null;
  
  if (grandparentIndex >= 0) {
    // Check if parent folder looks like "Artist - Album"
    const parent = parts[parentIndex];
    if (parent.includes(' - ')) {
      const parentParts = parent.split(' - ');
      artist = titleCase(parentParts[0].trim());
      album = titleCase(parentParts.slice(1).join(' - ').trim());
    } else {
      // Assume grandparent is artist, parent is album
      album = titleCase(parent);
      artist = titleCase(parts[grandparentIndex]);
    }
  }
  
  return { artist, album };
}

/**
 * Calculate confidence score based on matching
 * @param {Object} filenameData - Parsed filename data
 * @param {Object} folderData - Parsed folder data
 * @returns {Object} - { title, artist, album, confidence, source }
 */
function calculateConfidence(filenameData, folderData) {
  let title = filenameData.title;
  let artist = filenameData.artist;
  let album = folderData.album;
  
  // If filename has artist, use it
  if (filenameData.artist && filenameData.artist !== 'Unknown Artist') {
    artist = filenameData.artist;
  } else if (folderData.artist) {
    artist = folderData.artist;
  }
  
  // If filename doesn't have album, use folder
  if (!album && folderData.album) {
    album = folderData.album;
  }
  
  // Calculate confidence
  let confidence = 0.5; // Base confidence for filename parsing
  let source = 'filename';
  
  if (folderData.artist && folderData.album) {
    confidence = 0.7; // Higher confidence with folder structure
    source = 'folder';
  }
  
  // Boost if artist found in filename
  if (filenameData.artist && filenameData.artist !== 'Unknown Artist') {
    confidence = Math.min(confidence + 0.2, 1.0);
    source = 'filename';
  }
  
  return { title, artist, album, confidence, source };
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
 * Generate best-guess metadata for a track
 * @param {Object} track - Track object with path
 * @returns {Object} - { title, artist, album, confidence, source }
 */
function guessMetadata(track) {
  const filename = path.basename(track.path, path.extname(track.path));
  const filenameData = parseFilename(filename);
  const folderData = parseFolderStructure(track.path);
  
  return calculateConfidence(filenameData, folderData);
}

/**
 * Run guessing on all unidentified tracks
 * @param {Object} mainWindow - Electron main window for notifications
 */
async function runGuesser(mainWindow) {
  console.log('[Guesser] Starting guesser...');
  
  // Get database instance for direct queries
  let db;
  try {
    db = getDb();
  } catch (err) {
    console.error('[Guesser] Error getting database:', err);
    return { guessed: 0, skipped: 0, error: err.message };
  }
  
  // Get all tracks where identified = 0 AND (title is Unknown or title starts with '-')
  const unidentifiedTracks = db.prepare(`
    SELECT * FROM tracks 
    WHERE identified = 0 
    OR title LIKE '-%'
    OR title LIKE 'Unknown%'
    OR title GLOB '[0-9][0-9]*'
  `).all();
  
  console.log('[Guesser] Found', unidentifiedTracks.length, 'tracks to guess');
  
  let guessed = 0;
  let skipped = 0;
  
  for (const track of unidentifiedTracks) {
    // Skip if already has good metadata
    if (track.title && 
        !track.title.startsWith('-') && 
        !track.title.startsWith('Unknown') &&
        !track.title.match(/^[0-9]/)) {
      skipped++;
      continue;
    }
    
    const guess = guessMetadata(track);
    
    // Only save if we have something useful
    if (guess.title && guess.title !== 'Unknown') {
      console.log('[Guesser] Guessing:', guess.title, '-', guess.artist, '(confidence:', guess.confidence + ')');
      
      // Update database
      db.prepare(`
        UPDATE tracks SET
          title = @title,
          artist = @artist,
          album = @album,
          identified = 1
        WHERE id = @id
      `).run({
        id: track.id,
        title: guess.title,
        artist: guess.artist || 'Unknown Artist',
        album: guess.album || 'Unknown Album'
      });
      
      // Notify frontend
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('track:updated', {
          id: track.id,
          title: guess.title,
          artist: guess.artist,
          album: guess.album,
          confidence: guess.confidence,
          source: guess.source,
          identified: 1
        });
      }
      
      guessed++;
    }
  }
  
  console.log('[Guesser] Complete. Guessed:', guessed, 'Skipped:', skipped);
  
  return { guessed, skipped };
}

module.exports = {
  guessMetadata,
  runGuesser,
  parseFilename,
  parseFolderStructure
};
