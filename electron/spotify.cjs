const https = require('https');
const fs = require('fs');
const path = require('path');

let spotifyToken = null;
let tokenExpiry = null;
let lastRequestTime = 0;

// Spotify API credentials
const SPOTIFY_CLIENT_ID = '4eebcb072cb84eee9c53ee653b33a57b';
const SPOTIFY_CLIENT_SECRET = 'fec9e255221b42fb9d02f43749836958';

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if response looks like HTML or plaintext error
 * @param {string} body - Response body
 * @returns {boolean}
 */
function isNonJsonResponse(body) {
  const trimmed = body.trim();
  return trimmed.startsWith('<!DOCTYPE') || 
         trimmed.startsWith('<html') || 
         trimmed.startsWith('<!DOCTYPE html>') ||
         trimmed.startsWith('Check settings') ||
         trimmed.startsWith('Too many requests') ||
         trimmed.startsWith('<?xml');
}

/**
 * Request Spotify access token using Client Credentials Flow
 * @returns {Promise<string|null>}
 */
async function getAccessToken() {
  // Check if we have a valid token
  if (spotifyToken && tokenExpiry && Date.now() < tokenExpiry) {
    return spotifyToken;
  }

  // Request new token
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      grant_type: 'client_credentials'
    }).toString();

    const options = {
      hostname: 'accounts.spotify.com',
      path: '/api/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.access_token) {
            spotifyToken = json.access_token;
            tokenExpiry = Date.now() + (json.expires_in * 1000) - 60000; // Refresh 1 minute early
            console.log('[Spotify] New token obtained, expires in:', json.expires_in, 'seconds');
            resolve(spotifyToken);
          } else {
            console.error('[Spotify] Error getting token:', json);
            resolve(null);
          }
        } catch (e) {
          console.error('[Spotify] Error parsing token response:', e);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.error('[Spotify] Error requesting token:', e);
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Make HTTP request to Spotify API
 * @param {string} path - API path
 * @param {string} token - Bearer token
 * @returns {Promise<{status: number, body: string}>}
 */
function makeSpotifyRequest(apiPath, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.spotify.com',
      path: apiPath,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, body: data });
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.end();
  });
}

/**
 * Search Spotify for a track
 * @param {string} query - Search query
 * @returns {Promise<object|null>}
 */
async function searchTrack(query) {
  // Rate limiting: wait 120ms between requests
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (lastRequestTime > 0 && timeSinceLastRequest < 120) {
    await sleep(120 - timeSinceLastRequest);
  }
  lastRequestTime = Date.now();

  const token = await getAccessToken();
  if (!token) return null;

  const encodedQuery = encodeURIComponent(query);
  const apiPath = `/v1/search?q=${encodedQuery}&type=track&limit=1`;

  // Retry logic variables
  const maxRetries = 3;
  let retries = 0;
  let tokenRefreshed = false;

  while (retries <= maxRetries) {
    try {
      const response = await makeSpotifyRequest(apiPath, token);
      const { status, body } = response;

      // Handle 429 - Rate limit
      if (status === 429) {
        if (retries < maxRetries) {
          const jitter = Math.floor(Math.random() * 501) + 500; // 500-1000ms
          console.log('[Spotify] Rate limited (429), retrying after', jitter, 'ms');
          await sleep(jitter);
          retries++;
          continue;
        } else {
          console.error('[Spotify] Rate limit exceeded after', maxRetries, 'retries');
          return null;
        }
      }

      // Handle 401 - Invalid token
      if (status === 401 || body.includes('invalid token')) {
        if (!tokenRefreshed) {
          console.log('[Spotify] Token expired, refreshing...');
          clearToken();
          const newToken = await getAccessToken();
          if (newToken) {
            token = newToken;
            tokenRefreshed = true;
            continue; // Retry with new token
          }
        }
        console.error('[Spotify] Invalid token after refresh attempt');
        return null;
      }

      // Check for non-JSON response (HTML or plaintext errors)
      if (isNonJsonResponse(body)) {
        console.warn('[Spotify] Non-JSON response received:', body.substring(0, 200));
        return null;
      }

      // Safe JSON parsing
      let json;
      try {
        json = JSON.parse(body);
      } catch (parseError) {
        console.warn('[Spotify] JSON parse failed, response:', body.substring(0, 200));
        return null;
      }

      // Process successful response
      if (json.tracks && json.tracks.items && json.tracks.items.length > 0) {
        const track = json.tracks.items[0];
        return {
          title: track.name,
          artist: track.artists.map(a => a.name).join(', '),
          album: track.album.name,
          year: track.album.release_date ? track.album.release_date.substring(0, 4) : '',
          genre: '', // Genre is at album/artist level, not track level
          spotifyId: track.id,
          albumArt: track.album.images[0]?.url || ''
        };
      } else {
        return null;
      }

    } catch (e) {
      // Only retry on network errors, not on other errors
      console.error('[Spotify] Request error:', e.message);
      if (retries < maxRetries) {
        retries++;
        await sleep(100);
        continue;
      }
      return null;
    }
  }

  return null;
}

/**
 * Get token status
 * @returns {object}
 */
function getTokenStatus() {
  const hasValidToken = spotifyToken && tokenExpiry && Date.now() < tokenExpiry;
  let expiresIn = 0;
  
  if (tokenExpiry && Date.now() < tokenExpiry) {
    expiresIn = Math.floor((tokenExpiry - Date.now()) / 1000);
  }

  return {
    hasToken: hasValidToken,
    expiresIn: expiresIn,
    isExpired: !hasValidToken
  };
}

/**
 * Clear token
 */
function clearToken() {
  spotifyToken = null;
  tokenExpiry = null;
}

module.exports = {
  getAccessToken,
  searchTrack,
  getTokenStatus,
  clearToken
};
