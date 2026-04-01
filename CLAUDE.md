# DigoNode — AI Coding Guide

DigoNode is an AI-powered mind mapping web application built with React, TypeScript, and the Anthropic API. This document defines the rules, conventions, and architecture for AI-assisted development.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Canvas Engine | React Flow v11 (reactflow) |
| State Management | Zustand with `persist` middleware |
| Styling | Tailwind CSS + custom CSS variables |
| Animation | Framer Motion |
| Icons | Lucide React |
| AI | Anthropic Claude + OpenAI (user-selectable) via Express proxy |
| Auth | Microsoft Entra ID (Azure AD) via MSAL — `@azure/msal-react` frontend, `jwks-rsa` + `jsonwebtoken` backend |
| Routing | React Router v6 (`react-router-dom`) |
| Backend | Express.js (AI proxy + auth middleware) |
| Export | html-to-image (PNG), native JSON/Markdown |

## Project Structure

```
src/
├── auth/
│   ├── msalConfig.ts    # MSAL PublicClientApplication config + loginRequest scopes
│   └── AuthProvider.tsx # MsalProvider wrapper, useCurrentUser(), useGetToken() hooks
├── pages/
│   ├── SignInPage.tsx   # Public: Microsoft SSO sign-in screen
│   ├── Dashboard.tsx    # Protected: map grid, new map button, nav
│   ├── MapPage.tsx      # Protected: full canvas view (previously App.tsx content)
│   ├── TeamsPage.tsx    # Protected: teams management (Phase 3 stub)
│   └── InvitePage.tsx   # Public: team invite acceptance flow
├── components/
│   ├── Canvas/          # React Flow canvas, nodes, edges
│   │   └── MindMapCanvas.tsx   # nodeTypes, edgeTypes, fitView logic
│   ├── Toolbar/
│   │   ├── TopToolbar.tsx      # Top bar with labels, tooltips, export dropdown
│   │   └── FloatingToolbar.tsx # Context toolbar on node select
│   ├── Sidebar/
│   │   ├── LeftSidebar.tsx     # Saved maps list
│   │   └── RightSidebar.tsx    # AI tools panel (tabs: Tools / Chat)
│   ├── AI/              # AI chat, suggestions UI
│   └── UI/
│       ├── GenerateMapModal.tsx  # Generate from topic or pasted text
│       ├── SettingsModal.tsx     # AI provider + API key config
│       ├── PresentationMode.tsx  # Presentation overlay + controls
│       ├── SearchPanel.tsx
│       └── FocusMode.tsx
├── store/
│   ├── mindmapStore.ts  # Mind map data (nodes, edges, maps, layoutVersion)
│   ├── uiStore.ts       # UI state (theme, panels, focus mode, presentation mode)
│   └── settingsStore.ts # AI provider, model, API key (persisted)
├── services/
│   └── aiService.ts     # All AI API calls (via proxy), uses VITE_API_URL + JWT auth
├── hooks/
│   ├── useMindMap.ts    # Mind map operations
│   ├── useAI.ts         # AI feature hooks (fetchExpandSuggestions, addSuggestionNode, etc.)
│   └── useKeyboard.ts   # Keyboard shortcuts
├── types/
│   └── index.ts         # All TypeScript types
├── utils/
│   ├── layoutEngine.ts  # Auto-layout algorithms
│   └── exportUtils.ts   # PNG (html-to-image), JSON, Markdown export
└── vite-env.d.ts        # Vite env type declarations (required for import.meta.env)
server/
├── index.js             # Express server — AI proxy with auth middleware on all routes
└── auth.js              # requireAuth middleware — Microsoft JWT verification via jwks-rsa
railway.toml             # Railway deploy config (startCommand = node server/index.js)
vercel.json              # SPA rewrite rule — routes all paths to index.html
```

## Core Conventions

### Component Structure
- All components are functional React components with TypeScript
- Props interfaces are defined inline or imported from `@/types`
- Use named exports, not default exports (except page-level components)
- Component files: PascalCase (e.g., `MindMapNode.tsx`)
- Hook files: camelCase with `use` prefix (e.g., `useMindMap.ts`)

### State Management
- **Mind map data** → `useMindMapStore` (nodes, edges, maps list, layoutVersion)
- **UI state** → `useUIStore` (theme, panel visibility, focus mode, presentation mode, selected nodes)
- **Settings** → `useSettingsStore` (provider, model, apiKey — persisted to localStorage)
- Never put UI state in mindmapStore or vice versa
- Derive computed values with selectors, don't duplicate state
- `layoutVersion` counter: increment in store to signal `MindMapCanvas` to run fitView after auto-layout (node count doesn't change during layout so a separate counter is needed)

### Styling Rules
- Use Tailwind utility classes as the primary styling method
- CSS custom properties for theme-dependent values: `var(--node-bg)`, `var(--canvas-bg)`
- Dark mode via `dark:` Tailwind prefix + `class` strategy on `<html>`
- Node colors use the `node.*` Tailwind theme tokens
- Never use inline styles except for dynamic values (positions, transform)
- No gradients in panels — single `var(--brand)` accent only (Linear/Notion aesthetic)

### AI Features Convention
- All AI calls go through `src/services/aiService.ts`
- The service calls `/api/ai/*` endpoints on the Express proxy
- `API_BASE` is built from `VITE_API_URL` env var: `(import.meta.env.VITE_API_URL ?? '') + '/api/ai'`
- **Every fetch in the frontend that calls `/api/ai/*` must use `API_BASE`, never a hardcoded relative path** — relative paths break in production (Vercel has no backend)
- AI responses are always streamed when possible
- Show loading states with the `AIThinkingIndicator` component
- Every AI action is undoable (store action history)
- AI node expansion returns suggestions as a list — user adds them individually via `addSuggestionNode()` or all at once via `addAllSuggestions()`

### React Flow Rules
- Custom node types are registered in `MindMapCanvas.tsx` nodeTypes object
- Custom edge types are registered in edgeTypes object
- Node data shape: `{ label, color, icon, shape, checked, collapsed, notes }`
- Never mutate React Flow nodes/edges directly — always go through Zustand store
- Use `useReactFlow()` hook for viewport operations
- fitView is deferred 50ms with setTimeout after node additions so React Flow finishes positioning first

### Auto-Layout (Column-Based)
- Root node is at x=0; each depth level is at `x = depth * H_GAP` (H_GAP=230 for level 1, 190 deeper)
- Y positions are distributed based on subtree height, not radial angles
- `autoLayout()` in mindmapStore uses DFS, calls `subtreeHeight()` recursively, then `assign()` to place nodes
- After `autoLayout()`, `layoutVersion` is incremented → `MindMapCanvas` watches it and calls `fitView`
- `addAINodes()` snaps new nodes to the same X column as existing siblings

### Presentation Mode
- Entered via `enterPresentationMode(order: string[])` in uiStore
- `order` is built by DFS traversal in `TopToolbar.handlePresentationMode`
- `MindMapCanvas` watches `presentationIndex` and calls `fitView` to the current node
- Non-current nodes are dimmed via the existing `.mindmap-node.focused-out` CSS class
- `AnimatePresence` in `PresentationMode.tsx` requires a **single keyed `motion` element** as direct child — not a React fragment (fragments swallow animations)

### Lucide Icon Naming Conflicts
- `Map` is both a Lucide icon and a JS built-in constructor
- Always import the Lucide map icon as `Map as MapIcon` to avoid shadowing the built-in `Map`

### File Naming
```
Components:     PascalCase.tsx         (MindMapNode.tsx)
Hooks:          camelCase.ts           (useMindMap.ts)
Stores:         camelCase + Store.ts   (mindmapStore.ts)
Services:       camelCase + Service.ts (aiService.ts)
Utils:          camelCase.ts           (layoutEngine.ts)
Types:          index.ts in types/
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Tab | Add child node to selected |
| Enter | Add sibling node |
| Backspace/Delete | Delete selected node |
| Cmd/Ctrl+Z | Undo |
| Cmd/Ctrl+Shift+Z | Redo |
| Cmd/Ctrl+A | Select all |
| Cmd/Ctrl+F | Search |
| Cmd/Ctrl+E | Export |
| Escape | Deselect / exit focus mode |
| Space | Pan canvas (hold) |
| F | Toggle focus mode |
| 1-6 | Set node color |
| ArrowLeft/Right | Presentation mode: prev/next node |

## AI Features

1. **Generate from Topic** — Given a topic, generate full mind map structure (streamed)
2. **Generate from Text** — Paste up to ~4,000 words; AI extracts structure into a mind map (streamed)
3. **Expand Node** — Fetch AI-generated child suggestions; user adds individually or all at once
4. **Summarize Map** — Convert mind map to prose summary (streamed)
5. **Brainstorm / Chat** — Chat interface for iterative ideation with map context
6. **Auto-Connect** — Find non-obvious connections between nodes
7. **Write from Map** — Generate essay, outline, or bullet doc from map structure (streamed)

All AI prompts include the full mind map context as JSON for coherent responses.
Both Anthropic and OpenAI providers are supported; user selects in Settings modal.

## Export Features

- **PNG** — Captures the React Flow canvas via `html-to-image`, excludes controls/minimap/panels, 2x pixel ratio
- **JSON** — Exports nodes + edges as structured JSON file
- **Markdown** — Exports map as indented Markdown outline

## Authentication (Phase 1)

### Flow
1. User visits any protected route → redirected to `/sign-in`
2. User clicks "Continue with Microsoft" → `msalInstance.loginRedirect()` navigates the whole page to Microsoft's login
3. Microsoft authenticates the user and redirects back to `redirectUri` (e.g. `http://localhost:5173`)
4. On return, `AuthProvider` calls `msalInstance.handleRedirectPromise()` which processes the token from the URL hash and sets the active account
5. `useIsAuthenticated()` returns `true` → `SignInPage` useEffect redirects to `/dashboard`
6. Every API call fetches a fresh ID token via `msalInstance.acquireTokenSilent()` and sends it as `Authorization: Bearer <token>`
7. Express `requireAuth` middleware verifies the token signature using Microsoft's public JWKS keys

### Why redirect flow, not popup
`loginPopup()` is blocked by most browsers unless the popup is opened synchronously in a user gesture handler. React's async event handling and StrictMode double-renders both interfere with this. `loginRedirect()` is fully reliable — use it always.

### Key hooks / exports
- `useCurrentUser()` — returns `{ id, name, email, tenantId }` or `null` if not signed in
- `useGetToken()` — returns an async function that gets a fresh ID token (for direct fetch calls outside aiService)
- `useIsAuthenticated()` — from `@azure/msal-react`, used in ProtectedRoute and SignInPage
- `msalInstance` — exported singleton, used directly in SignInPage and aiService to avoid hook timing issues

### AuthProvider initialization
`AuthProvider` calls `msalInstance.initialize()` then `handleRedirectPromise()` before rendering children. This is **required** — rendering `MsalProvider` before `initialize()` resolves causes `interaction_in_progress` errors. The app renders `null` until ready.

### Azure App Registration setup (required)
1. Azure Portal → Azure Active Directory → App Registrations → New registration
2. Under **Authentication** → Add a platform → **Single-page application (SPA)**
3. Set Redirect URIs: `http://localhost:5173` (dev) + `https://your-vercel-app.vercel.app` (prod)
   - Must be under **SPA** platform, not Web — Web platform does not support MSAL browser redirect flow
4. Enable **ID tokens** under Implicit grant & hybrid flows
5. Copy **Application (client) ID** → `VITE_AZURE_CLIENT_ID` + `AZURE_CLIENT_ID`
6. Copy **Directory (tenant) ID** → `VITE_AZURE_TENANT_ID` + `AZURE_TENANT_ID`

### Environment variables for auth
**Railway (backend):**
```
AZURE_CLIENT_ID=...
AZURE_TENANT_ID=common   # or your specific tenant GUID
SKIP_AUTH=true           # local dev only — bypasses JWT check
```

**Vercel (frontend, build-time):**
```
VITE_AZURE_CLIENT_ID=...
VITE_AZURE_TENANT_ID=common
```

### Auth middleware in Express
- `server/auth.js` exports `requireAuth` — applied to all `/api/ai/*` routes
- In local dev: set `SKIP_AUTH=true` in `.env` to bypass JWT verification
- `req.user` is set to `{ id, email, name, tenantId }` on every authenticated request
- The `/api/health` endpoint is intentionally public (no auth required)

## Deployment

| Service | Purpose | Config |
|---------|---------|--------|
| Railway | Express backend (AI proxy) | `railway.toml` sets `startCommand = node server/index.js` |
| Vercel | React frontend (static) | Set `VITE_API_URL` env var to Railway backend URL |

### Environment Variables

**Railway (backend):**
```
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
PORT=3001
FRONTEND_URL=https://your-vercel-app.vercel.app
AZURE_CLIENT_ID=...
AZURE_TENANT_ID=common
```

**Vercel (frontend build-time):**
```
VITE_API_URL=https://your-railway-app.up.railway.app
VITE_AZURE_CLIENT_ID=...
VITE_AZURE_TENANT_ID=common
```

> `VITE_` variables are baked into the bundle at build time. After adding/changing them in Vercel, you must trigger a new deployment for changes to take effect.

### Key Deployment Rules
- Railway must run `node server/index.js` only — `npm start` also starts Vite dev server which breaks the deploy
- The Railway domain port must match `PORT` env var (set `PORT=3001` in Railway variables)
- Never use hardcoded relative `/api/ai/...` URLs in the frontend — always use `API_BASE` from `aiService.ts`
- `FRONTEND_URL` on Railway must match the exact Vercel domain for CORS to work

## Adding New Features

When asked to add a new feature:
1. Update types in `src/types/index.ts` first
2. Update the relevant Zustand store
3. Implement the UI component
4. Wire up keyboard shortcut if applicable
5. Add undo/redo support via history in the store
6. If the feature makes AI calls, add the endpoint to `server/index.js` and the service function to `aiService.ts`
7. Update this CLAUDE.md if the architecture changes

## Do Not

- Do not use class components
- Do not use Redux (use Zustand)
- Do not add global CSS except in `src/index.css`
- Do not call the Anthropic/OpenAI API directly from the frontend (use the Express proxy at `/api/ai`)
- Do not set `SKIP_AUTH=true` in production — it disables all authentication on the backend
- Do not store the MSAL token in Zustand or any persistent state — always fetch via `acquireTokenSilent()`
- Do not use `loginPopup()` — use `loginRedirect()` only. Popups are blocked by browsers and fail silently with React StrictMode
- Do not render `MsalProvider` before `msalInstance.initialize()` resolves — always wait in `AuthProvider` or you will get `interaction_in_progress` errors
- Do not register redirect URIs under the "Web" platform in Azure — must be under "Single-page application (SPA)"
- Do not use hardcoded relative paths like `/api/ai/...` in the frontend — use `API_BASE` from aiService or build it from `import.meta.env.VITE_API_URL`
- Do not store sensitive data (API keys) in frontend state or localStorage beyond what `settingsStore` (persisted Zustand) already handles
- Do not add dependencies without checking if an existing one covers the use case
- Do not wrap `AnimatePresence` children in a React fragment — always use a single keyed `motion.*` element as the direct child
