ADR‑02 — Unknown Tracks Management Feature (Drift‑Proof)
🎯 Purpose
Give users a way to clean up “unknown” tracks — files named like:

Code
-unknown-XXXXXXX.mp3
These tracks currently clutter the main library and are meaningless until played.
This feature moves them into a dedicated Unknown Tracks list where the user can edit metadata (title, artist, album, genre).
Once edited, the track automatically leaves the Unknown list and reappears in the main library.

1. Scope — What MUST Be Done
✔ Add a button in Settings
Label: “Manage Unknown Tracks”

Clicking it opens a new page or modal:

Code
/settings/unknown
✔ Create a new Unknown Tracks Page
This page must:

Display ONLY tracks whose filenames match the pattern:

Code
-unknown-*.mp3
Show them in a list identical in style to the main library

Allow full metadata editing:

Title

Artist

Album

Genre

✔ When the user edits a track:
Save metadata to DB

Rename the file if needed

Remove the “unknown” flag

Automatically remove the track from the Unknown list

Automatically add it back to the main library list

✔ Add a DB flag or detection rule
A track is considered “unknown” if:

Its filename matches -unknown-*.mp3  
OR

Its metadata fields are empty (title + artist)

✔ Ensure the main library no longer shows unknown tracks
Unknown tracks must be filtered out of the main library view.

2. Non‑Scope — What MUST NOT Be Changed
❌ No changes to:
Player logic

Queue logic

Audio logic

Virtualisation

Window chrome

Mode switching

Drag regions

TrackRow behaviour

Library layout

❌ No refactors
Only add the new feature.

3. Architecture Requirements
A. Unknown tracks must be identified by a single source of truth
Either:

A DB field isUnknown  
OR

A deterministic filename rule

B. Unknown tracks must be stored in the same DB table
No new tables.

C. Editing metadata must update:
DB record

File metadata (if applicable)

Filename (optional but recommended)

D. Unknown list must update reactively
When a track is edited:

It disappears from Unknown list

It appears in main library list

No reload required

4. UI Requirements
A. Settings Page
Add a new section:

Code
Unknown Tracks
[ Manage Unknown Tracks ]
B. Unknown Tracks Page
Must include:

A list of unknown tracks

A TrackRow-like layout

An edit panel or inline editing UI

Save / Cancel buttons

C. Editing UI
Editable fields:

Title (text input)

Artist (text input)

Album (text input)

Genre (dropdown or text input)

D. After saving:
Track disappears from Unknown list

Track appears in main library

No page refresh

No navigation required

5. Data Flow Requirements
A. Detection
Unknown tracks are identified by:

Code
filename.includes("-unknown-")
OR a DB flag.

B. Editing
When user edits metadata:

Update DB

Optionally rename file

Remove unknown flag

Trigger store update

Remove from Unknown list

Add to main library list

C. Stores
tracks.js must expose:

unknownTracks derived store

knownTracks derived store

D. Filtering
Main library must use knownTracks.

Unknown page must use unknownTracks.

6. Acceptance Criteria — What “Done” Looks Like
✔ Settings page has a “Manage Unknown Tracks” button
✔ Unknown Tracks page shows only unknown tracks
✔ User can edit title/artist/album/genre
✔ Saving removes track from Unknown list
✔ Track appears in main library immediately
✔ No regressions in library UI
✔ No regressions in player/queue
✔ No layout changes to main library
✔ No performance regressions
✔ No changes to unrelated components
7. Developer Notes (Important)
Unknown list uses the same TrackRow component

No new UI frameworks

No redesign of library

No changes to virtualisation

No changes to DB schema unless adding a simple boolean flag

Keep the patch surgical and isolated