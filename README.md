# DigoNode

An AI-powered mind mapping web application. Create, expand, and explore ideas visually with the help of Claude and GPT models.

![React](https://img.shields.io/badge/React-18-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-blue)
![Vite](https://img.shields.io/badge/Vite-5-purple)

## Features

- **AI-Powered Mind Maps** — Generate full mind maps from a topic or pasted text using Claude or GPT
- **Node Expansion** — Select any node and get AI-generated child suggestions
- **AI Chat & Brainstorm** — Iterative ideation through a chat interface with full map context
- **Summarize & Write** — Convert your mind map into prose summaries, essays, or outlines
- **Auto-Connect** — Discover non-obvious connections between nodes
- **Auto-Layout** — Column-based layout engine that organizes nodes by depth
- **Presentation Mode** — Step through your map node-by-node with focused highlighting
- **Focus Mode** — Isolate a subtree to work without distractions
- **Search** — Find nodes across your map instantly
- **Export** — PNG image, JSON, or Markdown outline
- **Dark / Light Theme** — Toggleable with Tailwind's class strategy
- **Microsoft SSO** — Sign in with Microsoft Entra ID (Azure AD)
- **Cloud Persistence** — Maps saved to Neon DB (serverless Postgres)
- **Keyboard-First** — Comprehensive shortcuts for all common actions

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite |
| Canvas | React Flow v11 |
| State | Zustand |
| Styling | Tailwind CSS, Framer Motion |
| Icons | Lucide React |
| AI | Anthropic Claude + OpenAI (user-selectable) |
| Auth | Microsoft Entra ID via MSAL |
| Backend | Express.js (AI proxy + CRUD API) |
| Database | Neon DB (serverless Postgres) |
| Export | html-to-image (PNG), JSON, Markdown |

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- (Optional) A [Neon DB](https://neon.tech) project for cloud persistence
- (Optional) An [Azure App Registration](https://portal.azure.com) for Microsoft SSO

### Installation

```bash
git clone <your-repo-url>
cd DigoNode-v2
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
# Backend
PORT=3001
ANTHROPIC_API_KEY=your_anthropic_key
OPENAI_API_KEY=your_openai_key
SKIP_AUTH=true                          # Set to true for local dev without Microsoft auth
# DATABASE_URL=postgresql://...         # Neon DB connection string (optional)

# Frontend (baked into bundle at build time)
VITE_API_URL=http://localhost:3001
# VITE_AZURE_CLIENT_ID=...             # Required for Microsoft SSO
# VITE_AZURE_TENANT_ID=common          # Required for Microsoft SSO
```

> At minimum, set `PORT`, one AI key (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`), and `SKIP_AUTH=true` to get started locally.

### Running Locally

**Start both frontend and backend together:**

```bash
npm start
```

Or run them separately in two terminals:

```bash
# Terminal 1 — Backend (Express)
npm run server

# Terminal 2 — Frontend (Vite)
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

### Database Setup (Optional)

1. Create a project at [neon.tech](https://neon.tech)
2. Run the contents of `server/schema.sql` in the Neon SQL Editor
3. Add `DATABASE_URL` to your `.env` file

Without a database, the server starts normally but map save/load endpoints return 503.

### Microsoft SSO Setup (Optional)

1. Go to **Azure Portal > Azure Active Directory > App Registrations > New registration**
2. Under **Authentication**, add a **Single-page application (SPA)** platform
3. Set redirect URIs: `http://localhost:5173` (dev) and your production URL
4. Enable **ID tokens** under Implicit grant & hybrid flows
5. Copy the **Application (client) ID** and **Directory (tenant) ID** into your `.env`

> Redirect URIs must be under the **SPA** platform, not Web.

## Project Structure

```
src/
  auth/           Microsoft MSAL auth provider and hooks
  pages/          Route-level page components
  components/
    Canvas/       React Flow canvas and custom node/edge types
    Toolbar/      Top toolbar and floating context toolbar
    Sidebar/      Left (saved maps) and Right (AI tools) sidebars
    AI/           AI chat and suggestions UI
    UI/           Modals, settings, presentation mode, search
  store/          Zustand stores (mindmap, UI, settings)
  services/       API service layers (AI, maps)
  hooks/          Custom React hooks
  types/          TypeScript type definitions
  utils/          Layout engine, export utilities
server/
  index.js        Express server (AI proxy + map CRUD + auth)
  auth.js         JWT verification middleware
  db.js           Neon DB connection pool
  schema.sql      Database DDL
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Tab` | Add child node |
| `Enter` | Add sibling node |
| `Delete` / `Backspace` | Delete selected node |
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Cmd/Ctrl + A` | Select all |
| `Cmd/Ctrl + F` | Search |
| `Cmd/Ctrl + E` | Export |
| `Escape` | Deselect / exit focus mode |
| `F` | Toggle focus mode |
| `1`-`6` | Set node color |
| `Space` (hold) | Pan canvas |
| `Arrow Left/Right` | Navigate in presentation mode |

## Deployment

| Service | Purpose |
|---------|---------|
| [Vercel](https://vercel.com) | Frontend (static SPA) |
| [Railway](https://railway.app) | Backend (Express server) |
| [Neon](https://neon.tech) | Database (serverless Postgres) |

Set `VITE_API_URL` on Vercel to point to your Railway backend URL. Set `FRONTEND_URL` on Railway to your Vercel domain for CORS.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run server` | Start Express backend |
| `npm start` | Start both concurrently |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build locally |

## License

Private project.
