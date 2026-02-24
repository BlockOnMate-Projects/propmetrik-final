-- Migration: Create WhatsApp Messages Table
-- Copied from src/routes/messaging.ts to ensure proper creation order

CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Message details
    wa_message_id VARCHAR(100) UNIQUE,
    direction VARCHAR(20) NOT NULL, -- inbound, outbound
    
    -- Participants
    from_phone VARCHAR(20),
    to_phone VARCHAR(20) NOT NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    
    -- Content
    message_type VARCHAR(50) NOT NULL, -- text, template, document, image
    content TEXT,
    template_name VARCHAR(100),
    media_url TEXT,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- pending, sent, delivered, read, failed
    error_message TEXT,
    
    -- Related entities
    deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
    
    -- Timestamps
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- Indexes (only if columns exist - table may have different schema)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_messages' AND column_name = 'organization_id') THEN
        CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_org ON whatsapp_messages(organization_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_messages' AND column_name = 'contact_id') THEN
        CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_contact ON whatsapp_messages(contact_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_messages' AND column_name = 'deal_id') THEN
        CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_deal ON whatsapp_messages(deal_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_messages' AND column_name = 'to_phone') THEN
        CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone ON whatsapp_messages(to_phone);
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_messages' AND column_name = 'to_number') THEN
        CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone ON whatsapp_messages(to_number);
    END IF;
END $$;
