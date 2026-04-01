Investigate and fix the following React Flow canvas issue in DigoNode:

$ARGUMENTS

Debugging approach:
1. Read `src/components/Canvas/MindMapCanvas.tsx` for the main canvas setup
2. Check `src/components/Canvas/MindMapNode.tsx` for the custom node component
3. Check `src/store/mindmapStore.ts` for state management
4. Look at `src/utils/layoutEngine.ts` for layout issues
5. Check React Flow docs patterns — never mutate nodes/edges directly
6. Fix the root cause, not symptoms

Common React Flow pitfalls:
- Nodes/edges must be passed as controlled state
- Use `useCallback` for onNodesChange, onEdgesChange, onConnect
- Custom node event handlers need `useCallback` to prevent re-renders
- Position changes require updating Zustand store AND calling setNodes
