import { Configuration, PopupRequest } from '@azure/msal-browser'

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
    redirectUri: window.location.origin, // e.g. http://localhost:5173 or https://your-vercel-app.vercel.app
  },
  cache: {
    cacheLocation: 'sessionStorage', // sessionStorage: cleared on tab close (more secure than localStorage)
  },
}

// Scopes requested during login
// openid + profile + email give us the user's identity
// User.Read gives access to basic Microsoft Graph profile data
export const loginRequest: PopupRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
}

// The audience your Express backend will validate tokens against
// Must match the clientId of your Azure App Registration
export const tokenRequest = {
  scopes: [`api://${import.meta.env.VITE_AZURE_CLIENT_ID}/access_as_user`],
}
