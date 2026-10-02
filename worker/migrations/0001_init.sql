CREATE TABLE IF NOT EXISTS executives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  pair_code TEXT UNIQUE,
  device_token_hash TEXT UNIQUE,
  device_model TEXT,
  last_sync_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  executive_id INTEGER NOT NULL REFERENCES executives(id) ON DELETE CASCADE,
  device_call_id TEXT NOT NULL,
  number TEXT NOT NULL,
  contact_name TEXT,
  type TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  duration_sec INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  UNIQUE (executive_id, device_call_id)
);
CREATE INDEX IF NOT EXISTS calls_by_exec_time ON calls (executive_id, started_at);
