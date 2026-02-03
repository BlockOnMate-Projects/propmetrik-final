/**
 * PropMetrik Authentication for E-Sign UI
 * Replaces Keycloak authentication with PropMetrik JWT token handling
 * 
 * Integration Pattern:
 * - E-Sign UI is embedded within PropMetrik frontend (iframe or component)
 * - PropMetrik passes JWT token via URL parameter or postMessage
 * - E-Sign UI uses this token for all API requests
 */

// Token storage
let authToken: string | null = null;
let tokenPayload: TokenPayload | null = null;

interface TokenPayload {
  userId: string;
  email: string;
  name?: string;
  role: string;
  organizationId: string;
  tier: string;
  iat: number;
  exp: number;
}

interface UserInfo {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  tier: string;
}

/**
 * Initialize authentication from PropMetrik
 * Call this on app startup
 */
export const initAuth = (): boolean => {
  // Method 1: Check URL parameters (for iframe embed)
  const urlParams = new URLSearchParams(window.location.search);
  const tokenFromUrl = urlParams.get('token');
  
  if (tokenFromUrl) {
    setToken(tokenFromUrl);
    // Clean URL (remove token from display)
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, cleanUrl);
    return true;
  }
  
  // Method 2: Check localStorage (for persistent sessions)
  const storedToken = localStorage.getItem('propmetrik_esign_token');
  if (storedToken) {
    setToken(storedToken);
    return true;
  }
  
  // Method 3: Listen for postMessage from parent (PropMetrik main app)
  window.addEventListener('message', handlePostMessage);
  
  // Request token from parent if in iframe
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'REQUEST_AUTH_TOKEN' }, '*');
  }
  
  return false;
};

/**
 * Handle postMessage from PropMetrik parent app
 */
const handlePostMessage = (event: MessageEvent) => {
  // In production, validate event.origin against allowed domains
  if (event.data?.type === 'AUTH_TOKEN' && event.data?.token) {
    setToken(event.data.token);
    console.log('🔐 Received auth token from parent app');
  }
};

/**
 * Set the authentication token
 */
export const setToken = (token: string): void => {
  try {
    let payload: any;
    
    // Try JWT format first (3 parts with dot separator)
    const parts = token.split('.');
    if (parts.length === 3) {
      payload = JSON.parse(atob(parts[1]));
    } else {
      // PropMetrik simple base64 format
      payload = JSON.parse(atob(token));
    }
    
    // Map various field names to expected format
    const userId = payload.userId || payload.sub || payload.id;
    const email = payload.email;
    const name = payload.name || email?.split('@')[0] || 'User';
    
    if (!userId && !email) {
      throw new Error('Token missing required fields');
    }
    
    authToken = token;
    tokenPayload = {
      userId: userId || 'unknown',
      email: email || 'unknown@propmetrik.com',
      role: payload.role || 'user',
      organizationId: payload.organizationId || payload.org_id || '',
      tier: payload.tier || 'standard',
      iat: payload.iat || Math.floor(Date.now() / 1000),
      exp: payload.exp || Math.floor(Date.now() / 1000) + 86400,
    };
    
    // Store for persistence
    localStorage.setItem('propmetrik_esign_token', token);
    
    console.log('✅ Auth token set for user:', tokenPayload.email);
  } catch (error) {
    console.error('❌ Failed to set auth token:', error);
    authToken = null;
    tokenPayload = null;
  }
};

/**
 * Check if token is expired
 * NOTE: Always returns false - expiration disabled for internal service communication
 */
const isTokenExpired = (_token: string): boolean => {
  // Expiration disabled - PropMetrik tokens don't expire for E-Sign
  return false;
};

/**
 * Get authorization header for API requests
 */
export const getAuthHeader = (): Record<string, string> => {
  if (authToken) {
    return {
      Authorization: `Bearer ${authToken}`,
    };
  }
  return {};
};

/**
 * Check if user is authenticated
 * NOTE: Only checks if token exists - no expiration check
 */
export const isAuthenticated = (): boolean => {
  return !!(authToken && tokenPayload);
};

/**
 * Get current user info
 */
export const getUserInfo = (): UserInfo | null => {
  if (!tokenPayload) return null;
  
  return {
    id: tokenPayload.userId,
    email: tokenPayload.email,
    name: tokenPayload.name || tokenPayload.email.split('@')[0], // Use name from token, fallback to email prefix
    role: tokenPayload.role,
    organizationId: tokenPayload.organizationId,
    tier: tokenPayload.tier,
  };
};

/**
 * Get raw token (for passing to child components/iframes)
 */
export const getToken = (): string | null => {
  return authToken;
};

/**
 * Logout - clear token and notify parent
 */
export const logout = (): void => {
  authToken = null;
  tokenPayload = null;
  localStorage.removeItem('propmetrik_esign_token');
  
  // Notify parent app if in iframe
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'ESIGN_LOGOUT' }, '*');
  }
  
  // Redirect to PropMetrik login or close modal
  console.log('🚪 User logged out from E-Sign');
};

/**
 * Update token - for PropMetrik to push new tokens
 * Returns true to match Keycloak interface
 */
export const updateToken = async (_minValidity: number = 30): Promise<boolean> => {
  // PropMetrik handles token refresh - we just validate current token
  if (!authToken || !tokenPayload) return false;
  
  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = tokenPayload.exp - now;
  
  // If token expires soon, request new one from parent
  if (timeUntilExpiry < _minValidity && window.parent !== window) {
    window.parent.postMessage({ type: 'REQUEST_TOKEN_REFRESH' }, '*');
  }
  
  return timeUntilExpiry > 0;
};

// Default export for compatibility with existing keycloak imports
const propmetrikAuth = {
  initAuth,
  setToken,
  getToken,
  getAuthHeader,
  isAuthenticated,
  getUserInfo,
  logout,
  updateToken,
};

export default propmetrikAuth;
