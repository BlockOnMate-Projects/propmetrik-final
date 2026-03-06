-- Make organization_id nullable in workspaces table
ALTER TABLE workspaces ALTER COLUMN organization_id DROP NOT NULL;
