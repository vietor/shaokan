# Shaokan (少看)

A lightweight desktop Markdown viewer for local files, built with Tauri 2, React 19 and TypeScript.

Open a folder, pick a `.md` file, and read it with rendered diagrams, syntax-highlighted code, in-document search, and a document outline.

## Features

- Browses `.md` / `.markdown` files in a directory (files only, non-recursive, sorted by name); starts in the user's `Documents` folder
- Sidebar with two tabs:
  - **Files** — file list with active-file highlighting, directory refresh, and back-to-home
  - **Outline** — heading list that follows the current scroll position; can be filtered, keeping matching headings and their ancestors
- Sidebar is resizable (280–560 px) and collapsible
- In-document search (case-insensitive): `Ctrl+F` focuses the search box, `Enter` / `Shift+Enter` jump to the next / previous match, `Esc` clears. A `current/total` match counter is shown
- Font size adjustment (12–22 px, default 15 px) with increase / decrease / reset, persisted in `localStorage`
- Theme: light / dark / system, cycled from the toolbar and persisted; the system theme is tracked live, and the saved theme and font size are applied before first paint
- Code blocks get a language label and a copy button; tables scroll horizontally when too wide
- Diagram rendering in fenced code blocks:
  - `mermaid` — rendered with Mermaid 12 (dark/light theme aware)
  - `plantuml` — rendered with `@plantuml/core`, loading `viz-global.js` on demand
- Anchor links (`#...`) scroll inside the document; relative `.md` links open the target file in the app; external links (`http(s)`, `mailto`, `tel`) open via the system opener
- UI localized in English, Simplified Chinese and Traditional Chinese, auto-detected from the system language
- The window title shows the file currently open

## Tech Stack

- Tauri 2 (Rust backend) with `tauri-plugin-opener`
- React 19, TypeScript 5.8, Vite 7
- markdown-it 15, highlight.js 11
- Mermaid 12, @plantuml/core

## Requirements

- Node.js with pnpm
- Rust (stable) with the Tauri 2 platform prerequisites (e.g. WebView2 and MSVC build tools on Windows)

## Development

```sh
pnpm install
pnpm tauri dev
```

The Vite dev server runs on port 1420 (`strictPort`) and is watched by the Tauri app; `src-tauri` is excluded from Vite's file watching.

## Build

```sh
pnpm tauri build
```

Produces platform installers under `src-tauri/target/release/bundle/` — for example, on Windows x64: `Shaokan_0.1.0_x64-setup.exe` (NSIS) and `Shaokan_0.1.0_x64_en-US.msi` (MSI).

## Project Layout

```
index.html                     Entry HTML; applies the saved theme/font size before first paint
src/
  main.tsx                     React entry point
  App.tsx                      Application state: directory, file, search, theme, layout
  markdown.ts                  markdown-it configuration; Mermaid/PlantUML rendering; slugify
  i18n.ts                      Localization (en, zh-Hans, zh-Hant) and locale detection
  types.ts                     Shared types (MdFile, OutlineItem, ThemeMode)
  components/
    Sidebar.tsx                File list / outline tabs and the sidebar resizer
    Toolbar.tsx                Search box, font size controls, theme toggle, sidebar toggle
    ContentView.tsx            Rendered document and error banner
src-tauri/
  src/lib.rs                   Tauri commands and app setup
  tauri.conf.json              App, window and bundle configuration
  capabilities/default.json    Window permissions
```

## Backend Commands

| Command | Description |
| --- | --- |
| `list_md_files(dir)` | Lists `.md` / `.markdown` files directly in `dir`, sorted case-insensitively by name |
| `read_md_file(path)` | Reads a file as UTF-8 text |
| `get_home_dir()` | Returns the default start directory: the user's Documents folder (via the platform's known-folder API), falling back to the home directory |
