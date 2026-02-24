/**
 * Fingerprint Module - Chromaprint/AcoustID integration
 * Generates audio fingerprints and queries AcoustID for metadata
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// Get the path to fpcalc.exe
function getFpcalcPath() {
  // In development (not packaged), use electron/resources/bin
  // In production, use resources/bin
  let fpcalcPath;
  
  if (app.isPackaged) {
    // Production: look in resources/bin
    fpcalcPath = path.join(process.resourcesPath, 'bin', 'fpcalc.exe');
  } else {
    // Development: look in electron/resources/bin
    fpcalcPath = path.join(__dirname, 'resources', 'bin', 'fpcalc.exe');
  }
  
  console.log('[Fingerprint] fpcalc path:', fpcalcPath);
  console.log('[Fingerprint] fpcalc exists:', fs.existsSync(fpcalcPath));
  return fpcalcPath;
}

/**
 * Generate fingerprint for an audio file using fpcalc
 * @param {string} filePath - Full path to the audio file
 * @returns {Promise<Object|null>} - { duration, fingerprint } or null on failure
 */
async function fingerprintFile(filePath) {
  const fpcalcPath = getFpcalcPath();
  
  // Check if fpcalc exists
  if (!fs.existsSync(fpcalcPath)) {
    console.log('[Fingerprint] fpcalc.exe not found at:', fpcalcPath);
    console.log('[Fingerprint] Please download from https://acoustid.org/chromaprint');
    return null;
  }
  
  return new Promise((resolve, reject) => {
    console.log('[Fingerprint] Running fpcalc on:', filePath);
    
    // Use -json flag only, file path goes at the end
    execFile(fpcalcPath, ['-json', filePath], (err, stdout, stderr) => {
      if (err) {
        console.log('[Fingerprint] fpcalc error:', err.message);
        console.log('[Fingerprint] fpcalc stderr:', stderr);
        return resolve(null);
      }
      
      try {
        const data = JSON.parse(stdout);
        
        if (!data.fingerprint) {
          console.log('[Fingerprint] No fingerprint generated for:', filePath);
          return resolve(null);
        }
        
        console.log('[Fingerprint] Generated fingerprint for:', filePath, 'duration:', data.duration);
        
        resolve({
          duration: Math.round(data.duration),
          fingerprint: data.fingerprint
        });
      } catch (parseErr) {
        console.log('[Fingerprint] JSON parse error:', parseErr.message);
        resolve(null);
      }
    });
  });
}

/**
 * Query AcoustID API for metadata
 * @param {string} fingerprint - Chromaprint fingerprint
 * @param {number} duration - Track duration in seconds
 * @param {string} apiKey - AcoustID API key
 * @returns {Promise<Object|null>} - { title, artist, album } or null
 */
async function lookupAcoustID(fingerprint, duration, apiKey) {
  if (!apiKey) {
    console.log('[Fingerprint] No AcoustID API key provided');
    return null;
  }
  
  if (!fingerprint || !duration) {
    console.log('[Fingerprint] Missing fingerprint or duration');
    return null;
  }
  
  const url = `https://api.acoustid.org/v2/lookup?client=${apiKey}&meta=recordings+releasegroups+compress&duration=${duration}&fingerprint=${fingerprint}`;
  
  console.log('[Fingerprint] Querying AcoustID for duration:', duration);
  
  try {
    const response = await fetch(url);
    const json = await response.json();
    
    if (json.error) {
      console.log('[Fingerprint] AcoustID API error:', json.error.message);
      return null;
    }
    
    if (!json.results || json.results.length === 0) {
      console.log('[Fingerprint] No results from AcoustID');
      return null;
    }
    
    // Get the first result with recordings
    const result = json.results[0];
    
    if (!result.recordings || result.recordings.length === 0) {
      console.log('[Fingerprint] No recordings in result');
      return null;
    }
    
    const recording = result.recordings[0];
    
    if (!recording) {
      console.log('[Fingerprint] No recording data');
      return null;
    }
    
    const metadata = {
      title: recording.title || null,
      artist: recording.artists && recording.artists.length > 0 
        ? recording.artists[0].name 
        : null,
      album: recording.releasegroups && recording.releasegroups.length > 0 
        ? recording.releasegroups[0].title 
        : null
    };
    
    console.log('[Fingerprint] Found metadata:', metadata);
    
    return metadata;
  } catch (err) {
    console.log('[Fingerprint] AcoustID lookup error:', err.message);
    return null;
  }
}

/**
 * Identify a track using fingerprint and AcoustID
 * @param {string} filePath - Full path to the audio file
 * @param {string} apiKey - AcoustID API key
 * @returns {Promise<Object|null>} - { title, artist, album, duration, fingerprint } or null
 */
async function identifyTrack(filePath, apiKey) {
  console.log('[Fingerprint] Identifying track:', filePath);
  
  // Generate fingerprint
  const fp = await fingerprintFile(filePath);
  
  if (!fp) {
    console.log('[Fingerprint] Failed to generate fingerprint');
    return null;
  }
  
  // Look up metadata
  const metadata = await lookupAcoustID(fp.fingerprint, fp.duration, apiKey);
  
  if (!metadata) {
    console.log('[Fingerprint] Failed to lookup metadata');
    return null;
  }
  
  // Return combined result
  return {
    ...metadata,
    duration: fp.duration,
    fingerprint: fp.fingerprint
  };
}

module.exports = {
  fingerprintFile,
  lookupAcoustID,
  identifyTrack,
  getFpcalcPath
};
