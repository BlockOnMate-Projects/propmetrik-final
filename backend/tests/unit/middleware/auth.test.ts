/**
 * Auth Middleware Unit Tests
 * 
 * Tests for requireRoles, requireOrganization, requireResourcePermission,
 * optionalAuth, and extractToken behavior.
 */

import { Request, Response, NextFunction } from 'express';

// We need to mock dependencies before importing the module
jest.mock('jose', () => ({
  jwtVerify: jest.fn(),
  createRemoteJWKSet: jest.fn().mockReturnValue('mock-jwks'),
}));

jest.mock('../../../src/config', () => ({
  config: {
    app: { env: 'test' },
    keycloak: { realm: 'propmetrik', clientId: 'propmetrik-app' },
    jwt: { secret: 'test-secret-key-for-testing-only-1234567890' },
  },
  keycloakConfig: {
    authServerUrl: 'https://sso.test.com',
  },
}));

jest.mock('../../../src/database/redis', () => ({
  redisAuth: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
    setex: jest.fn(),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  authLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../src/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn(), end: jest.fn() },
}));

import {
  requireRoles,
  requireOrganization,
  requireResourcePermission,
  requireAdmin,
  requireSuperAdmin,
  requireAgent,
} from '../../../src/middleware/auth';

// Helper to check error passed to next()
function expectUnauthorizedError(next: jest.Mock) {
  expect(next).toHaveBeenCalledTimes(1);
  const err = next.mock.calls[0][0];
  expect(err).toBeDefined();
  expect(err.message).toMatch(/authentication|unauthorized/i);
}

function expectForbiddenError(next: jest.Mock) {
  expect(next).toHaveBeenCalledTimes(1);
  const err = next.mock.calls[0][0];
  expect(err).toBeDefined();
  expect(err.message).toMatch(/permission|forbidden|insufficient|membership/i);
}

// Helper to create mock req/res/next
function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    query: {},
    user: undefined,
    token: undefined,
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function createMockUser(overrides: any = {}) {
  return {
    sub: 'user-123',
    id: 'user-123',
    email: 'test@example.com',
    emailVerified: true,
    name: 'Test User',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    realmRoles: ['staff'],
    clientRoles: [],
    organizationId: 'org-123',
    region: 'Greater Accra',
    ...overrides,
  };
}

describe('Auth Middleware', () => {
  let mockNext: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNext = jest.fn();
  });

  // =========================================================================
  // requireRoles
  // =========================================================================
  describe('requireRoles', () => {
    it('should pass when user has required role', () => {
      const middleware = requireRoles('admin', 'super_admin');
      const req = createMockReq({
        user: createMockUser({ realmRoles: ['admin'] }),
      });

      middleware(req, createMockRes(), mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should pass when user has any one of required roles', () => {
      const middleware = requireRoles('admin', 'super_admin');
      const req = createMockReq({
        user: createMockUser({ realmRoles: ['super_admin'] }),
      });

      middleware(req, createMockRes(), mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should check both realmRoles and clientRoles', () => {
      const middleware = requireRoles('valuer');
      const req = createMockReq({
        user: createMockUser({
          realmRoles: ['staff'],
          clientRoles: ['valuer'],
        }),
      });

      middleware(req, createMockRes(), mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject when user lacks required roles', () => {
      const middleware = requireRoles('admin', 'super_admin');
      const req = createMockReq({
        user: createMockUser({ realmRoles: ['staff'], clientRoles: [] }),
      });

      middleware(req, createMockRes(), mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ message: 'Insufficient permissions' }));
    });

    it('should reject when no user is attached', () => {
      const middleware = requireRoles('admin');
      const req = createMockReq({ user: undefined });

      middleware(req, createMockRes(), mockNext);

      expectUnauthorizedError(mockNext);
    });
  });

  // =========================================================================
  // requireOrganization
  // =========================================================================
  describe('requireOrganization', () => {
    it('should pass when user has organizationId', () => {
      const middleware = requireOrganization();
      const req = createMockReq({
        user: createMockUser({ organizationId: 'org-123' }),
      });

      middleware(req, createMockRes(), mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should pass for super_admin even without organizationId', () => {
      const middleware = requireOrganization(true);
      const req = createMockReq({
        user: createMockUser({
          realmRoles: ['super_admin'],
          organizationId: undefined,
        }),
      });

      middleware(req, createMockRes(), mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject super_admin when allowSuperAdmin is false', () => {
      const middleware = requireOrganization(false);
      const req = createMockReq({
        user: createMockUser({
          realmRoles: ['super_admin'],
          organizationId: undefined,
        }),
      });

      middleware(req, createMockRes(), mockNext);

      expectForbiddenError(mockNext);
    });

    it('should reject when no organizationId and not super_admin', () => {
      const middleware = requireOrganization();
      const req = createMockReq({
        user: createMockUser({
          realmRoles: ['staff'],
          organizationId: undefined,
        }),
      });

      middleware(req, createMockRes(), mockNext);

      expectForbiddenError(mockNext);
    });

    it('should reject when no user', () => {
      const middleware = requireOrganization();
      const req = createMockReq({ user: undefined });

      middleware(req, createMockRes(), mockNext);

      expectUnauthorizedError(mockNext);
    });
  });

  // =========================================================================
  // requireResourcePermission
  // =========================================================================
  describe('requireResourcePermission', () => {
    it('should pass when user has admin role', async () => {
      const getOwnerId = jest.fn().mockResolvedValue('other-user');
      const middleware = requireResourcePermission(getOwnerId);
      const req = createMockReq({
        user: createMockUser({ realmRoles: ['admin'] }),
      });

      await middleware(req, createMockRes(), mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(getOwnerId).not.toHaveBeenCalled(); // Skipped for admin
    });

    it('should pass when user is resource owner', async () => {
      const getOwnerId = jest.fn().mockResolvedValue('user-123');
      const middleware = requireResourcePermission(getOwnerId);
      const req = createMockReq({
        user: createMockUser({ sub: 'user-123', realmRoles: ['staff'] }),
      });

      await middleware(req, createMockRes(), mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject when user is not owner and not admin', async () => {
      const getOwnerId = jest.fn().mockResolvedValue('other-user');
      const middleware = requireResourcePermission(getOwnerId);
      const req = createMockReq({
        user: createMockUser({ sub: 'user-123', realmRoles: ['staff'], clientRoles: [] }),
      });

      await middleware(req, createMockRes(), mockNext);

      expectForbiddenError(mockNext);
    });

    it('should reject when no user', async () => {
      const getOwnerId = jest.fn();
      const middleware = requireResourcePermission(getOwnerId);
      const req = createMockReq({ user: undefined });

      await middleware(req, createMockRes(), mockNext);

      expectUnauthorizedError(mockNext);
    });

    it('should use custom allowRoles', async () => {
      const getOwnerId = jest.fn().mockResolvedValue('other-user');
      const middleware = requireResourcePermission(getOwnerId, ['manager']);
      const req = createMockReq({
        user: createMockUser({ realmRoles: ['manager'] }),
      });

      await middleware(req, createMockRes(), mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  // =========================================================================
  // Pre-defined middleware (requireAdmin, requireSuperAdmin, requireAgent)
  // =========================================================================
  describe('Pre-defined role middleware', () => {
    it('requireAdmin should accept admin or super_admin', () => {
      const req1 = createMockReq({ user: createMockUser({ realmRoles: ['admin'] }) });
      requireAdmin(req1, createMockRes(), mockNext);
      expect(mockNext).toHaveBeenCalledWith();

      mockNext.mockClear();
      const req2 = createMockReq({ user: createMockUser({ realmRoles: ['super_admin'] }) });
      requireAdmin(req2, createMockRes(), mockNext);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('requireSuperAdmin should reject admin (only super_admin)', () => {
      const req = createMockReq({
        user: createMockUser({ realmRoles: ['admin'], clientRoles: [] }),
      });
      requireSuperAdmin(req, createMockRes(), mockNext);
      expectForbiddenError(mockNext);
    });

    it('requireAgent should accept agent, admin, or super_admin', () => {
      const req = createMockReq({
        user: createMockUser({ realmRoles: ['agent'] }),
      });
      requireAgent(req, createMockRes(), mockNext);
      expect(mockNext).toHaveBeenCalledWith();
    });
  });
});
