const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class DiscogsAPI {
  constructor() {
    this.consumerKey = 'BTAxIAxheTGntshSvAlX';
    this.consumerSecret = 'wuwNBXRbqcEmokoPtpcxcOmxMtvwUNni';
    this.requestTokenUrl = 'https://api.discogs.com/oauth/request_token';
    this.authorizeUrl = 'https://www.discogs.com/oauth/authorize';
    this.accessTokenUrl = 'https://api.discogs.com/oauth/access_token';
    this.apiBaseUrl = 'https://api.discogs.com';
    
    this.token = null;
    this.tokenSecret = null;
    this.requestToken = null;
    this.requestTokenSecret = null;
  }

  // Generate OAuth signature
  generateSignature(method, url, params, tokenSecret = '') {
    const baseParams = {
      oauth_consumer_key: this.consumerKey,
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000),
      oauth_version: '1.0',
      ...params
    };

    // Sort parameters alphabetically
    const sortedParams = Object.keys(baseParams)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(baseParams[key])}`)
      .join('&');

    const signatureBase = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
    const signingKey = `${encodeURIComponent(this.consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
    
    const signature = crypto.createHmac('sha1', signingKey)
      .update(signatureBase)
      .digest('base64');

    return signature;
  }

  // Make OAuth signed request
  async makeRequest(method, url, params = {}, data = null, tokenSecret = '') {
    const signature = this.generateSignature(method, url, params, tokenSecret);
    
    const headers = {
      'Authorization': `OAuth oauth_consumer_key="${this.consumerKey}", oauth_nonce="${params.oauth_nonce}", oauth_signature="${encodeURIComponent(signature)}", oauth_signature_method="HMAC-SHA1", oauth_timestamp="${params.oauth_timestamp}", oauth_version="1.0"`,
      'User-Agent': 'McJukebox/1.0'
    };

    if (this.token) {
      headers.Authorization += `, oauth_token="${this.token}"`;
    }

    try {
      const requestParams = { ...params };
      if (!this.token && this.requestToken) {
        requestParams.oauth_token = this.requestToken;
      }

      const response = await axios({
        method,
        url,
        headers,
        params: requestParams,
        data
      });
      return response.data;
    } catch (error) {
      console.error('Discogs API error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get request token
  async getRequestToken() {
    try {
      const params = {
        oauth_consumer_key: this.consumerKey,
        oauth_callback: 'oob',
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000),
        oauth_nonce: crypto.randomBytes(16).toString('hex'),
        oauth_version: '1.0'
      };
      
      // Generate signature for request token
      const signatureBase = `POST&${encodeURIComponent(this.requestTokenUrl)}&${encodeURIComponent(
        Object.keys(params)
          .sort()
          .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
          .join('&')
      )}`;
      
      const signingKey = `${encodeURIComponent(this.consumerSecret)}&`;
      const signature = crypto.createHmac('sha1', signingKey)
        .update(signatureBase)
        .digest('base64');
      
      params.oauth_signature = signature;
      
      // Make request with OAuth parameters
      const response = await axios.post(this.requestTokenUrl, null, {
        params,
        headers: {
          'User-Agent': 'McJukebox/1.0'
        }
      });
      
      const data = response.data;
      
      // Parse response parameters
      const paramsObj = {};
      data.split('&').forEach(param => {
        const [key, value] = param.split('=');
        paramsObj[decodeURIComponent(key)] = decodeURIComponent(value);
      });

      this.requestToken = paramsObj.oauth_token;
      this.requestTokenSecret = paramsObj.oauth_token_secret;
      
      // Save request token to file immediately
      const tokenPath = path.join(__dirname, 'settings', 'discogs_tokens.json');
      try {
        const tokens = {
          requestToken: this.requestToken,
          requestTokenSecret: this.requestTokenSecret,
          token: null,
          tokenSecret: null
        };
        fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
        console.log('Discogs request token saved to file:', this.requestToken);
      } catch (err) {
        console.error('Error saving request token to file:', err);
      }
      
      return {
        success: true,
        authorizeUrl: `${this.authorizeUrl}?oauth_token=${this.requestToken}`
      };
    } catch (error) {
      console.error('Discogs getRequestToken error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  // Get access token
  async getAccessToken(verifier) {
    try {
      const params = {
        oauth_verifier: verifier
      };
      
      // Load existing request token from file
      this.loadTokens();
      
      // Check if we have request token from previous connection
      const tokenPath = path.join(__dirname, 'settings', 'discogs_tokens.json');
      let requestTokenData = null;
      
      try {
        if (fs.existsSync(tokenPath)) {
          const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
          if (tokens.requestToken && tokens.requestTokenSecret) {
            this.requestToken = tokens.requestToken;
            this.requestTokenSecret = tokens.requestTokenSecret;
            requestTokenData = tokens;
          }
        }
      } catch (err) {
        console.warn('Could not load request token from file:', err);
      }
      
      if (!this.requestToken) {
        throw new Error('No request token available. Please connect to Discogs first.');
      }
      
      // Generate signature for access token request
      const baseParams = {
        oauth_consumer_key: this.consumerKey,
        oauth_nonce: crypto.randomBytes(16).toString('hex'),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000),
        oauth_version: '1.0',
        oauth_token: this.requestToken,
        oauth_verifier: verifier
      };
      
      // Sort parameters alphabetically
      const sortedParams = Object.keys(baseParams)
        .sort()
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(baseParams[key])}`)
        .join('&');

      const signatureBase = `POST&${encodeURIComponent(this.accessTokenUrl)}&${encodeURIComponent(sortedParams)}`;
      const signingKey = `${encodeURIComponent(this.consumerSecret)}&${encodeURIComponent(this.requestTokenSecret)}`;
      
      const signature = crypto.createHmac('sha1', signingKey)
        .update(signatureBase)
        .digest('base64');
      
      // Make request with OAuth parameters
      const response = await axios.post(this.accessTokenUrl, null, {
        params,
        headers: {
          'Authorization': `OAuth oauth_consumer_key="${this.consumerKey}", oauth_nonce="${baseParams.oauth_nonce}", oauth_signature="${encodeURIComponent(signature)}", oauth_signature_method="HMAC-SHA1", oauth_timestamp="${baseParams.oauth_timestamp}", oauth_version="1.0", oauth_token="${this.requestToken}", oauth_verifier="${verifier}"`,
          'User-Agent': 'McJukebox/1.0'
        }
      });
      
      const data = response.data;
      
      // Parse response parameters
      const paramsObj = {};
      data.split('&').forEach(param => {
        const [key, value] = param.split('=');
        paramsObj[decodeURIComponent(key)] = decodeURIComponent(value);
      });

      this.token = paramsObj.oauth_token;
      this.tokenSecret = paramsObj.oauth_token_secret;
      
      // Save tokens to file (keep request token for debugging)
      this.saveTokens();
      
      return {
        success: true,
        token: this.token
      };
    } catch (error) {
      console.error('Discogs getAccessToken error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  // Load tokens from file
  loadTokens() {
    const tokenPath = path.join(__dirname, 'settings', 'discogs_tokens.json');
    try {
      if (fs.existsSync(tokenPath)) {
        const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
        this.token = tokens.token;
        this.tokenSecret = tokens.tokenSecret;
        return true;
      }
    } catch (error) {
      console.error('Error loading Discogs tokens:', error);
    }
    return false;
  }

  // Save tokens to file
  saveTokens() {
    const tokenPath = path.join(__dirname, 'settings', 'discogs_tokens.json');
    try {
      const tokens = {
        token: this.token,
        tokenSecret: this.tokenSecret,
        requestToken: this.requestToken,
        requestTokenSecret: this.requestTokenSecret
      };
      fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
    } catch (error) {
      console.error('Error saving Discogs tokens:', error);
    }
  }

  // Clear tokens
  clearTokens() {
    this.token = null;
    this.tokenSecret = null;
    const tokenPath = path.join(__dirname, 'settings', 'discogs_tokens.json');
    try {
      if (fs.existsSync(tokenPath)) {
        fs.unlinkSync(tokenPath);
      }
    } catch (error) {
      console.error('Error clearing Discogs tokens:', error);
    }
  }

  // Get token status
  getTokenStatus() {
    this.loadTokens();
    return {
      hasToken: !!this.token,
      token: this.token,
      isExpired: false // Discogs tokens don't expire
    };
  }

  // Search for tracks
  async searchTracks(query, type = 'release') {
    if (!this.token) {
      this.loadTokens();
    }

    if (!this.token) {
      throw new Error('No Discogs token available');
    }

    try {
      const params = {
        q: query,
        type: type,
        per_page: 20
      };

      const data = await this.makeRequest('GET', `${this.apiBaseUrl}/database/search`, params, null, this.tokenSecret);
      
      return data;
    } catch (error) {
      console.error('Discogs searchTracks error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get release details
  async getRelease(releaseId) {
    if (!this.token) {
      this.loadTokens();
    }

    if (!this.token) {
      throw new Error('No Discogs token available');
    }

    try {
      const data = await this.makeRequest('GET', `${this.apiBaseUrl}/releases/${releaseId}`, {}, null, this.tokenSecret);
      return data;
    } catch (error) {
      console.error('Discogs getRelease error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Search for tracks by artist and title
  async searchByArtistTitle(artist, title) {
    if (!this.token) {
      this.loadTokens();
    }

    if (!this.token) {
      throw new Error('No Discogs token available');
    }

    try {
      const query = `${artist} ${title}`;
      const params = {
        q: query,
        type: 'release',
        per_page: 10
      };

      const data = await this.makeRequest('GET', `${this.apiBaseUrl}/database/search`, params, null, this.tokenSecret);
      
      // Filter results to find best match
      if (data && data.results) {
        const results = data.results.filter(result => 
          result.type === 'release' && 
          result.title &&
          result.artists && 
          result.artists.some(a => a.name.toLowerCase().includes(artist.toLowerCase()))
        );

        return {
          results: results.slice(0, 5), // Return top 5 matches
          total: results.length
        };
      }

      return { results: [], total: 0 };
    } catch (error) {
      console.error('Discogs searchByArtistTitle error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Enrich track metadata using Discogs
  async enrichTrack(track) {
    if (!this.token) {
      this.loadTokens();
    }

    if (!this.token) {
      throw new Error('No Discogs token available');
    }

    try {
      // Build search query
      let query = track.title || '';
      if (track.artist && track.artist !== 'Unknown Artist') {
        query = `${track.artist} ${track.title}`;
      }

      if (!query.trim()) {
        return null;
      }

      const searchResult = await this.searchByArtistTitle(track.artist || '', track.title || '');
      
      if (searchResult.results && searchResult.results.length > 0) {
        const bestMatch = searchResult.results[0];
        
        // Get detailed release info
        const release = await this.getRelease(bestMatch.id);
        
        if (release) {
          return {
            title: release.title || track.title,
            artist: release.artists?.[0]?.name || track.artist,
            album: release.labels?.[0]?.name || track.album,
            year: release.year || track.year,
            genre: release.genres?.[0] || track.genre,
            discogsId: release.id,
            discogsUrl: release.uri,
            albumArt: release.images?.[0]?.uri
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Discogs enrichTrack error:', error.response?.data || error.message);
      return null;
    }
  }

  // Enrich library with rate limiting (12 calls per minute = 1 call every 5 seconds)
  async enrichLibrary(allTracks) {
    if (!this.token) {
      this.loadTokens();
    }

    if (!this.token) {
      throw new Error('No Discogs token available');
    }

    let enrichedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < allTracks.length; i++) {
      const track = allTracks[i];
      
      // Skip tracks that already have good metadata
      if (track.title && track.title !== 'Unknown Title' && 
          track.artist && track.artist !== 'Unknown Artist' &&
          track.discogsId) {
        skippedCount++;
        continue;
      }
      
      const result = await this.enrichTrack(track);
      if (result) {
        enrichedCount++;
      }
      
      // Rate limiting: 12 calls per minute = 1 call every 5 seconds
      if (i < allTracks.length - 1) {
        await new Promise(r => setTimeout(r, 5000));
      }
    }
    
    return { enriched: enrichedCount, skipped: skippedCount };
  }
}

module.exports = DiscogsAPI;