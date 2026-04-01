# DigoNode — Setup Guide

## Prerequisites

- Node.js 18+
- An Anthropic API key ([get one here](https://console.anthropic.com))

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure your API key
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# 3. Start both servers
npm start
# → Frontend: http://localhost:5173
# → AI Server: http://localhost:3001
```

## Running Separately

```bash
# Frontend only (no AI features)
npm run dev

# AI proxy server only
npm run server
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | — | Your Anthropic API key |
| `PORT` | No | `3001` | AI server port |
| `FRONTEND_URL` | No | `http://localhost:5173` | CORS origin |

## Features

### Mind Mapping
- **Create nodes** — Double-click the canvas or press Tab on a selected node
- **Edit labels** — Double-click any node to edit inline
- **Delete nodes** — Select and press Backspace/Delete
- **Add children** — Tab key on selected node
- **Add siblings** — Enter key on selected node
- **Drag nodes** — Click and drag to reposition
- **Pan canvas** — Click and drag empty canvas
- **Zoom** — Scroll wheel or pinch

### AI Features (requires API key)
- **Generate Map** — Click the wand icon in toolbar, enter a topic
- **Expand Node** — Select a node, click sparkle button in floating toolbar
- **Brainstorm Chat** — Open AI panel (sparkle icon top right), chat tab
- **Summarize Map** — AI panel → Tools → Summarize
- **Find Connections** — AI panel → Tools → Analyze
- **Write from Map** — AI panel → Tools → Write

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Add child node |
| `Enter` | Add sibling node |
| `Backspace` / `Delete` | Delete node |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` | Redo |
| `Cmd/Ctrl+F` | Search |
| `Cmd/Ctrl+0` | Fit view |
| `F` | Toggle focus mode |
| `Escape` | Deselect / exit focus mode |

### Multiple Maps
- Click the map icon in the toolbar to open the Maps panel
- Create, rename, switch, and delete maps
- All maps are saved automatically in localStorage

### Export
- **JSON** — Full map data for backup/import
- **Markdown** — Outline format for documents
