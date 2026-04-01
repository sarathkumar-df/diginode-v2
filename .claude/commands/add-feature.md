Analyze the request and implement the following new feature for DigoNode:

$ARGUMENTS

Steps to follow:
1. Check `src/types/index.ts` for existing types — extend if needed
2. Update the relevant Zustand store (`mindmapStore.ts` or `uiStore.ts`)
3. Implement the UI component in the appropriate `src/components/` subdirectory
4. Add any new AI endpoint to `server/index.js` and `src/services/aiService.ts`
5. Wire up keyboard shortcut in `src/hooks/useKeyboard.ts` if applicable
6. Ensure dark mode works with the new component
7. Test that undo/redo still works

Do not add placeholder or stub code — implement the feature fully.
