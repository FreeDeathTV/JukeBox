/**
 * File Tag Writer Module - ADR-03 Implementation
 * Safe, deterministic metadata writing to audio files
 * 
 * Supported Formats:
 * - MP3 (ID3v2.3/ID3v2.4)
 * - FLAC (Vorbis Comments)
 * - WAV (INFO tags)
 * - M4A/AAC (iTunes atoms)
 * 
 * Fields Allowed to Write:
 * - title, artist, album, year, genre
 * (artwork is future ADR)
 * 
 * Fields That Must Never Be Touched:
 * - track number, disc number, comments, lyrics
 * - replaygain, custom tags, MusicBrainz IDs
 * - file name, file path, audio data
 */

const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');
const NodeID3 = require('node-id3');
const { execSync } = require('child_process');

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
 * Get file extension
 * @param {string} filePath 
 * @returns {string}
 */
function getExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

/**
 * Read existing tags from file
 * @param {string} filePath 
 * @returns {Promise<Object>} Existing tags
 */
async function readExistingTags(filePath) {
  try {
    const metadata = await mm.parseFile(filePath);
    return {
      common: metadata.common,
      format: metadata.format,
      native: metadata.native
    };
  } catch (err) {
    console.error('[FileTagWriter] Error reading tags:', err.message);
    return null;
  }
}

/**
 * Write tags to MP3 file using node-id3
 * @param {string} filePath 
 * @param {Object} metadata - { title, artist, album, year, genre }
 * @param {Object} existing - Existing tags to preserve
 * @returns {Object} Result { success, error }
 */
function writeMP3Tags(filePath, metadata, existing) {
  try {
    // Read existing tags first
    const existingTags = NodeID3.read(filePath);
    
    // Build update object - only non-empty approved fields
    const updates = {};
    
    if (!isEmpty(metadata.title)) {
      updates.title = metadata.title;
    }
    if (!isEmpty(metadata.artist)) {
      updates.artist = metadata.artist;
    }
    if (!isEmpty(metadata.album)) {
      updates.album = metadata.album;
    }
    if (!isEmpty(metadata.year)) {
      // ID3v2 expects year as string, handle both formats
      updates.year = String(metadata.year).substring(0, 4);
    }
    if (!isEmpty(metadata.genre)) {
      updates.genre = metadata.genre;
    }
    
    // Preserve all existing tags that we're not updating
    const preserved = { ...existingTags };
    Object.keys(preserved).forEach(key => {
      if (updates[key] !== undefined) {
        delete preserved[key];
      }
    });
    
    // Merge: preserved + new updates
    const finalTags = { ...preserved, ...updates };
    
    // Write tags
    const success = NodeID3.write(finalTags, filePath);
    
    if (success) {
      console.log('[FileTagWriter] MP3 tags written successfully to:', filePath);
      return { success: true };
    } else {
      return { success: false, error: 'NodeID3 write returned false' };
    }
  } catch (err) {
    console.error('[FileTagWriter] Error writing MP3 tags:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Write tags to FLAC file using music-metadata (which supports FLAC)
 * @param {string} filePath 
 * @param {Object} metadata - { title, artist, album, year, genre }
 * @param {Object} existing - Existing tags to preserve
 * @returns {Object} Result { success, error }
 */
async function writeFLACTags(filePath, metadata, existing) {
  try {
    // FLAC uses Vorbis Comments
    const vorbisComments = {};
    
    // Only add non-empty fields
    if (!isEmpty(metadata.title)) {
      vorbisComments.title = [metadata.title];
    }
    if (!isEmpty(metadata.artist)) {
      vorbisComments.artist = [metadata.artist];
    }
    if (!isEmpty(metadata.album)) {
      vorbisComments.album = [metadata.album];
    }
    if (!isEmpty(metadata.year)) {
      vorbisComments.date = [String(metadata.year)];
    }
    if (!isEmpty(metadata.genre)) {
      vorbisComments.genre = [metadata.genre];
    }
    
    // If no tags to write, return success
    if (Object.keys(vorbisComments).length === 0) {
      console.log('[FileTagWriter] No FLAC tags to write');
      return { success: true };
    }
    
    // Use ffmetadata for FLAC writing (best support)
    // Format: ffmpeg -i input.flac -metadata title="..." -metadata artist="..." -c copy output.flac
    const tempPath = filePath + '.tmp.flac';
    
    let cmd = `ffmpeg -y -i "${filePath}"`;
    
    if (!isEmpty(metadata.title)) {
      cmd += ` -metadata title="${metadata.title.replace(/"/g, '\\"')}"`;
    }
    if (!isEmpty(metadata.artist)) {
      cmd += ` -metadata artist="${metadata.artist.replace(/"/g, '\\"')}"`;
    }
    if (!isEmpty(metadata.album)) {
      cmd += ` -metadata album="${metadata.album.replace(/"/g, '\\"')}"`;
    }
    if (!isEmpty(metadata.year)) {
      cmd += ` -metadata date="${String(metadata.year).substring(0, 4)}"`;
    }
    if (!isEmpty(metadata.genre)) {
      cmd += ` -metadata genre="${metadata.genre.replace(/"/g, '\\"')}"`;
    }
    
    cmd += ` -c copy "${tempPath}"`;
    
    execSync(cmd, { stdio: 'pipe' });
    
    // Replace original with temp
    fs.unlinkSync(filePath);
    fs.renameSync(tempPath, filePath);
    
    console.log('[FileTagWriter] FLAC tags written successfully to:', filePath);
    return { success: true };
  } catch (err) {
    console.error('[FileTagWriter] Error writing FLAC tags:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Write tags to WAV file (limited INFO tag support)
 * @param {string} filePath 
 * @param {Object} metadata - { title, artist, album, year, genre }
 * @returns {Object} Result { success, error }
 */
async function writeWAVTags(filePath, metadata) {
  try {
    // WAV INFO tags are limited, use ffmpeg
    const tempPath = filePath + '.tmp.wav';
    
    let cmd = `ffmpeg -y -i "${filePath}"`;
    
    if (!isEmpty(metadata.title)) {
      cmd += ` -metadata title="${metadata.title.replace(/"/g, '\\"')}"`;
    }
    if (!isEmpty(metadata.artist)) {
      cmd += ` -metadata artist="${metadata.artist.replace(/"/g, '\\"')}"`;
    }
    if (!isEmpty(metadata.album)) {
      cmd += ` -metadata album="${metadata.album.replace(/"/g, '\\"')}"`;
    }
    if (!isEmpty(metadata.year)) {
      cmd += ` -metadata date="${String(metadata.year).substring(0, 4)}"`;
    }
    if (!isEmpty(metadata.genre)) {
      cmd += ` -metadata genre="${metadata.genre.replace(/"/g, '\\"')}"`;
    }
    
    cmd += ` -c copy "${tempPath}"`;
    
    execSync(cmd, { stdio: 'pipe' });
    
    // Replace original with temp
    fs.unlinkSync(filePath);
    fs.renameSync(tempPath, filePath);
    
    console.log('[FileTagWriter] WAV tags written successfully to:', filePath);
    return { success: true };
  } catch (err) {
    console.error('[FileTagWriter] Error writing WAV tags:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Write tags to M4A/AAC file
 * @param {string} filePath 
 * @param {Object} metadata - { title, artist, album, year, genre }
 * @returns {Object} Result { success, error }
 */
async function writeM4ATags(filePath, metadata) {
  try {
    // M4A uses iTunes atoms, use ffmpeg for best support
    const tempPath = filePath + '.tmp.m4a';
    
    let cmd = `ffmpeg -y -i "${filePath}"`;
    
    if (!isEmpty(metadata.title)) {
      cmd += ` -metadata title="${metadata.title.replace(/"/g, '\\"')}"`;
    }
    if (!isEmpty(metadata.artist)) {
      cmd += ` -metadata artist="${metadata.artist.replace(/"/g, '\\"')}"`;
    }
    if (!isEmpty(metadata.album)) {
      cmd += ` -metadata album="${metadata.album.replace(/"/g, '\\"')}"`;
    }
    if (!isEmpty(metadata.year)) {
      cmd += ` -metadata date="${String(metadata.year).substring(0, 4)}"`;
    }
    if (!isEmpty(metadata.genre)) {
      cmd += ` -metadata genre="${metadata.genre.replace(/"/g, '\\"')}"`;
    }
    
    cmd += ` -c copy "${tempPath}"`;
    
    execSync(cmd, { stdio: 'pipe' });
    
    // Replace original with temp
    fs.unlinkSync(filePath);
    fs.renameSync(tempPath, filePath);
    
    console.log('[FileTagWriter] M4A tags written successfully to:', filePath);
    return { success: true };
  } catch (err) {
    console.error('[FileTagWriter] Error writing M4A tags:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Validate written tags by re-reading the file
 * @param {string} filePath 
 * @param {Object} expected - Expected metadata
 * @returns {Object} Validation result
 */
async function validateWrite(filePath, expected) {
  try {
    const metadata = await mm.parseFile(filePath);
    const common = metadata.common;
    
    const validation = {
      title: isEmpty(expected.title) || common.title === expected.title,
      artist: isEmpty(expected.artist) || common.artist === expected.artist,
      album: isEmpty(expected.album) || common.album === expected.album,
      year: isEmpty(expected.year) || 
            (common.date && String(common.date).startsWith(String(expected.year))),
      genre: isEmpty(expected.genre) || 
             (common.genre && common.genre.includes(expected.genre))
    };
    
    const allValid = Object.values(validation).every(v => v === true);
    
    console.log('[FileTagWriter] Validation result:', validation);
    return { valid: allValid, details: validation };
  } catch (err) {
    console.error('[FileTagWriter] Validation error:', err.message);
    return { valid: false, error: err.message };
  }
}

/**
 * Write metadata to audio file
 * ADR-03 Main Entry Point
 * 
 * @param {string} filePath - Path to audio file
 * @param {Object} metadata - Approved metadata { title, artist, album, year, genre }
 * @returns {Object} Result { success, error, validated }
 */
async function writeTags(filePath, metadata) {
  console.log('[FileTagWriter] writeTags called for:', filePath);
  console.log('[FileTagWriter] Metadata to write:', metadata);
  
  // Validate inputs
  if (!filePath) {
    return { success: false, error: 'No file path provided' };
  }
  
  if (!fs.existsSync(filePath)) {
    return { success: false, error: 'File not found: ' + filePath };
  }
  
  // Check if metadata has anything to write
  const hasMetadata = !isEmpty(metadata.title) || 
                      !isEmpty(metadata.artist) || 
                      !isEmpty(metadata.album) || 
                      !isEmpty(metadata.year) || 
                      !isEmpty(metadata.genre);
  
  if (!hasMetadata) {
    console.log('[FileTagWriter] No metadata to write, skipping file');
    return { success: true, skipped: true, reason: 'No metadata to write' };
  }
  
  // Get file extension
  const ext = getExtension(filePath);
  console.log('[FileTagWriter] File extension:', ext);
  
  // Read existing tags for preservation
  const existing = await readExistingTags(filePath);
  if (!existing) {
    console.log('[FileTagWriter] Could not read existing tags, proceeding anyway');
  }
  
  // Write tags based on format
  let result;
  
  switch (ext) {
    case '.mp3':
      result = writeMP3Tags(filePath, metadata, existing);
      break;
      
    case '.flac':
      result = await writeFLACTags(filePath, metadata, existing);
      break;
      
    case '.wav':
      result = await writeWAVTags(filePath, metadata);
      break;
      
    case '.m4a':
    case '.aac':
      result = await writeM4ATags(filePath, metadata);
      break;
      
    default:
      console.log('[FileTagWriter] Unsupported format:', ext);
      return { 
        success: false, 
        error: `Unsupported format: ${ext}`,
        unsupported: true 
      };
  }
  
  // If write failed, return error
  if (!result.success) {
    return result;
  }
  
  // Validate write success
  console.log('[FileTagWriter] Validating written tags...');
  const validation = await validateWrite(filePath, metadata);
  
  if (!validation.valid) {
    console.error('[FileTagWriter] Validation failed:', validation);
    return { 
      success: false, 
      error: 'Validation failed - written tags do not match expected',
      validation 
    };
  }
  
  console.log('[FileTagWriter] Write completed successfully');
  return { 
    success: true, 
    validated: true,
    format: ext 
  };
}

/**
 * Check if a format is supported for writing
 * @param {string} filePath 
 * @returns {boolean}
 */
function isFormatSupported(filePath) {
  const ext = getExtension(filePath);
  return ['.mp3', '.flac', '.wav', '.m4a', '.aac'].includes(ext);
}

module.exports = {
  writeTags,
  readExistingTags,
  validateWrite,
  isFormatSupported,
  getExtension
};
