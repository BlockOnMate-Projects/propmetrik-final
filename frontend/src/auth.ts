import NextAuth from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

// Backend API URL for server-side calls (NextAuth runs server-side).
// NEXT_PUBLIC_API_URL may be a relative proxy path like "/api" which doesn't work
// in server-side fetch; use the internal backend URL directly.
const API_BASE = (process.env.INTERNAL_API_URL || 'http://localhost:4000').replace(/\/api\/v1$/, '');

/** Decode a JWT payload without verification (just to read exp) */
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  } catch {
    return null;
  }
}

/** Refresh the backend-issued local JWT via POST /api/v1/auth/refresh */
async function refreshBackendToken(accessToken: string): Promise<{ token: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.success ? { token: data.token } : null;
  } catch {
    return null;
  }
}

/** Refresh Keycloak tokens via POST /api/v1/auth/refresh with refresh_token body */
async function refreshKeycloakToken(refreshToken: string): Promise<{
  token?: string;
  keycloak_access_token?: string;
  keycloak_refresh_token?: string;
  keycloak_expires_in?: number;
} | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.success ? data : null;
  } catch {
    return null;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    // Email/Password Authentication (Default)
    CredentialsProvider({
      id: 'credentials',
      name: 'Email & Password',
      credentials: {
        email: { label: "Email", type: "email", placeholder: "you@example.com" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const loginUrl = `${API_BASE}/api/v1/auth/login`;
          console.log('[Auth] Attempting login to:', loginUrl);
          console.log('[Auth] Email:', credentials.email);
          
          const response = await fetch(loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          const data = await response.json();
          console.log('[Auth] Response status:', response.status);
          console.log('[Auth] Response data:', JSON.stringify(data).substring(0, 200));

          if (!response.ok || !data.success) {
            console.error('[Auth] Login failed:', data.message);
            throw new Error(data.message || 'Invalid credentials');
          }

          // Return user object for NextAuth session
          return {
            id: data.user.id,
            email: data.user.email,
            name: `${data.user.firstName || ''} ${data.user.lastName || ''}`.trim() || data.user.email,
            image: null,
            accessToken: data.token,
            role: data.user.role,
            tier: data.user.tier,
            userType: data.user.userType,
            subscribedServices: data.user.subscribedServices || [],
            organizationId: data.user.organization?.id,
            organizationName: data.user.organization?.name,
          };
        } catch (error) {
          console.error('Credentials auth error:', error);
          return null;
        }
      }
    }),
    // Tenant Portal Authentication
    CredentialsProvider({
      id: 'tenant-credentials',
      name: 'Tenant Login',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        try {
          const res = await fetch(`${API_BASE}/api/v1/tenant-portal/auth/keycloak/password-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: credentials.email, password: credentials.password }),
          });
          const data = await res.json();
          if (!res.ok || !data.success || !data.tenant) return null;
          const tenant = data.tenant;
          const organizationId = tenant.organizationId || tenant.activeTenancies?.[0]?.organizationId;
          return {
            id: tenant.id,
            email: tenant.email,
            name: tenant.fullName || tenant.email,
            image: null,
            accessToken: data.accessToken,
            role: 'tenant',
            tier: 'starter',
            userType: 'tenant',
            subscribedServices: [],
            organizationId,
          };
        } catch {
          return null;
        }
      },
    }),
    // Keycloak SSO (Enterprise Feature)
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || "",
      issuer: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}`,
    }),
    // Google OAuth (Social Sign-In / Sign-Up)
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // For Google OAuth: create/find user in backend, store backend JWT on user
      if (account?.provider === 'google' && profile?.email) {
        try {
          const res = await fetch(`${API_BASE}/api/v1/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: profile.email,
              firstName: (profile as any).given_name || user.name?.split(' ')[0] || '',
              lastName: (profile as any).family_name || user.name?.split(' ').slice(1).join(' ') || '',
              googleId: account.providerAccountId,
              image: user.image,
            }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            console.error('[Auth] Google backend call failed:', data.message);
            return false;
          }
          // Attach backend data to the user object for the jwt callback
          (user as any).accessToken = data.token;
          (user as any).role = data.user.role;
          (user as any).tier = data.user.tier;
          (user as any).userType = data.user.userType;
          (user as any).subscribedServices = data.user.subscribedServices || [];
          (user as any).organizationId = data.user.organization?.id;
          (user as any).organizationName = data.user.organization?.name;
          (user as any).onboardingCompleted = data.user.onboardingCompleted;
          (user as any).isNewUser = data.isNewUser;
          user.id = data.user.id;
        } catch (err) {
          console.error('[Auth] Google backend error:', err);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, account, profile, user }) {
      // Only log when there's actual new data (not on every session check)
      if (user || account) {
        console.log('[Auth JWT] callback triggered', { hasUser: !!user, hasAccount: !!account });
      }
      
      // Handle credentials login — store backend JWT + compute expiry
      if (user && 'accessToken' in user) {
        console.log('[Auth JWT] Setting credentials/google token data');
        token.accessToken = user.accessToken as string;
        token.role = user.role as string;
        token.tier = user.tier as string;
        token.userType = user.userType as string;
        token.subscribedServices = (user as any).subscribedServices as string[] || [];
        token.organizationId = user.organizationId as string;
        token.organizationName = user.organizationName as string;
        token.roles = [user.role as string];
        token.name = user.name as string;
        token.email = user.email as string;
        token.onboardingCompleted = (user as any).onboardingCompleted as boolean;
        token.isNewUser = (user as any).isNewUser as boolean;

        // Extract exp from backend JWT so we know when to refresh
        const payload = decodeJwtPayload(token.accessToken as string);
        if (payload?.exp) {
          token.backendTokenExp = payload.exp as number;
        }
      }
      
      // Handle Keycloak SSO login
      if (account && account.provider === 'keycloak') {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.idToken = account.id_token;
        
        // Decode access token to get roles
        if (token.accessToken) {
          try {
            const payload = JSON.parse(
              Buffer.from((token.accessToken as string).split('.')[1], 'base64').toString()
            );
            token.roles = payload.realm_access?.roles || [];
            token.organizationId = payload.organization_id;
          } catch (e) {
            console.error('Error decoding token:', e);
          }
        }
      }

      // ── Token Refresh Logic ────────────────────────────────────────────
      // Refresh the backend JWT when it's within 60 seconds of expiring
      const now = Math.floor(Date.now() / 1000);

      // For Keycloak SSO sessions: use refresh_token
      if (token.refreshToken && token.expiresAt) {
        if (now >= (token.expiresAt as number) - 60) {
          console.log('[Auth JWT] Keycloak token expiring, refreshing...');
          const refreshed = await refreshKeycloakToken(token.refreshToken as string);
          if (refreshed) {
            if (refreshed.keycloak_access_token) {
              token.accessToken = refreshed.keycloak_access_token;
              token.expiresAt = now + (refreshed.keycloak_expires_in || 300);
            }
            if (refreshed.keycloak_refresh_token) {
              token.refreshToken = refreshed.keycloak_refresh_token;
            }
            if (refreshed.token) {
              // Also got a synced local JWT
              token.accessToken = refreshed.token;
              const payload = decodeJwtPayload(refreshed.token);
              if (payload?.exp) token.backendTokenExp = payload.exp;
              if (payload?.subscribedServices) token.subscribedServices = payload.subscribedServices;
            }
            console.log('[Auth JWT] Keycloak token refreshed');
          } else {
            console.error('[Auth JWT] Keycloak refresh failed — session may expire');
            token.error = 'RefreshTokenError';
          }
        }
      }
      // For credentials sessions: use local JWT refresh
      else if (token.accessToken && token.backendTokenExp) {
        if (now >= (token.backendTokenExp as number) - 60) {
          console.log('[Auth JWT] Backend token expiring, refreshing...');
          const refreshed = await refreshBackendToken(token.accessToken as string);
          if (refreshed) {
            token.accessToken = refreshed.token;
            const payload = decodeJwtPayload(refreshed.token);
            if (payload?.exp) token.backendTokenExp = payload.exp;
            if (payload?.subscribedServices) token.subscribedServices = payload.subscribedServices;
            console.log('[Auth JWT] Backend token refreshed');
          } else {
            console.error('[Auth JWT] Backend token refresh failed');
            token.error = 'RefreshTokenError';
          }
        }
      }
      
      return token;
    },
    async session({ session, token }) {
      // Send properties to the client
      session.accessToken = token.accessToken as string;
      session.user.id = token.sub!;
      session.user.roles = (token.roles as string[]) || [];
      session.user.role = token.role as string;
      session.user.tier = token.tier as string;
      session.user.userType = token.userType as string;
      session.user.subscribedServices = (token.subscribedServices as string[]) || [];
      session.user.organizationId = token.organizationId as string | undefined;
      session.user.organizationName = token.organizationName as string | undefined;
      session.user.name = token.name as string | undefined;
      session.user.email = (token.email as string | undefined) ?? '';
      session.user.onboardingCompleted = token.onboardingCompleted as boolean | undefined;
      session.user.isNewUser = token.isNewUser as boolean | undefined;

      // Surface refresh errors so the client can redirect to login
      if (token.error) {
        (session as any).error = token.error;
      }
      
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  // Derive the auth URL from the incoming request host (X-Forwarded-Host behind
  // the proxy) instead of a single fixed NEXTAUTH_URL. Lets one app serve both
  // app.propmetrik.com and tenant.propmetrik.com with correct callback/cookie hosts.
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  debug: process.env.NODE_ENV === 'development',
});

// Extend types for TypeScript
declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: string;
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      roles: string[];
      role?: string;
      tier?: string;
      userType?: string;
      subscribedServices?: string[];
      organizationId?: string;
      organizationName?: string;
      onboardingCompleted?: boolean;
      isNewUser?: boolean;
    };
  }
  
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    backendTokenExp?: number;
    idToken?: string;
    roles?: string[];
    role?: string;
    tier?: string;
    userType?: string;
    subscribedServices?: string[];
    organizationId?: string;
    organizationName?: string;
    onboardingCompleted?: boolean;
    isNewUser?: boolean;
    error?: string;
  }

  interface User {
    accessToken?: string;
    role?: string;
    tier?: string;
    userType?: string;
    subscribedServices?: string[];
    organizationId?: string;
    organizationName?: string;
    onboardingCompleted?: boolean;
    isNewUser?: boolean;
  }
}
