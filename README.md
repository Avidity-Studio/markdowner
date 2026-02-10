# Markdowner

A modern, cross-platform Markdown editor built with Tauri, React, and TypeScript. Features a clean interface with live preview, file operations, dark mode support, and drag-and-drop functionality.

![Markdown Editor Screenshot](./app-icon.png)

## Features

- ✨ **Live Preview** - See your markdown rendered in real-time as you type
- 🌓 **Dark/Light Mode** - Toggle between themes for comfortable editing
- 📁 **File Operations** - Open, edit, and save markdown files with ease
- 🕐 **Recent Files** - Quick access to recently opened files
- 📥 **Drag & Drop** - Open markdown files by dropping them onto the window
- 🏷️ **File Associations** - Open `.md`, `.markdown`, and `.mdx` files directly from your file manager
- 📊 **Status Bar** - Word and character count with save status
- ⚡ **Fast & Lightweight** - Built with Tauri for native performance

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust + Tauri v2
- **Styling**: CSS
- **Markdown Parsing**: Marked
- **Icons**: Lucide React

## Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v18 or later)
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri CLI](https://tauri.app/v2/guides/prerequisites/)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd markdown-editor
```

2. Install dependencies:
```bash
npm install
```

## Development

Run the development server with hot reload:

```bash
npm run dev
```

This will start both the Vite dev server and the Tauri application.

## Building

### Development Build

```bash
npm run build
```

### Production Build

Build the application for production:

```bash
npm run tauri build
```

The compiled application will be available in `src-tauri/target/release/bundle/`.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production (web assets)
- `npm run preview` - Preview production build
- `npm run tauri` - Tauri CLI commands
- `npm run tauri build` - Build desktop application

## Project Structure

```
markdown-editor/
├── src/                    # React frontend source
│   ├── components/         # React components
│   │   ├── ThemeToggle.tsx
│   │   └── ThemeToggle.css
│   ├── App.tsx            # Main application component
│   ├── App.css            # Application styles
│   ├── main.tsx           # Entry point
│   └── assets/            # Static assets
├── src-tauri/             # Rust/Tauri backend
│   ├── src/
│   │   ├── main.rs        # Application entry point
│   │   └── lib.rs         # Tauri commands and handlers
│   ├── Cargo.toml         # Rust dependencies
│   ├── tauri.conf.json    # Tauri configuration
│   └── icons/             # Application icons
├── public/                # Public assets
├── index.html             # HTML entry point
├── package.json           # Node.js dependencies
├── vite.config.ts         # Vite configuration
└── tsconfig.json          # TypeScript configuration
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + O` | Open file |
| `Cmd/Ctrl + S` | Save file |
| `Cmd/Ctrl + N` | New file |

## Supported File Formats

- `.md` - Markdown files
- `.markdown` - Markdown files
- `.mdx` - MDX (Markdown + JSX) files

## Platform Support

- **macOS** - Full support with dock integration
- **Windows** - Full support
- **Linux** - Full support

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built with [Tauri](https://tauri.app/)
- UI powered by [React](https://react.dev/)
- Icons by [Lucide](https://lucide.dev/)
- Markdown parsing by [Marked](https://marked.js.org/)

---

<p align="center">Made with ❤️ using Tauri + React</p>
