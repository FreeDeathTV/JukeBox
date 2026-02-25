import { writable, get } from 'svelte/store';

// Duplicate groups store
export const duplicateGroups = writable([]);

// Loading state
export const isDetecting = writable(false);

// Current group being reviewed
export const currentGroup = writable(null);

// Selected tracks for deletion in current group
export const selectedForDeletion = writable([]);

/**
 * Detect duplicates by calling the backend API
 */
export async function detectDuplicates() {
  console.log('[Duplicates Store] Starting duplicate detection...');
  isDetecting.set(true);
  
  try {
    if (typeof window !== 'undefined' && window.duplicatesAPI) {
      const result = await window.duplicatesAPI.detect();
      
      if (result.success) {
        console.log('[Duplicates Store] Found', result.groups.length, 'duplicate groups');
        duplicateGroups.set(result.groups);
        return result.groups;
      } else {
        console.error('[Duplicates Store] Error detecting duplicates:', result.error);
        return [];
      }
    } else {
      console.warn('[Duplicates Store] Duplicates API not available');
      return [];
    }
  } catch (err) {
    console.error('[Duplicates Store] Exception during duplicate detection:', err);
    return [];
  } finally {
    isDetecting.set(false);
  }
}

/**
 * Delete selected tracks
 * @param {Array} trackIds - Array of track IDs to delete
 * @returns {Object} - Result of deletion
 */
export async function deleteSelectedTracks(trackIds) {
  console.log('[Duplicates Store] Deleting tracks:', trackIds.length);
  
  try {
    if (typeof window !== 'undefined' && window.duplicatesAPI) {
      const result = await window.duplicatesAPI.delete(trackIds);
      
      if (result.success) {
        console.log('[Duplicates Store] Successfully deleted', result.deletedCount, 'tracks');
        
        // Remove deleted tracks from the groups
        duplicateGroups.update(groups => {
          return groups.map(group => {
            return {
              ...group,
              tracks: group.tracks.filter(t => !trackIds.includes(t.id))
            };
          }).filter(group => group.tracks.length >= 2);
        });
        
        // Clear selection
        selectedForDeletion.set([]);
        
        return result;
      } else {
        console.error('[Duplicates Store] Error deleting tracks:', result.error);
        return result;
      }
    } else {
      console.warn('[Duplicates Store] Duplicates API not available');
      return { success: false, error: 'API not available' };
    }
  } catch (err) {
    console.error('[Duplicates Store] Exception during deletion:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Mark a group as not duplicates
 * @param {string} groupId - Group ID to mark as not duplicates
 */
export async function markAsNotDuplicate(groupId) {
  console.log('[Duplicates Store] Marking group as not duplicates:', groupId);
  
  try {
    if (typeof window !== 'undefined' && window.duplicatesAPI) {
      const result = await window.duplicatesAPI.markNotDuplicate(groupId);
      
      if (result.success) {
        // Remove the group from the list
        duplicateGroups.update(groups => {
          return groups.filter(g => g.groupId !== groupId);
        });
        
        return result;
      } else {
        console.error('[Duplicates Store] Error marking as not duplicates:', result.error);
        return result;
      }
    } else {
      console.warn('[Duplicates Store] Duplicates API not available');
      return { success: false, error: 'API not available' };
    }
  } catch (err) {
    console.error('[Duplicates Store] Exception:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Set the current group being reviewed
 * @param {Object} group - Group to review
 */
export function setCurrentGroup(group) {
  currentGroup.set(group);
  selectedForDeletion.set([]);
}

/**
 * Toggle track selection for deletion
 * @param {string} trackId - Track ID to toggle
 */
export function toggleTrackSelection(trackId) {
  selectedForDeletion.update(selected => {
    if (selected.includes(trackId)) {
      return selected.filter(id => id !== trackId);
    } else {
      return [...selected, trackId];
    }
  });
}

/**
 * Select all tracks except the best one for deletion
 * @param {Array} tracks - Array of tracks in the group
 * @param {Object} bestTrack - The best track to keep
 */
export function selectAllExceptBest(tracks, bestTrack) {
  const idsToDelete = tracks
    .filter(t => t.id !== bestTrack.id)
    .map(t => t.id);
  
  selectedForDeletion.set(idsToDelete);
}

/**
 * Clear all selections
 */
export function clearSelections() {
  selectedForDeletion.set([]);
  currentGroup.set(null);
}

/**
 * Get total number of duplicate tracks across all groups
 * @returns {number}
 */
export function getTotalDuplicateTracks() {
  const groups = get(duplicateGroups);
  return groups.reduce((total, group) => total + group.tracks.length, 0);
}
