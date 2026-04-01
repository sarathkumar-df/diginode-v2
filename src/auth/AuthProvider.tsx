import { ReactNode, useEffect } from 'react'
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
    id: account.localAccountId,          // Microsoft object ID — used as user ID in DB
    name: account.name ?? '',
    email: account.username ?? '',        // UPN / email
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
      return result.idToken  // We send the ID token to our Express backend for verification
    } catch {
      // Silent token acquisition failed — fall back to popup
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

// ── Initializer: restore active account on page load ────────────────────────

function MsalInitializer({ children }: { children: ReactNode }) {
  const { instance } = useMsal()

  useEffect(() => {
    // Restore previously signed-in account from cache
    const accounts = instance.getAllAccounts()
    if (accounts.length > 0 && !instance.getActiveAccount()) {
      instance.setActiveAccount(accounts[0])
    }
  }, [instance])

  return <>{children}</>
}

// ── Provider component ───────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <MsalProvider instance={msalInstance}>
      <MsalInitializer>{children}</MsalInitializer>
    </MsalProvider>
  )
}
