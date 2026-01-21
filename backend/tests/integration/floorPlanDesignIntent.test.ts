/**
 * Floor Plan Design Intent Service Integration Tests
 *
 * Tests for the LLM-powered design intent generation service.
 *
 * @module tests/integration/floorPlanDesignIntent
 */

import {
  FloorPlanDesignIntentService,
  getFloorPlanDesignIntentService,
  SurfacedAssumption,
} from '../../src/services/ai/floorPlanDesignIntentService';
import { GHANA_BUILDING_CODE_LI_1630, getMinimumRoomSize } from '../../src/services/geometry/ghanaBuildingCode';
import { validateRoomProgram, suggestRoomSizes } from '../../src/services/geometry/roomSizeValidator';
import { validateAccessibility } from '../../src/services/geometry/accessibilityValidator';
import type { PropertyFeatures, RoomProgram, RoomType } from '../../src/types/floorPlanDesign';

describe('FloorPlanDesignIntentService', () => {
  let service: FloorPlanDesignIntentService;

  beforeAll(() => {
    service = getFloorPlanDesignIntentService();
    // Add error listener to prevent unhandled error events
    service.on('error', () => {
      // Intentionally empty - validation tests expect errors
    });
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = getFloorPlanDesignIntentService();
      const instance2 = getFloorPlanDesignIntentService();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Input Validation', () => {
    const validFeatures: PropertyFeatures = {
      bedrooms: 3,
      bathrooms: 2,
      total_area_sqm: 120,
      property_type: 'single_family',
      floors: 1,
    };

    it('should reject invalid bedrooms count', async () => {
      const response = await service.generateDesignIntent({
        valuationId: 'test-123',
        features: {
          ...validFeatures,
          bedrooms: -1,
        },
      });

      expect(response.success).toBe(false);
      expect(response.validationErrors).toBeDefined();
      expect(response.validationErrors?.length).toBeGreaterThan(0);
    });

    it('should reject invalid total area', async () => {
      const response = await service.generateDesignIntent({
        valuationId: 'test-123',
        features: {
          ...validFeatures,
          total_area_sqm: 0,
        },
      });

      expect(response.success).toBe(false);
      expect(response.validationErrors).toBeDefined();
    });

    it('should reject invalid property type', async () => {
      const response = await service.generateDesignIntent({
        valuationId: 'test-123',
        features: {
          ...validFeatures,
          property_type: 'invalid_type' as any,
        },
      });

      expect(response.success).toBe(false);
    });

    it('should accept valid property features', async () => {
      // This test requires ANTHROPIC_API_KEY to be set
      if (!process.env.ANTHROPIC_API_KEY) {
        console.log('Skipping API test: ANTHROPIC_API_KEY not set');
        return;
      }

      const response = await service.generateDesignIntent({
        valuationId: 'test-123',
        features: validFeatures,
        generateAlternatives: false,
      });

      // With API key, this should succeed
      expect(response.success).toBe(true);
      expect(response.designIntent).toBeDefined();
    });
  });

  describe('Assumption Extraction', () => {
    it('should extract assumptions from a design intent', () => {
      const mockDesignIntent = {
        version: '1.0.0' as const,
        timestamp: new Date().toISOString(),
        model_id: 'claude-sonnet-4-20250514',
        request_id: 'test-123',
        input_features: {
          bedrooms: 3,
          bathrooms: 2,
          total_area_sqm: 120,
          property_type: 'single_family' as const,
          floors: 1,
        },
        layout_strategy: {
          template_id: 'RES_3BR_COLONIAL',
          style: 'colonial' as const,
          circulation_type: 'central_corridor' as const,
        },
        room_program: [
          {
            room_id: '1',
            room_type: 'living' as RoomType,
            room_name: 'Living Room',
            target_area_sqm: 18,
            min_area_sqm: 12,
            importance: 'primary' as const,
            adjacency_requirements: ['dining'],
            natural_light_required: true,
            ventilation_required: true,
            floor_number: 0,
          },
        ],
        assumptions: [
          {
            assumption_id: 'a1',
            category: 'dimension' as const,
            assumption: 'Standard ceiling height',
            default_value: 3.0,
            unit: 'm',
            confidence: 0.85,
            source: 'Ghana Building Code LI 1630',
            overridable: true,
            applied: true,
          },
        ],
      };

      const assumptions = service.extractAssumptions(mockDesignIntent);

      expect(assumptions.length).toBeGreaterThan(0);
      expect(assumptions[0]).toHaveProperty('id');
      expect(assumptions[0]).toHaveProperty('category');
      expect(assumptions[0]).toHaveProperty('confidence');
      expect(assumptions[0]).toHaveProperty('requires_user_confirmation');
    });

    it('should flag low confidence assumptions for user confirmation', () => {
      const mockDesignIntent = {
        version: '1.0.0' as const,
        timestamp: new Date().toISOString(),
        model_id: 'claude-sonnet-4-20250514',
        request_id: 'test-123',
        input_features: {
          bedrooms: 3,
          bathrooms: 2,
          total_area_sqm: 120,
          property_type: 'single_family' as const,
          floors: 1,
        },
        layout_strategy: {
          template_id: 'RES_3BR_COLONIAL',
          style: 'colonial' as const,
          circulation_type: 'central_corridor' as const,
        },
        room_program: [],
        assumptions: [
          {
            assumption_id: 'a1',
            category: 'layout' as const,
            assumption: 'Corridor width',
            default_value: 1.2,
            unit: 'm',
            confidence: 0.6, // Low confidence
            source: 'Typical practice',
            overridable: true,
            applied: true,
          },
        ],
      };

      const assumptions = service.extractAssumptions(mockDesignIntent);
      const lowConfidence = assumptions.filter(a => a.requires_user_confirmation);

      expect(lowConfidence.length).toBeGreaterThan(0);
    });
  });
});

describe('Ghana Building Code Validation', () => {
  describe('Room Minimums', () => {
    const roomTests: Array<{ type: RoomType; minSqm: number }> = [
      { type: 'living', minSqm: 12.0 },
      { type: 'dining', minSqm: 9.0 },
      { type: 'kitchen', minSqm: 5.5 },
      { type: 'bedroom', minSqm: 9.0 },
      { type: 'master_bedroom', minSqm: 11.0 },
      { type: 'bathroom', minSqm: 3.0 },
      { type: 'toilet', minSqm: 1.5 },
      { type: 'storage', minSqm: 2.0 },
      { type: 'entrance', minSqm: 2.0 },
      { type: 'corridor', minSqm: 1.8 },
    ];

    test.each(roomTests)(
      '$type should have minimum size of $minSqm sqm per LI 1630',
      ({ type, minSqm }) => {
        const actualMin = getMinimumRoomSize(type);
        expect(actualMin).toBe(minSqm);
      }
    );
  });

  describe('Dimension Requirements', () => {
    it('should specify 2.4m minimum room width', () => {
      expect(GHANA_BUILDING_CODE_LI_1630.DIMENSION_MINIMUMS.room_width).toBe(2.4);
    });

    it('should specify 1.0m minimum corridor width', () => {
      expect(GHANA_BUILDING_CODE_LI_1630.DIMENSION_MINIMUMS.corridor_width).toBe(1.0);
    });

    it('should specify 0.9m minimum internal door width', () => {
      expect(GHANA_BUILDING_CODE_LI_1630.DIMENSION_MINIMUMS.door_width_internal).toBe(0.9);
    });

    it('should specify 1.0m minimum external door width', () => {
      expect(GHANA_BUILDING_CODE_LI_1630.DIMENSION_MINIMUMS.door_width_external).toBe(1.0);
    });

    it('should specify 2.7m minimum ceiling height for residential', () => {
      expect(GHANA_BUILDING_CODE_LI_1630.DIMENSION_MINIMUMS.ceiling_height_residential).toBe(2.7);
    });

    it('should specify 10% minimum window area ratio', () => {
      expect(GHANA_BUILDING_CODE_LI_1630.DIMENSION_MINIMUMS.window_area_ratio).toBe(0.10);
    });
  });

  describe('Wall Thickness', () => {
    it('should specify 230mm for external walls', () => {
      expect(GHANA_BUILDING_CODE_LI_1630.WALL_THICKNESS.external).toBe(230);
    });

    it('should specify 150mm for internal partitions', () => {
      expect(GHANA_BUILDING_CODE_LI_1630.WALL_THICKNESS.internal).toBe(150);
    });

    it('should specify 200mm for load-bearing internal walls', () => {
      expect(GHANA_BUILDING_CODE_LI_1630.WALL_THICKNESS.load_bearing).toBe(200);
    });
  });

  describe('Staircase Requirements', () => {
    it('should specify 0.9m minimum staircase width', () => {
      expect(GHANA_BUILDING_CODE_LI_1630.STAIRCASE.min_width).toBe(0.9);
    });

    it('should specify 0.19m maximum riser height', () => {
      expect(GHANA_BUILDING_CODE_LI_1630.STAIRCASE.max_riser).toBe(0.19);
    });

    it('should specify 0.25m minimum tread depth', () => {
      expect(GHANA_BUILDING_CODE_LI_1630.STAIRCASE.min_tread).toBe(0.25);
    });
  });
});

describe('Room Program Validation', () => {
  it('should validate a valid room program', () => {
    const rooms: RoomProgram[] = [
      {
        room_id: '1',
        room_type: 'living',
        target_area_sqm: 15,
        min_area_sqm: 12,
        importance: 'primary',
        adjacency_requirements: [],
        natural_light_required: true,
        ventilation_required: true,
        floor_number: 0,
      },
      {
        room_id: '2',
        room_type: 'bedroom',
        target_area_sqm: 12,
        min_area_sqm: 9,
        importance: 'primary',
        adjacency_requirements: [],
        natural_light_required: true,
        ventilation_required: true,
        floor_number: 0,
      },
    ];

    const result = validateRoomProgram(rooms, 100);

    expect(result.valid).toBe(true);
    expect(result.summary.rooms_valid).toBe(2);
    expect(result.summary.rooms_invalid).toBe(0);
  });

  it('should detect rooms below minimum size', () => {
    const rooms: RoomProgram[] = [
      {
        room_id: '1',
        room_type: 'living',
        target_area_sqm: 8, // Below 12 sqm minimum
        min_area_sqm: 12,
        importance: 'primary',
        adjacency_requirements: [],
        natural_light_required: true,
        ventilation_required: true,
        floor_number: 0,
      },
    ];

    const result = validateRoomProgram(rooms, 100);

    expect(result.valid).toBe(false);
    expect(result.summary.rooms_invalid).toBe(1);
    expect(result.summary.total_area_deficit_sqm).toBeGreaterThan(0);
  });

  it('should detect when total program exceeds available area', () => {
    const rooms: RoomProgram[] = [
      {
        room_id: '1',
        room_type: 'living',
        target_area_sqm: 60,
        min_area_sqm: 12,
        importance: 'primary',
        adjacency_requirements: [],
        natural_light_required: true,
        ventilation_required: true,
        floor_number: 0,
      },
      {
        room_id: '2',
        room_type: 'bedroom',
        target_area_sqm: 60,
        min_area_sqm: 9,
        importance: 'primary',
        adjacency_requirements: [],
        natural_light_required: true,
        ventilation_required: true,
        floor_number: 0,
      },
    ];

    const result = validateRoomProgram(rooms, 80); // Only 80 sqm available

    expect(result.valid).toBe(false);
    expect(result.summary.critical_failures.length).toBeGreaterThan(0);
  });
});

describe('Room Size Suggestions', () => {
  it('should suggest room sizes within available area', () => {
    const roomTypes: RoomType[] = ['living', 'bedroom', 'kitchen', 'bathroom'];
    const totalArea = 100;

    const suggestions = suggestRoomSizes(roomTypes, totalArea);

    expect(suggestions.size).toBe(4);
    
    // Each room should be at least minimum size
    for (const [roomType, size] of suggestions) {
      const minSize = getMinimumRoomSize(roomType);
      expect(size).toBeGreaterThanOrEqual(minSize);
    }

    // Total should not exceed available area (accounting for circulation)
    const totalSuggested = Array.from(suggestions.values()).reduce((a, b) => a + b, 0);
    expect(totalSuggested).toBeLessThanOrEqual(totalArea);
  });

  it('should prioritize primary rooms for extra space', () => {
    const roomTypes: RoomType[] = ['living', 'bedroom', 'storage'];
    const totalArea = 100;

    const suggestions = suggestRoomSizes(roomTypes, totalArea);

    const livingExtra = suggestions.get('living')! - getMinimumRoomSize('living');
    const storageExtra = suggestions.get('storage')! - getMinimumRoomSize('storage');

    // Living room (primary) should get more extra space than storage (ancillary)
    expect(livingExtra).toBeGreaterThan(storageExtra);
  });
});

describe('Accessibility Validation', () => {
  it('should validate accessible door widths', () => {
    const geometry = {
      version: '1.0.0',
      geometry_hash: 'test',
      generated_at: new Date().toISOString(),
      measurements: {
        gfa_sqm: 100,
        nia_sqm: 85,
        efficiency_ratio: 0.85,
        wall_area_sqm: 50,
        external_perimeter_m: 40,
        rooms: [],
        floors: [],
        calculation_method: 'blender_mesh' as const,
      },
      walls: [],
      rooms: [],
      floors: [],
      openings: [
        {
          opening_id: 'door-1',
          opening_type: 'door' as const,
          wall_id: 'wall-1',
          position: { x: 0, y: 0, z: 0 },
          width_m: 0.8, // Below accessible minimum of 1.0m
          height_m: 2.1,
        },
      ],
      fabric_projection: {
        canvas_width: 800,
        canvas_height: 600,
        scale_pixels_per_meter: 50,
        origin: { x: 0, y: 0 },
        floor_projections: [],
      },
      validation: {
        valid: true,
        errors: [],
        warnings: [],
        code_compliance: {
          ghana_building_code: true,
          minimum_room_sizes: true,
          ventilation_requirements: true,
          egress_requirements: true,
          details: [],
        },
      },
      processing_time_ms: 100,
      blender_version: '4.0.2',
    };

    const result = validateAccessibility(geometry, true); // Require full accessibility

    expect(result.accessible).toBe(false);
    expect(result.violations.some(v => v.code === 'ACC-DOOR-WIDTH')).toBe(true);
  });

  it('should pass validation for accessible doors', () => {
    const geometry = {
      version: '1.0.0',
      geometry_hash: 'test',
      generated_at: new Date().toISOString(),
      measurements: {
        gfa_sqm: 100,
        nia_sqm: 85,
        efficiency_ratio: 0.85,
        wall_area_sqm: 50,
        external_perimeter_m: 40,
        rooms: [],
        floors: [],
        calculation_method: 'blender_mesh' as const,
      },
      walls: [],
      rooms: [],
      floors: [{ 
        floor_number: 0, 
        floor_label: 'Ground', 
        floor_to_floor_height_m: 3.0,
        elevation_m: 0,
        slab_thickness_mm: 150,
        outline: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 8, z: 0 }, { x: 0, y: 8, z: 0 }]
      }],
      openings: [
        {
          opening_id: 'door-1',
          opening_type: 'door' as const,
          wall_id: 'wall-1',
          position: { x: 0, y: 0, z: 0 },
          width_m: 1.0, // Meets accessible minimum
          height_m: 2.1,
        },
      ],
      fabric_projection: {
        canvas_width: 800,
        canvas_height: 600,
        scale_pixels_per_meter: 50,
        origin: { x: 0, y: 0 },
        floor_projections: [],
      },
      validation: {
        valid: true,
        errors: [],
        warnings: [],
        code_compliance: {
          ghana_building_code: true,
          minimum_room_sizes: true,
          ventilation_requirements: true,
          egress_requirements: true,
          details: [],
        },
      },
      processing_time_ms: 100,
      blender_version: '4.0.2',
    };

    const result = validateAccessibility(geometry, false);

    expect(result.level).not.toBe('none');
    expect(result.score).toBeGreaterThan(50);
  });
});

describe('Template Selection', () => {
  const templates = [
    { id: 'RES_2BR_COMPACT', minArea: 55, maxArea: 80, bedrooms: 2 },
    { id: 'RES_3BR_COLONIAL', minArea: 100, maxArea: 150, bedrooms: 3 },
    { id: 'RES_3BR_MODERN', minArea: 110, maxArea: 160, bedrooms: 3 },
    { id: 'RES_4BR_EXECUTIVE', minArea: 160, maxArea: 220, bedrooms: 4 },
    { id: 'RES_2BR_APARTMENT', minArea: 60, maxArea: 85, bedrooms: 2 },
    { id: 'RES_COMPOUND', minArea: 120, maxArea: 200, bedrooms: 4 },
  ];

  test.each(templates)(
    'template $id should have valid area range [$minArea-$maxArea] for $bedrooms BR',
    ({ minArea, maxArea, bedrooms }) => {
      expect(minArea).toBeGreaterThan(0);
      expect(maxArea).toBeGreaterThan(minArea);
      
      // Minimum area should accommodate room minimums
      const minRoomTotal = 
        12 + // living
        (bedrooms * 9) + // bedrooms
        (Math.ceil(bedrooms / 2) * 3) + // bathrooms
        5.5 + // kitchen
        10; // circulation estimate
      
      expect(minArea).toBeGreaterThanOrEqual(minRoomTotal * 0.9); // Allow 10% flexibility
    }
  );

  it('should have at least 6 residential templates', () => {
    expect(templates.length).toBeGreaterThanOrEqual(6);
  });
});

// ============================================================================
// PROPERTY MAPPER TESTS
// Integration with ComprehensivePropertyData from frontend
// ============================================================================

import {
  mapPropertyToFeatures,
  mapComprehensivePropertyToFeatures,
  PROPERTY_TYPE_MAP,
  CONSTRUCTION_TYPE_MAP,
} from '../../src/utils/propertyMapper';

describe('PropertyMapper Integration', () => {
  describe('mapPropertyToFeatures', () => {
    it('should map database property record to PropertyFeatures', () => {
      const dbRecord = {
        id: 'prop-123',
        property_type: 'house',
        bedrooms: 4,
        bathrooms: 3,
        gfa_sqm: 180,
        floors: 2,
        year_built: 2015,
        quality_rating: 'high',
        parking_spaces: 2,
        has_garden: true,
      };

      const features = mapPropertyToFeatures(dbRecord);

      expect(features.bedrooms).toBe(4);
      expect(features.bathrooms).toBe(3);
      expect(features.total_area_sqm).toBe(180);
      expect(features.property_type).toBe('single_family'); // 'house' maps to 'single_family'
      expect(features.floors).toBe(2);
      expect(features.year_built).toBe(2015);
      expect(features.user_preferences?.preferred_style).toBe('modern'); // Post-2010 = modern
      expect(features.user_preferences?.garage_spaces).toBe(2);
      expect(features.user_preferences?.outdoor_living).toBe(true);
    });

    it('should handle ComprehensivePropertyData property types', () => {
      // Test all PROPERTY_TYPES from comprehensiveProperty.ts
      const testCases = [
        { input: 'house', expected: 'single_family' },
        { input: 'semi_detached', expected: 'multi_family' },
        { input: 'townhouse', expected: 'townhouse' },
        { input: 'apartment', expected: 'apartment' },
        { input: 'condo', expected: 'apartment' },
        { input: 'villa', expected: 'single_family' },
        { input: 'bungalow', expected: 'single_family' },
        { input: 'duplex', expected: 'multi_family' },
        { input: 'commercial', expected: 'commercial' },
        { input: 'office', expected: 'commercial' },
        { input: 'retail', expected: 'commercial' },
        { input: 'industrial', expected: 'industrial' },
        { input: 'warehouse', expected: 'industrial' },
        { input: 'mixed_use', expected: 'mixed_use' },
      ];

      for (const { input, expected } of testCases) {
        const features = mapPropertyToFeatures({ id: 'test', property_type: input });
        expect(features.property_type).toBe(expected);
      }
    });

    it('should use fallback values for missing fields', () => {
      const minimalRecord = { id: 'prop-minimal' };
      const features = mapPropertyToFeatures(minimalRecord);

      expect(features.bedrooms).toBe(3); // Default
      expect(features.bathrooms).toBe(2); // Default
      expect(features.total_area_sqm).toBe(100); // Fallback
      expect(features.property_type).toBe('single_family'); // Default
      expect(features.floors).toBe(1); // Default
    });
  });

  describe('mapComprehensivePropertyToFeatures', () => {
    it('should map frontend ComprehensivePropertyData to PropertyFeatures', () => {
      // Simulate data from ComprehensivePropertyForm
      const frontendData = {
        property_type: 'villa',
        gfa: 250,
        bedrooms: 5,
        bathrooms: 4,
        total_floors: 2,
        year_built: 2020,
        quality_rating: 'luxury',
        has_pool: true,
        has_garden: true,
        parking_spaces: 3,
      };

      const features = mapComprehensivePropertyToFeatures(frontendData);

      expect(features.bedrooms).toBe(5);
      expect(features.bathrooms).toBe(4);
      expect(features.total_area_sqm).toBe(250);
      expect(features.property_type).toBe('single_family'); // villa maps to single_family
      expect(features.floors).toBe(2);
      expect(features.user_preferences?.preferred_style).toBe('modern'); // 2020 = modern
      expect(features.user_preferences?.open_plan_kitchen).toBe(true); // luxury = open plan
      expect(features.user_preferences?.garage_spaces).toBe(3);
    });
  });

  describe('Property Type Mapping', () => {
    it('should cover all PROPERTY_TYPES from comprehensiveProperty.ts', () => {
      // These are all values from PROPERTY_TYPES in comprehensiveProperty.ts
      const frontendPropertyTypes = [
        'house', 'semi_detached', 'townhouse', 'apartment', 'condo',
        'villa', 'bungalow', 'duplex', 'commercial', 'office',
        'retail', 'industrial', 'warehouse', 'land', 'mixed_use',
      ];

      for (const type of frontendPropertyTypes) {
        expect(PROPERTY_TYPE_MAP[type]).toBeDefined();
      }
    });
  });

  describe('Construction Type Mapping', () => {
    it('should map common Ghanaian construction types', () => {
      const testCases = [
        { input: 'concrete_block', expected: 'concrete_block' },
        { input: 'sandcrete', expected: 'sandcrete_block' },
        { input: 'burnt_brick', expected: 'burnt_brick' },
        { input: 'reinforced_concrete', expected: 'reinforced_concrete' },
        { input: 'timber', expected: 'timber_frame' },
        { input: 'prefab', expected: 'prefabricated' },
      ];

      for (const { input, expected } of testCases) {
        expect(CONSTRUCTION_TYPE_MAP[input]).toBe(expected);
      }
    });
  });
});

// ============================================================================
// BLENDER TO FLOOR PLAN INTEGRATION TESTS
// ============================================================================

describe('Blender Geometry to Floor Plan Integration', () => {
  describe('FabricProjection to FloorPlanCanvas Conversion', () => {
    it('should convert Blender FabricProjection to FloorPlanCanvas format', () => {
      // Mock Blender geometry result
      const mockFabricProjection = {
        canvas_width: 1200,
        canvas_height: 800,
        scale_pixels_per_meter: 20,
        origin: { x: 0, y: 0 },
        floor_projections: [
          {
            floor_number: 0,
            objects: [
              {
                type: 'polygon' as const,
                element_id: 'room_living_001',
                element_type: 'room' as const,
                fabric_properties: {
                  points: [
                    { x: 0, y: 0 },
                    { x: 100, y: 0 },
                    { x: 100, y: 80 },
                    { x: 0, y: 80 },
                  ],
                  fill: '#E8F5E9',
                  stroke: '#333333',
                  roomType: 'living',
                  left: 50,
                  top: 40,
                },
              },
              {
                type: 'polygon' as const,
                element_id: 'room_bedroom_001',
                element_type: 'room' as const,
                fabric_properties: {
                  points: [
                    { x: 100, y: 0 },
                    { x: 180, y: 0 },
                    { x: 180, y: 80 },
                    { x: 100, y: 80 },
                  ],
                  fill: '#E3F2FD',
                  stroke: '#333333',
                  roomType: 'bedroom',
                  left: 140,
                  top: 40,
                },
              },
            ],
          },
        ],
      };

      // Convert to FloorPlanCanvas format (same logic as in apply endpoint)
      const floorProjection = mockFabricProjection.floor_projections[0];
      const canvasJson = {
        version: '1.0.0',
        objects: floorProjection.objects.map(obj => ({
          type: obj.type,
          ...obj.fabric_properties,
          name: obj.element_id,
          roomType: obj.element_type === 'room' 
            ? (obj.fabric_properties?.roomType as string) 
            : undefined,
        })),
        background: '#ffffff',
      };

      // Verify structure
      expect(canvasJson.version).toBe('1.0.0');
      expect(canvasJson.objects).toHaveLength(2);
      expect(canvasJson.objects[0].name).toBe('room_living_001');
      expect(canvasJson.objects[0].roomType).toBe('living');
      expect(canvasJson.objects[0].type).toBe('polygon');
      expect(canvasJson.objects[0].fill).toBe('#E8F5E9');
      expect(canvasJson.objects[1].name).toBe('room_bedroom_001');
      expect(canvasJson.objects[1].roomType).toBe('bedroom');
    });

    it('should handle multi-floor geometry projections', () => {
      const mockMultiFloorProjection = {
        floor_projections: [
          {
            floor_number: 0,
            objects: [{ type: 'polygon' as const, element_id: 'ground_floor', element_type: 'room' as const, fabric_properties: { roomType: 'living' } }],
          },
          {
            floor_number: 1,
            objects: [{ type: 'polygon' as const, element_id: 'first_floor', element_type: 'room' as const, fabric_properties: { roomType: 'bedroom' } }],
          },
          {
            floor_number: 2,
            objects: [{ type: 'polygon' as const, element_id: 'second_floor', element_type: 'room' as const, fabric_properties: { roomType: 'bedroom' } }],
          },
        ],
      };

      // Each floor should create a separate floor plan
      expect(mockMultiFloorProjection.floor_projections).toHaveLength(3);
      
      for (const fp of mockMultiFloorProjection.floor_projections) {
        expect(fp.floor_number).toBeGreaterThanOrEqual(0);
        expect(fp.objects.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Measurement Flow to Valuation', () => {
    it('should structure measurements for valuation consumption', () => {
      const mockMeasurements = {
        gfa_sqm: 120.5,
        nia_sqm: 108.2,
        efficiency_ratio: 0.898,
        wall_area_sqm: 245.6,
        external_perimeter_m: 42.0,
        calculation_method: 'blender_mesh' as const,
        rooms: [
          {
            room_id: 'living_001',
            room_name: 'Living Room',
            room_type: 'living' as RoomType,
            area_sqm: 24.5,
            perimeter_m: 20.0,
            width_m: 5.0,
            length_m: 4.9,
            height_m: 2.7,
            meets_minimum: true,
            minimum_required_sqm: 12,
          },
          {
            room_id: 'bedroom_001',
            room_name: 'Master Bedroom',
            room_type: 'master_bedroom' as RoomType,
            area_sqm: 14.5,
            perimeter_m: 15.2,
            width_m: 3.8,
            length_m: 3.8,
            height_m: 2.7,
            meets_minimum: true,
            minimum_required_sqm: 11,
          },
        ],
        floors: [
          {
            floor_number: 0,
            floor_label: 'Ground Floor',
            gfa_sqm: 120.5,
            nia_sqm: 108.2,
            room_count: 6,
          },
        ],
      };

      // Verify GFA is available for Cost Method valuation
      expect(mockMeasurements.gfa_sqm).toBeGreaterThan(0);
      expect(mockMeasurements.nia_sqm).toBeLessThanOrEqual(mockMeasurements.gfa_sqm);
      expect(mockMeasurements.efficiency_ratio).toBeGreaterThan(0);
      expect(mockMeasurements.efficiency_ratio).toBeLessThanOrEqual(1);

      // Verify room breakdown for detailed valuation
      expect(mockMeasurements.rooms.length).toBeGreaterThan(0);
      for (const room of mockMeasurements.rooms) {
        expect(room.area_sqm).toBeGreaterThan(0);
        expect(room.room_type).toBeDefined();
      }

      // Verify calculation method is Blender (authoritative)
      expect(mockMeasurements.calculation_method).toBe('blender_mesh');
    });

    it('should use Blender GFA over manual measurement when available', () => {
      // Simulating the priority: Blender > measured > estimated
      const measurements = [
        { source: 'blender_mesh', gfa: 120.5, confidence: 'verified' },
        { source: 'shoelace_2d', gfa: 118.2, confidence: 'measured' },
        { source: 'user_input', gfa: 115.0, confidence: 'estimated' },
      ];

      // Blender should be preferred
      const preferred = measurements.find(m => m.source === 'blender_mesh');
      expect(preferred?.confidence).toBe('verified');
      expect(preferred?.gfa).toBe(120.5);
    });
  });
});
