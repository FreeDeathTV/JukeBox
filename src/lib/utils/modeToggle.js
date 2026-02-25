// Shared mode toggle utility to eliminate duplication between Player.svelte and +layout.svelte
import { get } from 'svelte/store';
import { uiMode, toggleMode } from '../stores/ui.js';

/**
 * Toggle UI mode and sync with Electron
 */
export function toggleModeWithSync() {
  const newMode = get(uiMode) === 'full' ? 'mini' : 'full';
  toggleMode();
  
  // Send to Electron main process to resize window
  if (typeof window !== 'undefined' && window.uiAPI) {
    window.uiAPI.setMode(newMode);
  }
}
