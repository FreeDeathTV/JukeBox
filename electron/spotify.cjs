const https = require('https');
const fs = require('fs');
const path = require('path');

let spotifyToken = null;
let tokenExpiry = null;

// Spotify API credentials
const SPOTIFY_CLIENT_ID = '4eebcb072cb84eee9c53ee653b33a57b';
const SPOTIFY_CLIENT_SECRET = 'fec9e255221b42fb9d02f43749836958';

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
 * Search Spotify for a track
 * @param {string} query - Search query
 * @returns {Promise<object|null>}
 */
async function searchTrack(query) {
  const token = await getAccessToken();
  if (!token) return null;

  return new Promise((resolve, reject) => {
    const encodedQuery = encodeURIComponent(query);
    const options = {
      hostname: 'api.spotify.com',
      path: `/v1/search?q=${encodedQuery}&type=track&limit=1`,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.tracks && json.tracks.items && json.tracks.items.length > 0) {
            const track = json.tracks.items[0];
            resolve({
              title: track.name,
              artist: track.artists.map(a => a.name).join(', '),
              album: track.album.name,
              year: track.album.release_date ? track.album.release_date.substring(0, 4) : '',
              genre: '', // Genre is at album/artist level, not track level
              spotifyId: track.id,
              albumArt: track.album.images[0]?.url || ''
            });
          } else {
            resolve(null);
          }
        } catch (e) {
          console.error('[Spotify] Error parsing search response:', e);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.error('[Spotify] Error searching:', e);
      resolve(null);
    });

    req.end();
  });
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
