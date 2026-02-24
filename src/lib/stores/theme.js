import { writable } from 'svelte/store';

// Theme definitions
export const themes = {
  light: {
    name: 'Light',
    css: `
      --bg: #f8f9fa;
      --text: #212529;
      --surface: #ffffff;
      --surface-alt: #e9ecef;
      --accent: #0d6efd;
      --accent-text: #ffffff;
      --border: #dee2e6;
      --shadow: rgba(0, 0, 0, 0.1);
    `
  },
  dark: {
    name: 'Dark',
    css: `
      --bg: #1a1a2e;
      --text: #e9ecef;
      --surface: #16213e;
      --surface-alt: #1a1a2e;
      --accent: #e94560;
      --accent-text: #ffffff;
      --border: #2d3748;
      --shadow: rgba(0, 0, 0, 0.3);
    `
  },
  nightclub: {
    name: 'Nightclub',
    css: `
      --bg: #0a0a0a;
      --text: #00ff88;
      --surface: #1a1a1a;
      --surface-alt: #0d0d0d;
      --accent: #ff00ff;
      --accent-text: #000000;
      --border: #00ff88;
      --shadow: #ff00ff;
    `
  },
  retro: {
    name: 'Retro Jukebox',
    css: `
      --bg: #2c1810;
      --text: #f4e4bc;
      --surface: #3d2317;
      --surface-alt: #1a0f0a;
      --accent: #ff6b35;
      --accent-text: #2c1810;
      --border: #8b4513;
      --shadow: rgba(255, 107, 53, 0.3);
    `
  }
};

// Current theme
export const currentTheme = writable('dark');

// Apply theme to document
export function applyTheme(themeName) {
  const theme = themes[themeName];
  if (!theme) {
    console.error('[Theme] Unknown theme:', themeName);
    return;
  }
  
  // Set CSS custom properties on root
  const root = document.documentElement;
  
  // Parse and apply CSS variables
  const css = theme.css;
  const varRegex = /--(\w+):\s*([^;]+);/g;
  let match;
  
  while ((match = varRegex.exec(css)) !== null) {
    const [, prop, value] = match;
    root.style.setProperty(`--${prop}`, value.trim());
  }
  
  // Set data-theme attribute
  root.setAttribute('data-theme', themeName);
  
  // Update store
  currentTheme.set(themeName);
  
  console.log('[Theme] Applied:', themeName);
}

// Initialize theme from settings
export function initTheme(savedTheme) {
  const theme = savedTheme || 'dark';
  applyTheme(theme);
}
