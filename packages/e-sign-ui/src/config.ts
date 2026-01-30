// Environment configuration for PropMetrik E-Sign integration
// Production build v3 - PropMetrik Integration
export const config = {
  // PropMetrik API - Used for auth validation and user context
  propmetrikApiUrl:
    import.meta.env.VITE_PROPMETRIK_API_URL ||
    (import.meta.env.PROD ? 'https://api.propmetrik.com' : 'http://localhost:4000'),
  
  // E-Sign API - Python FastAPI backend on port 8002
  apiBaseUrl:
    import.meta.env.VITE_ESIGN_API_URL ||
    (import.meta.env.PROD ? 'https://esign-api.propmetrik.com' : 'http://localhost:8002'),
  
  // Keycloak (DISABLED - kept for reference)
  keycloakUrl: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080',
  keycloakRealm: import.meta.env.VITE_KEYCLOAK_REALM || 'propmetrik',
  keycloakClientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'propmetrik-esign',
  keycloakEnabled: false, // Keycloak is disabled for PropMetrik integration
  
  // Google OAuth (optional - for Drive import)
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  googleRedirectUri:
    import.meta.env.VITE_GOOGLE_REDIRECT_URI ||
    (import.meta.env.PROD
      ? 'https://esign.propmetrik.com/oauth2callback'
      : 'http://localhost:3001/oauth2callback'),
  
  // App
  appName: 'PropMetrik E-Signature',
  appVersion: '1.0.0',
  buildTimestamp: new Date().toISOString(),
};

export default config;
