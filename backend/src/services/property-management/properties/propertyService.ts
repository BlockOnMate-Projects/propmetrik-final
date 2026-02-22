
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import db from '../../../database';
import {
    Property,
    CreatePropertyDto
} from '../../../types/property-management.types';
import { logger } from '../../../utils/logger';
import { ghanaPostService } from '../../data-hub/ghanaPostGeocodingService';

export class PropertyService {
    /**
     * Create a new property for the PM module
     */
    async createProperty(organizationId: string, data: CreatePropertyDto, userId: string): Promise<Property> {
        logger.info('Starting createProperty', { organizationId, unitsCount: data.unitsCount, title: data.title });
        try {
            // Multi-unit creation logic
            if (data.unitsCount && data.unitsCount > 1) {
                logger.info(`Creating multi-unit property: ${data.title} with ${data.unitsCount} units`);

                // 1. Create Parent Property (Container)
                const parentData: CreatePropertyDto = {
                    ...data,
                    price: 0, // Parent container usually doesn't have a "rent" itself, it's the units
                    description: (data.description || '') + `\n(Multi-unit Building with ${data.unitsCount} units)`
                };

                const parent = await this.createSingleProperty(organizationId, parentData, userId);

                // 2. Create Units
                const unitPromises = [];
                for (let i = 1; i <= data.unitsCount; i++) {
                    const unitData: CreatePropertyDto = {
                        ...data,
                        title: `${data.title} - Unit ${i}`,
                        parentPropertyId: parent.id,
                        unitNumber: String(i),
                        // Ensure units inherit relevant fields
                    };
                    unitPromises.push(this.createSingleProperty(organizationId, unitData, userId));
                }

                await Promise.all(unitPromises);
                return parent;
            } else {
                return await this.createSingleProperty(organizationId, data, userId);
            }
        } catch (error: any) {
            logger.error('Error in createProperty', {
                error: error.message,
                stack: error.stack,
                organizationId,
                data
            });
            throw error;
        }
    }

    private async createSingleProperty(organizationId: string, data: CreatePropertyDto, userId: string): Promise<Property> {
        logger.info('Starting createSingleProperty', { organizationId, title: data.title, region: data.region });
        let values: any[] = []; // Declare values here to be accessible in catch block
        try {
            const id = uuidv4();
            const referenceNumber = this.generateReferenceNumber(data.region);

            // Generate permanent marketplace token
            const permanentLinkToken = crypto.randomBytes(32).toString('hex');

            // Geocode address automatically
            let latitude: number | null = null;
            let longitude: number | null = null;
            let locationAccuracy: string | null = null;
            let verifiedLocation = false;

            try {
                const { geocodePropertyAddress } = await import('../../../../shared-services/shared/geocodingHelper');
                const geocodeResult = await geocodePropertyAddress({
                    digitalAddress: data.digitalAddress,
                    addressStreet: data.addressStreet,
                    city: data.addressCity,
                    region: data.region,
                    landmark: null
                });
                
                if (geocodeResult) {
                    latitude = geocodeResult.latitude;
                    longitude = geocodeResult.longitude;
                    locationAccuracy = geocodeResult.accuracy;
                    verifiedLocation = true;
                    logger.info('Property geocoded successfully', {
                        propertyId: id,
                        lat: latitude,
                        lng: longitude,
                        accuracy: locationAccuracy,
                        source: geocodeResult.source
                    });
                }
            } catch (err: any) {
                logger.warn('Failed to geocode property on creation', { 
                    error: err.message,
                    propertyId: id 
                });
            }

            const query = `
                INSERT INTO properties (
                    id, organization_id, reference_number, title, description,
                    region, address_city, address_district, address_street,
                    digital_address, property_type, transaction_type,
                    bedrooms, bathrooms, floors, total_area_sqm,
                    price, price_currency, status, data_source,
                    created_by, latitude, longitude, location_verified, location_accuracy,
                    geom,
                    parent_property_id, unit_number, permanent_link_token,
                    marketplace_enabled, marketplace_listed_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
                    $22, $23, $24, $25,
                    CASE WHEN $22 IS NOT NULL AND $23 IS NOT NULL 
                        THEN ST_SetSRID(ST_MakePoint($23, $22), 4326)
                        ELSE NULL END,
                    $26, $27, $28, $29, $30
                ) RETURNING *
            `;

            values = [
                id,
                organizationId,
                referenceNumber,
                data.title,
                data.description || null,
                data.region,
                data.addressCity,
                data.addressDistrict || null,
                data.addressStreet || null,
                data.digitalAddress || null,
                data.propertyType,
                data.transactionType || 'rental',
                data.bedrooms || null,
                data.bathrooms || null,
                data.floors || null,
                data.totalAreaSqm || null,
                data.price,
                data.priceCurrency || 'GHS',
                'active',
                'manual_entry', // System level for property managers
                userId || null,
                latitude,
                longitude,
                verifiedLocation,
                locationAccuracy,
                data.parentPropertyId || null,
                data.unitNumber || null,
                permanentLinkToken,
                true, // marketplace_enabled
                new Date() // marketplace_listed_at
            ];

            const result = await db.query(query, values);
            const property = this.mapToProperty(result.rows[0]);
            logger.info('Successfully created property record', { id: property.id, ref: property.referenceNumber });

            // Track contribution for Data Hub
            try {
                const { ServiceHooks } = await import('../../data-hub/serviceHooks');
                await ServiceHooks.createContribution({
                    contributor_id: userId || null,
                    organization_id: organizationId,
                    contribution_type: 'new_property',
                    source_context: 'property_management',
                    source_id: property.id,
                    data: {
                        property_id: property.id,
                        title: property.title,
                        region: property.region,
                        city: property.addressCity,
                        property_type: property.propertyType,
                        price: property.price,
                        currency: property.priceCurrency,
                        action: 'property_creation'
                    }
                });
            } catch (hookError) {
                logger.error('Failed to create property contribution hook', hookError);
            }

            return property;
        } catch (error: any) {
            logger.error('Database error in createSingleProperty', {
                error: error.message,
                detail: error.detail,
                code: error.code,
                values
            });
            throw error;
        }
    }

    /**
     * Get property by ID
     */
    async getPropertyById(id: string, organizationId: string): Promise<Property | null> {
        const query = `SELECT * FROM properties WHERE id = $1 AND organization_id = $2`;
        const result = await db.query(query, [id, organizationId]);
        if (result.rows.length === 0) return null;
        return this.mapToProperty(result.rows[0]);
    }

    /**
     * List properties for an organization
     */
    async listProperties(organizationId: string): Promise<Property[]> {
        const query = `SELECT * FROM properties WHERE organization_id = $1 ORDER BY created_at DESC`;
        const result = await db.query(query, [organizationId]);
        return result.rows.map(row => this.mapToProperty(row));
    }

    /**
     * Update an existing property
     */
    async updateProperty(id: string, organizationId: string, data: Partial<CreatePropertyDto>, userId: string): Promise<Property | null> {
        // Check if address fields are being updated - if so, re-geocode
        const addressFieldsChanged = !!(
            data.digitalAddress !== undefined ||
            data.addressStreet !== undefined ||
            data.addressCity !== undefined ||
            data.region !== undefined
        );

        if (addressFieldsChanged) {
            try {
                // Fetch current property to get existing address data
                const currentResult = await db.query(
                    'SELECT digital_address, address_street, address_city, region FROM properties WHERE id = $1 AND organization_id = $2',
                    [id, organizationId]
                );
                
                if (currentResult.rows.length > 0) {
                    const current = currentResult.rows[0];
                    
                    // Use updated values or fallback to current values
                    const digitalAddress = data.digitalAddress !== undefined ? data.digitalAddress : current.digital_address;
                    const addressStreet = data.addressStreet !== undefined ? data.addressStreet : current.address_street;
                    const addressCity = data.addressCity !== undefined ? data.addressCity : current.address_city;
                    const region = data.region !== undefined ? data.region : current.region;
                    
                    const { geocodePropertyAddress } = await import('../../../../shared-services/shared/geocodingHelper');
                    const geocodeResult = await geocodePropertyAddress({
                        digitalAddress: digitalAddress,
                        addressStreet: addressStreet,
                        city: addressCity,
                        region: region,
                        landmark: null
                    });
                    
                    if (geocodeResult) {
                        // Add geocode results to update data
                        (data as any).latitude = geocodeResult.latitude;
                        (data as any).longitude = geocodeResult.longitude;
                        (data as any).locationAccuracy = geocodeResult.accuracy;
                        (data as any).locationVerified = true;
                        logger.info('Property re-geocoded on update', {
                            propertyId: id,
                            lat: geocodeResult.latitude,
                            lng: geocodeResult.longitude,
                            accuracy: geocodeResult.accuracy
                        });
                    }
                }
            } catch (err: any) {
                logger.warn('Failed to re-geocode property on update', { 
                    error: err.message,
                    propertyId: id 
                });
            }
        }

        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        const fieldMappings: Record<string, string> = {
            title: 'title',
            description: 'description',
            region: 'region',
            addressCity: 'address_city',
            addressDistrict: 'address_district',
            addressStreet: 'address_street',
            digitalAddress: 'digital_address',
            propertyType: 'property_type',
            transactionType: 'transaction_type',
            bedrooms: 'bedrooms',
            bathrooms: 'bathrooms',
            floors: 'floors',
            totalAreaSqm: 'total_area_sqm',
            price: 'price',
            priceCurrency: 'price_currency',
            latitude: 'latitude',
            longitude: 'longitude',
            locationAccuracy: 'location_accuracy',
            locationVerified: 'location_verified'
        };

        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined && key in fieldMappings) {
                updates.push(`${fieldMappings[key]} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        }

        // If latitude and longitude are being updated, also update geom
        if ((data as any).latitude !== undefined && (data as any).longitude !== undefined) {
            updates.push(`geom = ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex - 1}), 4326)`);
        }

        if (updates.length === 0) {
            return this.getPropertyById(id, organizationId);
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);

        const query = `
            UPDATE properties
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
            RETURNING *
        `;
        values.push(id, organizationId);

        const result = await db.query(query, values);
        if (result.rows.length === 0) return null;

        const property = this.mapToProperty(result.rows[0]);

        // Track update contribution
        try {
            const { ServiceHooks } = await import('../../data-hub/serviceHooks');
            await ServiceHooks.createContribution({
                contributor_id: userId,
                organization_id: organizationId,
                contribution_type: 'enrichment',
                source_context: 'property_management',
                source_id: property.id,
                data: {
                    property_id: property.id,
                    action: 'property_update',
                    updated_fields: Object.keys(data)
                }
            });
        } catch (hookError) {
            logger.error('Failed to create property update contribution hook', hookError);
        }

        return property;
    }

    /**
     * Soft delete a property (set status to 'deleted')
     */
    async deleteProperty(id: string, organizationId: string, userId: string): Promise<boolean> {
        // Check for active tenancies first
        const tenancyCheck = await db.query(
            `SELECT COUNT(*) as count FROM tenancies WHERE property_id = $1 AND status = 'active'`,
            [id]
        );

        if (parseInt(tenancyCheck.rows[0].count) > 0) {
            throw new Error('Cannot delete property with active tenancies');
        }

        const query = `
            UPDATE properties
            SET status = 'deleted', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND organization_id = $2
            RETURNING id
        `;

        const result = await db.query(query, [id, organizationId]);
        
        if (result.rows.length > 0) {
            logger.info(`Property ${id} soft deleted by user ${userId}`);
            return true;
        }
        return false;
    }

    /**
     * Get properties with pagination and filtering
     */
    async getPropertiesPaginated(
        organizationId: string,
        filters: { status?: string; region?: string; propertyType?: string; search?: string } = {},
        pagination: { page?: number; limit?: number; sortBy?: string; sortOrder?: string } = {}
    ): Promise<{ data: Property[]; total: number; page: number; limit: number; totalPages: number }> {
        const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = pagination;
        const offset = (page - 1) * limit;

        const conditions: string[] = ['organization_id = $1', "status != 'deleted'"];
        const params: any[] = [organizationId];
        let paramIndex = 2;

        if (filters.status) {
            conditions.push(`status = $${paramIndex}`);
            params.push(filters.status);
            paramIndex++;
        }

        if (filters.region) {
            conditions.push(`region = $${paramIndex}`);
            params.push(filters.region);
            paramIndex++;
        }

        if (filters.propertyType) {
            conditions.push(`property_type = $${paramIndex}`);
            params.push(filters.propertyType);
            paramIndex++;
        }

        if (filters.search) {
            conditions.push(`(title ILIKE $${paramIndex} OR address_street ILIKE $${paramIndex} OR digital_address ILIKE $${paramIndex})`);
            params.push(`%${filters.search}%`);
            paramIndex++;
        }

        const whereClause = conditions.join(' AND ');
        const allowedSortFields = ['created_at', 'title', 'price', 'region', 'status'];
        const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
        const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

        const countResult = await db.query(`SELECT COUNT(*) FROM properties WHERE ${whereClause}`, params);
        const total = parseInt(countResult.rows[0].count);

        const dataQuery = `
            SELECT * FROM properties
            WHERE ${whereClause}
            ORDER BY ${safeSortBy} ${safeSortOrder}
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        params.push(limit, offset);

        const dataResult = await db.query(dataQuery, params);
        const data = dataResult.rows.map(row => this.mapToProperty(row));

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }

    private generateReferenceNumber(region: string): string {
        const regionCodes: Record<string, string> = {
            'greater_accra': 'GA',
            'ashanti': 'AS',
            'eastern': 'ER',
            'central': 'CR',
            'western': 'WR',
            'volta': 'VR',
            'northern': 'NR',
            'upper_east': 'UE',
            'upper_west': 'UW',
            'bono': 'BO',
            'bono_east': 'BE',
            'ahafo': 'AH',
            'savannah': 'SR',
            'north_east': 'NE',
            'oti': 'OT',
            'western_north': 'WN',
            'kumasi_metro': 'KM',
            'western_cluster': 'WC',
            'northern_cluster': 'NC',
        };
        const code = regionCodes[region] || 'XX';
        const date = new Date();
        const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `PM-${code}-${dateStr}-${random}`;
    }

    private mapToProperty(row: any): Property {
        return {
            id: row.id,
            organizationId: row.organization_id,
            referenceNumber: row.reference_number,
            title: row.title,
            description: row.description,
            region: row.region,
            addressCity: row.address_city,
            addressDistrict: row.address_district,
            addressStreet: row.address_street,
            digitalAddress: row.digital_address,
            propertyType: row.property_type,
            transactionType: row.transaction_type,
            bedrooms: row.bedrooms,
            bathrooms: row.bathrooms,
            floors: row.floors,
            totalAreaSqm: row.total_area_sqm,
            price: parseFloat(row.price),
            priceCurrency: row.price_currency,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            parentPropertyId: row.parent_property_id,
            unitNumber: row.unit_number
        };
    }
}

export const propertyService = new PropertyService();
