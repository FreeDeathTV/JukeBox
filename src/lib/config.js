// Configuration constants for the JukeBox application
// Centralized configuration to improve maintainability and consistency

// Audio playback configuration
export const AUDIO_CONFIG = {
  // Default volume level (0-100)
  DEFAULT_VOLUME: 80,
  
  // Auto-advance delay after track ends (ms)
  AUTO_ADVANCE_DELAY: 100,
  
  // Restart threshold for previous track (seconds)
  PREVIOUS_RESTART_THRESHOLD: 3,
  
  // Progress update interval (ms) - not used currently but good for future
  PROGRESS_UPDATE_INTERVAL: 1000
};

// UI configuration
export const UI_CONFIG = {
  // Mini player drag region height (px)
  MINI_PLAYER_DRAG_HEIGHT: 20,
  
  // Player wrapper padding (px)
  PLAYER_PADDING: 16,
  
  // Track info max width (px)
  TRACK_INFO_MAX_WIDTH: 180,
  
  // Track info min width (px)
  TRACK_INFO_MIN_WIDTH: 160,
  
  // Progress section max width (px)
  PROGRESS_MAX_WIDTH: 300,
  
  // Volume slider width (px)
  VOLUME_SLIDER_WIDTH: 50
};

// Queue configuration
export const QUEUE_CONFIG = {
  // Default start index for playback
  DEFAULT_START_INDEX: 0,
  
  // Initial queue index when empty
  EMPTY_QUEUE_INDEX: -1
};

// Store configuration
export const STORE_CONFIG = {
  // Initial progress value
  INITIAL_PROGRESS: 0,
  
  // Initial duration value
  INITIAL_DURATION: 0,
  
  // Initial current time value
  INITIAL_CURRENT_TIME: 0
};

// Time formatting configuration
export const TIME_CONFIG = {
  // Default time display when invalid
  DEFAULT_TIME_DISPLAY: '0:00',
  
  // Seconds per minute for time formatting
  SECONDS_PER_MINUTE: 60
};