import pkg from 'pg'
import { config } from 'dotenv'

config()

const { Pool } = pkg

// DATABASE_URL is required in production (set in Railway env vars).
// If not set, DB operations will fail gracefully — the server still starts.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      // Force IPv4 only to avoid Happy Eyeballs / dual-stack timeout bugs in container runtimes
      family: 4,
      ssl: { rejectUnauthorized: false }, // Neon requires SSL
      max: 10,
    })
  : null

export default pool
