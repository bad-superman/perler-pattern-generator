-- 图库记录。cells_json 是色号索引，-1 表示空格。
CREATE TABLE IF NOT EXISTS gallery_shares (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  status TEXT NOT NULL,
  brand TEXT NOT NULL,
  cols INTEGER NOT NULL,
  rows INTEGER NOT NULL,
  mirrored INTEGER NOT NULL,
  color_count INTEGER NOT NULL,
  cells_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER
);

CREATE INDEX IF NOT EXISTS gallery_shares_status_created ON gallery_shares (status, created_at DESC);
CREATE INDEX IF NOT EXISTS gallery_shares_approved_reviewed ON gallery_shares (reviewed_at DESC);
CREATE INDEX IF NOT EXISTS gallery_shares_hash_created ON gallery_shares (content_hash, created_at);
CREATE INDEX IF NOT EXISTS gallery_shares_ip_created ON gallery_shares (ip_hash, created_at);
