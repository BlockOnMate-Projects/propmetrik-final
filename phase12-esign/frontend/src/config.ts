// Environment configuration from root .env via docker-compose
// Production build v2 - 2025-12-19
export const config = {
  // Keycloak
  keycloakUrl:
    import.meta.env.VITE_KEYCLOAK_URL ||
    (import.meta.env.PROD ? 'https://sso.cedynhq.com' : 'http://localhost:8080'),
  keycloakRealm: import.meta.env.VITE_KEYCLOAK_REALM || 'cedyn',
  keycloakClientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'cedyn-esign',
  
  // API - Production uses HTTPS
  apiBaseUrl:
    import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.PROD ? 'https://esign-api.cedynhq.com' : 'http://localhost:8000'),
  
  // Google OAuth
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  googleRedirectUri:
    import.meta.env.VITE_GOOGLE_REDIRECT_URI ||
    (import.meta.env.PROD
      ? 'https://esign.cedynhq.com/oauth2callback'
      : 'http://localhost:3000/oauth2callback'),
  
  // App
  appName: 'Cedyn E-Signature',
  appVersion: '1.0.1',
  buildTimestamp: '2025-12-19T00:30:00Z'
};

export default config;
