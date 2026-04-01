import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { config } from 'dotenv'
import { requireAuth } from './auth.js'
import pool from './db.js'
import { Liveblocks } from '@liveblocks/node'

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

// All protected routes require a valid Microsoft JWT.
// In local dev, set SKIP_AUTH=true in .env to bypass auth and inject a dev user.
const authMiddleware = process.env.SKIP_AUTH === 'true'
  ? (req, _res, next) => {
      req.user = { id: 'dev-user', email: 'dev@localhost', name: 'Dev User', tenantId: 'dev' }
      next()
    }
  : requireAuth

// ─── Helper: require DB to be configured ─────────────────────────────────────
function requireDb(res) {
  if (!pool) {
    res.status(503).json({ error: 'Database not configured. Set DATABASE_URL in env vars.' })
    return false
  }
  return true
}

// ─── User Routes ──────────────────────────────────────────────────────────────

// Upsert user from JWT claims — called once on dashboard load to register the user
app.post('/api/users/me', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { id, email, name, tenantId } = req.user
  await pool.query(
    `INSERT INTO users (id, email, name, tenant_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET email = $2, name = $3`,
    [id, email, name ?? '', tenantId ?? '']
  )
  res.json({ ok: true })
}))

// ─── Map Routes ───────────────────────────────────────────────────────────────

// GET /api/maps — list user's maps (metadata only, sorted by last updated)
app.get('/api/maps', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { rows } = await pool.query(
    `SELECT id, title, created_at, updated_at,
            data -> 'nodes' -> 0 -> 'data' ->> 'color' AS root_color
     FROM maps
     WHERE owner_id = $1
     ORDER BY updated_at DESC`,
    [req.user.id]
  )
  res.json(rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    rootColor: r.root_color ?? '#6366f1',
  })))
}))

// POST /api/maps — create a new map (client sends id + initial data)
app.post('/api/maps', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { id, title, data } = req.body
  if (!id || !data) return res.status(400).json({ error: 'id and data are required' })
  await pool.query(
    `INSERT INTO maps (id, owner_id, title, data) VALUES ($1, $2, $3, $4)`,
    [id, req.user.id, title || 'Untitled', JSON.stringify(data)]
  )
  res.json({ ok: true, id })
}))

// GET /api/maps/:id — get a single map with full node/edge data
app.get('/api/maps/:id', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { rows } = await pool.query(
    `SELECT id, title, data, created_at, updated_at
     FROM maps WHERE id = $1 AND owner_id = $2`,
    [req.params.id, req.user.id]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Map not found' })
  const r = rows[0]
  res.json({
    id: r.id,
    title: r.title,
    nodes: r.data.nodes ?? [],
    edges: r.data.edges ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })
}))

// PUT /api/maps/:id — update title and/or data (both optional)
app.put('/api/maps/:id', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { title, data } = req.body

  let query, params
  if (title !== undefined && data !== undefined) {
    query = `UPDATE maps SET title=$1, data=$2, updated_at=NOW() WHERE id=$3 AND owner_id=$4`
    params = [title, JSON.stringify(data), req.params.id, req.user.id]
  } else if (title !== undefined) {
    query = `UPDATE maps SET title=$1, updated_at=NOW() WHERE id=$2 AND owner_id=$3`
    params = [title, req.params.id, req.user.id]
  } else if (data !== undefined) {
    query = `UPDATE maps SET data=$1, updated_at=NOW() WHERE id=$2 AND owner_id=$3`
    params = [JSON.stringify(data), req.params.id, req.user.id]
  } else {
    return res.status(400).json({ error: 'title or data is required' })
  }

  const { rowCount } = await pool.query(query, params)
  if (!rowCount) return res.status(404).json({ error: 'Map not found' })
  res.json({ ok: true })
}))

// DELETE /api/maps/:id — delete a map
app.delete('/api/maps/:id', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  await pool.query(
    `DELETE FROM maps WHERE id = $1 AND owner_id = $2`,
    [req.params.id, req.user.id]
  )
  res.json({ ok: true })
}))

// Test connection
app.post('/api/ai/test-connection', authMiddleware, route(async (req, res) => {
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
app.post('/api/ai/generate-from-text', authMiddleware, route(async (req, res) => {
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
app.post('/api/ai/generate-map', authMiddleware, route(async (req, res) => {
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
app.post('/api/ai/expand-node', authMiddleware, route(async (req, res) => {
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
app.post('/api/ai/summarize', authMiddleware, route(async (req, res) => {
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
app.post('/api/ai/chat', authMiddleware, route(async (req, res) => {
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
app.post('/api/ai/connections', authMiddleware, route(async (req, res) => {
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
app.post('/api/ai/write', authMiddleware, route(async (req, res) => {
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

// ─── Team Routes ──────────────────────────────────────────────────────────────

// GET /api/teams — list teams the current user belongs to
app.get('/api/teams', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { rows } = await pool.query(
    `SELECT t.id, t.name, t.owner_id, t.created_at,
            tm.role,
            (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) AS member_count
     FROM teams t
     JOIN team_members tm ON tm.team_id = t.id
     WHERE tm.user_id = $1
     ORDER BY t.created_at DESC`,
    [req.user.id]
  )
  res.json(rows.map((r) => ({
    id: r.id,
    name: r.name,
    ownerId: r.owner_id,
    role: r.role,
    memberCount: parseInt(r.member_count),
    createdAt: r.created_at,
  })))
}))

// POST /api/teams — create a new team
app.post('/api/teams', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { id, name } = req.body
  if (!id || !name?.trim()) return res.status(400).json({ error: 'id and name are required' })

  // Create team and add creator as owner in one transaction
  await pool.query('BEGIN')
  try {
    await pool.query(
      `INSERT INTO teams (id, name, owner_id) VALUES ($1, $2, $3)`,
      [id, name.trim(), req.user.id]
    )
    await pool.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [id, req.user.id]
    )
    await pool.query('COMMIT')
  } catch (err) {
    await pool.query('ROLLBACK')
    throw err
  }

  res.json({ ok: true, id })
}))

// GET /api/teams/:id — get team details + members
app.get('/api/teams/:id', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return

  // Must be a member to view
  const { rows: memberCheck } = await pool.query(
    `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [req.params.id, req.user.id]
  )
  if (!memberCheck[0]) return res.status(403).json({ error: 'Not a member of this team' })

  const { rows: teamRows } = await pool.query(
    `SELECT id, name, owner_id, created_at FROM teams WHERE id = $1`,
    [req.params.id]
  )
  if (!teamRows[0]) return res.status(404).json({ error: 'Team not found' })

  const { rows: members } = await pool.query(
    `SELECT u.id, u.name, u.email, tm.role, tm.joined_at
     FROM team_members tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = $1
     ORDER BY tm.joined_at ASC`,
    [req.params.id]
  )

  const t = teamRows[0]
  res.json({
    id: t.id,
    name: t.name,
    ownerId: t.owner_id,
    createdAt: t.created_at,
    myRole: memberCheck[0].role,
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      joinedAt: m.joined_at,
    })),
  })
}))

// DELETE /api/teams/:id — delete team (owner only)
app.delete('/api/teams/:id', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { rowCount } = await pool.query(
    `DELETE FROM teams WHERE id = $1 AND owner_id = $2`,
    [req.params.id, req.user.id]
  )
  if (!rowCount) return res.status(403).json({ error: 'Not found or not the owner' })
  res.json({ ok: true })
}))

// DELETE /api/teams/:id/members/:userId — remove a member (owner only, or self-leave)
app.delete('/api/teams/:id/members/:userId', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { id: teamId, userId } = req.params
  const isSelf = userId === req.user.id

  if (!isSelf) {
    // Only owner can remove others
    const { rows } = await pool.query(
      `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
      [teamId, req.user.id]
    )
    if (rows[0]?.role !== 'owner') return res.status(403).json({ error: 'Only the owner can remove members' })
  }

  await pool.query(
    `DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [teamId, userId]
  )
  res.json({ ok: true })
}))

// ─── Invite Routes ────────────────────────────────────────────────────────────

// POST /api/teams/:id/invites — generate an invite link (owner only)
app.post('/api/teams/:id/invites', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return

  // Only owner can create invites
  const { rows } = await pool.query(
    `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [req.params.id, req.user.id]
  )
  if (rows[0]?.role !== 'owner') return res.status(403).json({ error: 'Only the owner can create invites' })

  // Generate token — random UUID, expires in 7 days
  const { v4: uuidv4 } = await import('uuid')
  const token = uuidv4()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  await pool.query(
    `INSERT INTO team_invites (token, team_id, created_by, expires_at) VALUES ($1, $2, $3, $4)`,
    [token, req.params.id, req.user.id, expiresAt]
  )

  res.json({ ok: true, token, expiresAt })
}))

// GET /api/invites/:token — validate an invite token (public — no auth required)
app.get('/api/invites/:token', route(async (req, res) => {
  if (!requireDb(res)) return
  const { rows } = await pool.query(
    `SELECT i.token, i.expires_at, t.id AS team_id, t.name AS team_name,
            (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) AS member_count
     FROM team_invites i
     JOIN teams t ON t.id = i.team_id
     WHERE i.token = $1 AND i.expires_at > NOW()`,
    [req.params.token]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Invite not found or expired' })
  const r = rows[0]
  res.json({
    token: r.token,
    teamId: r.team_id,
    teamName: r.team_name,
    memberCount: parseInt(r.member_count),
    expiresAt: r.expires_at,
  })
}))

// POST /api/invites/:token/accept — accept an invite (auth required)
app.post('/api/invites/:token/accept', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return

  const { rows } = await pool.query(
    `SELECT i.team_id, i.expires_at FROM team_invites i
     WHERE i.token = $1 AND i.expires_at > NOW()`,
    [req.params.token]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Invite not found or expired' })

  const teamId = rows[0].team_id

  // Upsert user (they may not exist in DB yet if coming via invite before dashboard)
  await pool.query(
    `INSERT INTO users (id, email, name, tenant_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET email = $2, name = $3`,
    [req.user.id, req.user.email, req.user.name ?? '', req.user.tenantId ?? '']
  )

  // Add to team (ignore if already a member)
  await pool.query(
    `INSERT INTO team_members (team_id, user_id, role)
     VALUES ($1, $2, 'member')
     ON CONFLICT (team_id, user_id) DO NOTHING`,
    [teamId, req.user.id]
  )

  res.json({ ok: true, teamId })
}))

// ─── Map Sharing Routes ───────────────────────────────────────────────────────

// Helper: check if user has access to a map (owner OR team member with share)
async function getUserMapPermission(mapId, userId) {
  // Owner always has edit
  const { rows: own } = await pool.query(
    `SELECT id FROM maps WHERE id = $1 AND owner_id = $2`,
    [mapId, userId]
  )
  if (own[0]) return 'edit'

  // Check team shares
  const { rows: shared } = await pool.query(
    `SELECT ms.permission
     FROM map_shares ms
     JOIN team_members tm ON tm.team_id = ms.team_id
     WHERE ms.map_id = $1 AND tm.user_id = $2
     ORDER BY CASE ms.permission WHEN 'edit' THEN 0 ELSE 1 END
     LIMIT 1`,
    [mapId, userId]
  )
  return shared[0]?.permission ?? null
}

// GET /api/maps/:id/shares — list teams this map is shared with
app.get('/api/maps/:id/shares', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  // Must be owner
  const { rows: own } = await pool.query(
    `SELECT id FROM maps WHERE id = $1 AND owner_id = $2`,
    [req.params.id, req.user.id]
  )
  if (!own[0]) return res.status(403).json({ error: 'Only the map owner can view shares' })

  const { rows } = await pool.query(
    `SELECT ms.team_id, ms.permission, ms.shared_at, t.name AS team_name
     FROM map_shares ms
     JOIN teams t ON t.id = ms.team_id
     WHERE ms.map_id = $1
     ORDER BY ms.shared_at DESC`,
    [req.params.id]
  )
  res.json(rows.map((r) => ({
    teamId: r.team_id,
    teamName: r.team_name,
    permission: r.permission,
    sharedAt: r.shared_at,
  })))
}))

// POST /api/maps/:id/shares — share map with a team
app.post('/api/maps/:id/shares', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { teamId, permission = 'view' } = req.body
  if (!teamId) return res.status(400).json({ error: 'teamId is required' })
  if (!['view', 'edit'].includes(permission)) return res.status(400).json({ error: 'permission must be view or edit' })

  // Must be map owner
  const { rows: own } = await pool.query(
    `SELECT id FROM maps WHERE id = $1 AND owner_id = $2`,
    [req.params.id, req.user.id]
  )
  if (!own[0]) return res.status(403).json({ error: 'Only the map owner can share it' })

  // Must be a member of the target team
  const { rows: member } = await pool.query(
    `SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [teamId, req.user.id]
  )
  if (!member[0]) return res.status(403).json({ error: 'You must be a member of the team to share with it' })

  await pool.query(
    `INSERT INTO map_shares (map_id, team_id, permission)
     VALUES ($1, $2, $3)
     ON CONFLICT (map_id, team_id) DO UPDATE SET permission = $3`,
    [req.params.id, teamId, permission]
  )
  res.json({ ok: true })
}))

// DELETE /api/maps/:id/shares/:teamId — remove share
app.delete('/api/maps/:id/shares/:teamId', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { rows: own } = await pool.query(
    `SELECT id FROM maps WHERE id = $1 AND owner_id = $2`,
    [req.params.id, req.user.id]
  )
  if (!own[0]) return res.status(403).json({ error: 'Only the map owner can remove shares' })

  await pool.query(
    `DELETE FROM map_shares WHERE map_id = $1 AND team_id = $2`,
    [req.params.id, req.params.teamId]
  )
  res.json({ ok: true })
}))

// GET /api/shared-maps — maps shared with the current user via team membership
app.get('/api/shared-maps', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { rows } = await pool.query(
    `SELECT DISTINCT m.id, m.title, m.updated_at, m.created_at,
            ms.permission,
            m.data -> 'nodes' -> 0 -> 'data' ->> 'color' AS root_color,
            u.name AS owner_name
     FROM map_shares ms
     JOIN maps m ON m.id = ms.map_id
     JOIN team_members tm ON tm.team_id = ms.team_id
     JOIN users u ON u.id = m.owner_id
     WHERE tm.user_id = $1 AND m.owner_id != $1
     ORDER BY m.updated_at DESC`,
    [req.user.id]
  )
  res.json(rows.map((r) => ({
    id: r.id,
    title: r.title,
    permission: r.permission,
    ownerName: r.owner_name,
    rootColor: r.root_color ?? '#6366f1',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })))
}))

// Override GET /api/maps/:id to also allow shared access
// We need to patch the existing handler — instead, re-register it with permission check
// (The original is already defined above; this new one handles shared access)
app.get('/api/maps/:id/shared', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const permission = await getUserMapPermission(req.params.id, req.user.id)
  if (!permission) return res.status(403).json({ error: 'Access denied' })

  const { rows } = await pool.query(
    `SELECT id, title, data, created_at, updated_at FROM maps WHERE id = $1`,
    [req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Map not found' })
  const r = rows[0]
  res.json({
    id: r.id,
    title: r.title,
    nodes: r.data.nodes ?? [],
    edges: r.data.edges ?? [],
    permission,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })
}))

// ─── Global error handler (catches anything that slips through) ───────────────

app.use((err, req, res, _next) => {
  console.error('[express error]', errMsg(err))
  if (!res.headersSent) res.json({ ok: false, error: errMsg(err) })
})

// ─── Liveblocks ───────────────────────────────────────────────────────────────

const PRESENCE_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
]

function userPresenceColor(userId) {
  let hash = 0
  for (const c of userId) hash = ((hash * 31) + c.charCodeAt(0)) >>> 0
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length]
}

const liveblocks = process.env.LIVEBLOCKS_SECRET_KEY
  ? new Liveblocks({ secret: process.env.LIVEBLOCKS_SECRET_KEY })
  : null

// POST /api/liveblocks-auth — issues a Liveblocks session token
// Room IDs are "map-<mapId>". Access mirrors the map permission system.
app.post('/api/liveblocks-auth', authMiddleware, route(async (req, res) => {
  if (!liveblocks) {
    return res.status(503).json({ error: 'Liveblocks not configured (set LIVEBLOCKS_SECRET_KEY)' })
  }

  const { room } = req.body
  if (!room || !room.startsWith('map-')) {
    return res.status(400).json({ error: 'Invalid room id' })
  }

  const mapId = room.replace(/^map-/, '')

  // Check if DB is available; fall back to full access in dev
  let permission = 'edit'
  if (pool) {
    permission = await getUserMapPermission(mapId, req.user.id)
    if (!permission) return res.status(403).json({ error: 'No access to this map' })
  }

  const session = liveblocks.prepareSession(req.user.id, {
    userInfo: {
      name: req.user.name ?? req.user.email ?? 'Anonymous',
      color: userPresenceColor(req.user.id),
    },
  })

  session.allow(room, permission === 'view'
    ? session.READ_ACCESS
    : session.FULL_ACCESS)

  const { status, body } = await session.authorize()
  res.status(status).send(body)
}))

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`DigoNode AI Server → http://localhost:${PORT}`)
  console.log(`Anthropic key: ${process.env.ANTHROPIC_API_KEY ? '✓' : '✗ not set'}`)
  console.log(`OpenAI key:    ${process.env.OPENAI_API_KEY ? '✓' : '✗ not set'}`)
  console.log('Users can supply their own key via the Settings panel.')
})
