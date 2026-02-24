const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Music scanning
  scanFolder: (folderPath) => ipcRenderer.invoke('music:scanFolder', folderPath),
  onScanComplete: (callback) => {
    ipcRenderer.on('music:scanComplete', (event, data) => callback(data));
  },
  onScanProgress: (callback) => {
    ipcRenderer.on('music:scanProgress', (event, data) => callback(data));
  },
  onMetadata: (callback) => {
    ipcRenderer.on('music:metadata', (event, data) => callback(data));
  },

  // Settings
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  onSettingsLoaded: (callback) => {
    ipcRenderer.on('settings:loaded', (event, data) => callback(data));
  },

  // Player
  playFile: (filePath) => ipcRenderer.invoke('player:playFile', filePath),

  // File URL helper for Electron - converts Windows paths to file:// URLs
  toFileUrl: (filePath) => {
    if (!filePath) return '';
    // Replace backslashes with forward slashes, encode spaces
    return `file:///${filePath.replace(/\\/g, '/').replace(/ /g, '%20')}`;
  },

  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  drag: () => ipcRenderer.send('window:drag')
});

// Expose database API to renderer
contextBridge.exposeInMainWorld('dbAPI', {
  // Get all tracks from SQLite
  getTracks: () => ipcRenderer.invoke('db:getTracks'),
  
  // Save tracks to SQLite
  saveTracks: (tracks) => ipcRenderer.invoke('db:saveTracks', tracks),
  
  // Clear all tracks from SQLite
  clearTracks: () => ipcRenderer.invoke('db:clearTracks'),
  
  // Get track count
  getTrackCount: () => ipcRenderer.invoke('db:getTrackCount')
});

// Expose identification API to renderer
contextBridge.exposeInMainWorld('identifyAPI', {
  // Run identification on unidentified tracks
  run: (apiKey) => ipcRenderer.invoke('identify:run', apiKey),
  
  // Get identification status
  getStatus: () => ipcRenderer.invoke('identify:getStatus'),
  
  // Stop identification
  stop: () => ipcRenderer.invoke('identify:stop'),
  
  // Listen for track updates
  onTrackUpdated: (callback) => {
    ipcRenderer.on('track:updated', (event, data) => callback(data));
  },
  
  // Listen for identification progress
  onProgress: (callback) => {
    ipcRenderer.on('identify:progress', (event, data) => callback(data));
  }
});

// Expose guesser API to renderer
contextBridge.exposeInMainWorld('guessAPI', {
  // Run guesser on unidentified tracks
  run: () => ipcRenderer.invoke('guess:run'),
  
  // Get guesser status
  getStatus: () => ipcRenderer.invoke('guess:getStatus')
});

// Expose UI mode API to renderer
contextBridge.exposeInMainWorld('uiAPI', {
  // Set UI mode (full or mini)
  setMode: (mode) => ipcRenderer.send('ui:setMode', mode),
  // Listen for mode changes from Electron
  onModeChanged: (callback) => {
    ipcRenderer.on('ui:modeChanged', (event, mode) => callback(mode));
  }
});

// Expose Spotify API to renderer
contextBridge.exposeInMainWorld('spotifyAPI', {
  // Get current token status
  getToken: () => ipcRenderer.invoke('spotify:getToken'),
  
  // Connect to Spotify (get new token)
  connect: () => ipcRenderer.invoke('spotify:connect'),
  
  // Enrich track with Spotify metadata
  enrichTrack: (track) => ipcRenderer.invoke('spotify:enrichTrack', track),
  
  // Disconnect (clear token)
  disconnect: () => ipcRenderer.invoke('spotify:disconnect')
});

// Expose Metadata Merge API to renderer - ADR-02
contextBridge.exposeInMainWorld('metadataAPI', {
  // Collect metadata from all sources for a track
  collect: (trackId) => ipcRenderer.invoke('metadata:collect', trackId),
  
  // Get proposed metadata for user review
  getProposed: (trackId) => ipcRenderer.invoke('metadata:getProposed', trackId),
  
  // Apply user-approved metadata to track
  apply: (trackId, approved) => ipcRenderer.invoke('metadata:apply', trackId, approved),
  
  // Mark track as reviewed/skip (user rejects)
  skip: (trackId) => ipcRenderer.invoke('metadata:skip', trackId)
});

// Expose Scan API to renderer - ADR-01 (Recursive Folder Scanning)
contextBridge.exposeInMainWorld('scanAPI', {
  // Add folder to scan list (without starting scan)
  addFolder: () => ipcRenderer.invoke('scan:addFolder'),
  
  // Remove folder from scan list
  removeFolder: (folderPath) => ipcRenderer.invoke('scan:removeFolder', folderPath),
  
  // Get current folder list
  getFolders: () => ipcRenderer.invoke('scan:getFolders'),
  
  // Start recursive scanning of all folders in list
  start: () => ipcRenderer.invoke('scan:start'),
  
  // Listen for scan progress
  onProgress: (callback) => {
    ipcRenderer.on('scan:progress', (event, data) => callback(data));
  },
  
  // Listen for scan complete
  onComplete: (callback) => {
    ipcRenderer.on('scan:complete', (event, data) => callback(data));
  }
});

console.log('[Preload] Context bridge exposed to renderer');
