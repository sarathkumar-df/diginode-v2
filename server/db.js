import pkg from 'pg'
import dns from 'dns'
import { config } from 'dotenv'

config()

const { Pool } = pkg

// DATABASE_URL is required in production (set in Railway env vars).
// If not set, DB operations will fail gracefully — the server still starts.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // Neon requires SSL
      max: 10,
      // Intercept DNS lookups and force IPv4 resolution to prevent Happy Eyeballs / dual-stack timeouts
      lookup: (hostname, options, callback) => {
        dns.lookup(hostname, { ...options, family: 4 }, callback)
      }
    })
  : null

export default pool
