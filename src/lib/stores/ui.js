import { writable, get } from 'svelte/store';

// UI mode: 'full' or 'mini'
export const uiMode = writable('full');

// Toggle between modes
export function toggleMode() {
  uiMode.update(mode => mode === 'full' ? 'mini' : 'full');
}

// Set specific mode
export function setMode(mode) {
  uiMode.set(mode);
}

// Initialize mode sync with Electron
export function initModeSync() {
  if (typeof window !== 'undefined' && window.uiAPI) {
    // Listen for mode changes from Electron
    window.uiAPI.onModeChanged((mode) => {
      console.log('[UI Store] Mode changed from Electron:', mode);
      uiMode.set(mode);
    });
  }
}
