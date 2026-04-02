-- DigoNode Phase 2 Database Schema
-- Run this once in Neon DB to set up the tables.
-- Neon DB: Project → SQL Editor → paste and run.

CREATE TABLE IF NOT EXISTS users (
  id         TEXT        PRIMARY KEY,           -- Azure localAccountId
  email      TEXT        NOT NULL,
  name       TEXT,
  tenant_id  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maps (
  id         TEXT        PRIMARY KEY,           -- UUID generated on the client
  owner_id   TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL DEFAULT 'Untitled',
  data       JSONB       NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast per-user map listing
CREATE INDEX IF NOT EXISTS maps_owner_updated ON maps (owner_id, updated_at DESC);

-- ── Phase 3: Teams ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS teams (
  id         TEXT        PRIMARY KEY,           -- UUID generated on the client
  name       TEXT        NOT NULL,
  owner_id   TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id    TEXT        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'member', -- 'owner' | 'member'
  joined_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS team_invites (
  token      TEXT        PRIMARY KEY,           -- random UUID used as the invite token
  team_id    TEXT        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_by TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL               -- invites expire after 7 days
);

CREATE INDEX IF NOT EXISTS team_members_user ON team_members (user_id);
CREATE INDEX IF NOT EXISTS team_invites_team ON team_invites (team_id);

-- ── Phase 3b: Map Sharing ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS map_shares (
  map_id      TEXT  NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  team_id     TEXT  NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  permission  TEXT  NOT NULL DEFAULT 'view',  -- 'view' | 'edit'
  shared_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (map_id, team_id)
);

CREATE INDEX IF NOT EXISTS map_shares_team ON map_shares (team_id);

-- ── Phase 5: Version History ──────────────────────────────────────────────────
-- Snapshots are created automatically on save, throttled to one per 5 minutes.
-- Max 30 versions per map; oldest are pruned on insert.

CREATE TABLE IF NOT EXISTS map_versions (
  id          TEXT        PRIMARY KEY,           -- UUID
  map_id      TEXT        NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  node_count  INT         NOT NULL DEFAULT 0,
  edge_count  INT         NOT NULL DEFAULT 0,
  data        JSONB       NOT NULL,              -- { nodes, edges }
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS map_versions_map ON map_versions (map_id, created_at DESC);
