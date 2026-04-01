import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { config } from 'dotenv'

config()

const app = express()
const PORT = process.env.PORT || 3001
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

app.use(cors({ origin: FRONTEND_URL }))
app.use(express.json({ limit: '2mb' }))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function errMsg(err) {
  return err instanceof Error ? err.message : String(err)
}

function getAnthropicClient(apiKey) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('No Anthropic API key configured. Add one in Settings.')
  return new Anthropic({ apiKey: key })
}

function getOpenAIClient(apiKey) {
  const key = apiKey || process.env.OPENAI_API_KEY
  if (!key) throw new Error('No OpenAI API key configured. Add one in Settings.')
  return new OpenAI({ apiKey: key })
}

function resolveModel(provider, model) {
  if (model) return model
  return provider === 'openai' ? 'gpt-4o' : 'claude-opus-4-6'
}

function aiConfig(req) {
  return {
    provider: req.body.provider || 'anthropic',
    apiKey: req.body.apiKey || '',
    model: req.body.model || '',
  }
}

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function setupSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
}

function emitChunk(res, text) {
  if (text) res.write(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { text } })}\n\n`)
}

// ─── Provider calls ───────────────────────────────────────────────────────────

// Non-streaming: returns text string
async function callAI({ provider, apiKey, model, system, messages, max_tokens, temperature }) {
  const mdl = resolveModel(provider, model)
  if (provider === 'openai') {
    const client = getOpenAIClient(apiKey)
    const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages
    const res = await client.chat.completions.create({ model: mdl, messages: msgs, max_tokens, temperature, stream: false })
    return res.choices[0]?.message?.content ?? ''
  } else {
    const client = getAnthropicClient(apiKey)
    const params = { model: mdl, max_tokens, messages, temperature }
    if (system) params.system = system
    const msg = await client.messages.create(params)
    return msg.content[0]?.type === 'text' ? msg.content[0].text : ''
  }
}

// Streaming: pipes chunks to res via SSE
// Caller must wrap in try-catch and NOT have sent headers yet
async function streamToRes(res, { provider, apiKey, model, system, messages, max_tokens, temperature }) {
  const mdl = resolveModel(provider, model)
  setupSSE(res)
  try {
    if (provider === 'openai') {
      const client = getOpenAIClient(apiKey)
      const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages
      const stream = await client.chat.completions.create({ model: mdl, messages: msgs, max_tokens, temperature, stream: true })
      for await (const chunk of stream) {
        emitChunk(res, chunk.choices[0]?.delta?.content ?? '')
      }
    } else {
      const client = getAnthropicClient(apiKey)
      const params = { model: mdl, max_tokens, messages, temperature }
      if (system) params.system = system
      const stream = client.messages.stream(params)
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.text) {
          emitChunk(res, event.delta.text)
        }
      }
    }
    res.write('data: [DONE]\n\n')
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: errMsg(err) })}\n\n`)
  }
  res.end()
}

// ─── Context formatter ────────────────────────────────────────────────────────

function formatMapContext(mapContext) {
  if (!mapContext) return 'No mind map context provided.'
  const lines = [`Mind Map: "${mapContext.title}"`, `Nodes (${mapContext.nodes.length} total):`]
  mapContext.nodes.forEach((node) => {
    const indent = '  '.repeat(node.level ?? 0)
    const check = node.checked !== undefined ? (node.checked ? '[x] ' : '[ ] ') : ''
    lines.push(`${indent}${check}${node.label} (id: ${node.id})`)
  })
  return lines.join('\n')
}

// ─── Route wrapper ────────────────────────────────────────────────────────────
// Wraps async route handlers so unhandled errors always return JSON, never 500 HTML

function route(fn) {
  return async (req, res) => {
    try {
      await fn(req, res)
    } catch (err) {
      console.error('[route error]', errMsg(err))
      if (!res.headersSent) {
        res.json({ ok: false, error: errMsg(err) })
      }
    }
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

// Test connection
app.post('/api/ai/test-connection', route(async (req, res) => {
  const { provider, apiKey, model } = aiConfig(req)
  console.log(`[test-connection] provider=${provider} model=${resolveModel(provider, model)}`)
  const text = await callAI({
    provider, apiKey,
    model: resolveModel(provider, model),
    messages: [{ role: 'user', content: 'Say: ok' }],
    max_tokens: 16,
    temperature: 0,
  })
  res.json({ ok: true, response: text.trim() })
}))

// 0. Generate mind map from pasted text (streaming)
app.post('/api/ai/generate-from-text', route(async (req, res) => {
  const { text } = req.body
  if (!text) return res.status(400).json({ error: 'text is required' })
  const { provider, apiKey, model } = aiConfig(req)
  await streamToRes(res, {
    provider, apiKey, model,
    max_tokens: 2048,
    temperature: 0.5,
    messages: [{
      role: 'user',
      content: `Analyze the following content and create a structured mind map that captures all key ideas, themes, and relationships.

Content:
"""
${text.slice(0, 6000)}
"""

Output a JSON object with this exact structure:
{
  "title": "concise descriptive title",
  "nodes": [
    {
      "label": "main theme",
      "icon": "relevant emoji",
      "color": "#hexcolor",
      "children": [
        { "label": "sub-point", "icon": "emoji", "children": [] }
      ]
    }
  ]
}

Colors for main branches: #FF6B6B, #FF9F43, #FECA57, #1DD1A1, #54A0FF, #5F27CD
Create 4-6 main branches, each with 2-4 children. Output ONLY the JSON.`,
    }],
  })
}))

// 1. Generate mind map from topic (streaming)
app.post('/api/ai/generate-map', route(async (req, res) => {
  const { topic } = req.body
  if (!topic) return res.status(400).json({ error: 'topic is required' })
  const { provider, apiKey, model } = aiConfig(req)
  await streamToRes(res, {
    provider, apiKey, model,
    max_tokens: 2048,
    temperature: 0.7,
    messages: [{
      role: 'user',
      content: `Create a detailed mind map structure for the topic: "${topic}"

Output a JSON object with this exact structure:
{
  "title": "topic name",
  "nodes": [
    {
      "label": "main branch",
      "icon": "emoji",
      "color": "#hexcolor",
      "children": [
        { "label": "sub-topic", "icon": "emoji", "children": [] }
      ]
    }
  ]
}

Use these colors for branches: #FF6B6B, #FF9F43, #FECA57, #1DD1A1, #54A0FF, #5F27CD
Create 4-6 main branches, each with 3-5 children. Output ONLY the JSON, no explanation.`,
    }],
  })
}))

// 2. Expand node
app.post('/api/ai/expand-node', route(async (req, res) => {
  const { nodeLabel, mapContext, count = 5 } = req.body
  if (!nodeLabel) return res.status(400).json({ error: 'nodeLabel is required' })
  const { provider, apiKey, model } = aiConfig(req)
  const text = await callAI({
    provider, apiKey, model,
    max_tokens: 512,
    temperature: 0.8,
    messages: [{
      role: 'user',
      content: `<mindmap>\n${formatMapContext(mapContext)}\n</mindmap>\n\nGenerate ${count} child node ideas for the node labeled: "${nodeLabel}"\n\nReturn ONLY a JSON array:\n[\n  { "label": "idea 1", "icon": "emoji" }\n]\nNo explanation, just JSON.`,
    }],
  })
  const match = text.match(/\[[\s\S]*\]/)
  res.json(match ? JSON.parse(match[0]) : [])
}))

// 3. Summarize (streaming)
app.post('/api/ai/summarize', route(async (req, res) => {
  const { mapContext } = req.body
  if (!mapContext) return res.status(400).json({ error: 'mapContext is required' })
  const { provider, apiKey, model } = aiConfig(req)
  await streamToRes(res, {
    provider, apiKey, model,
    max_tokens: 1024,
    temperature: 0.5,
    messages: [{
      role: 'user',
      content: `<mindmap>\n${formatMapContext(mapContext)}\n</mindmap>\n\nWrite a clear, concise summary in 2-4 paragraphs. Write in flowing prose, not as a list.`,
    }],
  })
}))

// 4. Brainstorm chat (streaming)
app.post('/api/ai/chat', route(async (req, res) => {
  const { userMessage, mapContext, history = [] } = req.body
  if (!userMessage) return res.status(400).json({ error: 'userMessage is required' })
  const { provider, apiKey, model } = aiConfig(req)
  const system = `You are an AI assistant helping the user brainstorm and develop their mind map.\n\nCurrent mind map:\n${formatMapContext(mapContext)}\n\nWhen suggesting nodes to add, format as:\n**Add to "[parent node]":** idea 1, idea 2\n\nKeep responses concise and actionable.`
  await streamToRes(res, {
    provider, apiKey, model,
    system,
    messages: [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ],
    max_tokens: 1024,
    temperature: 0.7,
  })
}))

// 5. Find connections
app.post('/api/ai/connections', route(async (req, res) => {
  const { mapContext } = req.body
  if (!mapContext) return res.status(400).json({ error: 'mapContext is required' })
  const { provider, apiKey, model } = aiConfig(req)
  const text = await callAI({
    provider, apiKey, model,
    max_tokens: 512,
    temperature: 0.6,
    messages: [{
      role: 'user',
      content: `<mindmap>\n${formatMapContext(mapContext)}\n</mindmap>\n\nIdentify 3-5 non-obvious connections between nodes NOT already connected.\n\nReturn ONLY a JSON array:\n[\n  { "sourceId": "id", "targetId": "id", "reason": "explanation" }\n]\nUse exact node ids. No explanation, just JSON.`,
    }],
  })
  const match = text.match(/\[[\s\S]*\]/)
  res.json(match ? JSON.parse(match[0]) : [])
}))

// 6. Write from map (streaming)
app.post('/api/ai/write', route(async (req, res) => {
  const { mapContext, format = 'essay' } = req.body
  if (!mapContext) return res.status(400).json({ error: 'mapContext is required' })
  const { provider, apiKey, model } = aiConfig(req)
  const instructions = {
    essay: 'Write a well-structured essay with introduction, body paragraphs for each main theme, and conclusion.',
    outline: 'Create a detailed outline with headers and sub-points.',
    bullets: 'Create a comprehensive bullet-point summary.',
  }
  await streamToRes(res, {
    provider, apiKey, model,
    max_tokens: 2048,
    temperature: 0.6,
    messages: [{
      role: 'user',
      content: `<mindmap>\n${formatMapContext(mapContext)}\n</mindmap>\n\n${instructions[format] || instructions.essay}\n\nUse the mind map structure as your content guide.`,
    }],
  })
}))

// ─── Global error handler (catches anything that slips through) ───────────────

app.use((err, req, res, _next) => {
  console.error('[express error]', errMsg(err))
  if (!res.headersSent) res.json({ ok: false, error: errMsg(err) })
})

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`DigoNode AI Server → http://localhost:${PORT}`)
  console.log(`Anthropic key: ${process.env.ANTHROPIC_API_KEY ? '✓' : '✗ not set'}`)
  console.log(`OpenAI key:    ${process.env.OPENAI_API_KEY ? '✓' : '✗ not set'}`)
  console.log('Users can supply their own key via the Settings panel.')
})
