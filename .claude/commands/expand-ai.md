Design and implement an AI-powered feature for DigoNode:

$ARGUMENTS

Follow this process:
1. Define the user story: what does the user see/do/get?
2. Design the prompt: what context does Claude need? What output format?
3. Implement the server endpoint in `server/index.js`
4. Implement the frontend service call in `src/services/aiService.ts`
5. Build the UI in `src/components/AI/`
6. Add streaming support if the response can be long
7. Handle errors gracefully (rate limits, network failures)

Always use the mind map's current state as context in AI prompts.
