# ADR-03 Implementation - File Tag Writing Strategy

## Tasks:
- [x] 1. Analyze codebase and understand current metadata flow
- [x] 2. Create electron/fileTagWriter.cjs - New module for safe file tag writing
- [x] 3. Update electron/metadataMerger.cjs - Integrate fileTagWriter into applyMetadata()
- [x] 4. Update package.json - Add required dependencies (node-id3)
- [ ] 5. Install dependencies and test the implementation

## ADR-03 Requirements Implemented:
- ✅ Write metadata only after explicit user approval
- ✅ Write only: title, artist, album, year, genre (artwork is future ADR)
- ✅ Preserve all other tags
- ✅ Never rename files
- ✅ Never modify audio data
- ✅ Validate write success by re-reading
- ✅ Error handling: never corrupt files - if write fails, DB is not updated

## Supported Formats:
- ✅ MP3 (ID3v2.3/ID3v2.4) - using node-id3
- ✅ FLAC (Vorbis Comments) - using ffmpeg
- ✅ WAV (INFO tags) - using ffmpeg
- ✅ M4A/AAC (iTunes atoms) - using ffmpeg

## Fields Allowed to Write:
- title
- artist
- album
- year
- genre

## Fields That Must Never Be Touched:
- track number, disc number
- comments, lyrics
- replaygain, custom tags
- MusicBrainz IDs
- file name, file path
- audio data
