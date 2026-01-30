import Keycloak from 'keycloak-js';
import config from './config';

// Initialize Keycloak instance (singleton pattern to prevent multiple initializations)
let keycloakInstance: Keycloak | null = null;

const getKeycloak = (): Keycloak => {
  if (!keycloakInstance) {
    keycloakInstance = new Keycloak({
      url: config.keycloakUrl,
      realm: config.keycloakRealm,
      clientId: config.keycloakClientId,
    });
  }
  return keycloakInstance;
};

const keycloak = getKeycloak();

export default keycloak;

// Helper to get authorization header
export const getAuthHeader = (): Record<string, string> => {
  if (keycloak.token) {
    return {
      Authorization: `Bearer ${keycloak.token}`,
    };
  }
  return {};
};

// Helper to check if user is authenticated
export const isAuthenticated = (): boolean => {
  return !!keycloak.authenticated;
};

// Helper to get user info
export const getUserInfo = () => {
  if (!keycloak.tokenParsed) return null;
  
  return {
    id: keycloak.tokenParsed.sub,
    email: keycloak.tokenParsed.email,
    name: keycloak.tokenParsed.name || keycloak.tokenParsed.preferred_username,
    groups: keycloak.tokenParsed.groups || [],
    roles: keycloak.tokenParsed.realm_access?.roles || [],
  };
};

// Helper to logout
export const logout = () => {
  keycloak.logout({
    redirectUri: window.location.origin
  });
};

// Helper to check if token needs refresh
export const updateToken = async (minValidity: number = 30): Promise<boolean> => {
  try {
    return await keycloak.updateToken(minValidity);
  } catch (error) {
    console.error('Failed to refresh token', error);
    return false;
  }
};
