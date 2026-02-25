const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const scanner = require('./scanner/index.cjs');
const database = require('./database.cjs');
const identifier = require('./identifier.cjs');
const guesser = require('./guesser.cjs');

// Create a reference to the main window
let mainWindow;

// Folder list for recursive scanning (ADR-01)
let scanFolderList = [];
let isScanning = false;

// Create the main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    titleBarStyle: 'hiddenInset',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: false,
      allowRunningInsecureContent: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.setAutoHideMenuBar(true);

  const isDev = process.env.NODE_ENV !== 'production';
  
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  console.log('[IPC] Window created successfully');
}

app.whenReady().then(() => {
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
  
  console.log('[IPC] App ready - Electron main process started');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Channel: scan:addFolder - Add folder to list without starting scan (ADR-01)
ipcMain.handle('scan:addFolder', async () => {
  console.log('[IPC] scan:addFolder called');
  
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Music Folder to Add'
  });

  if (result.canceled) {
    return { success: false, canceled: true };
  }

  const folderPath = result.filePaths[0];
  
  if (scanFolderList.includes(folderPath)) {
    return { success: false, error: 'Folder already in list' };
  }
  
  scanFolderList.push(folderPath);
  console.log('[IPC] Added folder to scan list:', folderPath);
  console.log('[IPC] Current scan list:', scanFolderList);
  
  return { success: true, folderPath, folders: scanFolderList };
});

// IPC Channel: scan:removeFolder - Remove folder from list (ADR-01)
ipcMain.handle('scan:removeFolder', async (event, folderPath) => {
  console.log('[IPC] scan:removeFolder called:', folderPath);
  
  const index = scanFolderList.indexOf(folderPath);
  if (index > -1) {
    scanFolderList.splice(index, 1);
    console.log('[IPC] Removed folder from scan list:', folderPath);
    return { success: true, folders: scanFolderList };
  }
  
  return { success: false, error: 'Folder not in list' };
});

// IPC Channel: scan:getFolders - Get current folder list (ADR-01)
ipcMain.handle('scan:getFolders', async () => {
  console.log('[IPC] scan:getFolders called');
  return { folders: scanFolderList, isScanning };
});

// IPC Channel: scan:start - Start recursive scanning of all folders (ADR-01)
ipcMain.handle('scan:start', async () => {
  console.log('[IPC] scan:start called');
  console.log('[IPC] Folders to scan:', scanFolderList);
  
  if (isScanning) {
    return { success: false, error: 'Scan already in progress' };
  }
  
  if (scanFolderList.length === 0) {
    return { success: false, error: 'No folders to scan' };
  }
  
  isScanning = true;
  
  const existingTracks = database.getAllTracks();
  const existingPaths = new Set(existingTracks.map(t => t.path));
  console.log('[IPC] Existing paths in DB:', existingPaths.size);
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('scan:progress', { 
      scanned: 0, 
      total: 0, 
      status: 'starting',
      folders: scanFolderList 
    });
  }
  
  try {
    const tracks = await scanner.scanFolders(
      scanFolderList,
      (scanned, total, status) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('scan:progress', { 
            scanned, 
            total, 
            status,
            folders: scanFolderList 
          });
        }
      },
      existingPaths
    );
    
    console.log('[IPC] Scan complete, found tracks:', tracks.length);
    
    scanFolderList = [];
    isScanning = false;
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scan:complete', { 
        tracks,
        count: tracks.length,
        folders: scanFolderList
      });
    }
    
    return { success: true, tracks, count: tracks.length };
  } catch (err) {
    console.error('[IPC] Scan error:', err);
    isScanning = false;
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scan:complete', { error: err.message });
    }
    
    return { success: false, error: err.message };
  }
});

// IPC Channel: music:scanFolder (backward compatibility)
ipcMain.handle('music:scanFolder', async (event, folderPath) => {
  console.log('[IPC] music:scanFolder called');
  
  if (!folderPath) {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Music Folder'
    });

    if (result.canceled) {
      return { canceled: true };
    }

    folderPath = result.filePaths[0];
    console.log('[IPC] Selected folder:', folderPath);
  }
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('music:scanProgress', { scanned: 0, total: 0, folderPath });
  }
  
  scanner.scanFolder(folderPath, (scanned, total) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('music:scanProgress', { scanned, total });
    }
  }).then(tracks => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('music:scanComplete', { tracks });
    }
  }).catch(err => {
    console.error('[IPC] Scan error:', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('music:scanComplete', { error: err.message });
    }
  });
  
  return { canceled: false, folderPath };
});

// IPC Channel: music:getProgress
ipcMain.handle('music:getProgress', async () => {
  return { scanned: 0, total: 0 };
});

// IPC Channel: player:playFile
ipcMain.handle('player:playFile', async (event, filePath) => {
  console.log('[IPC] player:playFile called', filePath);
  return { success: true, filePath };
});

// IPC Channel: db:getTracks
ipcMain.handle('db:getTracks', async () => {
  console.log('[IPC] db:getTracks called');
  try {
    const tracks = database.getAllTracks();
    console.log('[IPC] Loaded', tracks.length, 'tracks from database');
    return tracks;
  } catch (err) {
    console.error('[IPC] Error loading tracks from DB:', err);
    return [];
  }
});

// IPC Channel: db:saveTracks
ipcMain.handle('db:saveTracks', async (event, tracks) => {
  console.log('[IPC] db:saveTracks called with', tracks.length, 'tracks');
  try {
    database.clearTracks();
    database.saveTracks(tracks);
    return { success: true, count: tracks.length };
  } catch (err) {
    console.error('[IPC] Error saving tracks to DB:', err);
    return { success: false, error: err.message };
  }
});

// IPC Channel: db:clearTracks
ipcMain.handle('db:clearTracks', async () => {
  console.log('[IPC] db:clearTracks called');
  try {
    database.clearTracks();
    return { success: true };
  } catch (err) {
    console.error('[IPC] Error clearing tracks from DB:', err);
    return { success: false, error: err.message };
  }
});

// IPC Channel: db:getTrackCount
ipcMain.handle('db:getTrackCount', async () => {
  console.log('[IPC] db:getTrackCount called');
  try {
    return database.getTrackCount();
  } catch (err) {
    console.error('[IPC] Error getting track count from DB:', err);
    return 0;
  }
});

// IPC Channel: identify:run
ipcMain.handle('identify:run', async (event, apiKey) => {
  console.log('[IPC] identify:run called');
  
  if (!apiKey) {
    const configPath = path.join(__dirname, 'settings', 'config.json');
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        apiKey = config.acoustidApiKey;
      }
    } catch (err) {
      console.error('[IPC] Error reading config:', err);
    }
  }
  
  if (!apiKey) {
    return { success: false, error: 'No AcoustID API key provided. Please add it in Settings.' };
  }
  
  identifier.setMainWindow(mainWindow);
  
  try {
    const result = await identifier.runIdentification(apiKey);
    return { success: true, ...result };
  } catch (err) {
    console.error('[IPC] Identification error:', err);
    return { success: false, error: err.message };
  }
});

// IPC Channel: identify:getStatus
ipcMain.handle('identify:getStatus', async () => {
  console.log('[IPC] identify:getStatus called');
  try {
    return identifier.getStatus();
  } catch (err) {
    console.error('[IPC] Error getting identification status:', err);
    return { isRunning: false, unidentifiedCount: 0 };
  }
});

// IPC Channel: identify:stop
ipcMain.handle('identify:stop', async () => {
  console.log('[IPC] identify:stop called');
  try {
    identifier.stopIdentification();
    return { success: true };
  } catch (err) {
    console.error('[IPC] Error stopping identification:', err);
    return { success: false, error: err.message };
  }
});

// IPC Channel: guess:run
ipcMain.handle('guess:run', async () => {
  console.log('[IPC] guess:run called');
  
  try {
    const result = await guesser.runGuesser(mainWindow);
    return { success: true, ...result };
  } catch (err) {
    console.error('[IPC] Guesser error:', err);
    return { success: false, error: err.message };
  }
});

// IPC Channel: guess:getStatus
ipcMain.handle('guess:getStatus', async () => {
  console.log('[IPC] guess:getStatus called');
  try {
    const tracks = database.getAllTracks();
    const guessableCount = tracks.filter(t => 
      !t.identified || 
      (t.title && (t.title.startsWith('-') || /^[0-9]/.test(t.title)))
    ).length;
    return { guessableCount };
  } catch (err) {
    console.error('[IPC] Error getting guesser status:', err);
    return { guessableCount: 0 };
  }
});

// IPC Channel: settings:load
ipcMain.handle('settings:load', async () => {
  console.log('[IPC] settings:load called');
  const configPath = path.join(__dirname, 'settings', 'config.json');
  
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return {
        musicFolder: config.musicFolder || '',
        theme: config.theme || 'dark',
        autoScan: config.autoScan || false,
        acoustidApiKey: config.acoustidApiKey || ''
      };
    }
  } catch (err) {
    console.error('[IPC] Error loading settings:', err);
  }
  
  return {
    musicFolder: '',
    theme: 'dark',
    autoScan: false,
    acoustidApiKey: ''
  };
});

// IPC Channel: settings:save
ipcMain.handle('settings:save', async (event, settings) => {
  console.log('[IPC] settings:save called', settings);
  const configPath = path.join(__dirname, 'settings', 'config.json');
  
  try {
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    
    config = {
      ...config,
      musicFolder: settings.musicFolder || config.musicFolder || '',
      theme: settings.theme || 'dark',
      autoScan: settings.autoScan || false,
      acoustidApiKey: settings.acoustidApiKey || config.acoustidApiKey || ''
    };
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('[IPC] Settings saved successfully');
    return { success: true };
  } catch (err) {
    console.error('[IPC] Error saving settings:', err);
    return { success: false, error: err.message };
  }
});

// IPC Channel: ui:setMode
ipcMain.on('ui:setMode', (event, mode) => {
  console.log('[IPC] ui:setMode called', mode);
  
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  
  if (mode === 'mini') {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setSize(800, 100);
    mainWindow.setResizable(false);
    mainWindow.setMinimumSize(800, 100);
    mainWindow.setMaximumSize(800, 100);
  } else {
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setSize(1200, 800);
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(800, 600);
    mainWindow.setMaximumSize(9999, 9999);
  }
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ui:modeChanged', mode);
  }
});

// IPC Channel: window:drag
ipcMain.on('window:drag', () => {
  console.log('[IPC] window:drag called');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.startDragging();
  }
});

// IPC Channel: window:minimize
ipcMain.on('window:minimize', () => {
  console.log('[IPC] window:minimize called');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
});

// IPC Channel: window:maximize
ipcMain.on('window:maximize', () => {
  console.log('[IPC] window:maximize called');
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

// IPC Channel: window:close
ipcMain.on('window:close', () => {
  console.log('[IPC] window:close called');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});

// IPC Channel: spotify:getToken
ipcMain.handle('spotify:getToken', async () => {
  console.log('[IPC] spotify:getToken called');
  try {
    const spotify = require('./spotify.cjs');
    const status = spotify.getTokenStatus();
    return status;
  } catch (err) {
    console.error('[IPC] Spotify getToken error:', err);
    return { hasToken: false, expiresIn: 0, isExpired: true };
  }
});

// IPC Channel: spotify:connect
ipcMain.handle('spotify:connect', async () => {
  console.log('[IPC] spotify:connect called');
  try {
    const spotify = require('./spotify.cjs');
    const token = await spotify.getAccessToken();
    if (token) {
      const status = spotify.getTokenStatus();
      return { success: true, ...status };
    }
    return { success: false, error: 'Failed to obtain Spotify token' };
  } catch (err) {
    console.error('[IPC] Spotify connect error:', err);
    return { success: false, error: err.message };
  }
});

// IPC Channel: spotify:enrichTrack
ipcMain.handle('spotify:enrichTrack', async (event, track) => {
  console.log('[IPC] spotify:enrichTrack called', track.title);
  try {
    const spotify = require('./spotify.cjs');
    let query = track.title || '';
    if (track.artist && track.artist !== 'Unknown Artist') {
      query += ' ' + track.artist;
    }
    const result = await spotify.searchTrack(query);
    if (result) {
      return { success: true, metadata: result };
    }
    return { success: false, error: 'No match found on Spotify' };
  } catch (err) {
    console.error('[IPC] Spotify enrichTrack error:', err);
    return { success: false, error: err.message };
  }
});

// IPC Channel: spotify:disconnect
ipcMain.handle('spotify:disconnect', async () => {
  console.log('[IPC] spotify:disconnect called');
  try {
    const spotify = require('./spotify.cjs');
    spotify.clearToken();
    return { success: true };
  } catch (err) {
    console.error('[IPC] Spotify disconnect error:', err);
    return { success: false, error: err.message };
  }
});

// IPC Channel: metadata:collect
ipcMain.handle('metadata:collect', async (event, trackId) => {
  console.log('[IPC] metadata:collect called for track:', trackId);
  try {
    const metadataMerger = require('./metadataMerger.cjs');
    const sources = await metadataMerger.collectAllMetadata(trackId);
    if (sources) {
      return { success: true, sources };
    }
    return { success: false, error: 'Track not found' };
  } catch (err) {
    console.error('[IPC] metadata:collect error:', err);
    return { success: false, error: err.message };
  }
});

// IPC Channel: metadata:getProposed
ipcMain.handle('metadata:getProposed', async (event, trackId) => {
  console.log('[IPC] metadata:getProposed called for track:', trackId);
  try {
    const metadataMerger = require('./metadataMerger.cjs');
    const sources = await metadataMerger.collectAllMetadata(trackId);
    if (sources) {
      const proposed = metadataMerger.generateProposedMetadata(sources);
      return { success: true, proposed };
    }
    return { success: false, error: 'Track not found' };
  } catch (err) {
    console.error('[IPC] metadata:getProposed error:', err);
    return { success: false, error: err.message };
  }
});

// IPC Channel: metadata:apply (ADR-03)
ipcMain.handle('metadata:apply', async (event, trackId, approved) => {
  console.log('[IPC] metadata:apply called for track:', trackId);
  try {
    const metadataMerger = require('./metadataMerger.cjs');
    const result = await metadataMerger.applyMetadata(trackId, approved);
    
    if (result.success) {
      if (mainWindow && !mainWindow.isDestroyed() && result.track) {
        mainWindow.webContents.send('track:updated', result.track);
      }
      return { 
        success: true, 
        track: result.track,
        fileWritten: result.fileWritten,
        format: result.format
      };
    }
    
    return { 
      success: false, 
      error: result.error,
      fileWriteFailed: result.fileWriteFailed
    };
  } catch (err) {
    console.error('[IPC] metadata:apply error:', err);
    return { success: false, error: err.message };
  }
});

// IPC Channel: metadata:skip
ipcMain.handle('metadata:skip', async (event, trackId) => {
  console.log('[IPC] metadata:skip called for track:', trackId);
  try {
    const metadataMerger = require('./metadataMerger.cjs');
    metadataMerger.skipTrack(trackId);
    return { success: true };
  } catch (err) {
    console.error('[IPC] metadata:skip error:', err);
    return { success: false, error: err.message };
  }
});

// IPC Channel: duplicates:detect
ipcMain.handle('duplicates:detect', async () => {
  console.log('[IPC] duplicates:detect called');
  try {
    const duplicateDetector = require('./duplicateDetector.cjs');
    const groups = await duplicateDetector.detectDuplicates();
    return { success: true, groups };
  } catch (err) {
    console.error('[IPC] duplicates:detect error:', err);
    return { success: false, error: err.message };
  }
});

// IPC Channel: duplicates:delete
ipcMain.handle('duplicates:delete', async (event, trackIds) => {
  console.log('[IPC] duplicates:delete called for', trackIds.length, 'tracks');
  try {
    const duplicateDetector = require('./duplicateDetector.cjs');
    const result = duplicateDetector.deleteTracks(trackIds);
    return result;
  } catch (err) {
    console.error('[IPC] duplicates:delete error:', err);
    return { success: false, error: err.message };
  }
});

// IPC Channel: duplicates:markNotDuplicate
ipcMain.handle('duplicates:markNotDuplicate', async (event, groupId) => {
  console.log('[IPC] duplicates:markNotDuplicate called for group:', groupId);
  return { success: true };
});

// IPC Channel: playlist:random - Generate a random playlist based on duration
ipcMain.handle('playlist:random', async (event, durationMinutes) => {
  console.log('[IPC] playlist:random called with duration:', durationMinutes, 'minutes');
  
  try {
    const allTracks = database.getAllTracks();
    
    // Filter tracks that have valid duration
    const tracksWithDuration = allTracks.filter(track => track.duration && track.duration > 0);
    
    console.log('[IPC] Total tracks:', allTracks.length, 'Tracks with duration:', tracksWithDuration.length);
    
    if (tracksWithDuration.length === 0) {
      return { success: false, error: 'No tracks with duration found' };
    }
    
    // Fisher-Yates shuffle
    const shuffled = [...tracksWithDuration];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    // Accumulate tracks until we reach the target duration
    const targetSeconds = durationMinutes * 60;
    const selectedTracks = [];
    let totalDuration = 0;
    
    for (const track of shuffled) {
      selectedTracks.push(track);
      totalDuration += track.duration;
      
      // Stop once we've met or exceeded the target
      if (totalDuration >= targetSeconds) {
        break;
      }
    }
    
    console.log('[IPC] Generated random playlist:', selectedTracks.length, 'tracks,', totalDuration.toFixed(0), 'seconds');
    
    return {
      success: true,
      tracks: selectedTracks,
      totalDuration: totalDuration,
      targetDuration: targetSeconds
    };
  } catch (err) {
    console.error('[IPC] Error generating random playlist:', err);
    return { success: false, error: err.message };
  }
});

// IPC Channel: queue:add - Add track to queue
ipcMain.handle('queue:add', async (event, track) => {
  console.log('[IPC] queue:add called', track?.title);
  if (!track || typeof track !== 'object') return { success: false };
  
  // This would need to be implemented in the renderer side queue store
  // For now, we'll just return success to avoid errors
  return { success: true };
});

// IPC Channel: queue:addMany - Add multiple tracks to queue
ipcMain.handle('queue:addMany', async (event, tracks) => {
  console.log('[IPC] queue:addMany called', tracks.length, 'tracks');
  if (!Array.isArray(tracks)) return { success: false };
  
  // This would need to be implemented in the renderer side queue store
  // For now, we'll just return success to avoid errors
  return { success: true };
});

// IPC Channel: queue:remove - Remove track from queue by index
ipcMain.handle('queue:remove', async (event, index) => {
  console.log('[IPC] queue:remove called', index);
  
  // This would need to be implemented in the renderer side queue store
  // For now, we'll just return success to avoid errors
  return { success: true };
});

// IPC Channel: queue:clear - Clear entire queue
ipcMain.handle('queue:clear', async () => {
  console.log('[IPC] queue:clear called');
  
  // This would need to be implemented in the renderer side queue store
  // For now, we'll just return success to avoid errors
  return { success: true };
});

// IPC Channel: queue:playNow - Play track now (replace queue)
ipcMain.handle('queue:playNow', async (event, track) => {
  console.log('[IPC] queue:playNow called', track?.title);
  if (!track || typeof track !== 'object') return { success: false };
  
  // This would need to be implemented in the renderer side queue store
  // For now, we'll just return success to avoid errors
  return { success: true };
});

// IPC Channel: queue:addToQueue - Add to queue with auto-play option
ipcMain.handle('queue:addToQueue', async (event, track, autoPlay) => {
  console.log('[IPC] queue:addToQueue called', track?.title, autoPlay);
  if (!track || typeof track !== 'object') return { success: false };
  
  // This would need to be implemented in the renderer side queue store
  // For now, we'll just return success to avoid errors
  return { success: true };
});

// IPC Channel: queue:replaceAndPlay - Replace queue and play
ipcMain.handle('queue:replaceAndPlay', async (event, tracks, startIndex) => {
  console.log('[IPC] queue:replaceAndPlay called', tracks.length, 'tracks, start:', startIndex);
  if (!Array.isArray(tracks)) return { success: false };
  
  // This would need to be implemented in the renderer side queue store
  // For now, we'll just return success to avoid errors
  return { success: true };
});

// IPC Channel: queue:getLength - Get queue length
ipcMain.handle('queue:getLength', async () => {
  console.log('[IPC] queue:getLength called');
  
  // This would need to be implemented in the renderer side queue store
  // For now, we'll just return 0 to avoid errors
  return 0;
});

// IPC Channel: player:setTrack - Set current track
ipcMain.handle('player:setTrack', async (event, track) => {
  console.log('[IPC] player:setTrack called', track?.title);
  if (!track || typeof track !== 'object') return { success: false };
  
  // This would need to be implemented in the renderer side player store
  // For now, we'll just return success to avoid errors
  return { success: true };
});

// IPC Channel: player:play - Play current track
ipcMain.handle('player:play', async () => {
  console.log('[IPC] player:play called');
  
  // This would need to be implemented in the renderer side player store
  // For now, we'll just return success to avoid errors
  return { success: true };
});

// IPC Channel: player:pause - Pause playback
ipcMain.handle('player:pause', async () => {
  console.log('[IPC] player:pause called');
  
  // This would need to be implemented in the renderer side player store
  // For now, we'll just return success to avoid errors
  return { success: true };
});

// IPC Channel: player:toggle - Toggle play/pause
ipcMain.handle('player:toggle', async () => {
  console.log('[IPC] player:toggle called');
  
  // This would need to be implemented in the renderer side player store
  // For now, we'll just return success to avoid errors
  return { success: true };
});

// IPC Channel: player:stop - Stop playback
ipcMain.handle('player:stop', async () => {
  console.log('[IPC] player:stop called');
  
  // This would need to be implemented in the renderer side player store
  // For now, we'll just return success to avoid errors
  return { success: true };
});

// IPC Channel: player:setVolume - Set volume (0-100)
ipcMain.handle('player:setVolume', async (event, value) => {
  console.log('[IPC] player:setVolume called', value);
  
  // This would need to be implemented in the renderer side player store
  // For now, we'll just return success to avoid errors
  return { success: true };
});

// IPC Channel: player:setProgress - Set progress (0-1)
ipcMain.handle('player:setProgress', async (event, value) => {
  console.log('[IPC] player:setProgress called', value);
  
  // This would need to be implemented in the renderer side player store
  // For now, we'll just return success to avoid errors
  return { success: true };
});

// IPC Channel: player:isPlaying - Check if playing
ipcMain.handle('player:isPlaying', async () => {
  console.log('[IPC] player:isPlaying called');
  
  // This would need to be implemented in the renderer side player store
  // For now, we'll just return false to avoid errors
  return false;
});

// IPC Channel: player:getCurrentTrack - Get current track
ipcMain.handle('player:getCurrentTrack', async () => {
  console.log('[IPC] player:getCurrentTrack called');
  
  // This would need to be implemented in the renderer side player store
  // For now, we'll just return null to avoid errors
  return null;
});

