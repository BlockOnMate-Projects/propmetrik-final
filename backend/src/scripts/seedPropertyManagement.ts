/**
 * Seed Property Management Data
 * Populates the database with realistic Ghana-specific property management data
 * 
 * Usage: npx ts-node src/scripts/seedPropertyManagement.ts
 */

import { pool } from '../database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import {
    TenantStatus,
    TenancyStatus,
    PaymentMethod,
    PaymentStatus,
    WorkOrderStatus,
    MaintenanceCategory,
    Priority,
    Urgency,
    VendorStatus,
    PropertyDocumentType
} from '../types/property-management.types';

async function seed() {
    const client = await pool.connect();

    try {
        logger.info('Starting Property Management Seeding...');
        await client.query('BEGIN');

        // 1. Create Organization (Property Management Agency)
        logger.info('Creating Organization...');
        const orgRes = await client.query(`
      INSERT INTO organizations (id, name, slug, type, address_region, is_verified, is_active)
      VALUES ($1, 'Ghana Prime Properties', 'ghana-prime-properties', 'property_manager', 'greater_accra', true, true)
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `, [uuidv4()]);
        const orgId = orgRes.rows[0].id;

        // Get a user ID for "created_by" fields (assuming a user exists, or create one)
        const userRes = await client.query(`
      INSERT INTO users (id, keycloak_id, email, first_name, last_name, organization_id, status)
      VALUES ($1, $3, 'admin@ghanaprime.com', 'Kofi', 'Admin', $2, 'active')
      ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name
      RETURNING id
    `, [uuidv4(), orgId, uuidv4()]);
        const userId = userRes.rows[0].id;

        // 2. Create Properties (Mix of Residential/Commercial in Accra)
        logger.info('Creating Properties...');
        const properties = [
            {
                title: 'Luxury 3-Bedroom Apartment in Cantonments',
                address: 'Fourth Circular Road, Cantonments, Accra',
                type: 'apartment_flat',
                region: 'greater_accra',
                price: 350000, // Purchase price
                rent: 2500 // Monthly rent (USD)
            },
            {
                title: 'Executive House in East Legon',
                address: 'Lagos Avenue, East Legon, Accra',
                type: 'residential_house',
                region: 'greater_accra',
                price: 550000,
                rent: 4000
            },
            {
                title: 'Commercial Office Space - Osu',
                address: 'Oxford Street, Osu, Accra',
                type: 'commercial_office',
                region: 'greater_accra',
                price: 800000,
                rent: 6000
            },
            {
                title: 'Modern Townhouse in Airport Residential',
                address: 'Volta Street, Airport Residential Area, Accra',
                type: 'townhouse_development',
                region: 'greater_accra',
                price: 450000,
                rent: 3200
            },
            {
                title: 'Affordable Housing Unit - Sakumono',
                address: 'Sakumono Estates, Tema',
                type: 'apartment_flat',
                region: 'greater_accra',
                price: 85000,
                rent: 1500 // GHS
            }
        ];

        const propertyIds = [];
        for (const p of properties) {
            const transactionType = p.rent > 0 ? 'rental' : 'sale';
            const city = p.address.includes('Tema') ? 'Tema' : 'Accra';

            const propRes = await client.query(`
                INSERT INTO properties (
                  organization_id, title, address_street, address_city, property_type, region, 
                  price, price_currency, transaction_type, status, created_by
                ) VALUES ($1, $2, $3, $4, $5::property_type_enum, $6::region_code_enum, $7, 'USD', $8::transaction_type_enum, 'active', $9)
                RETURNING id
            `, [
                orgId,
                p.title,
                p.address,
                city,
                p.type === 'townhouse_development' ? 'residential_house' : p.type,
                p.region,
                p.price,
                transactionType,
                userId
            ]);
            const propId = propRes.rows[0].id;
            propertyIds.push(propId);

            // Create Contribution for Property
            await client.query(`
                INSERT INTO contributions (
                    contributor_id, contributor_type, contribution_type, property_id, property_region,
                    data, validation_status, source_context, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                userId, 'system', 'new_property', propId, p.region,
                JSON.stringify({ title: p.title, address: p.address, type: p.type, price: p.price, rent: p.rent }),
                'approved', 'property_management',
                JSON.stringify({ seeded: true })
            ]);
        }

        // 3. Create Vendors (Maintenance Providers)
        logger.info('Creating Vendors...');
        const vendors = [
            {
                name: 'FixIt Ghana Ltd',
                contact: 'Kwame Mensah',
                phone: '+233244123456',
                services: [MaintenanceCategory.PLUMBING, MaintenanceCategory.ELECTRICAL],
                rating: 4.5
            },
            {
                name: 'SecureGuard Services',
                contact: 'Emmanuel Osei',
                phone: '+233200987654',
                services: [MaintenanceCategory.SECURITY],
                rating: 4.8
            },
            {
                name: 'CleanSpace Cleaning',
                contact: 'Ama Boateng',
                phone: '+233543210987',
                services: [MaintenanceCategory.COMPOUND_MAINTENANCE],
                rating: 4.2
            }
        ];

        const vendorIds = [];
        for (const v of vendors) {
            const vendRes = await client.query(`
                INSERT INTO vendors (
                  organization_id, business_name, contact_person, phone_primary, 
                  service_categories, average_rating, status, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (business_name, organization_id) DO UPDATE SET contact_person = EXCLUDED.contact_person
                RETURNING id
            `, [orgId, v.name, v.contact, v.phone, v.services, v.rating, VendorStatus.ACTIVE, userId]);
            vendorIds.push(vendRes.rows[0].id);
        }

        // 4. Create Tenants
        logger.info('Creating Tenants...');
        const tenants = [
            {
                name: 'John Doe',
                email: 'john.doe@example.com',
                phone: '+233240000001',
                income: 15000,
                employer: 'Tullow Oil',
                ghanaCard: 'GHA-123456789-0'
            },
            {
                name: 'Sarah Smith',
                email: 'sarah.smith@example.com',
                phone: '+233240000002',
                income: 12000,
                employer: 'MTN Ghana',
                ghanaCard: 'GHA-987654321-1'
            }
        ];

        const tenantIds = [];
        for (const t of tenants) {
            const tenRes = await client.query(`
                INSERT INTO tenants (
                  organization_id, full_name, email, phone_primary, monthly_income,
                  employer_name, ghana_card_number, status, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (ghana_card_number) DO UPDATE SET full_name = EXCLUDED.full_name
                RETURNING id
            `, [orgId, t.name, t.email, t.phone, t.income, t.employer, t.ghanaCard, TenantStatus.ACTIVE, userId]);
            tenantIds.push(tenRes.rows[0].id);
        }

        // 5. Create Tenancies & Payments
        logger.info('Creating Tenancies and Payments...');

        // Tenancy 1: Active, Paid Upfront (Cantonments)
        const t1Start = new Date('2025-01-01');
        const t1End = new Date('2025-12-31');
        const t1Res = await client.query(`
            INSERT INTO tenancies (
              property_id, tenant_id, organization_id, lease_start_date, lease_end_date,
              monthly_rent, rent_currency, advance_payment_months, advance_payment_amount,
              status, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, 'USD', 12, $7, $8, $9)
            RETURNING id
        `, [propertyIds[0], tenantIds[0], orgId, t1Start, t1End, 2500, 30000, TenancyStatus.ACTIVE, userId]);

        const t1Id = t1Res.rows[0].id;

        // Create Contribution for Tenancy (Rental Data)
        await client.query(`
            INSERT INTO contributions (
                contributor_id, contributor_type, contribution_type, property_id,
                data, validation_status, source_context, metadata
            ) VALUES ($1, 'system', 'comparable', $2, $3, 'approved', 'property_management', $4)
        `, [
            userId, propertyIds[0],
            JSON.stringify({ tenancy_id: t1Id, monthly_rent: 2500, currency: 'USD', start_date: t1Start }),
            JSON.stringify({ seeded: true, type: 'rental_data' })
        ]);

        // Record payment for T1
        await client.query(`
            INSERT INTO rent_payments (
              tenancy_id, payment_amount, currency, payment_date, payment_method,
              period_start_date, period_end_date, status, notes
            ) VALUES ($1, $2, 'USD', $3, $4, $5, $6, $7, 'Full year advance via Bank Transfer')
        `, [t1Id, 30000, t1Start, PaymentMethod.BANK_TRANSFER, t1Start, t1End, PaymentStatus.COMPLETED]);

        // 6. Create Work Orders
        logger.info('Creating Work Orders...');
        const woRes = await client.query(`
            INSERT INTO maintenance_work_orders (
              property_id, tenancy_id, organization_id, title, description,
              category, priority, urgency, status, assigned_vendor_id,
              created_by, reported_by
            ) VALUES 
            ($1, $2, $3, 'Leaking AC Unit', 'Master bedroom AC is dripping water', $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
        `, [
            propertyIds[0], t1Id, orgId,
            MaintenanceCategory.HVAC, Priority.MEDIUM, Urgency.NORMAL, WorkOrderStatus.ASSIGNED, vendorIds[0],
            userId, userId
        ]);

        const woId = woRes.rows[0].id;

        // Create Contribution for Work Order (Maintenance Data)
        await client.query(`
            INSERT INTO contributions (
                contributor_id, contributor_type, contribution_type, property_id,
                data, validation_status, source_context, metadata
            ) VALUES ($1, 'system', 'enrichment', $2, $3, 'approved', 'property_management', $4)
        `, [
            userId, propertyIds[0],
            JSON.stringify({ work_order_id: woId, category: 'hvac', title: 'Leaking AC Unit' }),
            JSON.stringify({ seeded: true, type: 'maintenance_data' })
        ]);

        await client.query('COMMIT');
        logger.info('Property Management Seeding Completed Successfully with Data Hub Integration!');
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Seeding failed details:', error);
        logger.error('Seeding failed:', error);
        process.exit(1);
    } finally {
        client.release();
        process.exit(0);
    }
}

seed();
