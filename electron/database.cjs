/**
 * Database Module - SQLite persistence for Jukebox
 * Uses better-sqlite3 for fast, synchronous operations
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const Database = require('better-sqlite3');

let db = null;

/**
 * Initialize the database connection
 * @returns {Database} The database instance
 */
function initDatabase() {
  if (db) {
    return db;
  }

  // Get userData path for Electron
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'tracks.db');
  
  console.log('[DB] Initializing database at:', dbPath);
  
  // Check if database exists and needs migration
  const dbExists = fs.existsSync(dbPath);
  
  db = new Database(dbPath);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  if (!dbExists) {
    // Fresh database - create with full schema
    console.log('[DB] Creating new database with schema');
    db.exec(`
      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        artist TEXT,
        album TEXT,
        duration REAL,
        searchKey TEXT,
        fingerprint TEXT,
        identified INTEGER DEFAULT 0
      );
      
      CREATE INDEX IF NOT EXISTS idx_search ON tracks(searchKey);
      CREATE INDEX IF NOT EXISTS idx_path ON tracks(path);
      CREATE INDEX IF NOT EXISTS idx_identified ON tracks(identified);
    `);
  } else {
    // Existing database - run migrations
    console.log('[DB] Running migrations on existing database');
    runMigrations();
  }
  
  console.log('[DB] Database initialized successfully');
  
  return db;
}

/**
 * Run database migrations
 */
function runMigrations() {
  try {
    // Check if fingerprint column exists
    const tableInfo = db.prepare("PRAGMA table_info(tracks)").all();
    const columns = tableInfo.map(col => col.name);
    
    console.log('[DB] Current columns:', columns);
    
    // Add fingerprint column if missing
    if (!columns.includes('fingerprint')) {
      console.log('[DB] Adding fingerprint column');
      db.exec(`ALTER TABLE tracks ADD COLUMN fingerprint TEXT`);
    }
    
    // Add identified column if missing
    if (!columns.includes('identified')) {
      console.log('[DB] Adding identified column');
      db.exec(`ALTER TABLE tracks ADD COLUMN identified INTEGER DEFAULT 0`);
    }
    
    // Add genre column if missing (ADR-02 bolt-on)
    if (!columns.includes('genre')) {
      console.log('[DB] Adding genre column');
      db.exec(`ALTER TABLE tracks ADD COLUMN genre TEXT`);
    }
    
    // Add year column if missing (ADR-02 bolt-on)
    if (!columns.includes('year')) {
      console.log('[DB] Adding year column');
      db.exec(`ALTER TABLE tracks ADD COLUMN year INTEGER`);
    }
    
    // Add enriched column if missing (ADR-02 bolt-on)
    if (!columns.includes('enriched')) {
      console.log('[DB] Adding enriched column');
      db.exec(`ALTER TABLE tracks ADD COLUMN enriched INTEGER DEFAULT 0`);
    }
    
    // Create index on identified if it doesn't exist
    const indexes = db.prepare("PRAGMA index_list(tracks)").all();
    const indexNames = indexes.map(idx => idx.name);
    
    if (!indexNames.includes('idx_identified')) {
      console.log('[DB] Creating identified index');
      db.exec(`CREATE INDEX IF NOT EXISTS idx_identified ON tracks(identified)`);
    }
    
    console.log('[DB] Migrations complete');
  } catch (err) {
    console.error('[DB] Migration error:', err);
  }
}

/**
 * Get all tracks from database
 * @returns {Array} Array of track objects
 */
function getAllTracks() {
  if (!db) {
    initDatabase();
  }
  
  const stmt = db.prepare('SELECT * FROM tracks ORDER BY title');
  return stmt.all();
}

/**
 * Save tracks to database (replaces existing)
 * @param {Array} tracks - Array of track objects
 */
function saveTracks(tracks) {
  if (!db) {
    initDatabase();
  }
  
  console.log('[DB] Saving', tracks.length, 'tracks to database');
  
  // Use transaction for bulk insert
  const insert = db.prepare(`
    INSERT OR REPLACE INTO tracks
    (id, path, title, artist, album, duration, searchKey, identified)
    VALUES (@id, @path, @title, @artist, @album, @duration, @searchKey, @identified)
  `);
  
  const insertMany = db.transaction((trackList) => {
    for (const track of trackList) {
      insert.run({
        id: track.id,
        path: track.path,
        title: track.title,
        artist: track.artist || 'Unknown Artist',
        album: track.album || 'Unknown Album',
        duration: track.duration || 0,
        searchKey: track.searchKey || '',
        identified: track.identified || 0  // Default to 0 (unidentified)
      });
    }
  });
  
  insertMany(tracks);
  console.log('[DB] Saved', tracks.length, 'tracks');
}

/**
 * Clear all tracks from database
 */
function clearTracks() {
  if (!db) {
    initDatabase();
  }
  
  console.log('[DB] Clearing all tracks');
  db.prepare('DELETE FROM tracks').run();
}

/**
 * Get track count
 * @returns {number} Number of tracks in database
 */
function getTrackCount() {
  if (!db) {
    initDatabase();
  }
  
  const result = db.prepare('SELECT COUNT(*) as count FROM tracks').get();
  return result.count;
}

/**
 * Close database connection
 */
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('[DB] Database closed');
  }
}

/**
 * Update track with fingerprint
 * @param {string} trackId - Track ID
 * @param {string} fingerprint - Chromaprint fingerprint
 * @param {number} duration - Track duration in seconds
 */
function updateTrackFingerprint(trackId, fingerprint, duration) {
  if (!db) {
    initDatabase();
  }
  
  console.log('[DB] Updating fingerprint for track:', trackId);
  const stmt = db.prepare(`
    UPDATE tracks 
    SET fingerprint = ?, duration = ?
    WHERE id = ?
  `);
  stmt.run(fingerprint, duration, trackId);
}

/**
 * Update track metadata after identification
 * @param {string} trackId - Track ID
 * @param {Object} metadata - { title, artist, album }
 */
function updateTrackMetadata(trackId, metadata) {
  if (!db) {
    initDatabase();
  }
  
  console.log('[DB] Updating metadata for track:', trackId, metadata);
  const stmt = db.prepare(`
    UPDATE tracks 
    SET title = ?, artist = ?, album = ?, identified = 1
    WHERE id = ?
  `);
  stmt.run(
    metadata.title, 
    metadata.artist || 'Unknown Artist', 
    metadata.album || 'Unknown Album', 
    trackId
  );
}

/**
 * Get all unidentified tracks (identified = 0 or NULL)
 * @returns {Array} Array of unidentified track objects
 */
function getUnidentifiedTracks() {
  if (!db) {
    initDatabase();
  }
  
  // Get tracks where identified is 0 or NULL
  const stmt = db.prepare('SELECT * FROM tracks WHERE identified = 0 OR identified IS NULL');
  return stmt.all();
}

/**
 * Get track by ID
 * @param {string} trackId - Track ID
 * @returns {Object|null} Track object or null
 */
function getTrackById(trackId) {
  if (!db) {
    initDatabase();
  }
  
  const stmt = db.prepare('SELECT * FROM tracks WHERE id = ?');
  return stmt.get(trackId);
}

/**
 * Get count of unidentified tracks
 * @returns {number} Number of unidentified tracks
 */
function getUnidentifiedCount() {
  if (!db) {
    initDatabase();
  }
  
  // Count tracks where identified is 0 or NULL
  const result = db.prepare('SELECT COUNT(*) as count FROM tracks WHERE identified = 0 OR identified IS NULL').get();
  return result.count;
}

module.exports = {
  initDatabase,
  getAllTracks,
  saveTracks,
  clearTracks,
  getTrackCount,
  closeDatabase,
  updateTrackFingerprint,
  updateTrackMetadata,
  getUnidentifiedTracks,
  getTrackById,
  getUnidentifiedCount
};
