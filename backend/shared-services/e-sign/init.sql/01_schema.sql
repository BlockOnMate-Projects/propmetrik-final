-- Cedyn E-Signature Platform Database Schema
-- This file is automatically run when the PostgreSQL container starts

-- Create enum types
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'documentstatus') THEN
        CREATE TYPE documentstatus AS ENUM ('pending', 'converted', 'failed');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'signaturerequeststatus') THEN
        CREATE TYPE signaturerequeststatus AS ENUM ('draft', 'pending', 'completed', 'cancelled', 'expired');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'signerstatus') THEN
        CREATE TYPE signerstatus AS ENUM ('pending', 'signed', 'declined');
    END IF;
END$$;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    keycloak_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_users_keycloak_id ON users(keycloak_id);
CREATE INDEX IF NOT EXISTS ix_users_email ON users(email);

-- Google Tokens table
CREATE TABLE IF NOT EXISTS google_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type VARCHAR(50) DEFAULT 'Bearer',
    expires_at TIMESTAMP,
    scopes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_google_tokens_user_id ON google_tokens(user_id);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    google_drive_id VARCHAR(255),
    title VARCHAR(500) NOT NULL,
    original_format VARCHAR(50),
    file_path VARCHAR(1000),
    signed_file_path VARCHAR(1000),
    file_size INTEGER,
    mime_type VARCHAR(100),
    status documentstatus NOT NULL DEFAULT 'pending',
    conversion_error TEXT,
    signed_drive_id VARCHAR(255),
    extra_data JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_documents_id ON documents(id);
CREATE INDEX IF NOT EXISTS ix_documents_owner_id ON documents(owner_id);
CREATE INDEX IF NOT EXISTS ix_documents_google_drive_id ON documents(google_drive_id);
CREATE INDEX IF NOT EXISTS ix_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS ix_documents_created_at ON documents(created_at);
CREATE INDEX IF NOT EXISTS ix_documents_signed_drive_id ON documents(signed_drive_id);

-- Signature Requests table
CREATE TABLE IF NOT EXISTS signature_requests (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    message TEXT,
    status signaturerequeststatus NOT NULL DEFAULT 'draft',
    expires_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_signature_requests_document_id ON signature_requests(document_id);
CREATE INDEX IF NOT EXISTS ix_signature_requests_creator_id ON signature_requests(creator_id);
CREATE INDEX IF NOT EXISTS ix_signature_requests_status ON signature_requests(status);
CREATE INDEX IF NOT EXISTS ix_signature_requests_expires_at ON signature_requests(expires_at);
CREATE INDEX IF NOT EXISTS ix_signature_requests_created_at ON signature_requests(created_at);

-- Signers table
CREATE TABLE IF NOT EXISTS signers (
    id SERIAL PRIMARY KEY,
    signature_request_id INTEGER NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    "order" INTEGER DEFAULT 1,
    status signerstatus NOT NULL DEFAULT 'pending',
    access_token VARCHAR(64) UNIQUE,
    signed_at TIMESTAMP,
    declined_at TIMESTAMP,
    decline_reason TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_signers_signature_request_id ON signers(signature_request_id);
CREATE INDEX IF NOT EXISTS ix_signers_email ON signers(email);
CREATE INDEX IF NOT EXISTS ix_signers_status ON signers(status);
CREATE INDEX IF NOT EXISTS ix_signers_access_token ON signers(access_token);

-- Signature Fields table
CREATE TABLE IF NOT EXISTS signature_fields (
    id SERIAL PRIMARY KEY,
    signer_id INTEGER NOT NULL REFERENCES signers(id) ON DELETE CASCADE,
    page INTEGER NOT NULL,
    x FLOAT NOT NULL,
    y FLOAT NOT NULL,
    width FLOAT NOT NULL,
    height FLOAT NOT NULL,
    field_type VARCHAR(50) DEFAULT 'signature',
    required BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_signature_fields_signer_id ON signature_fields(signer_id);

-- Signatures table
CREATE TABLE IF NOT EXISTS signatures (
    id SERIAL PRIMARY KEY,
    signature_request_id INTEGER NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE,
    signer_id INTEGER NOT NULL REFERENCES signers(id) ON DELETE CASCADE,
    signature_data TEXT NOT NULL,
    signature_type VARCHAR(50) DEFAULT 'drawn',
    ip_address VARCHAR(45),
    user_agent TEXT,
    signed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_signatures_signature_request_id ON signatures(signature_request_id);
CREATE INDEX IF NOT EXISTS ix_signatures_signer_id ON signatures(signer_id);
CREATE INDEX IF NOT EXISTS ix_signatures_signed_at ON signatures(signed_at);

-- Audit Logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id INTEGER,
    event_data JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS ix_audit_logs_created_at ON audit_logs(created_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
        CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_google_tokens_updated_at') THEN
        CREATE TRIGGER update_google_tokens_updated_at BEFORE UPDATE ON google_tokens
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_documents_updated_at') THEN
        CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_signature_requests_updated_at') THEN
        CREATE TRIGGER update_signature_requests_updated_at BEFORE UPDATE ON signature_requests
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_signers_updated_at') THEN
        CREATE TRIGGER update_signers_updated_at BEFORE UPDATE ON signers
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END$$;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO CURRENT_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO CURRENT_USER;
