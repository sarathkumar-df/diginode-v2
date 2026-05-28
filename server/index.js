import dns from 'dns'
dns.setDefaultResultOrder('ipv4first')

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
  return provider === 'openai' ? 'gpt-4o-mini' : 'claude-sonnet-4-6'
}

function aiConfig(req) {
  return {
    provider: req.body.provider || 'anthropic',
    apiKey: req.body.apiKey || '',
    model: req.body.model || '',
    advisor: req.body.advisor || null,
  }
}

// Prepend the active advisor's framing to an endpoint's instruction.
// Format clauses in the original instruction (Add-to markers, JSON-only output,
// etc.) stay at the end so they win over any persona-induced rambling.
// `advisor` is the curated Advisor record sent by the client (frontend resolves
// id → systemFragment from src/data/advisors.ts before sending).
function withAdvisor(instruction, advisor) {
  if (!advisor) return instruction
  const fragment = advisor.custom
    ? sanitizeCustomFragment(advisor.systemFragment)
    : advisor.systemFragment
  if (!fragment) return instruction
  const role = advisor.custom
    ? sanitizeRoleLabel(advisor.role || advisor.label)
    : (advisor.role || advisor.label)
  const lens =
    `You are advising the user as ${role}. ` +
    `${fragment} ` +
    `Apply this lens to your judgment, examples, vocabulary, and what you flag — but always obey any output-format rules in the instructions below.`
  return `${lens}\n\n${instruction}`
}

// Strip out the obvious prompt-injection footguns from user-authored advisor
// text. We're not trying to win an adversarial battle here — just keep an
// honest user from accidentally writing something the model treats as a new
// instruction. Length capped at 600 chars; newlines collapsed; common
// "ignore previous instructions" patterns removed line-by-line.
const INJECTION_PATTERNS = [
  /\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(previous|prior|above|all|the|your)\b[^.\n]{0,40}\b(instructions?|rules?|prompts?|context)\b/gi,
  /\b(you\s+are\s+now|act\s+as|pretend\s+to\s+be|roleplay\s+as)\b[^.\n]{0,80}/gi,
  /\bsystem\s*[:>]/gi,
  /<\s*\/?\s*(system|instructions?|prompt)\s*>/gi,
]

function sanitizeCustomFragment(text) {
  if (typeof text !== 'string') return ''
  let cleaned = text.replace(/[\r\n]+/g, ' ').trim()
  for (const pattern of INJECTION_PATTERNS) cleaned = cleaned.replace(pattern, '')
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim()
  if (cleaned.length > 600) cleaned = cleaned.slice(0, 600).trim() + '…'
  return cleaned
}

function sanitizeRoleLabel(text) {
  if (typeof text !== 'string') return ''
  let cleaned = text.replace(/[\r\n]+/g, ' ').trim()
  for (const pattern of INJECTION_PATTERNS) cleaned = cleaned.replace(pattern, '')
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim()
  if (cleaned.length > 120) cleaned = cleaned.slice(0, 120).trim() + '…'
  return cleaned
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

// Flatten a system value (string | Anthropic block array) to a single string for OpenAI.
function systemToString(system) {
  if (!system) return null
  if (typeof system === 'string') return system
  return system.map((b) => b.text ?? '').filter(Boolean).join('\n\n')
}

// Build a system value for an AI call. When `mapContext` is provided, the map
// section is wrapped in a cache_control block for Anthropic so repeated calls
// within ~5 min pay a large discount on the shared context tokens.
// For OpenAI, this flattens to a plain string (OpenAI caches automatically).
// Pass { includeIds: true } only for endpoints that require id-keyed output;
// otherwise ids pollute the model's prose responses.
function buildSystem(instruction, mapContext, opts = {}) {
  if (!mapContext) return instruction
  const mapBlock = `<mindmap>\n${formatMapContext(mapContext, opts)}\n</mindmap>`
  return [
    { type: 'text', text: instruction },
    { type: 'text', text: mapBlock, cache_control: { type: 'ephemeral' } },
  ]
}

// Non-streaming: returns text string
async function callAI({ provider, apiKey, model, system, messages, max_tokens, temperature }) {
  const mdl = resolveModel(provider, model)
  if (provider === 'openai') {
    const sysStr = systemToString(system)
    const client = getOpenAIClient(apiKey)
    const msgs = sysStr ? [{ role: 'system', content: sysStr }, ...messages] : messages
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

// Structured JSON output — uses Anthropic tool_use or OpenAI json_schema.
// Both providers are forced to return a JSON payload matching `schema`, which
// removes the regex-parse fragility of asking the model to "return only JSON".
// `toolName` is Anthropic-side (tool name); OpenAI uses it as the schema name.
async function callAIJSON({
  provider, apiKey, model, system, messages, max_tokens, temperature,
  toolName, toolDescription, schema,
}) {
  const mdl = resolveModel(provider, model)

  if (provider === 'openai') {
    const sysStr = systemToString(system)
    const client = getOpenAIClient(apiKey)
    const msgs = sysStr ? [{ role: 'system', content: sysStr }, ...messages] : messages
    const res = await client.chat.completions.create({
      model: mdl,
      messages: msgs,
      max_tokens,
      temperature,
      response_format: {
        type: 'json_schema',
        json_schema: { name: toolName, schema, strict: false },
      },
    })
    const content = res.choices[0]?.message?.content ?? ''
    if (!content) throw new Error('Empty response from model')
    return JSON.parse(content)
  }

  const client = getAnthropicClient(apiKey)
  const params = {
    model: mdl,
    max_tokens,
    messages,
    temperature,
    tools: [{ name: toolName, description: toolDescription, input_schema: schema }],
    tool_choice: { type: 'tool', name: toolName },
  }
  if (system) params.system = system
  const msg = await client.messages.create(params)
  const toolUse = msg.content.find((b) => b.type === 'tool_use')
  if (!toolUse) throw new Error('Model did not return a structured response')
  return toolUse.input
}

// Stream a single provider call into res via SSE chunks. Does not set up SSE
// headers, write [DONE], or end the response — callers handle the SSE lifecycle.
// Used by streamToRes (one-shot) and the /debate endpoint (loops over advisors).
async function streamOneCallToRes(res, { provider, apiKey, model, system, messages, max_tokens, temperature }) {
  const mdl = resolveModel(provider, model)
  if (provider === 'openai') {
    const sysStr = systemToString(system)
    const client = getOpenAIClient(apiKey)
    const msgs = sysStr ? [{ role: 'system', content: sysStr }, ...messages] : messages
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
}

// Streaming: pipes chunks to res via SSE
// Caller must wrap in try-catch and NOT have sent headers yet
async function streamToRes(res, opts) {
  setupSSE(res)
  try {
    await streamOneCallToRes(res, opts)
    res.write('data: [DONE]\n\n')
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: errMsg(err) })}\n\n`)
  }
  res.end()
}

// ─── JSON schemas for structured outputs ─────────────────────────────────────

const SUGGESTION_ARRAY_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Concise idea label, 2-6 words' },
          icon: { type: 'string', description: 'Single emoji representing the idea' },
        },
        required: ['label'],
      },
    },
  },
  required: ['suggestions'],
}

const ADVISOR_SUGGESTIONS_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The exact advisor id from the provided list' },
          reason: { type: 'string', description: 'One-line explanation of why this advisor fits' },
        },
        required: ['id', 'reason'],
      },
    },
  },
  required: ['suggestions'],
}

const CONNECTIONS_SCHEMA = {
  type: 'object',
  properties: {
    connections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sourceId: { type: 'string', description: 'Exact id of an existing node' },
          targetId: { type: 'string', description: 'Exact id of an existing node' },
          reason: { type: 'string', description: 'Short explanation of the connection' },
        },
        required: ['sourceId', 'targetId', 'reason'],
      },
    },
  },
  required: ['connections'],
}

const GENERATED_MAP_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          icon: { type: 'string' },
          color: { type: 'string' },
          children: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                icon: { type: 'string' },
                children: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string' },
                      icon: { type: 'string' },
                    },
                    required: ['label'],
                  },
                },
              },
              required: ['label'],
            },
          },
        },
        required: ['label'],
      },
    },
  },
  required: ['title', 'nodes'],
}

const FLOW_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['process', 'decision', 'label', 'group', 'bulletList', 'swimlane'] },
          label: { type: 'string' },
          subtitle: { type: 'string' },
          color: { type: 'string' },
          layer: { type: 'number' },
          column: { type: 'number' },
          parentId: { type: ['string', 'null'] },
          items: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'type', 'label', 'layer', 'column'],
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          target: { type: 'string' },
          label: { type: 'string' },
          edgeStyle: { type: 'string', enum: ['solid', 'dashed'] },
          bidirectional: { type: 'boolean' },
        },
        required: ['source', 'target'],
      },
    },
  },
  required: ['title', 'nodes', 'edges'],
}

// ─── Context formatter ────────────────────────────────────────────────────────

// Serialize the map for an AI prompt. IDs are excluded by default — the model
// only needs them for endpoints that return id-keyed output (find-connections),
// and including them otherwise pollutes responses because the model echoes ids
// back inside its analysis prose.
function formatMapContext(mapContext, { includeIds = false } = {}) {
  if (!mapContext) return 'No mind map context provided.'

  const nodes = mapContext.nodes ?? []
  const edges = mapContext.edges ?? []

  // Build children map for quick lookup during cross-link detection below
  const parentOf = new Map()
  nodes.forEach((n) => (n.children ?? []).forEach((childId) => parentOf.set(childId, n.id)))

  const lines = [
    `Mind Map: "${mapContext.title}"`,
    `Nodes (${nodes.length} total):`,
  ]

  // Render the tree (indented by level) with inline notes
  nodes.forEach((node) => {
    const indent = '  '.repeat(node.level ?? 0)
    const check = node.checked !== undefined ? (node.checked ? '[x] ' : '[ ] ') : ''
    const idTag = includeIds ? ` (id: ${node.id})` : ''
    lines.push(`${indent}${check}${node.label}${idTag}`)
    if (node.notes?.trim()) {
      // Collapse whitespace so multi-line notes stay on one line per node
      const oneLine = node.notes.trim().replace(/\s+/g, ' ')
      lines.push(`${indent}  note: ${oneLine}`)
    }
  })

  // Render cross-links — edges that don't already correspond to the tree's
  // parent→child relationship. These are the signal-rich connections users have
  // drawn manually and would otherwise be invisible to the AI.
  const crossLinks = edges.filter((e) => parentOf.get(e.target) !== e.source)
  if (crossLinks.length > 0) {
    const labelOf = new Map(nodes.map((n) => [n.id, n.label]))
    lines.push('', `Cross-links (${crossLinks.length}):`)
    crossLinks.forEach((e) => {
      const src = labelOf.get(e.source) ?? e.source
      const tgt = labelOf.get(e.target) ?? e.target
      lines.push(`- "${src}" → "${tgt}"`)
    })
  }

  return lines.join('\n')
}

// ─── Route wrapper ────────────────────────────────────────────────────────────
// Wraps async route handlers so unhandled errors always return JSON, never 500 HTML

function route(fn) {
  return async (req, res) => {
    try {
      await fn(req, res)
    } catch (err) {
          console.error('[route error]', err.stack || err)
      if (!res.headersSent) {
                res.status(500).json({ ok: false, error: errMsg(err) })

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

// GET /api/users — list users in the same tenant as the caller (excluding self)
app.get('/api/users', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { rows } = await pool.query(
    `SELECT id, name, email
     FROM users
     WHERE tenant_id = $1 AND id <> $2
     ORDER BY name ASC NULLS LAST, email ASC`,
    [req.user.tenantId ?? '', req.user.id]
  )
  res.json(rows)
}))

// ─── Map Routes ───────────────────────────────────────────────────────────────

// GET /api/maps — list user's maps (metadata only, sorted by last updated)
app.get('/api/maps', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { rows } = await pool.query(
    `SELECT id, title, created_at, updated_at, thumbnail,
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
    thumbnail: r.thumbnail ?? null,
  })))
}))

// POST /api/maps — create a new map (client sends id + initial data)
app.post('/api/maps', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { id, title, data, advisor } = req.body
  if (!id || !data) return res.status(400).json({ error: 'id and data are required' })
  await pool.query(
    `INSERT INTO maps (id, owner_id, title, data, advisor) VALUES ($1, $2, $3, $4, $5)`,
    [id, req.user.id, title || 'Untitled', JSON.stringify(data), advisor ? JSON.stringify(advisor) : null]
  )
  res.json({ ok: true, id })
}))

// GET /api/maps/:id — get a single map with full node/edge data
app.get('/api/maps/:id', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { rows } = await pool.query(
    `SELECT id, title, data, advisor, created_at, updated_at
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
    chatHistory: r.data.chatHistory ?? [],
    advisor: r.advisor ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })
}))

// POST /api/maps/:id/duplicate — clone a map owned by the current user
app.post('/api/maps/:id/duplicate', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { rows } = await pool.query(
    `SELECT title, data FROM maps WHERE id = $1 AND owner_id = $2`,
    [req.params.id, req.user.id]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Map not found' })
  const { v4: uuidv4 } = await import('uuid')
  const newId = uuidv4()
  const newTitle = `Copy of ${rows[0].title}`
  await pool.query(
    `INSERT INTO maps (id, owner_id, title, data) VALUES ($1, $2, $3, $4)`,
    [newId, req.user.id, newTitle, JSON.stringify(rows[0].data)]
  )
  res.json({ id: newId, title: newTitle })
}))

// PUT /api/maps/:id — update title, data, and/or thumbnail (all optional)
// When data changes, auto-snapshots a version (throttled: max 1 per 5 minutes).
app.put('/api/maps/:id', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { title, data, thumbnail, advisor } = req.body

  const sets = []
  const params = []
  let i = 1
  if (title !== undefined)     { sets.push(`title=$${i++}`)     ; params.push(title) }
  if (data !== undefined)      { sets.push(`data=$${i++}`)      ; params.push(JSON.stringify(data)) }
  if (thumbnail !== undefined) { sets.push(`thumbnail=$${i++}`) ; params.push(thumbnail) }
  if (advisor !== undefined)   { sets.push(`advisor=$${i++}`)   ; params.push(advisor === null ? null : JSON.stringify(advisor)) }

  if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' })

  sets.push('updated_at=NOW()')
  params.push(req.params.id, req.user.id)
  const query = `UPDATE maps SET ${sets.join(', ')} WHERE id=$${i++} AND owner_id=$${i++}`

  const { rowCount } = await pool.query(query, params)
  if (!rowCount) return res.status(404).json({ error: 'Map not found' })

  // Auto-snapshot when data changes (throttled: 1 version per 5 minutes max)
  if (data !== undefined) {
    const { v4: uuidv4 } = await import('uuid')
    const mapId = req.params.id
    const nodes = data.nodes ?? []
    const edges = data.edges ?? []

    // Check time of last version
    const { rows: recent } = await pool.query(
      `SELECT created_at FROM map_versions WHERE map_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [mapId]
    )
    const lastVersionAge = recent[0]
      ? Date.now() - new Date(recent[0].created_at).getTime()
      : Infinity

    if (lastVersionAge > 5 * 60 * 1000) {
      const versionId = uuidv4()
      await pool.query(
        `INSERT INTO map_versions (id, map_id, node_count, edge_count, data)
         VALUES ($1, $2, $3, $4, $5)`,
        [versionId, mapId, nodes.length, edges.length, JSON.stringify({ nodes, edges })]
      )
      // Prune: keep only the 30 most recent versions
      await pool.query(
        `DELETE FROM map_versions WHERE map_id = $1 AND id NOT IN (
           SELECT id FROM map_versions WHERE map_id = $1
           ORDER BY created_at DESC LIMIT 30
         )`,
        [mapId]
      )
    }
  }

  res.json({ ok: true })
}))

// GET /api/maps/:id/versions — list version history (metadata only, newest first)
app.get('/api/maps/:id/versions', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const mapId = req.params.id

  // Verify access (owner or shared)
  const permission = await getUserMapPermission(mapId, req.user.id)
  const { rows: owned } = await pool.query(
    `SELECT id FROM maps WHERE id = $1 AND owner_id = $2`, [mapId, req.user.id]
  )
  if (!owned[0] && !permission) return res.status(403).json({ error: 'No access' })

  const { rows } = await pool.query(
    `SELECT id, map_id, node_count, edge_count, created_at
     FROM map_versions WHERE map_id = $1 ORDER BY created_at DESC`,
    [mapId]
  )
  res.json(rows.map((r) => ({
    id: r.id,
    mapId: r.map_id,
    nodeCount: r.node_count,
    edgeCount: r.edge_count,
    createdAt: r.created_at,
  })))
}))

// POST /api/maps/:id/versions/:versionId/restore — restore a version (owner only)
app.post('/api/maps/:id/versions/:versionId/restore', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { id: mapId, versionId } = req.params

  // Only the owner can restore
  const { rows: owned } = await pool.query(
    `SELECT id FROM maps WHERE id = $1 AND owner_id = $2`, [mapId, req.user.id]
  )
  if (!owned[0]) return res.status(403).json({ error: 'Only the map owner can restore versions' })

  // Fetch the version data
  const { rows: ver } = await pool.query(
    `SELECT data, node_count, edge_count FROM map_versions WHERE id = $1 AND map_id = $2`,
    [versionId, mapId]
  )
  if (!ver[0]) return res.status(404).json({ error: 'Version not found' })

  // Snapshot current state before overwriting (so restore is itself undoable)
  const { rows: current } = await pool.query(`SELECT data FROM maps WHERE id = $1`, [mapId])
  if (current[0]) {
    const { v4: uuidv4 } = await import('uuid')
    const curData = current[0].data
    const curNodes = curData.nodes ?? []
    const curEdges = curData.edges ?? []
    await pool.query(
      `INSERT INTO map_versions (id, map_id, node_count, edge_count, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [uuidv4(), mapId, curNodes.length, curEdges.length, JSON.stringify({ nodes: curNodes, edges: curEdges })]
    )
  }

  // Apply the restored version
  await pool.query(
    `UPDATE maps SET data = $1, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(ver[0].data), mapId]
  )

  const restoredData = ver[0].data
  res.json({
    nodes: restoredData.nodes ?? [],
    edges: restoredData.edges ?? [],
  })
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

// ─── Flow CRUD ──────────────────────────────────────────────────────────────

// GET /api/maps/:mapId/flows — list flows for a map (metadata only)
app.get('/api/maps/:mapId/flows', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const mapId = req.params.mapId

  // Must be owner or have shared access
  const permission = await getUserMapPermission(mapId, req.user.id)
  if (!permission) return res.status(403).json({ error: 'No access to this map' })

  const { rows } = await pool.query(
    `SELECT id, map_id, title, parent_flow_id, created_at, updated_at
     FROM flows WHERE map_id = $1 ORDER BY updated_at DESC`,
    [mapId]
  )
  res.json(rows.map((r) => ({
    id: r.id,
    mapId: r.map_id,
    title: r.title,
    parentFlowId: r.parent_flow_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })))
}))

// POST /api/maps/:mapId/flows — create a new flow
app.post('/api/maps/:mapId/flows', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const mapId = req.params.mapId

  // Must own the map to create flows
  const { rows: own } = await pool.query(
    `SELECT id FROM maps WHERE id = $1 AND owner_id = $2`, [mapId, req.user.id]
  )
  if (!own[0]) return res.status(403).json({ error: 'Only the map owner can create flows' })

  const { id, title, parentFlowId, data } = req.body
  if (!id) return res.status(400).json({ error: 'id is required' })

  await pool.query(
    `INSERT INTO flows (id, map_id, title, parent_flow_id, data)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, mapId, title || 'Untitled Flow', parentFlowId || null, JSON.stringify(data || { nodes: [], edges: [] })]
  )
  res.json({ ok: true, id })
}))

// GET /api/maps/:mapId/flows/:flowId — get full flow data
app.get('/api/maps/:mapId/flows/:flowId', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { mapId, flowId } = req.params

  const permission = await getUserMapPermission(mapId, req.user.id)
  if (!permission) return res.status(403).json({ error: 'No access to this map' })

  const { rows } = await pool.query(
    `SELECT id, map_id, title, parent_flow_id, data, created_at, updated_at
     FROM flows WHERE id = $1 AND map_id = $2`,
    [flowId, mapId]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Flow not found' })
  const r = rows[0]
  res.json({
    id: r.id,
    mapId: r.map_id,
    title: r.title,
    parentFlowId: r.parent_flow_id,
    nodes: r.data.nodes ?? [],
    edges: r.data.edges ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })
}))

// PUT /api/maps/:mapId/flows/:flowId — update flow title and/or data
app.put('/api/maps/:mapId/flows/:flowId', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { mapId, flowId } = req.params

  const { rows: own } = await pool.query(
    `SELECT id FROM maps WHERE id = $1 AND owner_id = $2`, [mapId, req.user.id]
  )
  if (!own[0]) return res.status(403).json({ error: 'Only the map owner can edit flows' })

  const { title, data } = req.body
  const sets = []
  const params = []
  let i = 1
  if (title !== undefined) { sets.push(`title=$${i++}`); params.push(title) }
  if (data !== undefined)  { sets.push(`data=$${i++}`);  params.push(JSON.stringify(data)) }
  if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' })

  sets.push('updated_at=NOW()')
  params.push(flowId, mapId)
  const query = `UPDATE flows SET ${sets.join(', ')} WHERE id=$${i++} AND map_id=$${i++}`
  const { rowCount } = await pool.query(query, params)
  if (!rowCount) return res.status(404).json({ error: 'Flow not found' })
  res.json({ ok: true })
}))

// DELETE /api/maps/:mapId/flows/:flowId — delete a flow
app.delete('/api/maps/:mapId/flows/:flowId', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { mapId, flowId } = req.params

  const { rows: own } = await pool.query(
    `SELECT id FROM maps WHERE id = $1 AND owner_id = $2`, [mapId, req.user.id]
  )
  if (!own[0]) return res.status(403).json({ error: 'Only the map owner can delete flows' })

  await pool.query(`DELETE FROM flows WHERE id = $1 AND map_id = $2`, [flowId, mapId])
  res.json({ ok: true })
}))

// ─── Generate Flow Diagram from Mind Map ─────────────────────────────────────

app.post('/api/ai/generate-flow', authMiddleware, route(async (req, res) => {
  const { mapContext } = req.body
  if (!mapContext) return res.status(400).json({ error: 'mapContext is required' })
  const { provider, apiKey, model, advisor } = aiConfig(req)

  const parsed = await callAIJSON({
    provider, apiKey, model,
    max_tokens: 4096,
    temperature: 0.5,
    system: buildSystem(
      withAdvisor('You are an expert business analyst and process flow designer. You extract entities, processes, systems, and relationships from mind maps and organize them into structured 4-layer swimlane flow diagrams.', advisor),
      mapContext,
    ),
    toolName: 'return_flow_diagram',
    toolDescription: 'Return the structured flow diagram with swimlanes, content nodes, and edges.',
    schema: FLOW_SCHEMA,
    messages: [{
      role: 'user',
      content: `Analyze the mind map in the system context and organize its content into a 4-layer swimlane flow diagram.

The flow diagram has exactly 4 FIXED layers (swimlanes). You MUST create these 4 swimlane nodes and place all content nodes into the appropriate layer:

LAYER 0 — "Capture Layer": Where data enters the system. POS systems, forms, intake tools, data collection points, client-facing inputs, CRM entry points.
LAYER 1 — "Core System": Central business systems that process and store data. ERP, accounting software, databases, payment gateways, backend platforms.
LAYER 2 — "Reporting & Finance": Outputs, dashboards, financial reports, analytics tools, compliance reporting, invoicing, reconciliation.
LAYER 3 — "Manual Workaround Layer": Manual processes, spreadsheets, workarounds, human-dependent steps, pain points, things that should be automated.

Analyze the mind map content and categorize each entity/process into the correct layer based on its function, NOT its name.

MANDATORY swimlane nodes — you MUST include ALL 4, even if a layer has no content:
- { "id": "lane-capture", "type": "swimlane", "label": "CAPTURE LAYER", "layer": 0, "column": 0 }
- { "id": "lane-core", "type": "swimlane", "label": "CORE SYSTEM", "layer": 1, "column": 0 }
- { "id": "lane-reporting", "type": "swimlane", "label": "REPORTING & FINANCE", "layer": 2, "column": 0 }
- { "id": "lane-manual", "type": "swimlane", "label": "MANUAL WORKAROUND LAYER", "layer": 3, "column": 0 }
Do NOT set width/height on swimlanes — the frontend calculates these automatically.

Content node types:
- "process": Individual systems, tools, or entities (e.g., "Store POS", "SAP B1", "PowerBI"). When inside a group, set "parentId" to the group's id.
- "group": A container box holding related child nodes (e.g., "Legal Entities" containing "Oxygen Digital" and "SSQ"). Do NOT set width/height — auto-calculated. Child nodes set "parentId" to this group's id.
- "decision": Decision points or conditional paths (diamond shape).
- "bulletList": A node with a header and bullet point items. Set the "items" array. Best for manual workarounds, requirements, pain points.
- "label": Simple text label for annotations. Use sparingly.

CRITICAL layout rules:
- Every content node (process, group, bulletList, decision) MUST have "layer" set to 0, 1, 2, or 3
- "column" is the LEFT-TO-RIGHT position within a layer. Start at 0. Each top-level node in a layer gets the next column number (0, 1, 2, 3...)
- Nodes inside a group: set "parentId" to group id. Their "column" is the position WITHIN the group (0, 1, 2...)
- Groups and their children must be in the SAME layer
- Do NOT put more than 4-5 top-level nodes in one layer — split into groups if needed
- Assign colors by meaning: blue (#3B82F6) for systems, green (#10B981) for working processes, orange (#F59E0B) for integrations/gateways, purple (#8B5CF6) for reporting, red (#EF4444) for manual/problematic areas, slate (#475569) for groups
- Extract client-specific terminology directly (company names, system names, tool names)
- Create meaningful connections between layers showing data/process flow. Use dashed edges for weak/pending integrations
- Use bulletList nodes in layer 3 (Manual Workaround) to list manual steps and pain points
- Aim for 10-20 content nodes total, using a mix of node types for visual richness`,
    }],
  })

  res.json(parsed)
}))

// Test connection
app.post('/api/ai/test-connection', authMiddleware, route(async (req, res) => {
  const { provider, apiKey, model, advisor } = aiConfig(req)
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

// Suggest advisors for a new map. The client sends the catalog so the server
// stays stateless — adding/removing curated advisors does not require a deploy.
// Returns 3 ids ranked by fit, each with a one-line "why this fits" reason.
app.post('/api/ai/suggest-advisors', authMiddleware, route(async (req, res) => {
  const { title, text, catalog } = req.body
  if (!title || typeof title !== 'string') return res.status(400).json({ error: 'title is required' })
  if (!Array.isArray(catalog) || catalog.length === 0) {
    return res.status(400).json({ error: 'catalog is required (non-empty array)' })
  }
  const { provider, apiKey, model } = aiConfig(req)

  const catalogList = catalog
    .map((a) => `- id: ${a.id} | ${a.label}: ${a.blurb || a.role || ''}`)
    .join('\n')

  const userContent = `The user is starting a new mind map.

Title: "${title}"
${text ? `\nSeed text:\n"""\n${String(text).slice(0, 2000)}\n"""\n` : ''}
Pick the 3 advisors from this catalog whose lens would be most useful for this map.

Catalog:
${catalogList}

Use the exact id from the catalog. Each reason should be one short sentence (under 20 words) about why this advisor would help on THIS specific topic — no generic platitudes.`

  const result = await callAIJSON({
    provider, apiKey, model,
    max_tokens: 384,
    temperature: 0.4,
    system: 'You match users to advisors. You read the topic and recommend the lenses that would actually be useful, not generic ones.',
    messages: [{ role: 'user', content: userContent }],
    toolName: 'return_advisor_suggestions',
    toolDescription: 'Return the top 3 advisors from the catalog ranked by fit.',
    schema: ADVISOR_SUGGESTIONS_SCHEMA,
  })

  // Validate ids belong to the catalog so a hallucinated id can't break the UI.
  const validIds = new Set(catalog.map((a) => a.id))
  const filtered = (result.suggestions ?? []).filter((s) => validIds.has(s.id)).slice(0, 3)
  res.json({ suggestions: filtered })
}))

// 0. Generate mind map from pasted text
app.post('/api/ai/generate-from-text', authMiddleware, route(async (req, res) => {
  const { text } = req.body
  if (!text) return res.status(400).json({ error: 'text is required' })
  const { provider, apiKey, model, advisor } = aiConfig(req)
  const parsed = await callAIJSON({
    provider, apiKey, model,
    max_tokens: 2048,
    temperature: 0.5,
    system: advisor ? withAdvisor('You generate clear, well-structured mind maps from arbitrary content.', advisor) : undefined,
    toolName: 'return_mindmap',
    toolDescription: 'Return the mind map structure extracted from the content.',
    schema: GENERATED_MAP_SCHEMA,
    messages: [{
      role: 'user',
      content: `Analyze the following content and create a structured mind map that captures all key ideas, themes, and relationships. Create 4-6 main branches, each with 2-4 children. Assign each main branch a distinct color from: #FF6B6B, #FF9F43, #FECA57, #1DD1A1, #54A0FF, #5F27CD. Use a relevant emoji per node.

Content:
"""
${text.slice(0, 6000)}
"""`,
    }],
  })
  res.json(parsed)
}))

// 1. Generate mind map from topic
app.post('/api/ai/generate-map', authMiddleware, route(async (req, res) => {
  const { topic } = req.body
  if (!topic) return res.status(400).json({ error: 'topic is required' })
  const { provider, apiKey, model, advisor } = aiConfig(req)
  const parsed = await callAIJSON({
    provider, apiKey, model,
    max_tokens: 2048,
    temperature: 0.7,
    system: advisor ? withAdvisor('You generate clear, well-structured mind maps for the given topic.', advisor) : undefined,
    toolName: 'return_mindmap',
    toolDescription: 'Return the mind map structure for the given topic.',
    schema: GENERATED_MAP_SCHEMA,
    messages: [{
      role: 'user',
      content: `Create a detailed mind map structure for the topic: "${topic}". Create 4-6 main branches, each with 3-5 children. Assign each main branch a distinct color from: #FF6B6B, #FF9F43, #FECA57, #1DD1A1, #54A0FF, #5F27CD. Use a relevant emoji per node.`,
    }],
  })
  res.json(parsed)
}))

// Build the style and exclude clauses shared by both expand endpoints.
// `style` is one of the refinement modes: 'concrete', 'ambitious', or unset.
// `excludeLabels` is the list of already-shown suggestions to avoid repeating.
function buildRefinementClauses(style, excludeLabels) {
  const clauses = []
  if (style === 'concrete') {
    clauses.push('Make suggestions more CONCRETE and specific — each idea should be something the user could act on tomorrow.')
  } else if (style === 'ambitious') {
    clauses.push('Make suggestions BOLDER and more ambitious — push past the obvious; unconventional ideas welcome.')
  }
  if (Array.isArray(excludeLabels) && excludeLabels.length > 0) {
    const list = excludeLabels.map((l) => `"${l}"`).join(', ')
    clauses.push(`Do NOT repeat any of these already-shown ideas: ${list}. Generate genuinely new, different suggestions.`)
  }
  return clauses.length > 0 ? '\n\n' + clauses.join('\n') : ''
}

// 2. Expand node
app.post('/api/ai/expand-node', authMiddleware, route(async (req, res) => {
  const { nodeLabel, mapContext, count = 5, style, excludeLabels } = req.body
  if (!nodeLabel) return res.status(400).json({ error: 'nodeLabel is required' })
  const { provider, apiKey, model, advisor } = aiConfig(req)
  const refine = buildRefinementClauses(style, excludeLabels)
  const result = await callAIJSON({
    provider, apiKey, model,
    max_tokens: 512,
    temperature: style === 'ambitious' ? 1.0 : 0.8,
    system: buildSystem(
      withAdvisor('You are a brainstorming partner helping the user develop their mind map. Use the map context to stay coherent with the user\'s thinking.', advisor),
      mapContext,
    ),
    messages: [{
      role: 'user',
      content: `Generate ${count} child node ideas for the node labeled "${nodeLabel}". Each idea should be concrete, concise (2-6 words), and non-redundant with existing children.${refine}`,
    }],
    toolName: 'return_suggestions',
    toolDescription: 'Return the list of suggested child nodes for the target node.',
    schema: SUGGESTION_ARRAY_SCHEMA,
  })
  res.json(result.suggestions ?? [])
}))

// 2b. Expand node with user-supplied intent/prompt
app.post('/api/ai/expand-node-with-prompt', authMiddleware, route(async (req, res) => {
  const { nodeLabel, userPrompt, mapContext, count = 5, style, excludeLabels } = req.body
  if (!nodeLabel) return res.status(400).json({ error: 'nodeLabel is required' })
  if (!userPrompt?.trim()) return res.status(400).json({ error: 'userPrompt is required' })
  const { provider, apiKey, model, advisor } = aiConfig(req)
  const refine = buildRefinementClauses(style, excludeLabels)
  const result = await callAIJSON({
    provider, apiKey, model,
    max_tokens: 512,
    temperature: style === 'ambitious' ? 1.0 : 0.8,
    system: buildSystem(
      withAdvisor('You are a brainstorming partner helping the user develop their mind map. Use the map context to stay coherent with the user\'s thinking.', advisor),
      mapContext,
    ),
    messages: [{
      role: 'user',
      content: `The user is focused on the node labeled "${nodeLabel}" and has this specific ask:\n\n"${userPrompt.trim()}"\n\nGenerate exactly ${count} child node ideas that directly address the user's ask while staying coherent with the surrounding map. Each idea should be concrete, concise (2-6 words), and add real value — no filler.${refine}`,
    }],
    toolName: 'return_suggestions',
    toolDescription: 'Return the list of suggested child nodes tailored to the user\'s ask.',
    schema: SUGGESTION_ARRAY_SCHEMA,
  })
  res.json(result.suggestions ?? [])
}))

// 3. Summarize (streaming)
app.post('/api/ai/summarize', authMiddleware, route(async (req, res) => {
  const { mapContext } = req.body
  if (!mapContext) return res.status(400).json({ error: 'mapContext is required' })
  const { provider, apiKey, model, advisor } = aiConfig(req)
  await streamToRes(res, {
    provider, apiKey, model,
    max_tokens: 1024,
    temperature: 0.5,
    system: buildSystem(
      withAdvisor('You write concise, flowing prose summaries of mind maps. Stay faithful to the map\'s structure and notes.', advisor),
      mapContext,
    ),
    messages: [{
      role: 'user',
      content: 'Write a clear, concise summary in 2-4 paragraphs. Write in flowing prose, not as a list.',
    }],
  })
}))

// 4. Brainstorm chat (streaming)
app.post('/api/ai/chat', authMiddleware, route(async (req, res) => {
  const { userMessage, mapContext, history = [], selectedNodeLabel } = req.body
  if (!userMessage) return res.status(400).json({ error: 'userMessage is required' })
  const { provider, apiKey, model, advisor } = aiConfig(req)

  const focusClause = selectedNodeLabel
    ? ` The user is currently focused on the node labeled "${selectedNodeLabel}" — bias your suggestions toward that area of the map unless the user's message clearly asks about something else.`
    : ''

  await streamToRes(res, {
    provider, apiKey, model,
    system: buildSystem(
      withAdvisor(`You are an AI assistant helping the user brainstorm and develop their mind map.${focusClause} When suggesting nodes to add, format as: **Add to "[parent node]":** idea 1, idea 2. Use the EXACT node label from the map as the parent. Keep responses concise and actionable.`, advisor),
      mapContext,
    ),
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
  const { provider, apiKey, model, advisor } = aiConfig(req)
  const result = await callAIJSON({
    provider, apiKey, model,
    max_tokens: 512,
    temperature: 0.6,
    system: buildSystem(
      withAdvisor('You find non-obvious connections between nodes in the user\'s mind map. Use exact ids from the map when referring to nodes.', advisor),
      mapContext,
      { includeIds: true },
    ),
    messages: [{
      role: 'user',
      content: 'Identify 3-5 non-obvious connections between nodes that are NOT already connected in the map. Each connection needs a short reason explaining why the pair matters.',
    }],
    toolName: 'return_connections',
    toolDescription: 'Return the list of non-obvious cross-links between existing nodes.',
    schema: CONNECTIONS_SCHEMA,
  })
  res.json(result.connections ?? [])
}))

// ─── Brainstorming primitives (streaming analysis) ──────────────────────────
// Each endpoint streams prose analysis into the chat panel. Prompts instruct
// the model to emit **Add to "X":** idea1, idea2 when suggesting additions,
// which the client's ApplyChips parser turns into one-click buttons.

const ADDITION_FORMAT_NOTE =
  'When you recommend adding nodes, format each addition on a SINGLE line as: **Add to "[exact parent node label]":** idea 1, idea 2, idea 3. Use exact labels from the map. The portion after the marker must be a plain comma-separated list of 2-6 word labels — no quotes, no parentheticals, no descriptions, no bullet points, no ids. Put any prose explanation on separate lines before or after. Omit this pattern when you are not recommending additions.'

// 7. Challenge assumptions (streaming)
app.post('/api/ai/challenge', authMiddleware, route(async (req, res) => {
  const { mapContext, selectedNodeLabel } = req.body
  if (!mapContext) return res.status(400).json({ error: 'mapContext is required' })
  const { provider, apiKey, model, advisor } = aiConfig(req)
  const scope = selectedNodeLabel
    ? `the "${selectedNodeLabel}" branch specifically`
    : 'this mind map as a whole'
  await streamToRes(res, {
    provider, apiKey, model,
    max_tokens: 1024,
    temperature: 0.7,
    system: buildSystem(
      withAdvisor(`You are a rigorous thinking partner. Your job is to poke holes — identify weak assumptions, unstated dependencies, circular reasoning, missing counter-evidence, and places the user is being too optimistic or too narrow. Be candid but constructive. ${ADDITION_FORMAT_NOTE}`, advisor),
      mapContext,
    ),
    messages: [{
      role: 'user',
      content: `Identify 3-5 of the weakest assumptions or blind spots in ${scope}. For each, explain in one sentence why it's risky and, where useful, suggest a concrete node the user should add to address it.`,
    }],
  })
}))

// 8. Prioritize (streaming)
app.post('/api/ai/prioritize', authMiddleware, route(async (req, res) => {
  const { mapContext, selectedNodeLabel } = req.body
  if (!mapContext) return res.status(400).json({ error: 'mapContext is required' })
  const { provider, apiKey, model, advisor } = aiConfig(req)
  const scope = selectedNodeLabel
    ? `the "${selectedNodeLabel}" branch`
    : 'this mind map'
  await streamToRes(res, {
    provider, apiKey, model,
    max_tokens: 1024,
    temperature: 0.5,
    system: buildSystem(
      withAdvisor(`You are a decisive advisor who helps the user focus. You rank ideas by impact and effort, name what to do first, and are willing to call out low-value items. ${ADDITION_FORMAT_NOTE}`, advisor),
      mapContext,
    ),
    messages: [{
      role: 'user',
      content: `Pick the top 3 items in ${scope} the user should tackle first. For each, give a one-line rationale (impact and why it's the right next step). Also call out 1-2 items that look low-value or could be deferred.`,
    }],
  })
}))

// 9. Find gaps (streaming, requires selected node)
app.post('/api/ai/find-gaps', authMiddleware, route(async (req, res) => {
  const { mapContext, nodeLabel } = req.body
  if (!mapContext) return res.status(400).json({ error: 'mapContext is required' })
  if (!nodeLabel) return res.status(400).json({ error: 'nodeLabel is required' })
  const { provider, apiKey, model, advisor } = aiConfig(req)
  await streamToRes(res, {
    provider, apiKey, model,
    max_tokens: 768,
    temperature: 0.7,
    system: buildSystem(
      withAdvisor(`You find OBVIOUS gaps a complete thinker would have covered. Focus on sub-topics the user has clearly missed, not creative new ideas. Be blunt about what's missing. ${ADDITION_FORMAT_NOTE}`, advisor),
      mapContext,
    ),
    messages: [{
      role: 'user',
      content: `Look at the "${nodeLabel}" node and its current children in the map. Name 3-5 obvious sub-topics a thorough treatment of "${nodeLabel}" would include but the user has not yet added. Then format them as additions to "${nodeLabel}".`,
    }],
  })
}))

// 10. Compress taxonomy (streaming, requires selected node)
app.post('/api/ai/compress', authMiddleware, route(async (req, res) => {
  const { mapContext, nodeLabel } = req.body
  if (!mapContext) return res.status(400).json({ error: 'mapContext is required' })
  if (!nodeLabel) return res.status(400).json({ error: 'nodeLabel is required' })
  const { provider, apiKey, model, advisor } = aiConfig(req)
  await streamToRes(res, {
    provider, apiKey, model,
    max_tokens: 1024,
    temperature: 0.4,
    system: buildSystem(
      withAdvisor(`You help the user simplify overgrown branches by proposing umbrella categories that group related children. Keep your prose brief — the value is in the umbrella names, not long explanations. ${ADDITION_FORMAT_NOTE}`, advisor),
      mapContext,
    ),
    messages: [{
      role: 'user',
      content: `The "${nodeLabel}" branch feels overgrown. Propose 2-4 umbrella category names that would regroup its children. Respond in this exact shape and nothing else:

Brief 1-2 sentence summary of how you're regrouping.

**Add to "${nodeLabel}":** Umbrella1, Umbrella2, Umbrella3

Optionally, a 1-line note per umbrella explaining which existing children it would absorb (just labels, no ids, no quoted phrases, no long descriptions).

Rules:
- The umbrella names must be short (2-4 words each), comma-separated on a single line after the Add-to marker.
- Do not put prose, bullets, colons, or descriptions on the Add-to line — only the umbrella names.
- Do not repeat node ids anywhere in your answer.`,
    }],
  })
}))

// 6. Write from map (streaming)
app.post('/api/ai/write', authMiddleware, route(async (req, res) => {
  const { mapContext, format = 'essay' } = req.body
  if (!mapContext) return res.status(400).json({ error: 'mapContext is required' })
  const { provider, apiKey, model, advisor } = aiConfig(req)
  const instructions = {
    essay: 'Write a well-structured essay with introduction, body paragraphs for each main theme, and conclusion.',
    outline: 'Create a detailed outline with headers and sub-points.',
    bullets: 'Create a comprehensive bullet-point summary.',
  }
  await streamToRes(res, {
    provider, apiKey, model,
    max_tokens: 2048,
    temperature: 0.6,
    system: buildSystem(
      withAdvisor('You turn mind maps into polished written content. Use the map structure as your content guide.', advisor),
      mapContext,
    ),
    messages: [{
      role: 'user',
      content: instructions[format] || instructions.essay,
    }],
  })
}))

// 11. Debate (streaming) — runs N advisors sequentially against the same
// question. Each advisor's response is preceded by an emoji + label header
// so the existing markdown renderer + apply-chip parser still work per-section.
app.post('/api/ai/debate', authMiddleware, route(async (req, res) => {
  const { question, advisors: debateAdvisors, mapContext, selectedNodeLabel } = req.body
  if (!question || typeof question !== 'string') return res.status(400).json({ error: 'question is required' })
  if (!Array.isArray(debateAdvisors) || debateAdvisors.length === 0) {
    return res.status(400).json({ error: 'advisors must be a non-empty array' })
  }
  if (debateAdvisors.length > 4) return res.status(400).json({ error: 'at most 4 advisors per debate' })
  if (!mapContext) return res.status(400).json({ error: 'mapContext is required' })
  const { provider, apiKey, model } = aiConfig(req)

  const focusClause = selectedNodeLabel
    ? ` The user is currently focused on the node labeled "${selectedNodeLabel}" — bias your answer toward that area unless the question is clearly about something else.`
    : ''

  setupSSE(res)
  try {
    for (let i = 0; i < debateAdvisors.length; i++) {
      const advisor = debateAdvisors[i]
      const emoji = advisor.emoji || (advisor.custom ? '🧠' : '🎯')
      const label = (advisor.label || advisor.role || 'Advisor').toString().slice(0, 60)

      // Header chunk — leading newline only after the first round so sections
      // are visually separated in the chat panel without a leading gap.
      const header = `${i === 0 ? '' : '\n\n'}### ${emoji} ${label}\n\n`
      emitChunk(res, header)

      await streamOneCallToRes(res, {
        provider, apiKey, model,
        max_tokens: 800,
        temperature: 0.7,
        system: buildSystem(
          withAdvisor(
            `You are one of several advisors weighing in on the user's question. Stay strictly in this advisor's lens — argue from your perspective, not a balanced overview. Be concise (3-6 short paragraphs max).${focusClause} ${ADDITION_FORMAT_NOTE}`,
            advisor,
          ),
          mapContext,
        ),
        messages: [{ role: 'user', content: question }],
      })
    }
    res.write('data: [DONE]\n\n')
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: errMsg(err) })}\n\n`)
  }
  res.end()
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

// POST /api/teams/:id/members — add a member directly (owner only, same tenant only)
app.post('/api/teams/:id/members', authMiddleware, route(async (req, res) => {
  if (!requireDb(res)) return
  const { id: teamId } = req.params
  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId is required' })

  const { rows: ownerCheck } = await pool.query(
    `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [teamId, req.user.id]
  )
  if (ownerCheck[0]?.role !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can add members' })
  }

  const { rows: targetRows } = await pool.query(
    `SELECT id, name, email, tenant_id FROM users WHERE id = $1`,
    [userId]
  )
  const target = targetRows[0]
  if (!target) return res.status(404).json({ error: 'User not found' })
  if ((target.tenant_id ?? '') !== (req.user.tenantId ?? '')) {
    return res.status(403).json({ error: 'User is not in your organization' })
  }

  const inserted = await pool.query(
    `INSERT INTO team_members (team_id, user_id, role)
     VALUES ($1, $2, 'member')
     ON CONFLICT (team_id, user_id) DO NOTHING
     RETURNING joined_at`,
    [teamId, userId]
  )
  if (!inserted.rowCount) return res.status(409).json({ error: 'User is already a member' })

  res.json({
    ok: true,
    member: {
      id: target.id,
      name: target.name,
      email: target.email,
      role: 'member',
      joinedAt: inserted.rows[0].joined_at,
    },
  })
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
            ms.permission, m.thumbnail,
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
    thumbnail: r.thumbnail ?? null,
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
    `SELECT id, title, data, advisor, created_at, updated_at FROM maps WHERE id = $1`,
    [req.params.id]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Map not found' })
  const r = rows[0]
  res.json({
    id: r.id,
    title: r.title,
    nodes: r.data.nodes ?? [],
    edges: r.data.edges ?? [],
    chatHistory: r.data.chatHistory ?? [],
    advisor: r.advisor ?? null,
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
  console.log(`DigiNode AI Server → http://localhost:${PORT}`)
  console.log(`Anthropic key: ${process.env.ANTHROPIC_API_KEY ? '✓' : '✗ not set'}`)
  console.log(`OpenAI key:    ${process.env.OPENAI_API_KEY ? '✓' : '✗ not set'}`)
  console.log('Users can supply their own key via the Settings panel.')
})
