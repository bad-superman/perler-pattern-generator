CREATE TABLE IF NOT EXISTS access_passes (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  total_credits INTEGER NOT NULL CHECK (total_credits >= 0),
  remaining_credits INTEGER NOT NULL CHECK (remaining_credits >= 0),
  reserved_credits INTEGER NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS access_passes_status_created
ON access_passes(status, created_at DESC);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id TEXT PRIMARY KEY,
  pass_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'succeeded', 'failed')),
  credit_state TEXT NOT NULL CHECK (credit_state IN ('reserved', 'charging', 'charged', 'releasing', 'released')),
  provider TEXT,
  model TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (pass_id) REFERENCES access_passes(id),
  UNIQUE (pass_id, request_id)
);

CREATE INDEX IF NOT EXISTS generation_jobs_pass_created
ON generation_jobs(pass_id, created_at DESC);

CREATE INDEX IF NOT EXISTS generation_jobs_status_created
ON generation_jobs(status, created_at);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  pass_id TEXT NOT NULL,
  job_id TEXT,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (pass_id) REFERENCES access_passes(id),
  FOREIGN KEY (job_id) REFERENCES generation_jobs(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_job_reason
ON credit_ledger(job_id, reason)
WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS credit_ledger_pass_created
ON credit_ledger(pass_id, created_at DESC);
