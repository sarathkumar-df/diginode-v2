/**
 * Microsoft Entra ID (Azure AD) JWT verification middleware
 *
 * How it works:
 *  1. The frontend (MSAL) gets an ID token from Microsoft after login
 *  2. It sends the token in the Authorization header: "Bearer <id_token>"
 *  3. This middleware fetches Microsoft's public signing keys (JWKS) and
 *     verifies the token signature + claims
 *  4. On success, req.user is set with { id, email, name, tenantId }
 *
 * Required env vars:
 *  AZURE_CLIENT_ID  — Application (client) ID from Azure Portal
 *  AZURE_TENANT_ID  — Tenant ID (or 'common' for multi-tenant)
 */

import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'

const TENANT_ID = process.env.AZURE_TENANT_ID || 'common'
const CLIENT_ID = process.env.AZURE_CLIENT_ID || ''

// Microsoft's JWKS endpoint for the configured tenant
// For multi-tenant ('common'), we use the common endpoint and validate issuer manually
const JWKS_URI = TENANT_ID === 'common'
  ? 'https://login.microsoftonline.com/common/discovery/v2.0/keys'
  : `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`

const client = jwksClient({
  jwksUri: JWKS_URI,
  cache: true,
  cacheMaxAge: 600000,   // 10 minutes
  rateLimit: true,
})

function getSigningKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err)
    const signingKey = key.getPublicKey()
    callback(null, signingKey)
  })
}

/**
 * requireAuth — Express middleware
 * Attaches req.user on success, returns 401 on failure.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' })
  }

  const token = authHeader.slice(7)

  const verifyOptions = {
    algorithms: ['RS256'],
    // For single-tenant: audience is the client ID
    // For multi-tenant 'common': audience is still the client ID
    audience: CLIENT_ID || undefined,
    // issuer validation: for common endpoint Microsoft uses a wildcard-style issuer
    // We validate tenant via the 'tid' claim instead
    issuer: TENANT_ID === 'common'
      ? undefined  // skip issuer check for multi-tenant; validate 'tid' below
      : `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
  }

  jwt.verify(token, getSigningKey, verifyOptions, (err, decoded) => {
    if (err) {
      console.error('[auth] JWT verification failed:', err.message)
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const payload = decoded

    // For multi-tenant, ensure the token belongs to a real Microsoft tenant
    if (TENANT_ID === 'common' && (!payload.tid || payload.tid === '')) {
      return res.status(401).json({ error: 'Token missing tenant ID' })
    }

    // Attach normalized user to request
    req.user = {
      id: payload.oid ?? payload.sub,     // Microsoft Object ID — stable unique user identifier
      email: payload.preferred_username ?? payload.email ?? payload.upn ?? '',
      name: payload.name ?? '',
      tenantId: payload.tid ?? '',
    }

    next()
  })
}
