import { Configuration, RedirectRequest } from '@azure/msal-browser'

// Azure App Registration values — set these in your .env file
// VITE_AZURE_CLIENT_ID  → Application (client) ID from Azure Portal
// VITE_AZURE_TENANT_ID  → Directory (tenant) ID from Azure Portal
//                         Use 'common' to allow any Microsoft account
//                         Use 'organizations' for work/school accounts only
//                         Use your specific tenant ID to restrict to one org

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID ?? '',
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID ?? 'common'}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: `${window.location.origin}/sign-in`,
  },
  cache: {
    cacheLocation: 'sessionStorage', // sessionStorage: cleared on tab close (more secure than localStorage)
  },
}

// Scopes used for both interactive login and silent token acquisition.
// Keep this single source of truth so silent token requests don't trigger
// extra round-trips due to scope drift.
export const authScopes = ['openid', 'profile', 'email', 'User.Read']

export const loginRequest: RedirectRequest = {
  scopes: authScopes,
}
