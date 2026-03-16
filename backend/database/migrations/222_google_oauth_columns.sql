-- Google OAuth support: add google_id and onboarding_completed to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT true;

-- Index for Google OAuth lookups
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id) WHERE google_id IS NOT NULL;

-- Mark existing users as onboarding completed (they already have accounts)
UPDATE users SET onboarding_completed = true WHERE onboarding_completed IS NULL;
