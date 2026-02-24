/**
 * Metadata Merge Module - ADR-02 Implementation
 * Deterministic metadata merging from multiple sources
 * 
 * Metadata Sources:
 * - Original File Tags (from database)
 * - Guess Engine (filename/folder parsing)
 * - AcoustID/MusicBrainz (fingerprint lookup)
 * - Spotify (API search)
 * 
 * Priority Rules:
 * 1. Title: Spotify > MusicBrainz > Original > Filename
 * 2. Artist: Spotify > MusicBrainz > Original > Filename
 * 3. Album: Spotify > MusicBrainz > Original > Empty
 * 4. Year: Spotify > MusicBrainz > Original > Empty
 * 5. Genre: Spotify artist genres > Original > Empty
 * 6. Artwork: Spotify > MusicBrainz > Original > None
 */

const path = require('path');
const database = require('./database.cjs');
const guesser = require('./guesser.cjs');
const spotify = require('./spotify.cjs');
const fileTagWriter = require('./fileTagWriter.cjs');

// Core genre buckets for mapping Spotify genres
const GENRE_BUCKETS = [
  'rock', 'pop', 'electronic', 'hip-hop', 'rap', 'r&b', 'soul', 'jazz',
  'classical', 'country', 'folk', 'metal', 'punk', 'indie', 'blues',
  'reggae', 'latin', 'ambient', 'soundtrack', 'world', 'new age',
  'experimental', 'alternative', 'dance', 'disco', 'funk', 'house',
  'techno', 'trance', 'dubstep', 'edm', 'instrumental', 'acoustic'
];

/**
 * Check if a value is considered empty
 * @param {any} value 
 * @returns {boolean}
 */
function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

/**
 * Check if value is better (non-empty and different from fallback)
 * @param {any} value 
 * @returns {boolean}
 */
function hasValue(value) {
  if (isEmpty(value)) return false;
  const str = String(value).toLowerCase();
  // Exclude common fallback values
  if (str === 'unknown' || str === 'unknown artist' || str === 'unknown album' || 
      str === '-' || str.startsWith('unknown')) return false;
  return true;
}

/**
 * Map Spotify genres to core buckets
 * @param {string[]} spotifyGenres 
 * @returns {string}
 */
function mapSpotifyGenres(spotifyGenres) {
  if (!spotifyGenres || spotifyGenres.length === 0) return '';
  
  // Find matching bucket
  for (const genre of spotifyGenres) {
    const lowerGenre = genre.toLowerCase();
    for (const bucket of GENRE_BUCKETS) {
      if (lowerGenre.includes(bucket)) {
        return bucket;
      }
    }
  }
  
  // Return first genre if no bucket match
  return spotifyGenres[0];
}

/**
 * Collect metadata from original file tags (database)
 * @param {Object} track - Track from database
 * @returns {Object} Original metadata
 */
function collectOriginalMetadata(track) {
  return {
    title: track.title || '',
    artist: track.artist || '',
    album: track.album || '',
    year: track.year || '',
    genre: track.genre || '',
    artwork: track.artwork || ''
  };
}

/**
 * Collect metadata from guess engine (filename/folder parsing)
 * @param {Object} track - Track from database
 * @returns {Object} Guessed metadata
 */
function collectGuessMetadata(track) {
  const guess = guesser.guessMetadata(track);
  return {
    title: guess.title || '',
    artist: guess.artist || '',
    album: guess.album || '',
    source: guess.source || 'filename',
    confidence: guess.confidence || 0
  };
}

/**
 * Collect metadata from Spotify (enrichment)
 * @param {Object} track - Track from database
 * @returns {Promise<Object>} Spotify metadata
 */
async function collectSpotifyMetadata(track) {
  try {
    // Build search query
    let query = track.title || '';
    if (track.artist && track.artist !== 'Unknown Artist') {
      query += ' ' + track.artist;
    }
    
    const result = await spotify.searchTrack(query);
    
    if (result) {
      return {
        title: result.title || '',
        artist: result.artist || '',
        album: result.album || '',
        year: result.year || '',
        genre: result.genre || '', // Note: Spotify returns genre at artist level
        artwork: result.albumArt || '',
        spotifyId: result.spotifyId || ''
      };
    }
  } catch (err) {
    console.error('[MetadataMerger] Error collecting Spotify metadata:', err.message);
  }
  
  // Return empty object if no Spotify result
  return {
    title: '',
    artist: '',
    album: '',
    year: '',
    genre: '',
    artwork: '',
    spotifyId: ''
  };
}

/**
 * Collect metadata from MusicBrainz (via identifier if available)
 * Note: This reuses the fingerprint module's AcoustID lookup
 * @param {Object} track - Track from database
 * @returns {Object} MusicBrainz metadata
 */
function collectMusicBrainzMetadata(track) {
  // If track has fingerprint, we could look up MusicBrainz
  // For now, we'll return empty - actual implementation would use fingerprint
  // The identifier module handles this separately
  return {
    title: '',
    artist: '',
    album: '',
    year: ''
  };
}

/**
 * Collect metadata from all sources for a track
 * @param {string} trackId - Track ID
 * @returns {Promise<Object>} Combined metadata from all sources
 */
async function collectAllMetadata(trackId) {
  // Get track from database
  const track = database.getTrackById(trackId);
  
  if (!track) {
    console.error('[MetadataMerger] Track not found:', trackId);
    return null;
  }
  
  // Collect from each source
  const original = collectOriginalMetadata(track);
  const guess = collectGuessMetadata(track);
  const musicbrainz = collectMusicBrainzMetadata(track);
  const spotify = await collectSpotifyMetadata(track);
  
  return {
    trackId: track.id,
    path: track.path,
    original,
    guess,
    musicbrainz,
    spotify,
    enriched: track.enriched || 0
  };
}

/**
 * Merge metadata using deterministic priority rules
 * @param {Object} sources - All metadata sources
 * @returns {Object} Merged metadata
 */
function mergeMetadata(sources) {
  const { original, guess, musicbrainz, spotify } = sources;
  
  // 1. Title Priority: Spotify > MusicBrainz > Original > Filename
  let title = '';
  if (hasValue(spotify.title)) {
    title = spotify.title;
  } else if (hasValue(musicbrainz.title)) {
    title = musicbrainz.title;
  } else if (hasValue(original.title)) {
    title = original.title;
  } else if (hasValue(guess.title)) {
    title = guess.title;
  }
  
  // 2. Artist Priority: Spotify > MusicBrainz > Original > Filename
  let artist = '';
  if (hasValue(spotify.artist)) {
    artist = spotify.artist;
  } else if (hasValue(musicbrainz.artist)) {
    artist = musicbrainz.artist;
  } else if (hasValue(original.artist)) {
    artist = original.artist;
  } else if (hasValue(guess.artist)) {
    artist = guess.artist;
  }
  
  // 3. Album Priority: Spotify > MusicBrainz > Original > Empty
  let album = '';
  if (hasValue(spotify.album)) {
    album = spotify.album;
  } else if (hasValue(musicbrainz.album)) {
    album = musicbrainz.album;
  } else if (hasValue(original.album)) {
    album = original.album;
  }
  
  // 4. Year Priority: Spotify > MusicBrainz > Original > Empty
  let year = '';
  if (hasValue(spotify.year)) {
    year = spotify.year;
  } else if (hasValue(musicbrainz.year)) {
    year = musicbrainz.year;
  } else if (hasValue(original.year)) {
    year = original.year;
  }
  
  // 5. Genre Priority: Spotify > Original > Empty
  let genre = '';
  if (hasValue(spotify.genre)) {
    genre = spotify.genre;
  } else if (hasValue(original.genre)) {
    genre = original.genre;
  }
  
  // 6. Artwork Priority: Spotify > MusicBrainz > Original > None
  let artwork = '';
  if (hasValue(spotify.artwork)) {
    artwork = spotify.artwork;
  } else if (hasValue(original.artwork)) {
    artwork = original.artwork;
  }
  
  return {
    title,
    artist,
    album,
    year,
    genre,
    artwork
  };
}

/**
 * Generate proposed metadata object for user review
 * @param {Object} sources - All metadata sources
 * @returns {Object} Proposed metadata for review
 */
function generateProposedMetadata(sources) {
  const merged = mergeMetadata(sources);
  
  return {
    original: sources.original,
    guess: sources.guess,
    spotify: sources.spotify,
    musicbrainz: sources.musicbrainz,
    final: merged,
    enriched: sources.enriched
  };
}

/**
 * Apply approved metadata to track
 * ADR-03: Writes to file first, then updates database only on success
 * @param {string} trackId - Track ID
 * @param {Object} approved - Approved metadata from user
 * @returns {Object} Updated track or error
 */
async function applyMetadata(trackId, approved) {
  // Get current track from database
  const track = database.getTrackById(trackId);
  
  if (!track) {
    console.error('[MetadataMerger] Track not found for apply:', trackId);
    return { success: false, error: 'Track not found' };
  }
  
  // Determine what fields changed
  const changes = {};
  const original = track;
  
  if (approved.title && approved.title !== original.title) {
    changes.title = approved.title;
  }
  if (approved.artist && approved.artist !== original.artist) {
    changes.artist = approved.artist;
  }
  if (approved.album && approved.album !== original.album) {
    changes.album = approved.album;
  }
  if (approved.year && approved.year !== original.year) {
    changes.year = approved.year;
  }
  if (approved.genre && approved.genre !== original.genre) {
    changes.genre = approved.genre;
  }
  if (approved.artwork && approved.artwork !== original.artwork) {
    changes.artwork = approved.artwork;
  }
  
  // If there are no changes, return success
  if (Object.keys(changes).length === 0) {
    console.log('[MetadataMerger] No metadata changes to apply');
    return { success: true, track, skipped: true };
  }
  
  console.log('[MetadataMerger] Applying metadata changes:', changes);
  
  // ADR-03: Write tags to file FIRST (before DB update)
  // Only write allowed fields: title, artist, album, year, genre
  const fileMetadata = {
    title: changes.title || original.title,
    artist: changes.artist || original.artist,
    album: changes.album || original.album,
    year: changes.year || original.year,
    genre: changes.genre || original.genre
  };
  
  console.log('[MetadataMerger] Writing tags to file:', track.path);
  const writeResult = await fileTagWriter.writeTags(track.path, fileMetadata);
  
  // If file write failed, do NOT modify database
  if (!writeResult.success) {
    console.error('[MetadataMerger] File write failed:', writeResult.error);
    return { 
      success: false, 
      error: writeResult.error,
      fileWriteFailed: true
    };
  }
  
  // File write succeeded - now update database
  console.log('[MetadataMerger] File write successful, updating database');
  
  const stmt = database.getDb().prepare(`
    UPDATE tracks 
    SET title = ?, artist = ?, album = ?, year = ?, genre = ?, artwork = ?, enriched = 1, identified = 1
    WHERE id = ?
  `);
  
  stmt.run(
    changes.title || original.title,
    changes.artist || original.artist,
    changes.album || original.album,
    changes.year || original.year || null,
    changes.genre || original.genre || null,
    changes.artwork || original.artwork || null,
    trackId
  );
  
  // Return updated track
  const updatedTrack = {
    ...original,
    ...changes,
    identified: 1,
    enriched: 1
  };
  
  console.log('[MetadataMerger] Metadata applied successfully');
  return { 
    success: true, 
    track: updatedTrack,
    fileWritten: true,
    format: writeResult.format
  };
}

/**
 * Skip a track (mark as reviewed without changes)
 * @param {string} trackId - Track ID
 */
function skipTrack(trackId) {
  const db = database.getDb();
  db.prepare('UPDATE tracks SET identified = 1, enriched = 1 WHERE id = ?').run(trackId);
  console.log('[MetadataMerger] Track marked as reviewed/skip:', trackId);
}

/**
 * Get database instance
 * @returns {Database}
 */
function getDb() {
  return database.getDb();
}

module.exports = {
  collectAllMetadata,
  mergeMetadata,
  generateProposedMetadata,
  applyMetadata,
  skipTrack,
  getDb,
  // Constants for reference
  GENRE_BUCKETS,
  Priority: {
    TITLE: ['spotify', 'musicbrainz', 'original', 'guess'],
    ARTIST: ['spotify', 'musicbrainz', 'original', 'guess'],
    ALBUM: ['spotify', 'musicbrainz', 'original'],
    YEAR: ['spotify', 'musicbrainz', 'original'],
    GENRE: ['spotify', 'original'],
    ARTWORK: ['spotify', 'original']
  }
};
