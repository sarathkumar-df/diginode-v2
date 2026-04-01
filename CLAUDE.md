# DigoNode — AI Coding Guide

DigoNode is an AI-powered mind mapping web application built with React, TypeScript, and the Anthropic API. This document defines the rules, conventions, and architecture for AI-assisted development.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Canvas Engine | React Flow v11 (reactflow) |
| State Management | Zustand |
| Styling | Tailwind CSS + custom CSS variables |
| Animation | Framer Motion |
| Icons | Lucide React |
| AI | Anthropic Claude via Express proxy |
| Backend | Express.js (AI proxy only) |

## Project Structure

```
src/
├── components/
│   ├── Canvas/          # React Flow canvas, nodes, edges
│   ├── Toolbar/         # Top toolbar, floating toolbar
│   ├── Sidebar/         # Left panel (maps), Right panel (AI)
│   ├── AI/              # AI chat, suggestions UI
│   └── UI/              # Modals, panels, shared UI
├── store/
│   ├── mindmapStore.ts  # Mind map data (nodes, edges, maps)
│   └── uiStore.ts       # UI state (theme, panels, focus mode)
├── services/
│   └── aiService.ts     # All Anthropic API calls (via proxy)
├── hooks/
│   ├── useMindMap.ts    # Mind map operations
│   ├── useAI.ts         # AI feature hooks
│   └── useKeyboard.ts   # Keyboard shortcuts
├── types/
│   └── index.ts         # All TypeScript types
└── utils/
    ├── layoutEngine.ts  # Auto-layout algorithms
    └── exportUtils.ts   # PNG, JSON export
server/
└── index.js             # Express AI proxy server
```

## Core Conventions

### Component Structure
- All components are functional React components with TypeScript
- Props interfaces are defined inline or imported from `@/types`
- Use named exports, not default exports (except page-level components)
- Component files: PascalCase (e.g., `MindMapNode.tsx`)
- Hook files: camelCase with `use` prefix (e.g., `useMindMap.ts`)

### State Management
- **Mind map data** → `useMindMapStore` (nodes, edges, maps list)
- **UI state** → `useUIStore` (theme, panel visibility, focus mode, selected nodes)
- Never put UI state in mindmapStore or vice versa
- Derive computed values with selectors, don't duplicate state

### Styling Rules
- Use Tailwind utility classes as the primary styling method
- CSS custom properties for theme-dependent values: `var(--node-bg)`, `var(--canvas-bg)`
- Dark mode via `dark:` Tailwind prefix + `class` strategy on `<html>`
- Node colors use the `node.*` Tailwind theme tokens
- Never use inline styles except for dynamic values (positions, transform)

### AI Features Convention
- All AI calls go through `src/services/aiService.ts`
- The service calls `/api/ai/*` endpoints on the Express proxy
- AI responses are always streamed when possible
- Show loading states with the `AIThinkingIndicator` component
- Every AI action is undoable (store action history)

### React Flow Rules
- Custom node types are registered in `MindMapCanvas.tsx` nodeTypes object
- Custom edge types are registered in edgeTypes object
- Node data shape: `{ label, color, icon, shape, checked, collapsed, notes }`
- Never mutate React Flow nodes/edges directly — always go through Zustand store
- Use `useReactFlow()` hook for viewport operations

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

## AI Features

1. **Generate Ideas** — Given a topic, generate mind map structure
2. **Expand Node** — Add AI-generated child nodes to selected node
3. **Summarize Map** — Convert mind map to prose summary
4. **Brainstorm** — Chat interface for iterative ideation
5. **Auto-Connect** — Find non-obvious connections between nodes
6. **Write from Map** — Generate document from mind map structure

All AI prompts include the full mind map context as JSON for coherent responses.

## Adding New Features

When asked to add a new feature:
1. Update types in `src/types/index.ts` first
2. Update the relevant Zustand store
3. Implement the UI component
4. Wire up keyboard shortcut if applicable
5. Add undo/redo support via history in the store
6. Update this CLAUDE.md if the architecture changes

## Do Not

- Do not use class components
- Do not use Redux (use Zustand)
- Do not add global CSS except in `src/index.css`
- Do not call the Anthropic API directly from the frontend (use the Express proxy at `/api/ai`)
- Do not store sensitive data (API keys) in frontend state or localStorage
- Do not add dependencies without checking if an existing one covers the use case
