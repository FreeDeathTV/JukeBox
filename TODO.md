# Random Playlist Feature Implementation Plan

## Tasks

### 1. Add IPC handler in main.cjs
- [ ] Add `playlist:random(durationMinutes)` handler that:
  - Gets all tracks from database
  - Filters tracks with valid duration (> 0)
  - Fisher-Yates shuffle
  - Accumulates tracks until total duration >= target
  - Returns selected track IDs

### 2. Add preload API in preload.cjs
- [ ] Add `generateRandomPlaylist: (durationMinutes) => ipcRenderer.invoke('playlist:random', durationMinutes)`

### 3. Add UI in settings/+page.svelte
- [ ] Add "Random Playlist" section with buttons [1 hour] [2 hours] [3 hours] [Custom]
- [ ] Add modal for custom duration input

### 4. Handle auto-start logic
- [ ] Check player state and queue state
- [ ] Auto-start if player is stopped AND playlist is empty
- [ ] Otherwise add tracks without auto-start
