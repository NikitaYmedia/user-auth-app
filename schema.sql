ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS admin_requests (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason      TEXT NOT NULL,
    status      VARCHAR(16) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'declined')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMPTZ,
    reviewed_by VARCHAR(255)
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_requests_one_pending_per_user
    ON admin_requests (user_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS admin_requests_status_idx
    ON admin_requests (status, created_at DESC);
