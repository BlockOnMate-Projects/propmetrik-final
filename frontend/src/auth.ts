import NextAuth from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";
import CredentialsProvider from "next-auth/providers/credentials";

// Backend API URL for server-side calls (NextAuth runs server-side).
// NEXT_PUBLIC_API_URL may be a relative proxy path like "/api" which doesn't work
// in server-side fetch; use the internal backend URL directly.
const API_BASE = (process.env.INTERNAL_API_URL || 'http://localhost:4000').replace(/\/api\/v1$/, '');

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
            organizationId: data.user.organization?.id,
            organizationName: data.user.organization?.name,
          };
        } catch (error) {
          console.error('Credentials auth error:', error);
          return null;
        }
      }
    }),
    // Keycloak SSO (Enterprise Feature)
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || "",
      issuer: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}`,
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile, user }) {
      console.log('[Auth JWT] callback triggered', { hasUser: !!user, hasAccount: !!account });
      
      // Handle credentials login
      if (user && 'accessToken' in user) {
        console.log('[Auth JWT] Setting credentials token data');
        token.accessToken = user.accessToken as string;
        token.role = user.role as string;
        token.tier = user.tier as string;
        token.organizationId = user.organizationId as string;
        token.organizationName = user.organizationName as string;
        token.roles = [user.role as string];
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
      
      return token;
    },
    async session({ session, token }) {
      // Send properties to the client
      session.accessToken = token.accessToken as string;
      session.user.id = token.sub!;
      session.user.roles = (token.roles as string[]) || [];
      session.user.role = token.role as string;
      session.user.tier = token.tier as string;
      session.user.organizationId = token.organizationId as string | undefined;
      session.user.organizationName = token.organizationName as string | undefined;
      
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: "jwt",
  },
  debug: process.env.NODE_ENV === 'development',
});

// Extend types for TypeScript
declare module "next-auth" {
  interface Session {
    accessToken?: string;
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      roles: string[];
      role?: string;
      tier?: string;
      organizationId?: string;
      organizationName?: string;
    };
  }
  
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    idToken?: string;
    roles?: string[];
    role?: string;
    tier?: string;
    organizationId?: string;
    organizationName?: string;
  }

  interface User {
    accessToken?: string;
    role?: string;
    tier?: string;
    organizationId?: string;
    organizationName?: string;
  }
}
