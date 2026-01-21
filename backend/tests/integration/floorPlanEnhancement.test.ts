/**
 * Floor Plan Enhancement Integration Tests
 * 
 * Tests for Phase 1 implementation:
 * - Design intent endpoints
 * - Geometry versioning endpoints
 * - Adjustment endpoints
 * - Audit logging
 * 
 * @module tests/integration/floorPlanEnhancement.test
 * @version 1.0.0
 * @since 2026-01-14
 */

import request from 'supertest';
import express, { Application } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Mock database
const mockQuery = jest.fn();
jest.mock('../../src/database', () => ({
  query: (...args: any[]) => mockQuery(...args),
  pool: {
    query: (...args: any[]) => mockQuery(...args),
    connect: jest.fn(),
    end: jest.fn(),
  },
}));

// Import routes after mocking
import floorPlanDesignRoutes from '../../src/routes/floor-plan-design';
import floorPlanGeometryRoutes from '../../src/routes/floor-plan-geometry';
import floorPlanAdjustmentsRoutes from '../../src/routes/floor-plan-adjustments';

// Test fixtures
const TEST_VALUATION_ID = uuidv4();
const TEST_INTENT_ID = uuidv4();
const TEST_VERSION_ID = uuidv4();
const TEST_USER_ID = uuidv4();

const TEST_PROPERTY_FEATURES = {
  bedrooms: 3,
  bathrooms: 2,
  total_area_sqm: 120,
  property_type: 'single_family',
  floors: 1,
};

const TEST_DESIGN_INTENT = {
  id: TEST_INTENT_ID,
  valuation_id: TEST_VALUATION_ID,
  llm_model: 'claude-3-opus',
  input_features: TEST_PROPERTY_FEATURES,
  layout_strategy: {
    template_id: '3BR_COMPACT_COLONIAL',
    style: 'colonial',
    circulation_type: 'central_corridor',
  },
  room_program: [
    { room_id: uuidv4(), room_type: 'living', target_area_sqm: 20, min_area_sqm: 12 },
    { room_id: uuidv4(), room_type: 'bedroom', target_area_sqm: 12, min_area_sqm: 9 },
  ],
  assumptions: [
    { category: 'dimension', assumption: 'Standard ceiling height', default_value: 3 },
  ],
  status: 'validated',
  created_at: new Date().toISOString(),
};

const TEST_GEOMETRY_VERSION = {
  id: TEST_VERSION_ID,
  valuation_id: TEST_VALUATION_ID,
  version_number: 1,
  geometry_hash: 'abc123',
  status: 'validated',
  measurements: {
    gfa_sqm: 120,
    nia_sqm: 108,
    rooms: [],
  },
  created_at: new Date().toISOString(),
};

// Create test app
function createTestApp(): Application {
  const app = express();
  app.use(express.json());
  
  // Add mock user to request
  app.use((req, res, next) => {
    (req as any).user = { id: TEST_USER_ID };
    next();
  });
  
  app.use('/', floorPlanDesignRoutes);
  app.use('/', floorPlanGeometryRoutes);
  app.use('/', floorPlanAdjustmentsRoutes);
  
  return app;
}

describe('Floor Plan Enhancement API - Phase 1', () => {
  let app: Application;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(() => {
    mockQuery.mockReset();
  });

  // =========================================================================
  // DESIGN INTENT ENDPOINTS
  // =========================================================================

  describe('Design Intent Endpoints', () => {
    describe('POST /:valuationId/floor-plans/design-intent', () => {
      it('should return 501 Not Implemented (Phase 2)', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: TEST_VALUATION_ID }] });

        const res = await request(app)
          .post(`/${TEST_VALUATION_ID}/floor-plans/design-intent`)
          .send({ property_features: TEST_PROPERTY_FEATURES });

        expect(res.status).toBe(501);
        expect(res.body.error).toBe('Not Implemented');
        expect(res.body.phase).toBe(2);
      });

      it('should return 404 for non-existent valuation', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const res = await request(app)
          .post(`/${TEST_VALUATION_ID}/floor-plans/design-intent`)
          .send({ property_features: TEST_PROPERTY_FEATURES });

        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Not Found');
      });

      it('should validate property features schema', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: TEST_VALUATION_ID }] });

        const res = await request(app)
          .post(`/${TEST_VALUATION_ID}/floor-plans/design-intent`)
          .send({ 
            property_features: { 
              bedrooms: 'invalid', // Should be number
              total_area_sqm: 120,
            } 
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Validation Error');
      });

      it('should reject invalid UUID', async () => {
        const res = await request(app)
          .post('/invalid-uuid/floor-plans/design-intent')
          .send({ property_features: TEST_PROPERTY_FEATURES });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('Invalid');
      });
    });

    describe('GET /:valuationId/floor-plans/design-intent', () => {
      it('should return design intents for valuation', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: TEST_VALUATION_ID }] }) // Valuation check
          .mockResolvedValueOnce({ rows: [TEST_DESIGN_INTENT] }); // Design intents

        const res = await request(app)
          .get(`/${TEST_VALUATION_ID}/floor-plans/design-intent`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.design_intents).toHaveLength(1);
      });

      it('should filter by status', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: TEST_VALUATION_ID }] })
          .mockResolvedValueOnce({ rows: [] });

        const res = await request(app)
          .get(`/${TEST_VALUATION_ID}/floor-plans/design-intent?status=applied`);

        expect(res.status).toBe(200);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('status = $2'),
          expect.arrayContaining(['applied'])
        );
      });

      it('should return 404 for non-existent valuation', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const res = await request(app)
          .get(`/${TEST_VALUATION_ID}/floor-plans/design-intent`);

        expect(res.status).toBe(404);
      });
    });

    describe('GET /:valuationId/floor-plans/design-intent/:intentId', () => {
      it('should return specific design intent', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [TEST_DESIGN_INTENT] });

        const res = await request(app)
          .get(`/${TEST_VALUATION_ID}/floor-plans/design-intent/${TEST_INTENT_ID}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe(TEST_INTENT_ID);
      });

      it('should return 404 for non-existent intent', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const res = await request(app)
          .get(`/${TEST_VALUATION_ID}/floor-plans/design-intent/${TEST_INTENT_ID}`);

        expect(res.status).toBe(404);
      });
    });

    describe('POST /:valuationId/floor-plans/design-intent/:intentId/apply', () => {
      it('should return 501 Not Implemented (Phase 2)', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [TEST_DESIGN_INTENT] });

        const res = await request(app)
          .post(`/${TEST_VALUATION_ID}/floor-plans/design-intent/${TEST_INTENT_ID}/apply`);

        expect(res.status).toBe(501);
        expect(res.body.error).toBe('Not Implemented');
      });

      it('should return 404 for non-validated intent', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const res = await request(app)
          .post(`/${TEST_VALUATION_ID}/floor-plans/design-intent/${TEST_INTENT_ID}/apply`);

        expect(res.status).toBe(404);
      });
    });

    describe('POST /:valuationId/floor-plans/design-intent/:intentId/reject', () => {
      it('should reject design intent with reason', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ ...TEST_DESIGN_INTENT, status: 'rejected' }] }) // Update
          .mockResolvedValueOnce({ rows: [] }); // Audit log

        const res = await request(app)
          .post(`/${TEST_VALUATION_ID}/floor-plans/design-intent/${TEST_INTENT_ID}/reject`)
          .send({ rejection_reason: 'Layout does not match property inspection' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      it('should require rejection reason minimum length', async () => {
        const res = await request(app)
          .post(`/${TEST_VALUATION_ID}/floor-plans/design-intent/${TEST_INTENT_ID}/reject`)
          .send({ rejection_reason: 'short' });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('10 characters');
      });
    });
  });

  // =========================================================================
  // GEOMETRY VERSION ENDPOINTS
  // =========================================================================

  describe('Geometry Version Endpoints', () => {
    describe('GET /:valuationId/floor-plans/geometry/current', () => {
      it('should return current validated geometry', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: TEST_VALUATION_ID }] }) // Valuation check
          .mockResolvedValueOnce({ rows: [TEST_GEOMETRY_VERSION] }); // Current geometry

        const res = await request(app)
          .get(`/${TEST_VALUATION_ID}/floor-plans/geometry/current`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe(TEST_VERSION_ID);
      });

      it('should return 404 when no validated geometry exists', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: TEST_VALUATION_ID }] })
          .mockResolvedValueOnce({ rows: [] });

        const res = await request(app)
          .get(`/${TEST_VALUATION_ID}/floor-plans/geometry/current`);

        expect(res.status).toBe(404);
        expect(res.body.hint).toBeDefined();
      });
    });

    describe('GET /:valuationId/floor-plans/geometry/versions', () => {
      it('should list all geometry versions', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: TEST_VALUATION_ID }] }) // Valuation check
          .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // Count
          .mockResolvedValueOnce({ rows: [TEST_GEOMETRY_VERSION, { ...TEST_GEOMETRY_VERSION, version_number: 2 }] });

        const res = await request(app)
          .get(`/${TEST_VALUATION_ID}/floor-plans/geometry/versions`);

        expect(res.status).toBe(200);
        expect(res.body.data.versions).toHaveLength(2);
        expect(res.body.data.total).toBe(2);
      });

      it('should support pagination', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: TEST_VALUATION_ID }] })
          .mockResolvedValueOnce({ rows: [{ count: '10' }] })
          .mockResolvedValueOnce({ rows: [TEST_GEOMETRY_VERSION] });

        const res = await request(app)
          .get(`/${TEST_VALUATION_ID}/floor-plans/geometry/versions?limit=5&offset=5`);

        expect(res.status).toBe(200);
        expect(res.body.data.limit).toBe(5);
        expect(res.body.data.offset).toBe(5);
      });
    });

    describe('POST /:valuationId/floor-plans/geometry/regenerate', () => {
      it('should return 501 Not Implemented (Phase 2)', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: TEST_VALUATION_ID }] }) // Valuation check
          .mockResolvedValueOnce({ rows: [] }); // Lock check

        const res = await request(app)
          .post(`/${TEST_VALUATION_ID}/floor-plans/geometry/regenerate`);

        expect(res.status).toBe(501);
        expect(res.body.phase).toBe(2);
      });

      it('should prevent regeneration when locked', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: TEST_VALUATION_ID }] })
          .mockResolvedValueOnce({ rows: [{ id: TEST_VERSION_ID, status: 'locked' }] });

        const res = await request(app)
          .post(`/${TEST_VALUATION_ID}/floor-plans/geometry/regenerate`);

        expect(res.status).toBe(409);
        expect(res.body.error).toBe('Conflict');
      });
    });

    describe('POST /:valuationId/floor-plans/geometry/versions/:versionId/approve', () => {
      it('should approve geometry version', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [TEST_GEOMETRY_VERSION] }) // Version check
          .mockResolvedValueOnce({ rows: [] }) // Supersede old
          .mockResolvedValueOnce({ rows: [{ ...TEST_GEOMETRY_VERSION, status: 'approved' }] }) // Approve
          .mockResolvedValueOnce({ rows: [] }); // Audit log

        const res = await request(app)
          .post(`/${TEST_VALUATION_ID}/floor-plans/geometry/versions/${TEST_VERSION_ID}/approve`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      it('should not approve locked version', async () => {
        mockQuery.mockResolvedValueOnce({ 
          rows: [{ ...TEST_GEOMETRY_VERSION, status: 'locked' }] 
        });

        const res = await request(app)
          .post(`/${TEST_VALUATION_ID}/floor-plans/geometry/versions/${TEST_VERSION_ID}/approve`);

        expect(res.status).toBe(409);
      });
    });

    describe('GET /:valuationId/floor-plans/geometry/compare', () => {
      it('should compare two geometry versions', async () => {
        const versionA = { ...TEST_GEOMETRY_VERSION, version_number: 1 };
        const versionB = { 
          ...TEST_GEOMETRY_VERSION, 
          id: uuidv4(),
          version_number: 2, 
          measurements: { gfa_sqm: 125, nia_sqm: 112, rooms: [] },
          geometry_hash: 'xyz789',
        };

        mockQuery.mockResolvedValueOnce({ rows: [versionA, versionB] });

        const res = await request(app)
          .get(`/${TEST_VALUATION_ID}/floor-plans/geometry/compare?version_a=${versionA.id}&version_b=${versionB.id}`);

        expect(res.status).toBe(200);
        expect(res.body.data.differences.gfa_sqm_change).toBe(5);
        expect(res.body.data.differences.geometry_hash_changed).toBe(true);
      });

      it('should require both version parameters', async () => {
        const res = await request(app)
          .get(`/${TEST_VALUATION_ID}/floor-plans/geometry/compare?version_a=${TEST_VERSION_ID}`);

        expect(res.status).toBe(400);
      });
    });
  });

  // =========================================================================
  // ADJUSTMENT ENDPOINTS
  // =========================================================================

  describe('Adjustment Endpoints', () => {
    describe('POST /:valuationId/floor-plans/adjustments', () => {
      it('should return 501 after validation (Phase 2)', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: TEST_VALUATION_ID }] }) // Valuation check
          .mockResolvedValueOnce({ rows: [] }) // Lock check
          .mockResolvedValueOnce({ rows: [] }); // Audit log

        const res = await request(app)
          .post(`/${TEST_VALUATION_ID}/floor-plans/adjustments`)
          .send({
            floor_plan_id: uuidv4(),
            geometry_version_id: TEST_VERSION_ID,
            justification: 'Adjusting room size based on site inspection',
            adjustments: [
              {
                element_id: uuidv4(),
                element_type: 'partition',
                adjustment_type: 'move',
                before: { position: { x: 100, y: 100 } },
                after: { position: { x: 120, y: 100 } },
                constraints_applied: [],
              },
            ],
          });

        expect(res.status).toBe(501);
        expect(res.body.validated_adjustments).toBe(1);
        expect(res.body.audit_logged).toBe(true);
      });

      it('should require justification', async () => {
        const res = await request(app)
          .post(`/${TEST_VALUATION_ID}/floor-plans/adjustments`)
          .send({
            adjustments: [{ element_id: uuidv4(), element_type: 'partition', adjustment_type: 'move' }],
          });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('Justification');
      });

      it('should reject structural element adjustments', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: TEST_VALUATION_ID }] })
          .mockResolvedValueOnce({ rows: [] });

        const res = await request(app)
          .post(`/${TEST_VALUATION_ID}/floor-plans/adjustments`)
          .send({
            justification: 'Trying to move structural wall',
            adjustments: [
              {
                element_id: uuidv4(),
                element_type: 'structural',
                adjustment_type: 'move',
              },
            ],
          });

        expect(res.status).toBe(400);
        expect(res.body.details).toContain("Adjustment type 'move' not allowed for structural elements");
      });

      it('should prevent adjustments when locked', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: TEST_VALUATION_ID }] })
          .mockResolvedValueOnce({ rows: [{ id: TEST_VERSION_ID }] }); // Locked geometry

        const res = await request(app)
          .post(`/${TEST_VALUATION_ID}/floor-plans/adjustments`)
          .send({
            justification: 'Trying to adjust locked floor plan',
            adjustments: [{ element_id: uuidv4(), element_type: 'partition', adjustment_type: 'move' }],
          });

        expect(res.status).toBe(409);
      });
    });

    describe('GET /:valuationId/floor-plans/adjustments/constraints', () => {
      it('should return adjustment constraints', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: TEST_VALUATION_ID }] })
          .mockResolvedValueOnce({ rows: [] }); // No geometry

        const res = await request(app)
          .get(`/${TEST_VALUATION_ID}/floor-plans/adjustments/constraints`);

        expect(res.status).toBe(200);
        expect(res.body.data.global).toBeDefined();
        expect(res.body.data.element_types).toHaveLength(4); // structural, partition, opening, fixture
        expect(res.body.data.room_minimums).toBeDefined();
        expect(res.body.data.room_minimums.living).toBe(12);
      });
    });

    describe('GET /:valuationId/floor-plans/adjustments/history', () => {
      it('should return adjustment history', async () => {
        const auditEntry = {
          id: uuidv4(),
          valuation_id: TEST_VALUATION_ID,
          action: 'adjust_geometry',
          actor_type: 'user',
          timestamp: new Date().toISOString(),
        };

        mockQuery
          .mockResolvedValueOnce({ rows: [auditEntry] })
          .mockResolvedValueOnce({ rows: [{ count: '1' }] });

        const res = await request(app)
          .get(`/${TEST_VALUATION_ID}/floor-plans/adjustments/history`);

        expect(res.status).toBe(200);
        expect(res.body.data.adjustments).toHaveLength(1);
      });
    });

    describe('POST /:valuationId/floor-plans/lock', () => {
      it('should lock floor plan', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: TEST_VALUATION_ID }] }) // Valuation check
          .mockResolvedValueOnce({ rows: [{ ...TEST_GEOMETRY_VERSION, status: 'approved' }] }) // Approved geometry
          .mockResolvedValueOnce({ rows: [{ ...TEST_GEOMETRY_VERSION, status: 'locked' }] }) // Lock geometry
          .mockResolvedValueOnce({ rows: [] }) // Lock legacy floor plan
          .mockResolvedValueOnce({ rows: [] }); // Audit log

        const res = await request(app)
          .post(`/${TEST_VALUATION_ID}/floor-plans/lock`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe('locked');
      });

      it('should require approved geometry before locking', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: TEST_VALUATION_ID }] })
          .mockResolvedValueOnce({ rows: [] }); // No approved geometry

        const res = await request(app)
          .post(`/${TEST_VALUATION_ID}/floor-plans/lock`);

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('No approved geometry');
      });
    });

    describe('POST /:valuationId/floor-plans/unlock', () => {
      it('should unlock floor plan with reason', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ ...TEST_GEOMETRY_VERSION, status: 'locked' }] }) // Locked geometry
          .mockResolvedValueOnce({ rows: [{ ...TEST_GEOMETRY_VERSION, status: 'approved' }] }) // Unlock
          .mockResolvedValueOnce({ rows: [] }) // Unlock legacy
          .mockResolvedValueOnce({ rows: [] }); // Audit log

        const res = await request(app)
          .post(`/${TEST_VALUATION_ID}/floor-plans/unlock`)
          .send({ reason: 'Client requested modifications after initial lock' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      it('should require unlock reason', async () => {
        const res = await request(app)
          .post(`/${TEST_VALUATION_ID}/floor-plans/unlock`)
          .send({});

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('10 characters');
      });
    });
  });

  // =========================================================================
  // FLOOR PLAN SERVICE METHODS
  // =========================================================================

  describe('FloorPlanService Methods', () => {
    // Import service for direct testing
    let floorPlanService: any;

    beforeAll(async () => {
      // Dynamically import to use mocked database
      const serviceModule = await import('../../src/services/valuation-engine/floorPlanService');
      floorPlanService = serviceModule.floorPlanService;
    });

    describe('createGeometryVersion', () => {
      it('should create a new geometry version', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ next_version: 1 }] }) // Version number
          .mockResolvedValueOnce({ rows: [{ id: TEST_VERSION_ID, version_number: 1 }] }); // Insert

        const result = await floorPlanService.createGeometryVersion({
          valuation_id: TEST_VALUATION_ID,
          blender_output: { walls: [], rooms: [] },
          fabric_projection: { objects: [] },
          measurements: { gfa_sqm: 100, nia_sqm: 90 },
        });

        expect(result.id).toBe(TEST_VERSION_ID);
        expect(result.version_number).toBe(1);
      });
    });

    describe('logAuditEntry', () => {
      it('should log an audit entry', async () => {
        const auditId = uuidv4();
        mockQuery.mockResolvedValueOnce({ rows: [{ id: auditId }] });

        const result = await floorPlanService.logAuditEntry({
          valuation_id: TEST_VALUATION_ID,
          action: 'update_canvas',
          actor_type: 'user',
          actor_id: TEST_USER_ID,
        });

        expect(result).toBe(auditId);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO valuation_floor_plan_audit_log'),
          expect.any(Array)
        );
      });
    });

    describe('saveDesignIntent', () => {
      it('should save LLM design intent', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: TEST_INTENT_ID }] });

        const result = await floorPlanService.saveDesignIntent({
          valuation_id: TEST_VALUATION_ID,
          llm_model: 'claude-3-opus',
          input_features: TEST_PROPERTY_FEATURES,
          layout_strategy: { template_id: 'test', style: 'modern' },
          room_program: [],
          assumptions: [],
        });

        expect(result).toBe(TEST_INTENT_ID);
      });
    });

    describe('getAuditHistory', () => {
      it('should return paginated audit history', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // Count
          .mockResolvedValueOnce({ rows: [{ id: uuidv4() }] }); // Entries

        const result = await floorPlanService.getAuditHistory(TEST_VALUATION_ID, {
          limit: 10,
          offset: 0,
        });

        expect(result.total).toBe(5);
        expect(result.entries).toHaveLength(1);
      });
    });
  });
});

// =========================================================================
// TYPE VALIDATION TESTS
// =========================================================================

describe('Floor Plan Types Validation', () => {
  // Import schemas
  let PropertyFeaturesSchema: any;
  let LLMDesignIntentSchema: any;
  let UserAdjustmentDeltasSchema: any;

  beforeAll(async () => {
    const types = await import('../../src/types/floorPlanDesign');
    PropertyFeaturesSchema = types.PropertyFeaturesSchema;
    LLMDesignIntentSchema = types.LLMDesignIntentSchema;
    UserAdjustmentDeltasSchema = types.UserAdjustmentDeltasSchema;
  });

  describe('PropertyFeaturesSchema', () => {
    it('should validate valid property features', () => {
      const result = PropertyFeaturesSchema.safeParse(TEST_PROPERTY_FEATURES);
      expect(result.success).toBe(true);
    });

    it('should reject negative bedrooms', () => {
      const result = PropertyFeaturesSchema.safeParse({
        ...TEST_PROPERTY_FEATURES,
        bedrooms: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid property type', () => {
      const result = PropertyFeaturesSchema.safeParse({
        ...TEST_PROPERTY_FEATURES,
        property_type: 'invalid_type',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('LLMDesignIntentSchema', () => {
    it('should validate complete design intent', () => {
      const intent = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        model_id: 'claude-3-opus',
        request_id: uuidv4(),
        input_features: TEST_PROPERTY_FEATURES,
        layout_strategy: {
          template_id: 'test',
          style: 'colonial',
          circulation_type: 'central_corridor',
        },
        room_program: [{
          room_id: uuidv4(),
          room_type: 'living',
          target_area_sqm: 20,
          min_area_sqm: 12,
          importance: 'primary',
          adjacency_requirements: ['kitchen'],
          natural_light_required: true,
          ventilation_required: true,
          floor_number: 0,
        }],
        assumptions: [{
          assumption_id: uuidv4(),
          category: 'dimension',
          assumption: 'Standard ceiling height',
          default_value: 3,
          confidence: 0.9,
          source: 'Ghana Building Code',
          overridable: true,
          applied: true,
        }],
      };

      const result = LLMDesignIntentSchema.safeParse(intent);
      expect(result.success).toBe(true);
    });
  });

  describe('UserAdjustmentDeltasSchema', () => {
    it('should require justification minimum length', () => {
      const result = UserAdjustmentDeltasSchema.safeParse({
        adjustment_id: uuidv4(),
        valuation_id: uuidv4(),
        floor_plan_id: uuidv4(),
        geometry_version_id: uuidv4(),
        timestamp: new Date().toISOString(),
        user_id: uuidv4(),
        adjustments: [],
        justification: 'short', // Too short
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toContain('10 characters');
    });
  });
});
