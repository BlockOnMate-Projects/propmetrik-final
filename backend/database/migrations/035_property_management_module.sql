-- Migration: 018_property_management_module
-- Description: Property Management module - tenants, tenancies, payments, maintenance
-- Created: 2026-01-17
-- Phase: 4.1 Database Foundation

-- =====================================================
-- PROPERTY MANAGEMENT ENUM TYPES
-- =====================================================

-- Tenant status
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_status_enum') THEN
        CREATE TYPE tenant_status_enum AS ENUM (
          'active',
          'inactive',
          'blacklisted',
          'pending_verification'
        );
    END IF;
END $$;

-- Tenancy status
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenancy_status_enum') THEN
        CREATE TYPE tenancy_status_enum AS ENUM (
          'pending',
          'active',
          'expired',
          'terminated',
          'renewed'
        );
    END IF;
END $$;

-- Payment method (Ghana-specific includes mobile money)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method_enum') THEN
        CREATE TYPE payment_method_enum AS ENUM (
          'cash',
          'bank_transfer',
          'bank_deposit',
          'cheque',
          'mobile_money_mtn',
          'mobile_money_vodafone',
          'mobile_money_airteltigo',
          'paystack',
          'flutterwave'
        );
    END IF;
END $$;

-- Payment status
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status_enum') THEN
        CREATE TYPE payment_status_enum AS ENUM (
          'pending',
          'completed',
          'failed',
          'refunded',
          'partially_paid'
        );
    END IF;
END $$;

-- Work order status
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_order_status_enum') THEN
        CREATE TYPE work_order_status_enum AS ENUM (
          'open',
          'assigned',
          'in_progress',
          'pending_approval',
          'completed',
          'cancelled'
        );
    END IF;
END $$;

-- Priority levels
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'priority_enum') THEN
        CREATE TYPE priority_enum AS ENUM (
          'low',
          'medium',
          'high',
          'urgent'
        );
    END IF;
END $$;

-- Urgency levels
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'urgency_enum') THEN
        CREATE TYPE urgency_enum AS ENUM (
          'routine',
          'normal',
          'urgent',
          'emergency'
        );
    END IF;
END $$;

-- Maintenance categories (Ghana-specific)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'maintenance_category_enum') THEN
        CREATE TYPE maintenance_category_enum AS ENUM (
          'plumbing',
          'electrical',
          'hvac',
          'roofing',
          'painting',
          'flooring',
          'doors_windows',
          'security',
          'water_supply',
          'borehole',
          'generator',
          'solar_system',
          'compound_maintenance',
          'pest_control',
          'septic_tank',
          'other'
        );
    END IF;
END $$;

-- Vendor status
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_status_enum') THEN
        CREATE TYPE vendor_status_enum AS ENUM (
          'active',
          'inactive',
          'suspended',
          'pending_verification'
        );
    END IF;
END $$;

-- Income categories (Ghana-specific)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'income_category_enum') THEN
        CREATE TYPE income_category_enum AS ENUM (
          'rental_income',
          'parking_fees',
          'utility_charges',
          'service_charges',
          'late_fees',
          'security_deposit_forfeiture',
          'other_income'
        );
    END IF;
END $$;

-- Expense categories (Ghana-specific)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'expense_category_enum') THEN
        CREATE TYPE expense_category_enum AS ENUM (
          'property_taxes',
          'insurance',
          'maintenance_repairs',
          'utilities_ecg',
          'utilities_water',
          'utilities_waste',
          'security_services',
          'property_management_fees',
          'legal_fees',
          'marketing_advertising',
          'depreciation',
          'agent_commission',
          'other_expenses'
        );
    END IF;
END $$;

-- Property document types (Ghana-specific)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'property_document_type_enum') THEN
        CREATE TYPE property_document_type_enum AS ENUM (
          'indenture',
          'lease_agreement',
          'power_of_attorney',
          'lands_commission_search',
          'site_plan',
          'building_permit',
          'occupancy_certificate',
          'environmental_permit',
          'fire_certificate',
          'property_tax_receipts',
          'valuation_reports',
          'insurance_policies',
          'mortgage_documents',
          'tenant_agreements',
          'maintenance_records',
          'utility_bills',
          'vendor_contracts',
          'property_photos',
          'inspection_reports',
          'correspondence',
          'other'
        );
    END IF;
END $$;

-- =====================================================
-- TENANTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Personal information
  full_name VARCHAR(255) NOT NULL,
  ghana_card_number VARCHAR(20) UNIQUE,
  date_of_birth DATE,
  phone_primary VARCHAR(20) NOT NULL,
  phone_secondary VARCHAR(20),
  email VARCHAR(255),
  
  -- Address
  current_address TEXT,
  digital_address VARCHAR(20), -- Ghana Post GPS
  
  -- Professional information
  occupation VARCHAR(200),
  employer_name VARCHAR(200),
  employer_address TEXT,
  employer_phone VARCHAR(20),
  monthly_income NUMERIC(12,2),
  
  -- Emergency contact
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(20),
  emergency_contact_relationship VARCHAR(100),
  
  -- Tenant history
  credit_score INTEGER,
  character_references JSONB DEFAULT '[]',
  previous_addresses JSONB DEFAULT '[]',
  
  -- Status
  status tenant_status_enum DEFAULT 'pending_verification',
  notes TEXT,
  
  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenants_organization ON tenants(organization_id);
CREATE INDEX IF NOT EXISTS idx_tenants_ghana_card ON tenants(ghana_card_number);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_phone ON tenants(phone_primary);
CREATE INDEX IF NOT EXISTS idx_tenants_email ON tenants(email);

-- =====================================================
-- TENANCIES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS tenancies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference_number VARCHAR(50) UNIQUE DEFAULT generate_reference_number('TEN'),
  
  -- Relations
  property_id UUID NOT NULL, -- References properties table
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  unit_number VARCHAR(50), -- For multi-unit properties
  
  -- Lease terms
  lease_start_date DATE NOT NULL,
  lease_end_date DATE NOT NULL,
  monthly_rent NUMERIC(12,2) NOT NULL,
  rent_currency currency_enum DEFAULT 'GHS',
  
  -- Ghana-specific: Advance payment (1-2 years common)
  advance_payment_months INTEGER DEFAULT 12,
  advance_payment_amount NUMERIC(14,2),
  advance_payment_date DATE,
  
  -- Deposits
  security_deposit NUMERIC(12,2) DEFAULT 0,
  security_deposit_paid BOOLEAN DEFAULT FALSE,
  
  -- Payment schedule
  rent_due_day INTEGER DEFAULT 1, -- Day of month rent is due
  late_fee_amount NUMERIC(10,2) DEFAULT 0,
  late_fee_grace_days INTEGER DEFAULT 7,
  
  -- Status
  status tenancy_status_enum DEFAULT 'pending',
  
  -- Renewal options
  renewal_options JSONB DEFAULT '{}',
  auto_renew BOOLEAN DEFAULT FALSE,
  
  -- Terms and conditions
  lease_terms JSONB DEFAULT '{}',
  special_conditions TEXT,
  
  -- Documents
  lease_document_url VARCHAR(500),
  
  -- Termination
  terminated_at TIMESTAMPTZ,
  termination_reason TEXT,
  
  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenancies_property ON tenancies(property_id);
CREATE INDEX IF NOT EXISTS idx_tenancies_tenant ON tenancies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenancies_organization ON tenancies(organization_id);
CREATE INDEX IF NOT EXISTS idx_tenancies_status ON tenancies(status);
CREATE INDEX IF NOT EXISTS idx_tenancies_dates ON tenancies(lease_start_date, lease_end_date);
CREATE INDEX IF NOT EXISTS idx_tenancies_active ON tenancies(status) WHERE status = 'active';

-- =====================================================
-- RENT PAYMENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS rent_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_number VARCHAR(50) UNIQUE DEFAULT generate_reference_number('RCP'),
  
  -- Relations
  tenancy_id UUID NOT NULL REFERENCES tenancies(id) ON DELETE RESTRICT,
  
  -- Payment details
  payment_amount NUMERIC(12,2) NOT NULL,
  currency currency_enum DEFAULT 'GHS',
  payment_date TIMESTAMPTZ NOT NULL,
  payment_method payment_method_enum NOT NULL,
  
  -- Mobile money specific
  mobile_money_reference VARCHAR(100),
  mobile_money_number VARCHAR(20),
  
  -- Bank specific
  bank_reference VARCHAR(100),
  bank_name VARCHAR(100),
  
  -- Period covered
  period_start_date DATE NOT NULL,
  period_end_date DATE NOT NULL,
  
  -- Additional charges
  late_fees NUMERIC(10,2) DEFAULT 0,
  other_charges JSONB DEFAULT '[]',
  
  -- Status
  status payment_status_enum DEFAULT 'completed',
  
  -- Notes
  notes TEXT,
  
  -- Audit
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rent_payments_tenancy ON rent_payments(tenancy_id);
CREATE INDEX IF NOT EXISTS idx_rent_payments_date ON rent_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_rent_payments_status ON rent_payments(status);
CREATE INDEX IF NOT EXISTS idx_rent_payments_method ON rent_payments(payment_method);
CREATE INDEX IF NOT EXISTS idx_rent_payments_period ON rent_payments(period_start_date, period_end_date);

-- =====================================================
-- VENDORS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Basic info
  business_name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255) NOT NULL,
  phone_primary VARCHAR(20) NOT NULL,
  phone_secondary VARCHAR(20),
  email VARCHAR(255),
  
  -- Address
  address TEXT,
  digital_address VARCHAR(20), -- Ghana Post GPS
  region region_code_enum,
  
  -- Business details
  tin_number VARCHAR(50), -- Tax ID
  business_registration VARCHAR(100),
  
  -- Services offered
  service_categories maintenance_category_enum[] NOT NULL,
  
  -- Performance metrics
  total_jobs_completed INTEGER DEFAULT 0,
  average_rating NUMERIC(3,2) DEFAULT 0,
  total_ratings INTEGER DEFAULT 0,
  
  -- Financial
  bank_name VARCHAR(100),
  bank_account_number VARCHAR(50),
  mobile_money_number VARCHAR(20),
  preferred_payment_method payment_method_enum,
  
  -- Status
  status vendor_status_enum DEFAULT 'pending_verification',
  
  -- Notes
  notes TEXT,
  
  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vendors_organization ON vendors(organization_id);
CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);
CREATE INDEX IF NOT EXISTS idx_vendors_region ON vendors(region);
CREATE INDEX IF NOT EXISTS idx_vendors_services ON vendors USING GIN(service_categories);
CREATE INDEX IF NOT EXISTS idx_vendors_rating ON vendors(average_rating DESC);

-- =====================================================
-- MAINTENANCE WORK ORDERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS maintenance_work_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference_number VARCHAR(50) UNIQUE DEFAULT generate_reference_number('WO'),
  
  -- Relations
  property_id UUID NOT NULL, -- References properties table
  tenancy_id UUID REFERENCES tenancies(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  assigned_vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  
  -- Issue details
  title VARCHAR(500) NOT NULL,
  description TEXT,
  category maintenance_category_enum NOT NULL,
  priority priority_enum DEFAULT 'medium',
  urgency urgency_enum DEFAULT 'normal',
  
  -- Location within property
  specific_location VARCHAR(255), -- e.g., "Master bedroom", "Kitchen sink"
  access_instructions TEXT,
  safety_considerations TEXT[],
  
  -- Status
  status work_order_status_enum DEFAULT 'open',
  
  -- Scheduling
  scheduled_date DATE,
  scheduled_time_start TIME,
  scheduled_time_end TIME,
  completed_at TIMESTAMPTZ,
  
  -- Financial
  estimated_cost NUMERIC(12,2),
  actual_cost NUMERIC(12,2),
  budget_approved BOOLEAN DEFAULT FALSE,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  
  -- Documentation
  photos_before TEXT[] DEFAULT '{}',
  photos_after TEXT[] DEFAULT '{}',
  documents TEXT[] DEFAULT '{}',
  completion_notes TEXT,
  
  -- Reporting
  reported_by UUID REFERENCES users(id),
  reported_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_work_orders_property ON maintenance_work_orders(property_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_tenancy ON maintenance_work_orders(tenancy_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_organization ON maintenance_work_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_vendor ON maintenance_work_orders(assigned_vendor_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON maintenance_work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_category ON maintenance_work_orders(category);
CREATE INDEX IF NOT EXISTS idx_work_orders_priority ON maintenance_work_orders(priority, urgency);
CREATE INDEX IF NOT EXISTS idx_work_orders_open ON maintenance_work_orders(status) WHERE status IN ('open', 'assigned', 'in_progress');

-- =====================================================
-- PROPERTY DOCUMENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS property_management_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relations
  property_id UUID NOT NULL, -- References properties table
  tenancy_id UUID REFERENCES tenancies(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Document info
  document_type property_document_type_enum NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- File info
  file_url VARCHAR(500) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size_bytes BIGINT,
  mime_type VARCHAR(100),
  
  -- Metadata
  issue_date DATE,
  expiry_date DATE,
  issuing_authority VARCHAR(255),
  reference_number VARCHAR(100),
  
  -- Verification
  is_verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  
  -- Folder organization
  folder_path VARCHAR(500) DEFAULT '/',
  
  -- Tags for searching
  tags TEXT[] DEFAULT '{}',
  
  -- Audit
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pm_docs_property ON property_management_documents(property_id);
CREATE INDEX IF NOT EXISTS idx_pm_docs_tenancy ON property_management_documents(tenancy_id);
CREATE INDEX IF NOT EXISTS idx_pm_docs_organization ON property_management_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_pm_docs_type ON property_management_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_pm_docs_expiry ON property_management_documents(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pm_docs_tags ON property_management_documents USING GIN(tags);

-- =====================================================
-- FINANCIAL RECORDS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS property_financial_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference_number VARCHAR(50) UNIQUE DEFAULT generate_reference_number('FIN'),
  
  -- Relations
  property_id UUID NOT NULL, -- References properties table
  tenancy_id UUID REFERENCES tenancies(id) ON DELETE SET NULL,
  work_order_id UUID REFERENCES maintenance_work_orders(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Record type
  record_type VARCHAR(20) NOT NULL CHECK (record_type IN ('income', 'expense')),
  
  -- Income/Expense category
  income_category income_category_enum,
  expense_category expense_category_enum,
  
  -- Amount
  amount NUMERIC(14,2) NOT NULL,
  currency currency_enum DEFAULT 'GHS',
  
  -- Date
  transaction_date DATE NOT NULL,
  
  -- Description
  description TEXT,
  
  -- Payment info
  payment_method payment_method_enum,
  payment_reference VARCHAR(100),
  
  -- Vendor (for expenses)
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  
  -- Documentation
  receipt_url VARCHAR(500),
  invoice_url VARCHAR(500),
  
  -- Tax related
  is_tax_deductible BOOLEAN DEFAULT FALSE,
  tax_category VARCHAR(100),
  
  -- Audit
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fin_records_property ON property_financial_records(property_id);
CREATE INDEX IF NOT EXISTS idx_fin_records_tenancy ON property_financial_records(tenancy_id);
CREATE INDEX IF NOT EXISTS idx_fin_records_organization ON property_financial_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_fin_records_type ON property_financial_records(record_type);
CREATE INDEX IF NOT EXISTS idx_fin_records_date ON property_financial_records(transaction_date);
CREATE INDEX IF NOT EXISTS idx_fin_records_income_cat ON property_financial_records(income_category) WHERE record_type = 'income';
CREATE INDEX IF NOT EXISTS idx_fin_records_expense_cat ON property_financial_records(expense_category) WHERE record_type = 'expense';

-- =====================================================
-- TRIGGERS
-- =====================================================
DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tenancies_updated_at ON tenancies;
CREATE TRIGGER update_tenancies_updated_at
  BEFORE UPDATE ON tenancies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rent_payments_updated_at ON rent_payments;
CREATE TRIGGER update_rent_payments_updated_at
  BEFORE UPDATE ON rent_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_vendors_updated_at ON vendors;
CREATE TRIGGER update_vendors_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_work_orders_updated_at ON maintenance_work_orders;
CREATE TRIGGER update_work_orders_updated_at
  BEFORE UPDATE ON maintenance_work_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pm_docs_updated_at ON property_management_documents;
CREATE TRIGGER update_pm_docs_updated_at
  BEFORE UPDATE ON property_management_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fin_records_updated_at ON property_financial_records;
CREATE TRIGGER update_fin_records_updated_at
  BEFORE UPDATE ON property_financial_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE tenants IS 'Tenant information for property management';
COMMENT ON TABLE tenancies IS 'Lease/tenancy agreements between landlords and tenants';
COMMENT ON TABLE rent_payments IS 'Rent payment records with Ghana mobile money support';
COMMENT ON TABLE vendors IS 'Maintenance contractors and service providers';
COMMENT ON TABLE maintenance_work_orders IS 'Work orders for property maintenance';
COMMENT ON TABLE property_management_documents IS 'Document vault for property-related documents';
COMMENT ON TABLE property_financial_records IS 'Income and expense tracking for properties';
