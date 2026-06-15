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
      max: 3,                    // Neon free tier has low concurrent connection limits
      idleTimeoutMillis: 20000,  // release idle connections quickly so Neon can scale down
      connectionTimeoutMillis: 30000, // fail fast rather than hang indefinitely
      // Intercept DNS lookups and force IPv4 resolution to prevent Happy Eyeballs / dual-stack timeouts
      lookup: (hostname, options, callback) => {
        console.log(`[db] Initiating connection: Resolving DNS for ${hostname} (IPv4 forced)`)
        dns.lookup(hostname, { ...options, family: 4 }, (err, address, family) => {
          if (err) {
            console.error(`[db] DNS resolution failed for ${hostname}:`, err)
          } else {
            console.log(`[db] DNS resolved ${hostname} to ${address} (IPv${family})`)
          }
          callback(err, address, family)
        })
      }
    })
  : null

if (pool) {
  pool.on('connect', () => {
    console.log('[db] Successfully established new client connection to the database')
  })

  pool.on('error', (err) => {
    console.error('[db] Unexpected error on idle database client:', err)
  })
}

export default pool
