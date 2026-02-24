# Jukebox - Desktop Music Player

A local Windows 10 desktop jukebox application built with Electron + SvelteKit.

## Features

- 🎵 Scan music folders for MP3/WMA files
- 📚 Searchable music library
- ▶️ Audio playback with queue management
- 🎲 Random playlist generation
- ⚙️ Configurable settings
- 🔜 Future: Poker timer integration

## Tech Stack

- **Frontend**: SvelteKit, Vite, Bootstrap
- **Backend/Desktop**: Electron, Node.js
- **Metadata**: music-metadata

## Project Structure

```
jukebox/
├── electron/               # Electron main process
│   ├── main.js            # Main window, IPC handlers
│   ├── preload.js         # Context bridge for renderer
│   ├── scanner/           # Music folder scanner
│   └── settings/          # Configuration storage
├── src/                   # SvelteKit frontend
│   ├── lib/
│   │   ├── components/    # UI components
│   │   └── stores/        # Svelte stores
│   └── routes/            # Pages
├── static/                # Static assets
├── package.json
├── svelte.config.js
└── vite.config.js
```

## Getting Started

### Prerequisites

- Node.js LTS (v18 or higher)
- npm or yarn

### Installation

1. Clone the repository:
   
```
bash
   cd jukebox
   
```

2. Install dependencies:
   
```
bash
   npm install
   
```

### Development

Run the SvelteKit development server:
```
bash
npm run dev
```

In a separate terminal, run Electron:
```
bash
npm run electron
```

### Building

Build the SvelteKit app:
```
bash
npm run build
```

Then run in Electron:
```
bash
npm start
```

## IPC Channels

Communication between Electron and SvelteKit:

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `music:scanFolder` | Svelte → Electron | Open folder dialog |
| `music:scanComplete` | Electron → Svelte | Scan finished |
| `music:metadata` | Electron → Svelte | Track metadata |
| `settings:load` | Svelte → Electron | Load settings |
| `settings:save` | Svelte → Electron | Save settings |
| `player:playFile` | Svelte → Electron | Play audio file |

## Tasks for Junior Dev

### Task 1 - Install and Initialize
- [x] Install Node LTS
- [x] Create SvelteKit project
- [x] Add Electron
- [x] Add Bootstrap
- [x] Add music-metadata

### Task 2 - Create Folder Structure
- [x] Follow the structure above

### Task 3 - Create Skeleton Files
- [x] Empty files with placeholder comments

### Task 4 - Wire Up IPC Channels
- [x] Console log placeholders

### Task 5 - Build and Run
- [ ] Ensure empty app launches in Electron

## Next Steps

1. Implement actual music folder scanning in `electron/scanner/index.js`
2. Implement MP3/WMA metadata reading using music-metadata
3. Connect stores to IPC for real data flow
4. Implement audio playback
5. Add random playlist generation
6. Integrate poker timer (future)

## License

MIT
