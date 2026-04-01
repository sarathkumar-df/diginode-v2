import { ReactNode, useState, useEffect } from 'react'
import { MsalProvider, useMsal } from '@azure/msal-react'
import { PublicClientApplication, EventType, AuthenticationResult } from '@azure/msal-browser'
import { msalConfig } from './msalConfig'

// Singleton MSAL instance — created once at module level
export const msalInstance = new PublicClientApplication(msalConfig)

// Set the active account after login if none is set
msalInstance.addEventCallback((event) => {
  if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
    const payload = event.payload as AuthenticationResult
    msalInstance.setActiveAccount(payload.account)
  }
})

// ── Hook: get current user info ──────────────────────────────────────────────

export function useCurrentUser() {
  const { accounts } = useMsal()
  const account = accounts[0] ?? null
  if (!account) return null
  return {
    id: account.localAccountId,
    name: account.name ?? '',
    email: account.username ?? '',
    tenantId: account.tenantId ?? '',
  }
}

// ── Hook: get a valid access token for backend API calls ─────────────────────

export function useGetToken() {
  const { instance, accounts } = useMsal()

  return async (): Promise<string | null> => {
    if (!accounts[0]) return null
    try {
      const result = await instance.acquireTokenSilent({
        scopes: ['openid', 'profile', 'email'],
        account: accounts[0],
      })
      return result.idToken
    } catch {
      try {
        const result = await instance.acquireTokenPopup({
          scopes: ['openid', 'profile', 'email'],
        })
        return result.idToken
      } catch {
        return null
      }
    }
  }
}

// ── Provider component ───────────────────────────────────────────────────────
// MSAL requires initialize() to be called and resolved before any interaction.
// We render null until initialization is complete to prevent the
// interaction_in_progress error caused by React StrictMode double-renders.

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    msalInstance.initialize().then(() => {
      // Handle the redirect response when returning from Microsoft login page
      return msalInstance.handleRedirectPromise()
    }).then((response) => {
      if (response?.account) {
        msalInstance.setActiveAccount(response.account)
      } else {
        // Restore previously signed-in account from cache
        const accounts = msalInstance.getAllAccounts()
        if (accounts.length > 0 && !msalInstance.getActiveAccount()) {
          msalInstance.setActiveAccount(accounts[0])
        }
      }
      setReady(true)
    }).catch((err) => {
      console.error('MSAL init error', err)
      setReady(true) // still render so user sees the sign-in page
    })
  }, [])

  if (!ready) return null

  return (
    <MsalProvider instance={msalInstance}>
      {children}
    </MsalProvider>
  )
}
