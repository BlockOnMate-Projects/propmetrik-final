-- Envelope tables for DocuSign-style workflow

-- Main envelopes table
CREATE TABLE IF NOT EXISTS envelopes (
    id UUID PRIMARY KEY,
    subject VARCHAR(255) NOT NULL,
    message TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    created_by VARCHAR(255) NOT NULL,
    reminder_frequency_days INTEGER DEFAULT 3,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Envelope recipients
CREATE TABLE IF NOT EXISTS envelope_recipients (
    id UUID PRIMARY KEY,
    envelope_id UUID REFERENCES envelopes(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL, -- 'signer', 'cc', 'viewer'
    signing_order INTEGER DEFAULT 1,
    status VARCHAR(50) DEFAULT 'pending',
    access_token UUID DEFAULT gen_random_uuid(),
    signed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Envelope documents
CREATE TABLE IF NOT EXISTS envelope_documents (
    id UUID PRIMARY KEY,
    envelope_id UUID REFERENCES envelopes(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    source VARCHAR(50) DEFAULT 'desktop', -- 'desktop', 'google-drive'
    drive_id VARCHAR(255),
    file_path VARCHAR(500),
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Field placements on documents
CREATE TABLE IF NOT EXISTS envelope_fields (
    id UUID PRIMARY KEY,
    envelope_id UUID REFERENCES envelopes(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'signature', 'initial', 'date_signed', 'name', 'email', etc.
    recipient_email VARCHAR(255) NOT NULL,
    document_index INTEGER DEFAULT 0,
    page INTEGER DEFAULT 1,
    x FLOAT NOT NULL,
    y FLOAT NOT NULL,
    width FLOAT NOT NULL,
    height FLOAT NOT NULL,
    required BOOLEAN DEFAULT TRUE,
    value TEXT, -- Filled in when signed
    filled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_envelopes_created_by ON envelopes(created_by);
CREATE INDEX IF NOT EXISTS idx_envelopes_status ON envelopes(status);
CREATE INDEX IF NOT EXISTS idx_envelope_recipients_envelope_id ON envelope_recipients(envelope_id);
CREATE INDEX IF NOT EXISTS idx_envelope_recipients_email ON envelope_recipients(email);
CREATE INDEX IF NOT EXISTS idx_envelope_recipients_access_token ON envelope_recipients(access_token);
CREATE INDEX IF NOT EXISTS idx_envelope_documents_envelope_id ON envelope_documents(envelope_id);
CREATE INDEX IF NOT EXISTS idx_envelope_fields_envelope_id ON envelope_fields(envelope_id);
